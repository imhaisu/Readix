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
import { getTodayRange } from '../utils/helpers';

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
  const [isSwitchingFilter, setIsSwitchingFilter] = useState(false);
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
  const prevGroupId = usePrevious(currentGroupId);
  const prevTopicId = usePrevious(currentTopicId);
  const prevSearchTerm = usePrevious(searchTerm);

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

  // Effect: 当上下文或筛选条件变化时，更新豁免的文章ID
  useEffect(() => {
    setPersistentlyExemptedIds(prev => {
      const newSet = new Set<string>();
      
      if (selectedArticleIdRef.current) {
        const selectedArticle = allArticles.find(article => article.id === selectedArticleIdRef.current);
        
        // 添加额外检查：如果是"未读"筛选，确保只有未读文章被豁免
        const meetsFilterRequirement = 
          !filter.isRead || filter.isRead !== 'false' || // 如果不是未读筛选，则不用检查
          (selectedArticle && selectedArticle.isRead === 'false'); // 如果是未读筛选，检查文章是否未读
        
        if (selectedArticle && 
            (!currentFeedId || selectedArticle.sourceId === currentFeedId)) {
          // 无论文章是否符合筛选条件，都保留当前选中的文章，确保它能够显示
          newSet.add(selectedArticleIdRef.current);
        }
        // 移除了在未读筛选下自动取消已读文章选中的逻辑
      }
      return newSet;
    });

    console.log('上下文或筛选条件变化 - 清除持久豁免列表');
  }, [filter, currentFeedId, currentGroupId, listRefreshKey, allArticles, safeSelectArticle]);

  // 当文章列表刷新时，处理选中文章的显示逻辑
  useEffect(() => {
    console.log('文章列表刷新触发, 处理选中文章:', selectedArticleIdRef.current);
    
    // 清空所有持久豁免
    setPersistentlyExemptedIds(new Set<string>());
    
    if (selectedArticleIdRef.current) {
      // 查找当前选中的文章
      const selectedArticle = allArticles.find(a => a.id === selectedArticleIdRef.current);
      
      if (!selectedArticle) {
        console.log('选中的文章未找到，可能已被删除');
        return;
      }
      
      // 检查当前是否是"未读"筛选
      const isUnreadFilter = filter.isRead === 'false';
      
      // 检查文章是否符合筛选条件
      const meetsFilterRequirement = 
        !isUnreadFilter || // 不是未读筛选
        selectedArticle.isRead === 'false'; // 是未读筛选且文章未读
      
      console.log('文章是否符合筛选条件:', meetsFilterRequirement);
      
      // 无论是否符合筛选条件，始终保留当前选中的文章，确保能够显示
      setExemptedArticleIds(prev => new Set([selectedArticleIdRef.current!, ...prev]));
      
      // 删除取消选中的逻辑，让用户可以看到任何选中的文章
      // 即使在未读筛选条件下，也允许查看已读文章
    } else {
      // 没有选中文章，清空所有豁免
      setExemptedArticleIds(new Set<string>());
    }
  }, [articleListRefreshTrigger, filter, allArticles, safeSelectArticle]);

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

    const hasContextChanged = prevFeedId !== currentFeedId ||
                            prevGroupId !== currentGroupId ||
                            prevTopicId !== currentTopicId;

    const hasFilterOrSearchChanged = JSON.stringify(prevFilter) !== JSON.stringify(filter) ||
                                   prevSearchTerm !== searchTerm;

    const isSwitch = hasContextChanged || hasFilterOrSearchChanged;

      const loadArticlesForContext = async () => {
        if (!hasInitialLoaded) {
          setLoading(true);
        } else if (isSwitch) {
          setIsSwitchingFilter(true);
        } else {
          setIsRefreshing(true);
        }
        setError(null);
        
        console.log('===== ArticleListManager: 开始加载文章 =====');
        console.log('当前上下文:', { currentFeedId, currentGroupId, currentTopicId, filter });
        
        // 记录开始时间，用于性能分析
        const startTime = performance.now();
        
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
            console.log('按订阅源过滤:', currentFeedId);
            feedsInScope = await db.feeds.where('id').equals(currentFeedId).toArray();
            collection = db.articles.where('sourceId').equals(currentFeedId);
            contextFiltered = true;
          } else if (currentGroupId) {
            console.log('按分组过滤:', currentGroupId);
            feedsInScope = await db.feeds.where('groupId').equals(currentGroupId).toArray();
            const feedIdsInGroup = feedsInScope.map(f => f.id!).filter(Boolean);
            console.log('分组中的订阅源数量:', feedIdsInGroup.length);
            if (feedIdsInGroup.length > 0) {
              collection = db.articles.where('sourceId').anyOf(feedIdsInGroup);
            } else {
              // 关键改动：不再立即清空文章，而是构建一个永远不会匹配的查询
              collection = db.articles.where('id').equals('__NEVER_MATCH__');
            }
            contextFiltered = true;
          } else if (currentTopicId) {
            console.log('按主题过滤:', currentTopicId);
            const topicFeeds = await db.topicFeeds.where('topicId').equals(currentTopicId).toArray();
            const feedIdsInTopic = topicFeeds.map(tf => tf.feedId);
            console.log('主题中的订阅源数量:', feedIdsInTopic.length);
            if (feedIdsInTopic.length > 0) {
              feedsInScope = await db.feeds.where('id').anyOf(feedIdsInTopic).toArray();
              collection = db.articles.where('sourceId').anyOf(feedIdsInTopic);
              contextFiltered = true;
              
              // 获取主题过滤规则
              const topic = await db.topics.get(currentTopicId);
              if (topic && topic.filterRules && topic.filterRules.length > 0) {
                console.log('应用主题过滤规则:', topic.filterRules.length, '条规则');
              }
            } else {
              // 关键改动：不再立即清空文章，而是构建一个永远不会匹配的查询
              collection = db.articles.where('id').equals('__NEVER_MATCH__');
            }
            contextFiltered = true;
          } else if (window.location.pathname === '/today') {
            // 特殊处理今日视图
            console.log('今日视图');
            const todayRange = getTodayRange();
            console.log('今日时间范围:', new Date(todayRange.start), '至', new Date(todayRange.end));
            feedsInScope = await db.feeds.toArray();
            collection = db.articles
              .where('publishDate')
              .between(todayRange.start, todayRange.end, true, true);
            contextFiltered = true;
          }

          if (!contextFiltered) {
            console.log('无上下文过滤，获取所有订阅源');
            feedsInScope = await db.feeds.toArray();
            collection = db.articles.toCollection();
          }

          // 2. 属性过滤 (Attribute Filtering)
          console.log('应用属性过滤:', filter);
          collection = collection.filter(article => {
            // 始终排除隐藏的文章
            if (article.isHidden === true) return false;
            
            if (filter.isRead === 'false' && article.isRead !== 'false') return false;
            if (filter.isRead === 'true' && article.isRead !== 'true') return false;
            if (filter.isStarred === 'true' && article.isStarred !== 'true') return false;
            if (filter.isReadLater === 'true' && article.isReadLater !== 'true') return false;
            return true;
          });

          // 3. 搜索过滤 (Search Term Filtering)
          if (searchTerm && searchTerm.trim() !== '') {
            console.log('应用搜索过滤:', searchTerm);
            const lowerCaseSearchTerm = searchTerm.toLowerCase();
            collection = collection.filter(article => 
              article.title.toLowerCase().includes(lowerCaseSearchTerm)
            );
          }

          // 4. 排序 (Sorting)
          const sortedArticles = await collection.reverse().sortBy('publishDate');
          console.log('排序后的文章数量:', sortedArticles.length);

          // 5. 应用动态过滤规则 (JS-side filtering)
          const newFeedRulesMap = new Map(feedsInScope.map(f => [f.id!, f.filterRules || []]));
          setFeedRulesMap(newFeedRulesMap);
          
          // 先获取可能需要的主题过滤规则
          let topicFilterRules: TopicFilterRule[] = [];
          if (currentTopicId) {
            try {
              const topic = await db.topics.get(currentTopicId);
              if (topic && topic.filterRules && topic.filterRules.length > 0) {
                topicFilterRules = topic.filterRules;
                console.log('获取到主题过滤规则:', topicFilterRules.length, '条规则');
              }
            } catch (error) {
              console.error('获取主题过滤规则失败:', error);
            }
          }
          
          // 应用所有过滤规则
          let finalArticles = sortedArticles.filter(article => 
            !shouldArticleBeHidden(article, [...(newFeedRulesMap.get(article.sourceId) || []), ...globalFilterRules])
          );
          
          // 如果有主题过滤规则，进一步过滤文章
          if (currentTopicId && topicFilterRules.length > 0) {
            // 导入applyTopicFilterRules函数
            const { applyTopicFilterRules } = await import('../utils/filterApplier');
            finalArticles = finalArticles.filter(article => {
              return applyTopicFilterRules(article, topicFilterRules);
            });
            console.log('应用主题过滤规则后的文章数量:', finalArticles.length);
          }
          
          console.log('应用过滤规则后的文章数量:', finalArticles.length);
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
          
          console.log('===== ArticleListManager: 文章加载完成 =====');
          
          // 计算并记录加载耗时
          const endTime = performance.now();
          console.log(`文章加载耗时: ${Math.round(endTime - startTime)}ms，共加载 ${finalArticles.length} 篇文章`);
          
        } catch (err) {
          setError('加载文章失败，请稍后重试。');
          console.error("Error loading articles:", err);
        } finally {
          setLoading(false);
          setIsRefreshing(false);
          setIsSwitchingFilter(false);
          if (!hasInitialLoaded) {
            setHasInitialLoaded(true);
          }
        }
      };

      loadArticlesForContext();
    
  }, [db, isInitialized, currentFeedId, currentGroupId, currentTopicId, filter, searchTerm, listRefreshKey, globalFilterRules, articleListRefreshTrigger]);
  // 添加回articleListRefreshTrigger依赖，确保响应全局刷新事件

  
  // Effect 2: Combine fetched articles with exempted articles for display
  useEffect(() => {
    const combineArticles = async () => {
      if (!db || loading) return;
      
      console.log('合并文章列表 - 开始处理');
      console.log('当前筛选条件:', filter);

      // 使用 useMemo 或者在这里缓存结果，避免不必要的重新计算
      const articlesMap = new Map(allArticles.map(a => [a.id, a]));
      
      const exemptedIdsToFetch = new Set<string>();
      const combinedExemptedIds = new Set([...exemptedArticleIds, ...persistentlyExemptedIds]);
      const isUnreadFilter = filter.isRead === 'false';
      
      console.log('豁免ID数量:', combinedExemptedIds.size);
      console.log('当前选中文章:', selectedArticleIdRef.current);
      
      // 获取豁免文章
      let exemptedArticles: Article[] = [];

      // 只处理真正需要获取的文章 ID
      if (combinedExemptedIds.size > 0) {
      combinedExemptedIds.forEach(id => {
        if (!articlesMap.has(id)) {
          exemptedIdsToFetch.add(id);
        }
      });

        // 如果有需要从数据库获取的豁免ID
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
        
        // 收集所有豁免文章
        exemptedArticles = Array.from(combinedExemptedIds)
          .map(id => articlesMap.get(id))
          .filter((a): a is Article => !!a);
          
        console.log('找到豁免文章数量:', exemptedArticles.length);
      }
      
      // 准备最终文章列表
      let finalArticles: Article[] = [...allArticles];
      
      // 如果是"未读"筛选，需要特别处理
      if (isUnreadFilter) {
        console.log('应用未读筛选逻辑');
        
        // 当前选中的文章，即使是已读也需要显示
        const selectedArticle = selectedArticleIdRef.current 
          ? articlesMap.get(selectedArticleIdRef.current)
          : undefined;
        
        // 将豁免文章中符合条件的添加到结果中
        // 对于未读筛选，只添加当前选中的文章，其他已读文章不添加
        if (selectedArticle) {
          // 只有当前选中的文章才可能被豁免显示，其他已读文章不显示
          if (!finalArticles.some(a => a.id === selectedArticle.id)) {
            finalArticles.push(selectedArticle);
          }
        }
      } else {
        // 非未读筛选模式，添加所有豁免文章
        for (const exemptedArticle of exemptedArticles) {
          if (!finalArticles.some(a => a.id === exemptedArticle.id)) {
            finalArticles.push(exemptedArticle);
          }
        }
      }
      
      // 最后进行排序
      finalArticles.sort((a, b) => b.publishDate - a.publishDate);
      
      console.log('最终文章数量:', finalArticles.length);
      setDisplayedArticles(finalArticles);
      
      // 发送文章计数变化事件
      const articleCount = finalArticles.length;
      document.dispatchEvent(new CustomEvent('articleCountChanged', { 
        detail: { 
          count: articleCount,
          filter: filter,
          feedId: currentFeedId,
          groupId: currentGroupId,
          topicId: currentTopicId
        } 
      }));
      
      console.log('合并文章列表 - 完成处理');
    };

    // 使用 requestAnimationFrame 确保在下一帧渲染时更新，避免阻塞当前帧
    const rafId = requestAnimationFrame(() => {
      combineArticles();
    });
    
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [allArticles, exemptedArticleIds, persistentlyExemptedIds, db, loading, filter, currentFeedId, currentGroupId, currentTopicId]);

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

  const markAsRead = (articleIds: string[]) => {
    setAllArticles(prev =>
      prev.map(a => (articleIds.includes(a.id) ? { ...a, isRead: 'true' } : a))
    );
  };

  const markArticlesAsRead = async (articleIds: string[]) => {
    if (!db || articleIds.length === 0) return;
    try {
      await db.articles.where('id').anyOf(articleIds).modify({ isRead: 'true' });
      
      markAsRead(articleIds);
      
      // 检查当前是否使用"未读"筛选
      const isUnreadFilter = filter.isRead === 'false';
      
      // 如果使用的是"未读"筛选，我们需要更谨慎地处理豁免列表
      if (isUnreadFilter) {
        // 在"未读"筛选模式下，我们只豁免当前选中的文章
        // 其他已标记为已读的文章不应该保留在视图中
        const currentlySelectedId = selectedArticleIdRef.current;
        setExemptedArticleIds(prev => {
          const newSet = new Set(prev);
          // 仅当当前选中的文章被标记为已读时，保留它
          if (currentlySelectedId && articleIds.includes(currentlySelectedId)) {
            newSet.add(currentlySelectedId);
          }
          return newSet;
        });
      } else {
        // 非"未读"筛选模式下，保持原有逻辑
        setExemptedArticleIds(prev => {
          const newSet = new Set(prev);
          articleIds.forEach(id => newSet.add(id));
          return newSet;
        });
      }

      // 优化：一次性获取所有受影响的订阅源ID
      const articlesToUpdate = await db.articles.where('id').anyOf(articleIds).toArray();
      const affectedFeedIds = [...new Set(articlesToUpdate.map(a => a.sourceId).filter(Boolean))];
      
      // 批量更新未读计数
      for (const feedId of affectedFeedIds) {
        if (feedId) {
          const newUnreadCount = await db.articles.where({ sourceId: feedId, isRead: 'false' }).count();
          await db.feeds.update(feedId, { unreadCount: newUnreadCount });
        }
      }
      
      triggerFeedCountRefresh();
      
      return articleIds.length;
    } catch (error) {
      console.error('批量标记文章为已读失败:', error);
      throw error;
    }
  };

  return {
    loading,
    isRefreshing,
    isSwitchingFilter,
    articles: displayedArticles,
    feedInfoMap,
    error,
    toggleArticleReadStatus,
    handleToggleStar,
    markArticlesAsRead,
    markAsRead, // 暴露新方法
  };
}; 