import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import Dexie from 'dexie';

// 定义数据库类
export class RssDatabase extends Dexie {
  feeds!: Dexie.Table<FeedSource, string>;
  articles!: Dexie.Table<Article, string>;
  groups!: Dexie.Table<Group, string>;
  savedLinks!: Dexie.Table<SavedLink, string>;

  constructor() {
    super('RssDatabase');
    
    // 定义数据库结构
    this.version(7).stores({
      feeds: 'id, groupId, title, url, lastUpdated, unreadCount, active, order, viewMode, bionicReading',
      articles: 'id, sourceId, publishDate, fetchDate, isRead, isStarred, url, title, scrollPosition, isReadLater, [sourceId+isRead]',
      groups: 'id, name, order, collapsed',
      savedLinks: 'id, url, title, addedDate, isRead'
    }).upgrade(async (tx) => {
      console.log("数据库升级: 版本 6->7。为 articles 添加了 fetchDate 索引。如果这是全新创建，则无需迁移。");
    });
    
    // 定义类型
    this.feeds = this.table('feeds');
    this.articles = this.table('articles');
    this.groups = this.table('groups');
    this.savedLinks = this.table('savedLinks');
  }
}

// 数据类型定义
export interface FeedSource {
  id?: string;
  title: string;
  url: string;
  iconUrl?: string;
  groupId?: string;
  updateFrequency: number;
  lastUpdated: Date;
  viewMode: 'full' | 'web' | 'original';
  unreadCount: number;
  active: boolean;
  bionicReading: boolean;
  order?: number;
}

export interface Article {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  author?: string;
  publishDate: number;
  fetchDate: number;
  content: string;
  contentText?: string;
  summary?: string;
  imageUrl?: string;
  isRead: string;
  isStarred: string;
  isReadLater?: string;
  isHidden?: boolean;
  tags?: string[];
  guid?: string;
  scrollPosition?: number;
}

export interface Group {
  id?: string;
  name: string;
  order: number;
  collapsed: boolean;
}

export interface SavedLink {
  id: string;
  url: string;
  title: string;
  addedDate: Date;
  content?: string;
  isRead: boolean;
  readPosition?: number;
}

// 数据库上下文类型
interface DatabaseContextType {
  db: RssDatabase | null;
  initDatabase: () => void;
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
  const [db, setDb] = useState<RssDatabase | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [initialLoadRefreshed, setInitialLoadRefreshed] = useState(false);
  const initStarted = useRef(false); // 使用 useRef 代替 useState 来防止重复初始化

  // 初始化数据库
  const initDatabase = useCallback(async () => {
    // 防止重复初始化。useRef 的值在 StrictMode 的二次调用中不会被重置。
    if (initStarted.current) {
      return;
    }
    initStarted.current = true;
    
    try {
      console.log('[DatabaseContext] 开始初始化数据库...');
      const database = new RssDatabase();
      console.log('[DatabaseContext] 数据库实例已创建');
      
      // 验证数据库连接
      console.log('[DatabaseContext] 正在打开数据库连接...');
      await database.open();
      console.log('[DatabaseContext] 数据库连接已打开');
      
      // 测试数据库是否可用
      console.log('[DatabaseContext] 测试数据库是否可用...');
      await database.articles.limit(1).toArray();
      console.log('[DatabaseContext] 数据库测试成功');
      
      setDb(database);
      (window as any).dbInstanceForDebug = database;
      setIsInitialized(true);
      console.log('[DatabaseContext] 数据库初始化成功，标记为已初始化');
    } catch (error) {
      console.error('数据库初始化失败:', error);
      setDb(null);
      setIsInitialized(false);
      
      // 如果是数据库版本问题，尝试清理并重新初始化
      if (error && typeof error === 'object' && 'name' in error) {
        if ((error as any).name === 'VersionError' || (error as any).name === 'DatabaseError') {
          console.log('检测到数据库版本或结构问题，尝试重置数据库...');
          try {
            await Dexie.delete('RssDatabase');
            console.log('旧数据库已删除，重新初始化...');
            
            const newDatabase = new RssDatabase();
            await newDatabase.open();
            await newDatabase.articles.limit(1).toArray();
            
            setDb(newDatabase);
            (window as any).dbInstanceForDebug = newDatabase;
            setIsInitialized(true);
            console.log('数据库重置并初始化成功');
          } catch (resetError) {
            console.error('数据库重置失败:', resetError);
          }
        }
      }
    } finally {
      // 不再需要 setIsInitializing
    }
  }, []); // 保持空的依赖项

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
    db,
    initDatabase,
    isInitialized,
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