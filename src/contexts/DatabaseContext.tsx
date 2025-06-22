import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { RssDatabase, initializeDatabaseSingleton, dbInstance, isDbInitialized } from '../db/database';

// 数据库上下文类型
interface DatabaseContextType {
  db: RssDatabase | null;
  isInitialized: boolean;
  refreshTrigger: number;
  triggerRefresh: () => void;
  initialLoadRefreshed: boolean;
  setInitialLoadRefreshed: () => void;
}

// 创建上下文
const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

// 提供者组件Props类型
interface DatabaseProviderProps {
  children: ReactNode;
}

// 数据库提供者组件
export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({ children }) => {
  // state 现在只用于触发重新渲染，而不是存储实例
  const [initializationCompleted, setInitializationCompleted] = useState(isDbInitialized);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [initialLoadRefreshed, setInitialLoadRefreshed] = useState(false);

  useEffect(() => {
    // 组件挂载时触发初始化
    if (!isDbInitialized) {
      initializeDatabaseSingleton().then(() => {
        // 初始化完成后，更新 state 以触发子组件的重新渲染
        setInitializationCompleted(true);
      });
    }
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => {
      console.log('[DatabaseContext] Data refresh triggered. Old trigger:', prev, 'New trigger:', prev + 1);
      return prev + 1;
    });
  }, []);

  const handleSetInitialLoadRefreshed = useCallback(() => {
    setInitialLoadRefreshed(true);
  }, []);

  const value = {
    db: dbInstance,
    isInitialized: initializationCompleted,
    refreshTrigger,
    triggerRefresh,
    initialLoadRefreshed,
    setInitialLoadRefreshed: handleSetInitialLoadRefreshed
  };

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
};

// 自定义钩子，用于组件中获取数据库上下文
export const useDatabase = (): DatabaseContextType => {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}; 