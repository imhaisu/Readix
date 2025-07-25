import { useState, useEffect, useRef } from 'react';
import { useDatabase } from '../../../contexts/DatabaseContext';
import { Topic, Article } from '../../../db/database';

// 缓存有效期（毫秒）
const CACHE_VALID_DURATION = 10000;

export const useTopicCounts = (topics: Topic[], filter: string) => {
  const { db, feedCountRefreshTrigger } = useDatabase();
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [topicFeeds, setTopicFeeds] = useState<Map<string, string[]>>(new Map());
  const topicCountCacheRef = useRef<Map<string, {count: number, timestamp: number}>>(new Map());

  // 添加缓存清除功能
  useEffect(() => {
    // 当feedCountRefreshTrigger更新时，清除缓存
    topicCountCacheRef.current.clear();
  }, [feedCountRefreshTrigger]);

  // 加载主题-订阅源关联数据
  useEffect(() => {
    const loadTopicFeedMap = async () => {
      if (!db) return;
      
      try {
        // 获取所有主题-订阅源关联
        const allTopicFeeds = await db.topicFeeds.toArray();
        
        // 构建主题->订阅源ID映射
        const topicFeedMap = new Map<string, string[]>();
        allTopicFeeds.forEach(tf => {
          if (!topicFeedMap.has(tf.topicId)) {
            topicFeedMap.set(tf.topicId, []);
          }
          topicFeedMap.get(tf.topicId)?.push(tf.feedId);
        });
        setTopicFeeds(topicFeedMap);
      } catch (error) {
        console.error('加载主题-订阅源关联数据失败:', error);
      }
    };
    
    loadTopicFeedMap();
  }, [db]);

  // 计算主题文章数量
  useEffect(() => {
    const calculateTopicCounts = async () => {
      if (!db || topics.length === 0 || topicFeeds.size === 0) {
        setCounts(new Map());
        return;
      }
      
      const now = Date.now();
      const topicCountMap = new Map<string, number>();
      
      // 检查哪些主题需要重新计算计数
      const topicsToUpdate: Topic[] = [];
      
      for (const topic of topics) {
        if (!topic.id) continue;
        
        // 检查缓存
        const cacheKey = `${topic.id}-${filter}`;
        const cacheEntry = topicCountCacheRef.current.get(cacheKey);
        
        if (cacheEntry && (now - cacheEntry.timestamp) < CACHE_VALID_DURATION) {
          // 使用缓存数据
          topicCountMap.set(topic.id, cacheEntry.count);
        } else {
          // 需要重新计算
          topicsToUpdate.push(topic);
        }
      }
      
      if (topicsToUpdate.length === 0) {
        // 所有数据都在缓存中
        setCounts(topicCountMap);
        return;
      }
      
      // 加载来自其他模块的过滤函数
      const { applyTopicFilterRules } = await import('../../../utils/filterApplier');
      
      // 收集所有需要查询的订阅源ID
      const allFeedIdsToQuery = new Set<string>();
      for (const topic of topicsToUpdate) {
        if (topic.id) {
          const feedIds = topicFeeds.get(topic.id) || [];
          feedIds.forEach(id => allFeedIdsToQuery.add(id));
        }
      }
      
      if (allFeedIdsToQuery.size === 0) {
        // 更新主题没有关联的订阅源
        for (const topic of topicsToUpdate) {
          if (topic.id) {
            topicCountMap.set(topic.id, 0);
            topicCountCacheRef.current.set(`${topic.id}-${filter}`, {
              count: 0,
              timestamp: now
            });
          }
        }
        setCounts(topicCountMap);
        return;
      }
      
      // 获取所有符合条件的文章
      let allRelevantArticles: Article[] = [];
      
      try {
        // 创建一个事务，确保查询过程中不会有变化
        await db.transaction('r', db.articles, async () => {
          const feedIdsArray = Array.from(allFeedIdsToQuery);
          
          if (filter === 'all') {
            allRelevantArticles = await db.articles
              .where('sourceId')
              .anyOf(feedIdsArray)
              .filter(article => article.isHidden !== true)
              .toArray();
          } else if (filter === 'unread') {
            allRelevantArticles = await db.articles
              .where('[sourceId+isRead]')
              .anyOf(feedIdsArray.map(id => [id, 'false']))
              .filter(article => article.isHidden !== true)
              .toArray();
          } else if (filter === 'starred') {
            allRelevantArticles = await db.articles
              .where('[sourceId+isStarred]')
              .anyOf(feedIdsArray.map(id => [id, 'true']))
              .filter(article => article.isHidden !== true)
              .toArray();
          } else {
            // 默认为未读
            allRelevantArticles = await db.articles
              .where('[sourceId+isRead]')
              .anyOf(feedIdsArray.map(id => [id, 'false']))
              .filter(article => article.isHidden !== true)
              .toArray();
          }
        
          // 遍历所有需要更新的主题，根据文章列表计算计数
          for (const topic of topicsToUpdate) {
            if (!topic.id) continue;
            
            const feedIds = topicFeeds.get(topic.id) || [];
            if (feedIds.length === 0) {
              topicCountMap.set(topic.id, 0);
              topicCountCacheRef.current.set(`${topic.id}-${filter}`, {
                count: 0,
                timestamp: now
              });
              continue;
            }
            
            // 获取主题过滤规则
            const topicFilterRules = topic.filterRules || [];
            
            // 过滤出属于当前主题的文章
            const topicArticles = allRelevantArticles.filter(
              article => feedIds.includes(article.sourceId)
            );
            
            // 如果有主题过滤规则，应用过滤规则
            let passedCount = 0;
            
            // 遍历所有文章，检查是否通过过滤规则
            for (const article of topicArticles) {
              const passed = applyTopicFilterRules(article, topicFilterRules);
              if (passed) {
                passedCount++;
              }
            }
            
            // 设置主题文章数量并更新缓存
            topicCountMap.set(topic.id, passedCount);
            topicCountCacheRef.current.set(`${topic.id}-${filter}`, {
              count: passedCount,
              timestamp: now
            });
          }
        });
      } catch (error) {
        console.error('获取主题文章数量失败:', error);
      }
      
      setCounts(topicCountMap);
    };
    
    calculateTopicCounts();
  }, [db, filter, topics, topicFeeds, feedCountRefreshTrigger]);

  return { counts, topicFeeds };
};