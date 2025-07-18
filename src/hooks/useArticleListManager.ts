import React, { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { Article, FeedSource, FilterRule, TopicFilterRule, Topic } from '../db/database';
import { processIconUrl } from '../utils/iconUtils';
import Dexie from 'dexie';
import { usePrevious } from './usePrevious';
import { shouldArticleBeHidden } from '../utils/filterUtils';
import { useFilterRules } from '../contexts/FilterRulesContext';
import { useLayout } from '../contexts/LayoutContext';
import { applyTopicFilterRules } from '../utils/filterApplier';
import { LogConfig } from '../utils/logConfig';

export interface UseArticleListManagerProps {
  filter: any;
  searchTerm?: string;
  selectedArticleId: string | null;
  currentFeedId?: string;
  currentGroupId?: string;
  currentTopicId?: string;
  lastUpdatedArticleInfo?: { id: string; changes: Partial<Article> } | null;
  listRefreshKey?: number;
  onSelectArticle: (articleId: string | null) => void;
  onLastUpdatedArticleInfoChange: (info: { id: string; changes: Partial<Article> } | null) => void;
}

export const useArticleListManager = ({
  filter,
  searchTerm,
  selectedArticleId,
  currentFeedId,
  currentGroupId,
  currentTopicId,
  lastUpdatedArticleInfo,
  listRefreshKey,
  onSelectArticle,
  onLastUpdatedArticleInfoChange,
}: UseArticleListManagerProps) => {
  const { db, isInitialized, triggerFeedCountRefresh, articleListRefreshTrigger } = useDatabase();
  const { settings } = useSettings();
  const { globalFilterRules } = useFilterRules();

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // allArticles 现在存储的是从数据库直接获取、已排序和过滤的文章
  const [allArticles, setAllArticles] = useState<Article[]>([]);
  // displayedArticles 将是最终渲染的列表，包含了豁免的文章
  const [displayedArticles, setDisplayedArticles] = useState<Article[]>([]);
  const [feedInfoMap, setFeedInfoMap] = useState<Map<string, FeedSource>>(new Map());
  const [feedRulesMap, setFeedRulesMap] = useState<Map<string, FilterRule[]>>(new Map());
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exemptedArticleIds, setExemptedArticleIds] = useState<Set<string>>(new Set());
  const [persistentlyExemptedIds, setPersistentlyExemptedIds] = useState<Set<string>>(new Set());
  
  // 保存当前选中的文章ID，即使在刷新后也能保留
  const selectedArticleIdRef = useRef<string | null>(null);
  
  // 保存回调函数引用，避免闭包问题
  const onSelectArticleRef = useRef(onSelectArticle);
  const onLastUpdatedArticleInfoChangeRef = useRef(onLastUpdatedArticleInfoChange);
  
  // 更新回调函数引用
  useEffect(() => {
    onSelectArticleRef.current = onSelectArticle;
    onLastUpdatedArticleInfoChangeRef.current = onLastUpdatedArticleInfoChange;
  }, [onSelectArticle, onLastUpdatedArticleInfoChange]);
  
  // Effect: 当选中的文章ID变化时更新引用
  useEffect(() => {
    if (selectedArticleId) {
      selectedArticleIdRef.current = selectedArticleId;
    }
  }, [selectedArticleId]);

  const articlesRef = useRef(allArticles);
  articlesRef.current = allArticles;

  const prevFilter = usePrevious(filter);
  const prevSelectedArticleId = usePrevious(selectedArticleId);
  const prevFeedId = usePrevious(currentFeedId);

  // 当选中的文章改变时，将之前选中的文章ID添加到豁免列表中
  useEffect(() => {
    if (prevSelectedArticleId && prevSelectedArticleId !== selectedArticleId) {
      // 当用户选择了一个新的文章，将之前选中的文章添加到持久豁免列表中
      // 这样即使文章被标记为已读，它也会保留在列表中，直到用户刷新列表
      // 但我们需要检查它是否与当前的订阅源匹配
      if (prevSelectedArticleId) {
        const prevArticle = allArticles.find(a => a.id === prevSelectedArticleId);
        if (prevArticle && (!currentFeedId || prevArticle.sourceId === currentFeedId)) {
          setPersistentlyExemptedIds(prev => new Set([...prev, prevSelectedArticleId]));
        }
      }
    }
    
    // 如果有新选中的文章，确保它被豁免
    if (selectedArticleId) {
      // 使用函数形式的更新，确保不会导致多余的重渲染
      setExemptedArticleIds(prev => {
        // 如果文章ID已经在集合中，避免创建新的集合
        if (prev.has(selectedArticleId)) {
          return prev;
        }
        return new Set([...prev, selectedArticleId]);
      });
    }
  }, [selectedArticleId, prevSelectedArticleId, allArticles, currentFeedId]);

  // 安全地调用onSelectArticle
  const safeSelectArticle = useCallback((articleId: string | null) => {
    // 使用setTimeout将调用放到下一个事件循环，避免在渲染期间触发状态更新
    setTimeout(() => {
      onSelectArticleRef.current(articleId);
    }, 0);
  }, []);

  // 当订阅源变化时，清除不属于新订阅源的豁免文章
  useEffect(() => {
    if (prevFeedId !== currentFeedId) {
      // 清理豁免列表，只保留与新订阅源匹配的文章
      setExemptedArticleIds(prev => {
        const newSet = new Set<string>();
        // 如果有当前选中的文章并且它属于当前订阅源，保留它
        if (selectedArticleIdRef.current) {
          const selectedArticle = allArticles.find(a => a.id === selectedArticleIdRef.current);
          if (selectedArticle && (!currentFeedId || selectedArticle.sourceId === currentFeedId)) {
            newSet.add(selectedArticleIdRef.current);
          } else if (currentFeedId) {
            // 如果选中的文章不属于当前订阅源，取消选中
            selectedArticleIdRef.current = null;
            // 通知上层组件取消选中
            safeSelectArticle(null);
          }
        }
        return newSet;
      });
      
      // 同样清理持久豁免列表
      setPersistentlyExemptedIds(prev => {
        const newSet = new Set<string>();
        if (selectedArticleIdRef.current) {
          const selectedArticle = allArticles.find(a => a.id === selectedArticleIdRef.current);
          if (selectedArticle && (!currentFeedId || selectedArticle.sourceId === currentFeedId)) {
            newSet.add(selectedArticleIdRef.current);
          }
        }
        return newSet;
      });
    }
  }, [currentFeedId, prevFeedId, allArticles, safeSelectArticle]);

  // 当过滤条件或上下文变化时，清除持久豁免列表，但保留当前选中的文章
  useEffect(() => {
    setPersistentlyExemptedIds(prev => {
      const newSet = new Set<string>();
      // 如果有当前选中的文章，保留它，但仅当它属于当前订阅源
      if (selectedArticleIdRef.current) {
        const selectedArticle = allArticles.find(a => a.id === selectedArticleIdRef.current);
        if (selectedArticle && (!currentFeedId || selectedArticle.sourceId === currentFeedId)) {
          newSet.add(selectedArticleIdRef.current);
        }
      }
      return newSet;
    });
  }, [filter, currentFeedId, currentGroupId, listRefreshKey, allArticles]);

  // 当文章列表刷新时，确保当前选中的文章仍然在豁免列表中
  useEffect(() => {
    if (selectedArticleIdRef.current) {
      setExemptedArticleIds(prev => new Set([...prev, selectedArticleIdRef.current!]));
      setPersistentlyExemptedIds(prev => new Set([...prev, selectedArticleIdRef.current!]));
    }
  }, [articleListRefreshTrigger]);

  const toggleArticleReadStatus = useCallback(async (articleId: string, currentStatus: 'true' | 'false', sourceId: string | undefined) => {
    if (!db) return;
    const newStatus = currentStatus === 'true' ? 'false' : 'true';
    try {
      await db.articles.update(articleId, { isRead: newStatus });
      setAllArticles((prevAll) =>
        prevAll.map((a) => (a.id === articleId ? { ...a, isRead: newStatus } : a))
      );
      
      // 只有在标记为未读时，或者当前选中的文章被标记为已读时，才添加到豁免列表
      // 且只有当文章属于当前订阅源时才添加到豁免列表
      if ((newStatus === 'false' || articleId === selectedArticleIdRef.current) && 
          (!currentFeedId || sourceId === currentFeedId)) {
        setExemptedArticleIds(prev => new Set([...prev, articleId]));
      }
      
      if (lastUpdatedArticleInfo?.id === articleId) {
        onLastUpdatedArticleInfoChangeRef.current(null);
      }
      
      // 更新订阅源的未读计数
      if (sourceId) {
        // 使用精确查询获取真实的未读数量，而不是简单地加减1
        const actualUnreadCount = await db.articles
          .where({ sourceId: sourceId, isRead: 'false' })
          .filter(article => article.isHidden !== true)
          .count();
        
        const feed = feedInfoMap.get(sourceId) || await db.feeds.get(sourceId);
        if (feed?.id) {
          await db.feeds.update(feed.id, { unreadCount: actualUnreadCount });
          
          // 在主题视图中，需要确保主题的计数也能更新
          if (currentTopicId) {
            // 主题视图的计数会通过刷新全局计数得到更新
            triggerFeedCountRefresh();
          }
        }
        
        // 不管是哪种情况，都触发计数刷新
        triggerFeedCountRefresh();
      }
    } catch (error) {
      console.error("Error toggling article read status:", error);
    }
  }, [db, feedInfoMap, triggerFeedCountRefresh, lastUpdatedArticleInfo, currentFeedId, currentTopicId]);

  const toggleFnRef = useRef(toggleArticleReadStatus);
  toggleFnRef.current = toggleArticleReadStatus;

  useEffect(() => {
    if (!selectedArticleId || !settings.appearance.reading.autoMarkAsRead) {
      return;
    }
    const article = articlesRef.current.find((a) => a.id === selectedArticleId);
    if (article && article.isRead === 'false') {
      toggleFnRef.current(article.id, 'false', article.sourceId);
    }
  }, [selectedArticleId, settings.appearance.reading.autoMarkAsRead]);
  
  // Effect for handling external updates to a single article
  useEffect(() => {
    if (lastUpdatedArticleInfo && lastUpdatedArticleInfo.id) {
      setAllArticles(prevArticles => 
        prevArticles.map(article =>
          article.id === lastUpdatedArticleInfo.id
            ? { ...article, ...lastUpdatedArticleInfo.changes }
            : article
        )
      );
    }
  }, [lastUpdatedArticleInfo]);

  // Effect 1: Fetch articles from DB when context, filter, or search term changes
  useEffect(() => {
    if (!isInitialized || !db) {
      return;
    }

    const loadArticlesForContext = async () => {
      if (!hasInitialLoaded) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);
      
      const newExemptedIds = new Set<string>();
      if (selectedArticleIdRef.current) {
        newExemptedIds.add(selectedArticleIdRef.current);
      }
      setExemptedArticleIds(newExemptedIds);
      setPersistentlyExemptedIds(newExemptedIds);

      try {
        let collection: Dexie.Collection<Article, string> | Dexie.Table<Article, string> = db.articles;
        let feedsInScope: FeedSource[] = [];

        // 1. 上下文过滤 (Context Filtering)
        let contextFiltered = false;
        if (currentFeedId) {
          feedsInScope = await db.feeds.where('id').equals(currentFeedId).toArray();
          collection = db.articles.where('sourceId').equals(currentFeedId);
          contextFiltered = true;
        } else if (currentGroupId) {
          feedsInScope = await db.feeds.where('groupId').equals(currentGroupId).toArray();
          const feedIdsInGroup = feedsInScope.map(f => f.id!).filter(Boolean);
          if (feedIdsInGroup.length > 0) {
            collection = db.articles.where('sourceId').anyOf(feedIdsInGroup);
            contextFiltered = true;
          } else {
            setAllArticles([]);
            feedsInScope = [];
          }
        } else if (currentTopicId) {
          const topicFeeds = await db.topicFeeds.where('topicId').equals(currentTopicId).toArray();
          const feedIdsInTopic = topicFeeds.map(tf => tf.feedId);
          if (feedIdsInTopic.length > 0) {
            feedsInScope = await db.feeds.where('id').anyOf(feedIdsInTopic).toArray();
            collection = db.articles.where('sourceId').anyOf(feedIdsInTopic);
            contextFiltered = true;
          } else {
            setAllArticles([]);
            feedsInScope = [];
          }
        }

        if (!contextFiltered) {
          feedsInScope = await db.feeds.toArray();
          collection = db.articles.toCollection();
        }

        // 2. 属性过滤 (Attribute Filtering)
        collection = collection.filter(article => {
          if (filter.isRead === 'false' && article.isRead !== 'false') return false;
          if (filter.isRead === 'true' && article.isRead !== 'true') return false;
          if (filter.isStarred === 'true' && article.isStarred !== 'true') return false;
          if (filter.isReadLater === 'true' && article.isReadLater !== 'true') return false;
          return true;
        });

        // 3. 搜索过滤 (Search Term Filtering)
        if (searchTerm && searchTerm.trim() !== '') {
          const lowerCaseSearchTerm = searchTerm.toLowerCase();
          collection = collection.filter(article => 
            article.title.toLowerCase().includes(lowerCaseSearchTerm)
          );
        }

        // 4. 排序 (Sorting)
        const sortedArticles = await collection.reverse().sortBy('publishDate');

        // 5. 应用动态过滤规则 (JS-side filtering)
        const newFeedRulesMap = new Map(feedsInScope.map(f => [f.id!, f.filterRules || []]));
        setFeedRulesMap(newFeedRulesMap);
        
        const finalArticles = sortedArticles.filter(article => 
          !shouldArticleBeHidden(article, [...(newFeedRulesMap.get(article.sourceId) || []), ...globalFilterRules])
        );

        setAllArticles(finalArticles);

        // 获取并设置订阅源信息
        const sourceIds = [...new Set(finalArticles.map(a => a.sourceId).filter(Boolean))];
        if (sourceIds.length > 0) {
          const feeds = await db.feeds.where('id').anyOf(sourceIds as string[]).toArray();
          const newFeedInfoMap = new Map<string, FeedSource>();
          for (const feed of feeds) {
            if (feed && feed.id) {
              newFeedInfoMap.set(feed.id, {
                ...feed,
                iconUrl: await processIconUrl(feed.iconUrl),
              });
            }
          }
          setFeedInfoMap(newFeedInfoMap);
        }
        
      } catch (err) {
        setError('加载文章失败，请稍后重试。');
        console.error("Error loading articles:", err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
        if (!hasInitialLoaded) {
          setHasInitialLoaded(true);
        }
      }
    };

    loadArticlesForContext();
    
  }, [db, isInitialized, currentFeedId, currentGroupId, currentTopicId, filter, searchTerm, listRefreshKey, articleListRefreshTrigger, globalFilterRules]);

  
  // Effect 2: Combine fetched articles with exempted articles for display
  useEffect(() => {
    const combineArticles = async () => {
      if (!db || loading) return;

      const articlesMap = new Map(allArticles.map(a => [a.id, a]));
      
      const exemptedIdsToFetch = new Set<string>();
      const combinedExemptedIds = new Set([...exemptedArticleIds, ...persistentlyExemptedIds]);

      combinedExemptedIds.forEach(id => {
        if (!articlesMap.has(id)) {
          exemptedIdsToFetch.add(id);
        }
      });

      if (exemptedIdsToFetch.size > 0) {
        try {
          const missingExemptedArticles = await db.articles.where('id').anyOf([...exemptedIdsToFetch]).toArray();
          missingExemptedArticles.forEach(article => {
            articlesMap.set(article.id, article);
          });
        } catch (error) {
          console.error("Error fetching exempted articles:", error);
          }
      }
      
      const finalIdSet = new Set([...allArticles.map(a => a.id), ...combinedExemptedIds]);
      const finalArticles = Array.from(finalIdSet)
        .map(id => articlesMap.get(id))
        .filter((a): a is Article => !!a)
        .sort((a, b) => b.publishDate - a.publishDate);
      
      setDisplayedArticles(finalArticles);
    };

    combineArticles();
  }, [allArticles, exemptedArticleIds, persistentlyExemptedIds, db, loading]);

  const handleToggleStar = async (articleId: string) => {
    if (!db) return;
    const article = articlesRef.current.find(a => a.id === articleId);
    if (!article) return;
    const newIsStarred = article.isStarred === 'true' ? 'false' : 'true';
    try {
      await db.articles.update(articleId, { isStarred: newIsStarred });
      setAllArticles((prev) =>
        prev.map((a) => (a.id === articleId ? { ...a, isStarred: newIsStarred } : a))
      );
      setExemptedArticleIds(prev => new Set([...prev, articleId]));
    } catch (error) {
      console.error('Failed to toggle star status:', error);
    }
  };

  const handleMarkArticlesAsRead = async (articlesToMark: Article[]) => {
    if (!db || articlesToMark.length === 0) return;
    try {
      const articleIds = articlesToMark.map(a => a.id);
      await db.articles.where('id').anyOf(articleIds).modify({ isRead: 'true' });
      setAllArticles(prev =>
        prev.map(a => (articleIds.includes(a.id) ? { ...a, isRead: 'true' } : a))
      );
      setExemptedArticleIds(prev => new Set([...prev, ...articleIds]));

      const affectedFeeds = new Set(articlesToMark.map(a => a.sourceId).filter(Boolean));
      for (const feedId of affectedFeeds) {
        if (feedId) {
          const newUnreadCount = await db.articles.where({ sourceId: feedId, isRead: 'false' }).count();
          const feedInfo = feedInfoMap.get(feedId);
          if (feedInfo && feedInfo.id) {
            await db.feeds.update(feedInfo.id, { unreadCount: newUnreadCount });
          }
        }
      }
      triggerFeedCountRefresh();
      return articlesToMark.length;
    } catch (error) {
      console.error('批量标记文章为已读失败:', error);
      throw error;
    }
  };

  return {
    loading,
    isRefreshing,
    articles: displayedArticles,
    feedInfoMap,
    error,
    toggleArticleReadStatus,
    handleToggleStar,
    handleMarkArticlesAsRead,
  };
}; 