import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { RssDatabase, initializeDatabaseSingleton, dbInstance, isDbInitialized } from '../db/database';

// 数据库上下文类型
interface DatabaseContextType {
  db: RssDatabase | null;
  isInitialized: boolean;
  refreshTrigger: number;
  triggerRefresh: () => void;
  feedListRefreshTrigger: number;
  triggerFeedListRefresh: () => void;
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
  const [feedListRefreshTrigger, setFeedListRefreshTrigger] = useState(0);
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

  useEffect(() => {
    if (initializationCompleted && dbInstance) {
      runDataMigration(dbInstance);
    }
  }, [initializationCompleted]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => {
      console.log('[DatabaseContext] Data refresh triggered. Old trigger:', prev, 'New trigger:', prev + 1);
      return prev + 1;
    });
  }, []);

  const triggerFeedListRefresh = useCallback(() => {
    setFeedListRefreshTrigger(prev => prev + 1);
  }, []);

  const handleSetInitialLoadRefreshed = useCallback(() => {
    setInitialLoadRefreshed(true);
  }, []);

  const value = {
    db: dbInstance,
    isInitialized: initializationCompleted,
    refreshTrigger,
    triggerRefresh,
    feedListRefreshTrigger,
    triggerFeedListRefresh,
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

const runDataMigration = async (db: RssDatabase) => {
  const MIGRATION_KEY = 'v1-fixed-relative-urls';

  if (localStorage.getItem(MIGRATION_KEY) === 'true') {
    console.log('数据迁移：相对路径修复已执行过，跳过。');
    return;
  }

  console.log('数据迁移：开始检查并修复文章中的相对URL...');
  
  try {
    const feeds = await db.feeds.toArray();
    const feedUrlMap = new Map(feeds.map(feed => [feed.id, feed.url]));
    const articlesToUpdate: { key: string; changes: { content?: string, imageUrl?: string } }[] = [];

    const allArticles = await db.articles.toArray();

    for (const article of allArticles) {
      let madeChange = false;
      const updates: { content?: string, imageUrl?: string } = {};
      const baseUrl = article.url || (article.sourceId ? feedUrlMap.get(article.sourceId) : null);

      if (!baseUrl) continue;

      // 1. 修复 imageUrl
      if (article.imageUrl && !article.imageUrl.startsWith('http')) {
        try {
          updates.imageUrl = new URL(article.imageUrl, baseUrl).href;
          madeChange = true;
        } catch (e) {
          console.warn(`迁移：无法修复 imageUrl ${article.imageUrl}`, e);
        }
      }

      // 2. 修复 content 中的图片和链接
      if (article.content) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(article.content, 'text/html');
        let contentChanged = false;

        doc.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src');
          if (src && !src.startsWith('http') && !src.startsWith('data:')) {
            try {
              img.src = new URL(src, baseUrl).href;
              contentChanged = true;
            } catch (e) {
               console.warn(`迁移：无法修复 img src ${src}`, e);
            }
          }
        });

        doc.querySelectorAll('a').forEach(a => {
          const href = a.getAttribute('href');
          if (href && !href.startsWith('http') && !href.startsWith('#')) {
            try {
              a.href = new URL(href, baseUrl).href;
              contentChanged = true;
            } catch (e) {
              console.warn(`迁移：无法修复 a href ${href}`, e);
            }
          }
        });

        if (contentChanged) {
          updates.content = doc.body.innerHTML;
          madeChange = true;
        }
      }
      
      if (madeChange) {
        articlesToUpdate.push({
          key: article.id,
          changes: updates
        });
      }
    }

    if (articlesToUpdate.length > 0) {
      console.log(`数据迁移：找到 ${articlesToUpdate.length} 篇文章需要更新。正在批量处理...`);
      await db.transaction('rw', db.articles, async () => {
        for (const item of articlesToUpdate) {
          await db.articles.update(item.key, item.changes);
        }
      });
      console.log('数据迁移：批量更新完成。');
    }

    localStorage.setItem(MIGRATION_KEY, 'true');
    console.log('数据迁移：所有文章的相对路径已修复。');

  } catch (error) {
    console.error('数据迁移过程中发生错误:', error);
  }
}; 