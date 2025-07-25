import { useState, useEffect, useRef } from 'react';
import { useDatabase } from '../../../contexts/DatabaseContext';
import { FeedSource, Article } from '../../../db/database';

// 缓存有效期（毫秒）
const CACHE_VALID_DURATION = 10000;

export const useFeedCounts = (feeds: FeedSource[], filter: string) => {
  const { db, feedCountRefreshTrigger } = useDatabase();
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const countCacheRef = useRef<Map<string, {count: number, timestamp: number}>>(new Map());

  // 添加缓存清除功能
  useEffect(() => {
    // 当feedCountRefreshTrigger更新时，清除缓存
    countCacheRef.current.clear();
  }, [feedCountRefreshTrigger]);

  useEffect(() => {
    const calculateCounts = async () => {
      if (!db || feeds.length === 0) {
        setCounts(new Map());
        return;
      }

      const now = Date.now();
      const newCounts = new Map<string, number>();
      const feedsToQuery = [];
      
      // 首先尝试从缓存中获取计数
      for (const feed of feeds) {
        if (!feed.id) continue;
        
        // 检查是否有有效的缓存数据
        const cacheEntry = countCacheRef.current.get(`${feed.id}-${filter}`);
        if (cacheEntry && (now - cacheEntry.timestamp) < CACHE_VALID_DURATION) {
          // 使用缓存的计数
          newCounts.set(feed.id, cacheEntry.count);
        } else {
          // 需要查询数据库
          feedsToQuery.push(feed);
        }
      }
      
      // 如果所有数据都在缓存中，直接返回
      if (feedsToQuery.length === 0) {
        setCounts(newCounts);
        return;
      }
      
      // 只有缓存未命中的订阅源才需要查询数据库
      const feedIdsToQuery = feedsToQuery.map(feed => feed.id).filter(Boolean) as string[];
      
      if (feedIdsToQuery.length > 0) {
        try {
          let allArticles: Article[];
          
          if (filter === 'all') {
            allArticles = await db.articles
              .where('sourceId')
              .anyOf(feedIdsToQuery)
              .filter(article => article.isHidden !== true)
              .toArray();
          } else if (filter === 'unread') {
            allArticles = await db.articles
              .where('[sourceId+isRead]')
              .anyOf(feedIdsToQuery.map(id => [id, 'false']))
              .filter(article => article.isHidden !== true)
              .toArray();
          } else if (filter === 'starred') {
            allArticles = await db.articles
              .where('[sourceId+isStarred]')
              .anyOf(feedIdsToQuery.map(id => [id, 'true']))
              .filter(article => article.isHidden !== true)
              .toArray();
          } else {
            // 默认为未读
            allArticles = await db.articles
              .where('[sourceId+isRead]')
              .anyOf(feedIdsToQuery.map(id => [id, 'false']))
              .filter(article => article.isHidden !== true)
              .toArray();
          }
          
          // 统计并缓存结果
          const queryResults = new Map<string, number>();
          
          // 分组计数
          for (const article of allArticles) {
            if (article.sourceId) {
              queryResults.set(article.sourceId, (queryResults.get(article.sourceId) || 0) + 1);
            }
          }
          
          // 更新缓存和结果
          for (const feedId of feedIdsToQuery) {
            const count = queryResults.get(feedId) || 0;
            newCounts.set(feedId, count);
            
            // 更新缓存
            countCacheRef.current.set(`${feedId}-${filter}`, {
              count,
              timestamp: now
            });
          }
        } catch (error) {
          console.error('计算文章数量出错:', error);
        }
      }
      
      setCounts(newCounts);
    };

    calculateCounts();
  }, [db, filter, feeds, feedCountRefreshTrigger]);

  return counts;
}; 