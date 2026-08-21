import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface WatchlistFolder {
  id: string;
  name: string;
  stocks: string[];
}

interface WatchlistContextType {
  folders: WatchlistFolder[];
  activeFolderId: string;
  setActiveFolderId: (id: string) => void;
  createFolder: (name: string) => void;
  renameFolder: (id: string, newName: string) => void;
  deleteFolder: (id: string) => void;
  addStockToFolder: (folderId: string, symbol: string) => void;
  removeStockFromFolder: (folderId: string, symbol: string) => void;
  getFoldersContainingStock: (symbol: string) => string[];
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'stock_watchlist_folders';
const ACTIVE_FOLDER_KEY = 'stock_watchlist_active_folder';

export const WatchlistProvider = ({ children }: { children: ReactNode }) => {
  const [folders, setFolders] = useState<WatchlistFolder[]>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse folders', e);
      }
    }

    // 向後相容舊版的 stock_watchlist
    const oldSaved = localStorage.getItem('stock_watchlist');
    if (oldSaved) {
      try {
        const oldList = JSON.parse(oldSaved);
        if (Array.isArray(oldList) && oldList.length > 0) {
          return [{ id: 'default', name: '預設名單', stocks: oldList }];
        }
      } catch (e) {
        console.error('Failed to parse old watchlist', e);
      }
    }

    return [{ id: 'default', name: '預設名單', stocks: [] }];
  });

  const [activeFolderId, setActiveFolderId] = useState<string>(() => {
    const saved = localStorage.getItem(ACTIVE_FOLDER_KEY);
    return saved || 'default';
  });

  // 當資料夾變更時，儲存到 LocalStorage
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(folders));
  }, [folders]);

  // 當選擇的資料夾變更時，儲存到 LocalStorage
  useEffect(() => {
    localStorage.setItem(ACTIVE_FOLDER_KEY, activeFolderId);
  }, [activeFolderId]);

  const createFolder = (name: string) => {
    const newId = `folder_${Date.now()}`;
    setFolders(prev => [...prev, { id: newId, name, stocks: [] }]);
    setActiveFolderId(newId);
  };

  const renameFolder = (id: string, newName: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
  };

  const deleteFolder = (id: string) => {
    if (folders.length <= 1) return; // 至少保留一個資料夾
    
    setFolders(prev => {
      const newFolders = prev.filter(f => f.id !== id);
      if (activeFolderId === id && newFolders.length > 0) {
        setActiveFolderId(newFolders[0].id);
      }
      return newFolders;
    });
  };

  const addStockToFolder = (folderId: string, symbol: string) => {
    setFolders(prev => prev.map(f => {
      if (f.id === folderId) {
        if (!f.stocks.includes(symbol)) {
          return { ...f, stocks: [symbol, ...f.stocks] };
        }
      }
      return f;
    }));
  };

  const removeStockFromFolder = (folderId: string, symbol: string) => {
    setFolders(prev => prev.map(f => {
      if (f.id === folderId) {
        return { ...f, stocks: f.stocks.filter(s => s !== symbol) };
      }
      return f;
    }));
  };

  const getFoldersContainingStock = (symbol: string) => {
    return folders.filter(f => f.stocks.includes(symbol)).map(f => f.id);
  };

  return (
    <WatchlistContext.Provider
      value={{
        folders,
        activeFolderId,
        setActiveFolderId,
        createFolder,
        renameFolder,
        deleteFolder,
        addStockToFolder,
        removeStockFromFolder,
        getFoldersContainingStock
      }}
    >
      {children}
    </WatchlistContext.Provider>
  );
};

export const useWatchlist = () => {
  const context = useContext(WatchlistContext);
  if (context === undefined) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
};
