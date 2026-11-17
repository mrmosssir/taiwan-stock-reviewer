import type {
  IChartApi,
  ISeriesApi,
  Logical,
  LogicalRange,
  MouseEventParams,
  SeriesType,
  Time,
} from 'lightweight-charts';

/**
 * 統一所有圖表右側價格座標軸最小寬度 (px)，
 * 確保上下排列的多張圖表左緣與右緣繪圖區寬度完全一致，達成時間刻度垂直像素對齊。
 */
export const UNIFIED_PRICE_SCALE_WIDTH = 80;

export interface SyncedChartEntry {
  id: string;
  chart: IChartApi;
  getMainSeries: () => ISeriesApi<SeriesType> | null;
  getValueAtTime: (time: string) => number | undefined;
  onHoverTimeChange?: (time: string | null) => void;
  isUpdatingSeries?: () => boolean;
}

export class ChartSyncController {
  private entries = new Map<string, SyncedChartEntry>();
  private isSyncingRange = false;
  private isSyncingCrosshair = false;
  private currentRange: LogicalRange | null = null;
  private datasetKey: string = '';
  private onLoadMore?: () => void;
  private isLoadingMore = false;

  constructor(onLoadMore?: () => void) {
    this.onLoadMore = onLoadMore;
  }

  public setOnLoadMore(fn?: () => void) {
    this.onLoadMore = fn;
  }

  public getCurrentRange(forDatasetKey?: string): LogicalRange | null {
    if (forDatasetKey && this.datasetKey && forDatasetKey !== this.datasetKey) {
      return null;
    }
    return this.currentRange;
  }

  public setCurrentRange(
    range: LogicalRange | { from: number; to: number } | null,
    forDatasetKey?: string
  ) {
    if (forDatasetKey) {
      this.datasetKey = forDatasetKey;
    }
    this.currentRange = range
      ? { from: range.from as Logical, to: range.to as Logical }
      : null;
  }

  public syncAllToRange(
    range: LogicalRange | { from: number; to: number },
    sourceId?: string,
    forDatasetKey?: string
  ) {
    if (this.isSyncingRange) return;
    this.isSyncingRange = true;
    if (forDatasetKey) {
      this.datasetKey = forDatasetKey;
    }
    this.currentRange = { from: range.from as Logical, to: range.to as Logical };
    try {
      for (const [id, entry] of this.entries.entries()) {
        if (id !== sourceId) {
          try {
            entry.chart.timeScale().setVisibleLogicalRange(this.currentRange);
          } catch {}
        }
      }
    } finally {
      this.isSyncingRange = false;
    }
  }

  public register(entry: SyncedChartEntry): () => void {
    this.entries.set(entry.id, entry);

    const handleRangeChange = (range: LogicalRange | null) => {
      if (!range || this.isSyncingRange || entry.isUpdatingSeries?.()) return;

      this.isSyncingRange = true;
      this.currentRange = range;
      try {
        for (const [otherId, otherEntry] of this.entries.entries()) {
          if (otherId !== entry.id) {
            try {
              otherEntry.chart.timeScale().setVisibleLogicalRange(range);
            } catch {}
          }
        }
      } finally {
        this.isSyncingRange = false;
      }

      // 任一圖表滑動接近最左緣時，自動觸發載入更早歷史資料
      if (range.from <= 10 && !this.isLoadingMore && this.onLoadMore) {
        this.isLoadingMore = true;
        Promise.resolve(this.onLoadMore()).finally(() => {
          setTimeout(() => {
            this.isLoadingMore = false;
          }, 500);
        });
      }
    };

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (this.isSyncingCrosshair) return;

      this.isSyncingCrosshair = true;
      try {
        const hasValidPoint =
          Boolean(param.time) &&
          Boolean(param.point) &&
          param.point!.x >= 0 &&
          param.point!.y >= 0;

        if (hasValidPoint && param.time) {
          const timeStr = String(param.time);
          entry.onHoverTimeChange?.(timeStr);

          for (const [otherId, otherEntry] of this.entries.entries()) {
            if (otherId !== entry.id) {
              otherEntry.onHoverTimeChange?.(timeStr);
              const series = otherEntry.getMainSeries();
              const val = otherEntry.getValueAtTime(timeStr);
              if (series && val !== undefined && !Number.isNaN(val)) {
                try {
                  otherEntry.chart.setCrosshairPosition(val, param.time, series);
                } catch {}
              }
            }
          }
        } else {
          entry.onHoverTimeChange?.(null);
          for (const [otherId, otherEntry] of this.entries.entries()) {
            if (otherId !== entry.id) {
              otherEntry.onHoverTimeChange?.(null);
              try {
                otherEntry.chart.clearCrosshairPosition();
              } catch {}
            }
          }
        }
      } finally {
        this.isSyncingCrosshair = false;
      }
    };

    entry.chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);
    entry.chart.subscribeCrosshairMove(handleCrosshairMove);

    // 若註冊時已有其他圖表設定好的可視區間，立即同步對齊
    if (this.currentRange) {
      this.isSyncingRange = true;
      try {
        entry.chart.timeScale().setVisibleLogicalRange(this.currentRange);
      } catch {} finally {
        this.isSyncingRange = false;
      }
    }

    return () => {
      try {
        entry.chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      } catch {}
      try {
        entry.chart.unsubscribeCrosshairMove(handleCrosshairMove);
      } catch {}
      this.entries.delete(entry.id);
    };
  }
}
