import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { Article, FeedSource, FilterRule } from '../db/database';
import { processIconUrl } from '../utils/iconUtils';
import Dexie from 'dexie';
import { usePrevious } from './usePrevious';
import { shouldArticleBeHidden } from '../utils/filterUtils';
import { useFilterRules } from '../contexts/FilterRulesContext';

export interface UseArticleListManagerProps {
  filter: any;
  searchTerm?: string;
  selectedArticleId: string | null;
  currentFeedId?: string;
  currentGroupId?: string;
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
  const [allArticles, setAllArticles] = useState<Article[]>([]);
  const [displayedArticles, setDisplayedArticles] = useState<Article[]>([]);
  const [feedInfoMap, setFeedInfoMap] = useState<Map<string, FeedSource>>(new Map());
  const [feedRulesMap, setFeedRulesMap] = useState<Map<string, FilterRule[]>>(new Map());
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exemptedArticleIds, setExemptedArticleIds] = useState<Set<string>>(new Set());
  const [persistentlyExemptedIds, setPersistentlyExemptedIds] = useState<Set<string>>(new Set());

  const articlesRef = useRef(allArticles);
  articlesRef.current = allArticles;

  const prevFilter = usePrevious(filter);

  const toggleArticleReadStatus = useCallback(async (articleId: string, currentStatus: 'true' | 'false', sourceId: string | undefined) => {
    if (!db) return;
    const newStatus = currentStatus === 'true' ? 'false' : 'true';
    try {
      await db.articles.update(articleId, { isRead: newStatus });
      setAllArticles((prevAll) =>
        prevAll.map((a) => (a.id === articleId ? { ...a, isRead: newStatus } : a))
      );
      setExemptedArticleIds(prev => new Set(prev).add(articleId));
      if (lastUpdatedArticleInfo?.id === articleId) {
        onLastUpdatedArticleInfoChange(null);
      }
      if (sourceId) {
        const feed = feedInfoMap.get(sourceId) || await db.feeds.get(sourceId);
        if (feed?.id) {
          const change = newStatus === 'true' ? -1 : 1;
          await db.feeds.where('id').equals(feed.id).modify((f) => {
            f.unreadCount = (f.unreadCount || 0) + change;
          });
          triggerFeedCountRefresh();
        }
      }
    } catch (error) {
      console.error("Error toggling article read status:", error);
    }
  }, [db, feedInfoMap, triggerFeedCountRefresh, onLastUpdatedArticleInfoChange, lastUpdatedArticleInfo]);

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

  // Effect 1: Fetch articles from DB when context changes (feed, group, or forced refresh)
  useEffect(() => {
    if (!isInitialized || !db) {
      return;
    }

    const loadArticlesForContext = async () => {
      // No longer check isRefreshing here, let the effect dependencies handle it.
      
      // Show loading indicators
      if (!hasInitialLoaded) {
        setLoading(true); // Full page skeleton on first load
      } else {
        setIsRefreshing(true); // Spinner on subsequent loads
      }
      setError(null);
      setExemptedArticleIds(new Set());
      setPersistentlyExemptedIds(new Set());

      try {
        let collection: Dexie.Collection<Article, string> = db.articles.toCollection();

        // Filter by Feed or Group (DB-side)
        let feedsInScope: FeedSource[] = [];
        if (currentFeedId) {
          const feed = await db.feeds.get(currentFeedId);
          if (feed) feedsInScope.push(feed);
          collection = collection.filter(article => article.sourceId === currentFeedId);
        } else if (currentGroupId) {
          feedsInScope = await db.feeds.where('groupId').equals(currentGroupId).toArray();
          const feedIdsInGroup = new Set(feedsInScope.map(f => f.id).filter((id): id is string => !!id));
          if (feedIdsInGroup.size > 0) {
            collection = collection.filter(article => article.sourceId ? feedIdsInGroup.has(article.sourceId) : false);
          } else {
            setAllArticles([]);
            setLoading(false);
            setIsRefreshing(false);
            setHasInitialLoaded(true);
            return;
          }
        } else {
          // No specific context, fetch all feeds for rule application
          feedsInScope = await db.feeds.toArray();
        }
        
        const fetchedArticles = await collection.toArray();

        // 构建订阅源规则映射
        const newFeedRulesMap = new Map<string, FilterRule[]>();
        for (const feed of feedsInScope) {
          if (feed.id && feed.filterRules && Array.isArray(feed.filterRules)) {
            newFeedRulesMap.set(feed.id, feed.filterRules);
          }
        }
        setFeedRulesMap(newFeedRulesMap);
        
        // 按发布日期排序
        fetchedArticles.sort((a, b) => b.publishDate - a.publishDate);
        setAllArticles(fetchedArticles);

        // Fetch associated feed info for the loaded articles
        if (fetchedArticles.length > 0) {
          const sourceIds = [...new Set(fetchedArticles.map(a => a.sourceId).filter(Boolean))];
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
        }
        
        if (!hasInitialLoaded) {
          setHasInitialLoaded(true);
        }
      } catch (err) {
        setError('加载文章失败，请稍后重试。');
        if (err instanceof Error) {
            console.error(`Error name: ${err.name}, message: ${err.message}`);
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    };

    loadArticlesForContext();
    
  }, [db, isInitialized, currentFeedId, currentGroupId, listRefreshKey, articleListRefreshTrigger]);

  // Effect to clear exemptions when the main context (feed or group) changes
  useEffect(() => {
    setExemptedArticleIds(new Set());
    setPersistentlyExemptedIds(new Set());
  }, [currentFeedId, currentGroupId]);

  // Effect 2: Filter and sort articles for display when data or filters change
  const displayedArticlesResult = useMemo(() => {
    let filtered = [...allArticles];
    // 过滤开始

    // 应用过滤规则（动态过滤，不依赖于数据库中的isHidden字段）
    filtered = filtered.filter(article => {
      // 如果文章ID在豁免列表中，则始终显示
      if (exemptedArticleIds.has(article.id) || persistentlyExemptedIds.has(article.id)) {
        return true;
      }

      // 首先检查数据库中的isHidden字段
      if (article.isHidden === true) {
        return false;
      }

      // 获取该文章对应的订阅源规则
      const feedRules = article.sourceId ? feedRulesMap.get(article.sourceId) || [] : [];
      const activeFeedRules = feedRules.filter(r => r.isActive);
      
      // 获取激活的全局规则
      const activeGlobalRules = globalFilterRules.filter(r => r.isActive);
      
      // 合并规则并检查文章是否应该被隐藏
      const combinedRules = [...activeFeedRules, ...activeGlobalRules];
      
      const shouldHide = shouldArticleBeHidden(article, combinedRules);
      return !shouldHide;
    });

    // Client-side search term filter
    if (searchTerm && searchTerm.trim() !== '') {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter((article: Article) =>
        article.title.toLowerCase().includes(lowerSearchTerm) ||
        (article.author && article.author.toLowerCase().includes(lowerSearchTerm)) ||
        (article.summary && article.summary.toLowerCase().includes(lowerSearchTerm)) ||
        (article.contentText && article.contentText.toLowerCase().includes(lowerSearchTerm))
      );
    }

    // Apply main filters from the 'filter' prop
    if (filter) {
      filtered = filtered.filter(article => {
        let passes = true;
        if (typeof filter.isRead === 'string' && article.isRead !== filter.isRead) {
          passes = false;
        }
        if (passes && filter.isStarred === 'true' && article.isStarred !== 'true') {
          passes = false;
        }
        if (passes && filter.publishDate && typeof filter.publishDate === 'object' && '$gte' in filter.publishDate && '$lte' in filter.publishDate) {
          const { $gte, $lte } = filter.publishDate;
          if (article.publishDate < $gte || article.publishDate > $lte) {
            passes = false;
          }
        }
        return passes;
      });
    }

    return {
      articles: filtered,
      total: allArticles.length,
      filtered: filtered.length,
    };
  }, [allArticles, searchTerm, filter, exemptedArticleIds, persistentlyExemptedIds, feedRulesMap, globalFilterRules]);

  // Update displayed articles when the result changes
  useEffect(() => {
    setDisplayedArticles(displayedArticlesResult.articles);
  }, [displayedArticlesResult]);

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
      setExemptedArticleIds(prev => new Set(prev).add(articleId));
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
    error,
    displayedArticles,
    feedInfoMap,
    toggleArticleReadStatus,
    handleToggleStar,
    handleMarkArticlesAsRead,
    setAllArticles,
  };
}; 