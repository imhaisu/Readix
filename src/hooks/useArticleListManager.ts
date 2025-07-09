import React, { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { Article, FeedSource, FilterRule } from '../db/database';
import { processIconUrl } from '../utils/iconUtils';
import Dexie from 'dexie';
import { usePrevious } from './usePrevious';
import { shouldArticleBeHidden } from '../utils/filterUtils';
import { useFilterRules } from '../contexts/FilterRulesContext';
import { DatabaseContext } from '../contexts/DatabaseContext';
import { useLayout } from '../contexts/LayoutContext';

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
  
  // 保存当前选中的文章ID，即使在刷新后也能保留
  const selectedArticleIdRef = useRef<string | null>(null);
  
  // 当选中的文章ID变化时更新引用
  useEffect(() => {
    if (selectedArticleId) {
      selectedArticleIdRef.current = selectedArticleId;
    }
  }, [selectedArticleId]);

  const articlesRef = useRef(allArticles);
  articlesRef.current = allArticles;

  const prevFilter = usePrevious(filter);
  const prevSelectedArticleId = usePrevious(selectedArticleId);

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
      setExemptedArticleIds(prev => new Set([...prev, selectedArticleId]));
    }
  }, [selectedArticleId, prevSelectedArticleId, allArticles, currentFeedId]);

  // 当过滤条件或上下文变化时，清除持久豁免列表，但保留当前选中的文章
  useEffect(() => {
    setPersistentlyExemptedIds(prev => {
      const newSet = new Set<string>();
      // 如果有当前选中的文章，保留它
      if (selectedArticleIdRef.current) {
        newSet.add(selectedArticleIdRef.current);
      }
      return newSet;
    });
  }, [filter, currentFeedId, currentGroupId, listRefreshKey]);

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
      if (newStatus === 'false' || articleId === selectedArticleIdRef.current) {
        setExemptedArticleIds(prev => new Set([...prev, articleId]));
      }
      
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
  }, [db, feedInfoMap, triggerFeedCountRefresh, onLastUpdatedArticleInfoChange, lastUpdatedArticleInfo, selectedArticleIdRef]);

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
      
      // 当订阅源或分组变化时，清空豁免列表和持久豁免列表
      // 这样在切换上下文时不会保留不属于当前上下文的文章
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

        // 如果当前有选中的文章，确保它在列表中
        if (selectedArticleIdRef.current) {
          const selectedArticle = fetchedArticles.find(a => a.id === selectedArticleIdRef.current);
          if (!selectedArticle) {
            // 如果选中的文章不在获取的文章列表中，尝试单独获取它
            try {
              const article = await db.articles.get(selectedArticleIdRef.current);
              if (article) {
                // 将选中的文章添加到文章列表中
                setAllArticles(prev => [article, ...prev]);
              }
            } catch (err) {
              console.error("Failed to fetch selected article:", err);
            }
          }
        }

        // 获取所有文章中涉及的订阅源ID
        const sourceIds = [...new Set(fetchedArticles.map(a => a.sourceId).filter(Boolean))];
        
        // 修复：确保获取所有需要的订阅源，而不仅仅是当前上下文中的
        // 这样即使在未读筛选条件下也能显示正确的订阅源信息
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
          
          // 确保当前选中的订阅源也在映射中
          if (currentFeedId && !newFeedInfoMap.has(currentFeedId)) {
            const currentFeed = await db.feeds.get(currentFeedId);
            if (currentFeed) {
              newFeedInfoMap.set(currentFeedId, {
                ...currentFeed,
                iconUrl: await processIconUrl(currentFeed.iconUrl),
              });
            }
          }
          
          setFeedInfoMap(newFeedInfoMap);
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

  // Effect 2: Filter and sort articles for display when data or filters change
  const displayedArticlesResult = useMemo(() => {
    let filtered = [...allArticles];
    // 过滤开始

    // 应用过滤规则（动态过滤，不依赖于数据库中的isHidden字段）
    filtered = filtered.filter(article => {
      // 如果文章ID在豁免列表中，则始终显示，但必须符合当前订阅源上下文
      const isExempted = exemptedArticleIds.has(article.id) || 
                         persistentlyExemptedIds.has(article.id) || 
                         article.id === selectedArticleIdRef.current;
      
      // 修复：如果当前选择了特定订阅源，则所有文章（包括豁免的文章）必须匹配该订阅源
      if (currentFeedId && article.sourceId !== currentFeedId) {
        return false;
      }
      
      if (isExempted) {
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
      filtered = filtered.filter((article: Article) => {
        // 如果是当前选中的文章，始终显示
        if (article.id === selectedArticleIdRef.current) {
          // 修复：如果当前选择了特定订阅源，选中的文章也必须匹配该订阅源
          if (currentFeedId && article.sourceId !== currentFeedId) {
            return false;
          }
          return true;
        }
        
        return article.title.toLowerCase().includes(lowerSearchTerm) ||
          (article.author && article.author.toLowerCase().includes(lowerSearchTerm)) ||
          (article.summary && article.summary.toLowerCase().includes(lowerSearchTerm)) ||
          (article.contentText && article.contentText.toLowerCase().includes(lowerSearchTerm));
      });
    }

    // Apply main filters from the 'filter' prop
    if (filter) {
      filtered = filtered.filter(article => {
        // 首先检查文章是否属于当前选中的订阅源
        if (currentFeedId && article.sourceId !== currentFeedId) {
          return false;
        }
        
        // 如果是当前选中的文章，显示它（前提是已通过上面的订阅源检查）
        if (article.id === selectedArticleIdRef.current) {
          return true;
        }
        
        // 如果文章在豁免列表中，即使它不符合过滤条件，也应该显示（前提是已通过上面的订阅源检查）
        if (exemptedArticleIds.has(article.id) || persistentlyExemptedIds.has(article.id)) {
          return true;
        }
        
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
  }, [allArticles, searchTerm, filter, exemptedArticleIds, persistentlyExemptedIds, feedRulesMap, globalFilterRules, currentFeedId]);

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
    error,
    displayedArticles,
    feedInfoMap,
    toggleArticleReadStatus,
    handleToggleStar,
    handleMarkArticlesAsRead,
    setAllArticles,
  };
}; 