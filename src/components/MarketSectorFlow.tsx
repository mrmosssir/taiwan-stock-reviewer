import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ArrowUpRight, ArrowDownRight, Flame, Building2, PieChart, Zap } from 'lucide-react';
import type { SectorFlowItem, SectorStockRepresentative } from '../api';

interface MarketSectorFlowProps {
  date: string;
  sectors: SectorFlowItem[];
  isLoading: boolean;
  onRefresh: (rebuild?: boolean) => void;
}

const BAR_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-teal-500',
];

export const MarketSectorFlow: React.FC<MarketSectorFlowProps> = ({
  date,
  sectors,
  isLoading,
  onRefresh,
}) => {
  const navigate = useNavigate();
  const [flowMode, setFlowMode] = useState<'composite' | 'inst' | 'turnover'>('composite');

  // 依成交佔比排序的前 8 大主流族群（供頂部資金佔比結構條與卡片使用）
  const topShareSectors = useMemo(() => {
    return [...sectors].sort((a, b) => b.turnoverRatio - a.turnoverRatio).slice(0, 8);
  }, [sectors]);

  const otherShareRatio = useMemo(() => {
    const topSum = topShareSectors.reduce((acc, s) => acc + s.turnoverRatio, 0);
    return Math.max(0, Number((100 - topSum).toFixed(2)));
  }, [topShareSectors]);

  // 計算「資金流入 Top 10」與「資金流出 Top 10」（納入漲跌幅、漲跌家數比、成交佔比變化與外投買賣超）
  const { inflowList, outflowList } = useMemo(() => {
    const getDiff = (s: SectorFlowItem) =>
      s.ratioDiff5d !== 0 ? s.ratioDiff5d : s.ratioDiff1d;

    // 計算「價、量、籌碼」綜合強弱評分：
    // 1. 價格表現：族群加權均漲幅 (avgChangePct) + 淨上漲家數比 ((up - down) / count)
    // 2. 籌碼力道：外投買賣超絕對金額 (億) + 外投買賣超佔該族群成交額比例 (主力集中度)
    // 3. 人氣消長：成交佔比較 5 日均量增減 (diff %)
    const calcInflowStrength = (s: SectorFlowItem) => {
      const diff = getDiff(s);
      const instBillion = s.instNetAmount / 1e8;
      const instToTurnoverPct = s.turnover > 0 ? (s.instNetAmount / s.turnover) * 100 : 0;
      const breadthRatio = s.stockCount > 0 ? (s.upCount - s.downCount) / s.stockCount : 0; // -1 ~ +1

      return (
        s.avgChangePct * 12 +
        breadthRatio * 18 +
        Math.max(-15, Math.min(25, instBillion * 1.2)) +
        Math.max(-15, Math.min(20, instToTurnoverPct * 1.5)) +
        diff * 6
      );
    };

    const calcOutflowWeakness = (s: SectorFlowItem) => {
      const diff = getDiff(s);
      const instBillion = s.instNetAmount / 1e8; // 賣超為負
      const instToTurnoverPct = s.turnover > 0 ? (s.instNetAmount / s.turnover) * 100 : 0;
      const breadthRatio = s.stockCount > 0 ? (s.upCount - s.downCount) / s.stockCount : 0;

      // 數值愈負代表跌勢愈重、賣超愈兇、資金逃離愈明顯
      const panicVolumePenalty = s.avgChangePct < -0.5 && diff > 0 ? -diff * 5 : diff * 4;
      return (
        s.avgChangePct * 12 +
        breadthRatio * 18 +
        Math.max(-25, Math.min(15, instBillion * 1.2)) +
        Math.max(-20, Math.min(15, instToTurnoverPct * 1.5)) +
        panicVolumePenalty
      );
    };

    if (flowMode === 'composite') {
      // 價量籌碼綜合模式：流入榜必須具備正向綜合動能且非重挫族群（排除爆量長黑假流入）
      const inflow = [...sectors]
        .filter(
          (s) =>
            (s.avgChangePct > -0.3 && (s.instNetAmount > 0 || getDiff(s) > 0 || s.avgChangePct > 0.3)) ||
            calcInflowStrength(s) > 0
        )
        .sort((a, b) => calcInflowStrength(b) - calcInflowStrength(a))
        .slice(0, 10);

      const inflowSet = new Set(inflow.map((s) => s.industry));

      const outflow = [...sectors]
        .filter(
          (s) =>
            !inflowSet.has(s.industry) &&
            (s.avgChangePct < 0 || s.instNetAmount < 0 || getDiff(s) < 0)
        )
        .sort((a, b) => calcOutflowWeakness(a) - calcOutflowWeakness(b))
        .slice(0, 10);

      return { inflowList: inflow, outflowList: outflow };
    } else if (flowMode === 'inst') {
      // 外投主力流向 + 漲跌幅加權：同樣買超時，真正在上漲且主力集中度高的強勢族群優先排前面
      const inflow = [...sectors]
        .filter((s) => s.instNetAmount > 0)
        .sort((a, b) => {
          const scoreA = a.instNetAmount / 1e8 + a.avgChangePct * 3;
          const scoreB = b.instNetAmount / 1e8 + b.avgChangePct * 3;
          return scoreB - scoreA;
        })
        .slice(0, 10);

      const outflow = [...sectors]
        .filter((s) => s.instNetAmount < 0)
        .sort((a, b) => {
          const scoreA = a.instNetAmount / 1e8 + a.avgChangePct * 3;
          const scoreB = b.instNetAmount / 1e8 + b.avgChangePct * 3;
          return scoreA - scoreB;
        })
        .slice(0, 10);

      return { inflowList: inflow, outflowList: outflow };
    } else {
      // 成交佔比增減 + 價量方向：
      // 流入榜：佔比擴張 (diff > 0) 且族群並非重挫殺盤 (avgChangePct >= -0.3% 或上漲家數 >= 下跌家數)
      const inflow = [...sectors]
        .filter(
          (s) =>
            getDiff(s) > 0 && (s.avgChangePct >= -0.3 || s.upCount >= s.downCount)
        )
        .sort((a, b) => {
          const scoreA = getDiff(a) * 4 + a.avgChangePct * 1.5;
          const scoreB = getDiff(b) * 4 + b.avgChangePct * 1.5;
          return scoreB - scoreA;
        })
        .slice(0, 10);

      const inflowSet = new Set(inflow.map((s) => s.industry));

      // 流出榜：佔比萎縮退潮 (diff < 0) 或「爆量下跌逃命 (diff > 0 但 avgChangePct < -0.5%)」
      const outflow = [...sectors]
        .filter(
          (s) =>
            !inflowSet.has(s.industry) &&
            (getDiff(s) < 0 || (getDiff(s) > 0 && s.avgChangePct < -0.5))
        )
        .sort((a, b) => {
          const scoreA = getDiff(a) * 3 + a.avgChangePct * 2;
          const scoreB = getDiff(b) * 3 + b.avgChangePct * 2;
          return scoreA - scoreB;
        })
        .slice(0, 10);

      return { inflowList: inflow, outflowList: outflow };
    }
  }, [sectors, flowMode]);

  const formatBillion = (val: number) => {
    const b = val / 1e8;
    const sign = b > 0 ? '+' : '';
    return `${sign}${b.toFixed(1)}億`;
  };

  const renderStockChips = (stocks: SectorStockRepresentative[], isOutflow: boolean) => {
    if (!stocks || stocks.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          {isOutflow ? '領跌調節：' : '領漲吸金：'}
        </span>
        {stocks.slice(0, 3).map((st) => {
          const isUp = st.changePct >= 0;
          const instM = st.instNetAmount / 1e8;
          return (
            <button
              key={st.symbol}
              onClick={() => navigate(`/stock/${st.symbol}`)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-gray-200 dark:border-gray-700 transition-colors cursor-pointer"
              title={`點擊查看 ${st.symbol} ${st.name} K線 | 漲跌 ${st.changePct >= 0 ? '+' : ''}${st.changePct.toFixed(2)}% | 外投 ${formatBillion(st.instNetAmount)}`}
            >
              <span className="font-semibold text-gray-800 dark:text-gray-200">{st.name}</span>
              <span className="text-gray-400 font-mono">{st.symbol}</span>
              <span className={`font-bold ${isUp ? 'text-red-500' : 'text-emerald-500'}`}>
                {isUp ? '+' : ''}
                {st.changePct.toFixed(1)}%
              </span>
              {Math.abs(instM) >= 0.1 && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  ({instM > 0 ? '+' : ''}
                  {instM.toFixed(1)}億)
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm space-y-5">
      {/* 標題與控制列 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
            <PieChart size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                大盤族群資金流向佔比與流入／流出排行
              </h2>
              {date && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  統計日：{date}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              結合全市場族群「加權漲跌幅 ＋ 漲跌家數比 ＋ 成交比重變化 ＋ 外投買賣超」綜合排序，過濾假流入與死魚大牛股
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 排行依據切換 */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700/80 p-1 rounded-lg text-xs">
            <button
              onClick={() => setFlowMode('composite')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                flowMode === 'composite'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Zap size={13} />
              價量籌碼綜合
            </button>
            <button
              onClick={() => setFlowMode('inst')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                flowMode === 'inst'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Building2 size={13} />
              外投主力＋漲跌
            </button>
            <button
              onClick={() => setFlowMode('turnover')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                flowMode === 'turnover'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Flame size={13} />
              成交佔比＋價向
            </button>
          </div>

          <button
            onClick={() => onRefresh(true)}
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 cursor-pointer"
            title="從 R2 最新選股快照重新計算族群流向"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            重算流向
          </button>
        </div>
      </div>

      {isLoading && sectors.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-xs">
          <RefreshCw size={22} className="animate-spin mx-auto mb-2 text-blue-500" />
          正在統計全市場產業族群資金流向...
        </div>
      ) : sectors.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-xs">
          尚無當日族群資金流向資料，請點擊右上角「重算流向」從選股快照生成。
        </div>
      ) : (
        <>
          {/* 1. 全市場成交資金佔比結構條與前 8 大主流族群 */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-800 dark:text-gray-200">
                📊 當日大盤成交資金佔比結構（前 8 大主流族群）
              </span>
              <span className="text-gray-400 text-[11px]">
                括號內為較近 5 日平均成交佔比之增減 (Δ%)
              </span>
            </div>

            {/* 橫向堆疊進度條 */}
            <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-gray-100 dark:bg-gray-700">
              {topShareSectors.map((s, idx) => (
                <div
                  key={s.industry}
                  style={{ width: `${Math.max(1.5, s.turnoverRatio)}%` }}
                  className={`${BAR_COLORS[idx % BAR_COLORS.length]} h-full transition-all border-r border-white/20`}
                  title={`${s.industry}: ${s.turnoverRatio.toFixed(1)}% (成交 ${(s.turnover / 1e8).toFixed(0)} 億)`}
                />
              ))}
              {otherShareRatio > 0 && (
                <div
                  style={{ width: `${otherShareRatio}%` }}
                  className="bg-gray-300 dark:bg-gray-600 h-full"
                  title={`其他族群合計: ${otherShareRatio}%`}
                />
              )}
            </div>

            {/* 前 8 大主流族群小卡網格 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {topShareSectors.map((s, idx) => {
                const diff = s.ratioDiff5d !== 0 ? s.ratioDiff5d : s.ratioDiff1d;
                return (
                  <div
                    key={s.industry}
                    className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200/70 dark:border-gray-700/70 flex flex-col justify-between text-xs"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1.5 font-bold text-gray-800 dark:text-gray-100 truncate">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${BAR_COLORS[idx % BAR_COLORS.length]}`}
                        />
                        {s.industry}
                      </span>
                      <span
                        className={`text-[11px] font-bold shrink-0 ${
                          s.avgChangePct >= 0 ? 'text-red-500' : 'text-emerald-500'
                        }`}
                      >
                        {s.avgChangePct >= 0 ? '+' : ''}
                        {s.avgChangePct.toFixed(2)}%
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-1.5">
                      <div>
                        <span className="text-base font-black text-gray-900 dark:text-white">
                          {s.turnoverRatio.toFixed(1)}%
                        </span>
                        <span
                          className={`ml-1 text-[11px] font-semibold ${
                            diff > 0
                              ? 'text-red-500'
                              : diff < 0
                              ? 'text-emerald-500'
                              : 'text-gray-400'
                          }`}
                        >
                          ({diff > 0 ? '+' : ''}
                          {diff.toFixed(1)}%)
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400">
                        {(s.turnover / 1e8).toFixed(0)}億
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. 資金流入 vs 資金流出 雙欄對照排行榜 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* 左欄：資金流入排行 */}
            <div className="rounded-xl border border-red-200/70 dark:border-red-900/50 bg-red-50/20 dark:bg-red-950/10 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-red-100 dark:border-red-900/40">
                <div className="flex items-center gap-1.5 font-bold text-red-600 dark:text-red-400 text-sm">
                  <ArrowUpRight size={18} />
                  {flowMode === 'composite'
                    ? '強勢資金流入族群 Top 10 (價漲＋量增＋外投買)'
                    : flowMode === 'inst'
                    ? '主力資金淨流入族群 Top 10 (外投買超＋漲幅加權)'
                    : '人氣資金湧入族群 Top 10 (佔比擴張＋價強)'}
                </div>
                <span className="text-[11px] text-gray-400">漲跌家數 / 加權均漲幅</span>
              </div>

              <div className="space-y-2">
                {inflowList.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400">無明顯強勢流入族群</div>
                ) : (
                  inflowList.map((item, idx) => {
                    const diff = item.ratioDiff5d !== 0 ? item.ratioDiff5d : item.ratioDiff1d;
                    return (
                      <div
                        key={item.industry}
                        className="p-3 rounded-xl bg-white dark:bg-gray-800/90 border border-gray-200/80 dark:border-gray-700/80 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 text-xs font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">
                              {item.industry}
                            </span>
                            <span className="text-xs font-bold text-red-500 shrink-0">
                              {flowMode === 'turnover'
                                ? `佔比 ${item.turnoverRatio.toFixed(1)}% (${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%)`
                                : `外投 ${formatBillion(item.instNetAmount)}`}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs shrink-0">
                            <span className="text-[11px] text-gray-400">
                              <strong className="text-red-500">{item.upCount}</strong>漲 /{' '}
                              <strong className="text-emerald-500">{item.downCount}</strong>跌
                            </span>
                            <span
                              className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                item.avgChangePct >= 0
                                  ? 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400'
                                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {item.avgChangePct >= 0 ? '+' : ''}
                              {item.avgChangePct.toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                          <span>
                            成交佔比：<strong>{item.turnoverRatio.toFixed(1)}%</strong> (
                            {diff >= 0 ? '+' : ''}
                            {diff.toFixed(2)}%)
                          </span>
                          <span>
                            外資：
                            <strong
                              className={
                                item.foreignNetAmount >= 0 ? 'text-red-500' : 'text-emerald-500'
                              }
                            >
                              {formatBillion(item.foreignNetAmount)}
                            </strong>
                          </span>
                          <span>
                            投信：
                            <strong
                              className={
                                item.trustNetAmount >= 0 ? 'text-red-500' : 'text-emerald-500'
                              }
                            >
                              {formatBillion(item.trustNetAmount)}
                            </strong>
                          </span>
                        </div>

                        {renderStockChips(item.topInflowStocks, false)}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 右欄：資金流出排行 */}
            <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/10 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-100 dark:border-emerald-900/40">
                <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  <ArrowDownRight size={18} />
                  {flowMode === 'composite'
                    ? '弱勢資金流出族群 Top 10 (價跌＋外投賣／退潮)'
                    : flowMode === 'inst'
                    ? '主力資金淨流出族群 Top 10 (外投賣超＋跌幅加權)'
                    : '人氣資金退潮族群 Top 10 (佔比萎縮／爆量跌)'}
                </div>
                <span className="text-[11px] text-gray-400">漲跌家數 / 加權均漲幅</span>
              </div>

              <div className="space-y-2">
                {outflowList.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400">無明顯弱勢流出族群</div>
                ) : (
                  outflowList.map((item, idx) => {
                    const diff = item.ratioDiff5d !== 0 ? item.ratioDiff5d : item.ratioDiff1d;
                    return (
                      <div
                        key={item.industry}
                        className="p-3 rounded-xl bg-white dark:bg-gray-800/90 border border-gray-200/80 dark:border-gray-700/80 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">
                              {item.industry}
                            </span>
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                              {flowMode === 'turnover'
                                ? `佔比 ${item.turnoverRatio.toFixed(1)}% (${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%)`
                                : `外投 ${formatBillion(item.instNetAmount)}`}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs shrink-0">
                            <span className="text-[11px] text-gray-400">
                              <strong className="text-red-500">{item.upCount}</strong>漲 /{' '}
                              <strong className="text-emerald-500">{item.downCount}</strong>跌
                            </span>
                            <span
                              className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                item.avgChangePct >= 0
                                  ? 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400'
                                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {item.avgChangePct >= 0 ? '+' : ''}
                              {item.avgChangePct.toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                          <span>
                            成交佔比：<strong>{item.turnoverRatio.toFixed(1)}%</strong> (
                            {diff >= 0 ? '+' : ''}
                            {diff.toFixed(2)}%)
                          </span>
                          <span>
                            外資：
                            <strong
                              className={
                                item.foreignNetAmount >= 0 ? 'text-red-500' : 'text-emerald-500'
                              }
                            >
                              {formatBillion(item.foreignNetAmount)}
                            </strong>
                          </span>
                          <span>
                            投信：
                            <strong
                              className={
                                item.trustNetAmount >= 0 ? 'text-red-500' : 'text-emerald-500'
                              }
                            >
                              {formatBillion(item.trustNetAmount)}
                            </strong>
                          </span>
                        </div>

                        {renderStockChips(item.topOutflowStocks, true)}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
