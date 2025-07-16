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

  // Effect 1: Fetch articles from DB when context changes (feed, group, topic, or forced refresh)
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
      
      // 当订阅源、分组或主题变化时，清空豁免列表和持久豁免列表
      // 这样在切换上下文时不会保留不属于当前上下文的文章
      setExemptedArticleIds(new Set());
      setPersistentlyExemptedIds(new Set());

      try {
        let collection: Dexie.Collection<Article, string> = db.articles.toCollection();

        // 主题相关数据
        let currentTopic: Topic | undefined;
        
        // Filter by Feed, Group, or Topic (DB-side)
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
        } else if (currentTopicId) {
          // 获取主题下所有的订阅源ID
          const topicFeeds = await db.topicFeeds.where('topicId').equals(currentTopicId).toArray();
          const feedIdsInTopic = topicFeeds.map(tf => tf.feedId);
          
          // 加载主题信息，用于后续应用过滤规则
          currentTopic = await db.topics.get(currentTopicId);
          
          // 获取主题下所有的订阅源
          if (feedIdsInTopic.length > 0) {
            feedsInScope = await db.feeds.where('id').anyOf(feedIdsInTopic).toArray();
            // 过滤文章，只显示属于主题内订阅源的文章
            collection = collection.filter(article => article.sourceId ? feedIdsInTopic.includes(article.sourceId) : false);
          } else {
            // 如果主题下没有订阅源，则返回空数组
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
        
        // 如果是主题视图并且有过滤规则，应用主题特定的过滤
        let filteredArticles = fetchedArticles;
        if (currentTopic && currentTopic.filterRules && currentTopic.filterRules.length > 0) {
          // 确保过滤规则被应用 - 修复过滤逻辑
          const articlesBeforeFilter = filteredArticles.length;
          const tempArticles = [];
          
          // 遍历所有文章，应用过滤规则
          for (const article of filteredArticles) {
            if (applyTopicFilterRules(article, currentTopic.filterRules || [])) {
              tempArticles.push(article);
            }
          }
          
          // 替换为过滤后的文章列表
          filteredArticles = tempArticles;
          
          // 只在开发环境下输出日志
          if (process.env.NODE_ENV === 'development') {
            console.log(`主题过滤: ${articlesBeforeFilter} -> ${filteredArticles.length} 篇文章`);
          }
        }
        
        setAllArticles(filteredArticles);

        // 如果当前有选中的文章，确保它在列表中
        if (selectedArticleIdRef.current) {
          const selectedArticle = filteredArticles.find(a => a.id === selectedArticleIdRef.current);
          if (!selectedArticle) {
            // 如果选中的文章不在获取的文章列表中，尝试单独获取它
            try {
              const article = await db.articles.get(selectedArticleIdRef.current);
              if (article) {
                // 只有当文章符合当前主题的过滤规则时，才添加到列表
                if (!currentTopic || !currentTopic.filterRules || !currentTopic.filterRules.length || 
                    applyTopicFilterRules(article, currentTopic.filterRules)) {
                  setAllArticles(prev => [article, ...prev]);
                }
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
    
  }, [db, isInitialized, currentFeedId, currentGroupId, currentTopicId, listRefreshKey, articleListRefreshTrigger]);

  // 存储当前主题对象及其过滤规则
  const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);
  
  // Effect: 当主题ID变化时，加载主题数据
  useEffect(() => {
    if (currentTopicId && db) {
      db.topics.get(currentTopicId)
        .then(topic => {
          if (topic) {
            setCurrentTopic(topic);
            if (process.env.NODE_ENV === 'development') {
              console.log(`已加载主题 "${topic.name}" 的过滤规则，共 ${topic.filterRules?.length || 0} 条规则`);
            }
          } else {
            setCurrentTopic(null);
          }
        })
        .catch(error => {
          console.error('加载主题失败:', error);
          setCurrentTopic(null);
        });
    } else {
      setCurrentTopic(null);
    }
  }, [currentTopicId, db]);

  // 存储主题关联的订阅源ID
  const [topicFeedIds, setTopicFeedIds] = useState<string[]>([]);
  
  // 当主题ID变化时，加载该主题关联的订阅源
  useEffect(() => {
    if (!db || !currentTopicId) {
      setTopicFeedIds([]);
      return;
    }
    
    db.topicFeeds.where('topicId').equals(currentTopicId).toArray()
      .then(topicFeeds => {
        const feedIds = topicFeeds.map(tf => tf.feedId);
        setTopicFeedIds(feedIds);
        if (feedIds.length > 0 && process.env.NODE_ENV === 'development') {
          console.log(`主题关联了 ${feedIds.length} 个订阅源: ${feedIds.join(', ')}`);
        } else if (process.env.NODE_ENV === 'development') {
          console.log(`主题未关联任何订阅源`);
        }
      })
      .catch(error => {
        console.error('获取主题关联的订阅源失败:', error);
        setTopicFeedIds([]);
      });
  }, [db, currentTopicId]);

  // Effect 2: Filter and sort articles for display when data or filters change
  const displayedArticlesResult = useMemo(() => {
    let filtered = [...allArticles];
    // 过滤开始

    // 如果是主题视图，先过滤出属于该主题关联订阅源的文章
    if (currentTopicId && topicFeedIds.length > 0) {
      const beforeFilter = filtered.length;
      // 只保留属于主题关联订阅源的文章
      filtered = filtered.filter(article => topicFeedIds.includes(article.sourceId));
    }
    
    // 然后应用主题过滤规则
    if (currentTopicId && currentTopic) {
      // 创建一个临时数组，只包含通过过滤规则的文章
      const passedArticles = [];
      
      // 遍历所有文章，检查是否通过过滤规则
      for (const article of filtered) {
        // 对于主题视图，我们需要严格应用过滤规则，除非文章是当前选中的
        const isCurrentSelection = article.id === selectedArticleIdRef.current;
        
        // 只有当前选中的文章可以豁免过滤规则，其他文章必须通过过滤
        if ((isCurrentSelection && exemptedArticleIds.has(article.id)) || 
            applyTopicFilterRules(article, currentTopic.filterRules || [])) {
          passedArticles.push(article);
        }
      }
      
      // 替换过滤后的文章列表
      filtered = passedArticles;
    }

    // 应用过滤规则（动态过滤，不依赖于数据库中的isHidden字段）
    filtered = filtered.filter(article => {
      // 修复：检查文章是否属于当前订阅源，这是第一个最严格的过滤条件
      // 如果指定了订阅源，则必须严格过滤，不允许任何例外
      if (currentFeedId && article.sourceId !== currentFeedId) {
        // 移除豁免逻辑，确保在特定订阅源视图下只显示该订阅源的文章
        return false;
      }
      
      // 检查文章是否在豁免列表中，只有在没有指定特定订阅源时才应用这个逻辑
      // 或者当文章确实属于当前订阅源时
      const isExempted = (!currentFeedId || article.sourceId === currentFeedId) && (
        exemptedArticleIds.has(article.id) || 
        persistentlyExemptedIds.has(article.id) || 
        article.id === selectedArticleIdRef.current
      );
      
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
        // 如果是当前选中的文章，在它属于当前订阅源时显示
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
        // 如果是当前选中的文章，只有在它属于当前订阅源时才显示
        if (article.id === selectedArticleIdRef.current) {
          if (currentFeedId && article.sourceId !== currentFeedId) {
            return false;
          }
          return true;
        }
        
        // 如果文章在豁免列表中，只有在它属于当前订阅源时才显示
        if (exemptedArticleIds.has(article.id) || persistentlyExemptedIds.has(article.id)) {
          if (currentFeedId && article.sourceId !== currentFeedId) {
            return false;
          }
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
  }, [allArticles, searchTerm, filter, exemptedArticleIds, persistentlyExemptedIds, feedRulesMap, globalFilterRules, currentFeedId, currentTopic, currentTopicId, topicFeedIds]);

  // Update displayed articles when the result changes
  useEffect(() => {
    setDisplayedArticles(displayedArticlesResult.articles);
    
    // 添加调试信息 - 只在开发环境下输出
    if (currentTopicId && process.env.NODE_ENV === 'development') {
      console.log(`主题视图最终显示文章数量: ${displayedArticlesResult.articles.length} 篇`);
    }
  }, [displayedArticlesResult, currentTopicId]);

  // 添加一个文章数量变化的回调事件
  useEffect(() => {
    // 当显示的文章数量变化时，触发一个事件
    if (typeof window !== 'undefined') {
      // 创建一个自定义事件，包含文章数量信息
      const event = new CustomEvent('articleCountChanged', {
        detail: {
          count: displayedArticles.length,
          filter,
          feedId: currentFeedId,
          groupId: currentGroupId,
          topicId: currentTopicId
        }
      });
      
      // 派发事件
      window.dispatchEvent(event);
    }
  }, [displayedArticles.length, filter, currentFeedId, currentGroupId, currentTopicId]);

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