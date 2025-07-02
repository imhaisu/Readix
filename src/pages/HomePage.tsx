import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Layout, Empty, Select, Button, Typography, Skeleton, Input, Space, Tooltip, Popover, message, Radio, Spin, notification, Modal } from 'antd';
import type { InputRef } from 'antd';
import { 
  CheckCircleOutlined,
  SearchOutlined,
  StarOutlined,
  CheckSquareOutlined,
  AppstoreAddOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  CloseOutlined
} from '@ant-design/icons';
import ArticleList, { ArticleListHandle } from '../components/ArticleList';
import ArticleDetail from '../components/ArticleDetail';
import WelcomePage from '../components/WelcomePage';
import { useDatabase } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFilter, FilterType } from '../contexts/FilterContext';
import { refreshAllFeeds } from '../utils/rssParser';
import { FeedSource, Article } from '../db/database';
import { getTodayRange, debounce, updateUnreadCountOptimized, formatDate, logDateIssue } from '../utils/helpers';
import { debugFeedFilterRules, forceApplyAllFeedRules, checkAndFixAllFeedRules } from '../utils/filterUtils';
import { debugGlobalFilterRules } from '../contexts/FilterRulesContext';
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle, ImperativePanelGroupHandle } from 'react-resizable-panels';
import styles from './HomePage.module.css';
import { useLayout } from '../contexts/LayoutContext';
import { GeneralSettings } from '../types/settings';
import { useLiveQuery } from 'dexie-react-hooks';

import { useTitleBar } from '../contexts/TitleBarContext';
import { useArticleListManager } from '../hooks/useArticleListManager';
import { usePrevious } from '../hooks/usePrevious';
import FeedList from '../components/FeedList';
import SidebarLayout from '../layouts/SidebarLayout';
import AddFeedModal from '../components/AddFeedModal';
import DiscoverFeedsModal from '../components/DiscoverFeedsModal';
import MindMapModal from '../components/MindMapModal';
import PulsingLoader from '../components/PulsingLoader';

const { Header, Content } = Layout;
const { Option } = Select;
const { Title, Text } = Typography;

// 添加日志控制配置
const LOG_CONFIG = {
  ENABLE_FEED_LOGS: false,  // 订阅源日志
  ENABLE_ERROR_LOGS: true   // 错误日志
};

// 封装日志函数
const log = {
  feed: (message: string) => {
    if (LOG_CONFIG.ENABLE_FEED_LOGS) console.log(message);
  },
  error: (message: string, error?: any) => {
    if (LOG_CONFIG.ENABLE_ERROR_LOGS) {
      if (error) console.error(message, error);
      else console.error(message);
    }
  }
};

interface HomePageProps {
  filter?: 'all' | 'unread' | 'starred' | 'today';
}

const HomePage: React.FC<HomePageProps> = ({ filter }) => {
  const { db, articleListRefreshTrigger, triggerArticleListRefresh, isInitialized: dbInitialized, initialLoadRefreshed, setInitialLoadRefreshed } = useDatabase();
  const { settings, isInitialized: settingsInitialized, updateLayoutSettings } = useSettings();
  const { filter: activeListFilter, setFilter } = useFilter();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { feedId, groupId } = useParams<{ feedId?: string; groupId?: string }>();

  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [articleDetailViewMode, setArticleDetailViewMode] = useState<'full' | 'web' | 'original'>('full');
  const [pageTitle, setPageTitle] = useState('所有文章');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isTodayView, setIsTodayView] = useState(false);
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [searchModeActive, setSearchModeActive] = useState(false);
  const [lastUpdatedArticleInfo, setLastUpdatedArticleInfo] = useState<{ id: string, changes: Partial<Article> } | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [isFocusMode, setIsFocusMode] = useState(false);
  
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [pullDownProgress, setPullDownProgress] = useState(0); 
  const articleListRef = useRef<ArticleListHandle>(null);
  const articleListContainerRef = useRef<HTMLDivElement>(null);
  const pullStartY = useRef(0);
  const isPulling = useRef(false);

  const PULL_TO_REFRESH_THRESHOLD = 250;

  const refreshDependenciesRef = useRef({ db, feedId, groupId, triggerArticleListRefresh, setIsPullRefreshing });
  const lastRefreshTimeRef = useRef<number>(0);
  
  // 确保 refreshDependenciesRef 总是包含最新的值
  useEffect(() => {
    refreshDependenciesRef.current = { db, feedId, groupId, triggerArticleListRefresh, setIsPullRefreshing };
  }, [db, feedId, groupId, triggerArticleListRefresh, setIsPullRefreshing]);
  
  const searchInputRef = useRef<InputRef>(null);
  const detailPanelRef = useRef<ImperativePanelHandle>(null);
  const listPanelRef = useRef<ImperativePanelHandle>(null);
  const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);
  const { isArticleListVisible } = useLayout();
  const panelGroupHandleRef = useRef<ImperativePanelGroupHandle>(null);
  const panelGroupContainerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const groupElement = panelGroupContainerRef.current;
    if (!groupElement) return;

    const resizeObserver = new ResizeObserver(() => {
      if (listPanelRef.current && detailPanelRef.current) {
        const containerWidth = groupElement.getBoundingClientRect().width;
        if (containerWidth === 0) return;

        const articleListPxWidth = settings.layout.articleListWidth;
        
        let newArticleListPercentage = (articleListPxWidth / containerWidth) * 100;

        newArticleListPercentage = Math.max(25, Math.min(50, newArticleListPercentage));

        listPanelRef.current.resize(newArticleListPercentage);
        detailPanelRef.current.resize(100 - newArticleListPercentage);
      }
    });

    resizeObserver.observe(groupElement);

    return () => resizeObserver.disconnect();
  }, [settings.layout.articleListWidth]);

  const handleMainLayout = (sizes: number[]) => {
    if (panelGroupContainerRef.current) {
      const containerWidth = panelGroupContainerRef.current.getBoundingClientRect().width;
      const newPixelWidth = (containerWidth * sizes[0]) / 100;
      updateLayoutSettings({ 
        mainLayout: sizes,
        articleListWidth: newPixelWidth,
      });
    }
    setIsResizing(false);
  };

  const handleScrollCapture = (event: React.UIEvent<HTMLDivElement>) => {
    // console.log('[SCROLL CAPTURE] Scroll event detected! The real scrolling element is:', event.target);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const scrollableElement = articleListRef.current?.getScrollableElement();
    // console.log('[HomePage Touch] --- TOUCH START ---');
    if (!scrollableElement) {
      // console.log('[HomePage Touch] Aborting: scrollableElement is null.');
      return;
    }
    if (scrollableElement.scrollTop !== 0) {
      // console.log(`[HomePage Touch] Aborting: scrollTop is ${scrollableElement.scrollTop}, not 0.`);
      return;
    }
    if (isPullRefreshing) {
      // console.log(`[HomePage Touch] Aborting: isPullRefreshing is ${isPullRefreshing}.`);
      return;
    }
    
    pullStartY.current = e.touches[0].clientY;
    isPulling.current = true;
    // console.log(`[HomePage Touch] Success! Pulling gesture initiated. StartY: ${pullStartY.current}`);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isPulling.current) return;

    const currentY = e.touches[0].clientY;
    const pullDistance = currentY - pullStartY.current;
    
    // console.log(`[HomePage Touch] handleTouchMove. Pull distance: ${pullDistance}`);

    if (pullDistance > 0) {
      e.preventDefault(); 
      const progress = Math.min(1, pullDistance / PULL_TO_REFRESH_THRESHOLD);
      setPullDownProgress(progress);
    }
  };

  const handleTouchEnd = () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    // console.log(`[HomePage Touch] --- TOUCH END --- Progress: ${pullDownProgress}`);
    if (pullDownProgress === 1) {
      // console.log('Pull to refresh triggered by touch.');
      handleRefreshAll();
    }
    
    setTimeout(() => setPullDownProgress(0), 100);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!settings.advanced.gestures.pullToRefresh || isPulling.current) return;

    const scrollableElement = articleListRef.current?.getScrollableElement();
    if (!scrollableElement || isPullRefreshing) return;

    const { scrollTop } = scrollableElement;
    const { deltaY } = event;

    if (scrollTop === 0 && deltaY < 0) {
      const pullDistance = Math.abs(deltaY);
      const newProgress = Math.min(1, pullDownProgress + pullDistance / (PULL_TO_REFRESH_THRESHOLD * 2));
      setPullDownProgress(newProgress);

      if (newProgress >= 1) {
        // console.log('Pull to refresh triggered by wheel.');
        handleRefreshAll();
        setTimeout(() => setPullDownProgress(0), 100);
      }
    } else if (pullDownProgress > 0 && deltaY > 0) {
      setPullDownProgress(0);
    }
  };

  useEffect(() => {
    const handleAnnotationSidebarToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ isVisible: boolean }>;
      if (!customEvent.detail) return;

      const { isVisible } = customEvent.detail;
      setIsFocusMode(isVisible);
    };

    document.addEventListener('annotationSidebarToggled', handleAnnotationSidebarToggle);

    return () => {
      document.removeEventListener('annotationSidebarToggled', handleAnnotationSidebarToggle);
    };
  }, []);

  const initialRefreshDoneRef = useRef(false);

  const prevFeedIdRef = useRef<string | undefined>();
  const prevGroupIdRef = useRef<string | undefined>();
  const prevFilterPropRef = useRef<string | undefined>();

  useEffect(() => {
    const updateTitle = async () => {
      if (!db) return;

      if (feedId) {
        const feed = await db.feeds.get(feedId);
        setPageTitle(feed?.title || '订阅源');
      } else if (groupId) {
        const group = await db.groups.get(groupId);
        setPageTitle(group?.name || '分组');
      } else if (filter === 'starred') {
        setPageTitle('我的收藏');
      } else if (filter === 'unread') {
        setPageTitle('未读文章');
      } else if (filter === 'all') {
        setPageTitle('所有文章');
      } else if (window.location.pathname === '/today' || (filter === undefined && !feedId && !groupId)) {
        setPageTitle('今日文章');
      } else {
        setPageTitle('所有文章');
      }
    };

    updateTitle();
  }, [db, feedId, groupId, filter]);

  const loadFeeds = async () => {
    if (!db) return;
    
    // 添加日志，帮助调试
    console.log('[HomePage] 加载订阅源列表');
    const allFeeds = await db.feeds.toArray();
    setFeeds(allFeeds);
    
    // 调试订阅源过滤规则
    try {
      console.log('[HomePage] 开始调试订阅源过滤规则...');
      await debugFeedFilterRules(db);
    } catch (error) {
      console.error('[HomePage] 调试订阅源过滤规则时出错:', error);
    }
  };

  useEffect(() => {
    loadFeeds();
    // 移除triggerArticleListRefresh依赖，避免循环
  }, [db]);
  
  useEffect(() => {
    const prevFeed = prevFeedIdRef.current;
    const prevGroup = prevGroupIdRef.current;
    const prevFilter = prevFilterPropRef.current;

    let needsListRefresh = false;

    if (feedId !== prevFeed || groupId !== prevGroup) {
      needsListRefresh = true;
    } else if (!feedId && !groupId && filter !== prevFilter) {
      needsListRefresh = true;
    }

    if (needsListRefresh) {
      // console.log('[HomePage] Critical navigation change detected. Refreshing ArticleList key.', { feedId, prevFeed, groupId, prevGroup, filter, prevFilter });
      setSelectedArticleId(null); 
    }
    
    const newIsToday = filter === undefined && !feedId && !groupId;
    setIsTodayView(newIsToday);

    prevFeedIdRef.current = feedId;
    prevGroupIdRef.current = groupId;
    prevFilterPropRef.current = filter;

  }, [filter, feedId, groupId]);
  
  const handleRefreshAll = useCallback(async (options?: { silent?: boolean }) => {
    const { db, feedId, groupId, triggerArticleListRefresh, setIsPullRefreshing } = refreshDependenciesRef.current;
    
    // 添加防抖机制，避免短时间内多次刷新
    const now = Date.now();
    const MIN_REFRESH_INTERVAL = 5000; // 5秒内不重复刷新
    if (now - lastRefreshTimeRef.current < MIN_REFRESH_INTERVAL) {
      console.log('[HomePage] 刷新间隔太短，跳过');
      return;
    }
    lastRefreshTimeRef.current = now;

    if (!db) {
      console.error('[HomePage] 数据库未初始化');
      return;
    }

    if (!options?.silent) {
      setIsPullRefreshing(true);
    }

    try {
      // 确定要刷新的订阅源
      let feedsToRefresh: FeedSource[] = [];
      
      if (feedId) {
        // 刷新单个订阅源
        const feed = await db.feeds.get(feedId);
        if (feed) {
          feedsToRefresh = [feed];
        }
      } else if (groupId) {
        // 刷新分组内的所有订阅源
        feedsToRefresh = await db.feeds.where('groupId').equals(groupId).toArray();
      } else {
        // 刷新所有订阅源
        feedsToRefresh = await db.feeds.toArray();
      }

      try {
        if (feedsToRefresh.length > 0) {
          // console.log(`[HomePage] Refreshing ${feedsToRefresh.length} feeds...`);
          const results = await refreshAllFeeds(feedsToRefresh);

          if (db) {
            for (const result of results) {
              const { feed, articles: fetchedArticles } = result;
              if (fetchedArticles.length > 0) {
                log.feed(`[HomePage] 处理订阅源 ${feed.title} 的 ${fetchedArticles.length} 篇文章`);
                
                // 获取现有文章
                const existingArticles = await db.articles.where('sourceId').equals(feed.id!).toArray();
                const existingArticlesMap = new Map(existingArticles.map(a => [a.id, a]));
                
                // 处理文章数据
                const articlesToUpdate: Article[] = [];
                const articlesToAdd: Article[] = [];
                
                // 区分需要更新的文章和需要新增的文章
for (const fetchedArticle of fetchedArticles) {
  const existingArticle = existingArticlesMap.get(fetchedArticle.id);
  
  if (existingArticle) {
    // 已存在的文章 - 保留原始发布日期和阅读状态
    // 使用条件日志，默认不输出
    if (LOG_CONFIG.ENABLE_FEED_LOGS) {
      console.log(`[HomePage] 更新现有文章: ${fetchedArticle.title}, ID: ${fetchedArticle.id}`);
      console.log(`[HomePage] 原始日期: ${formatDate(existingArticle.publishDate, true)}, 新日期: ${formatDate(fetchedArticle.publishDate, true)}`);
    }
                    
                    // 决定使用哪个发布日期
                    let finalPublishDate = existingArticle.publishDate; // 默认保留原始日期
                    let finalIsFirstFetchDate = existingArticle.isFirstFetchDate;
                    
                    // 检查是否是芥末堆网站的文章
                    const isJiemoduiArticle = fetchedArticle.id.startsWith('jiemodui_') || 
                                              (existingArticle.sourceId && 
                                               feeds.find(f => f.id === existingArticle.sourceId)?.url.includes('jiemodui.com'));
                    
                        // 芥末堆文章特殊处理：始终保留原始日期
    if (isJiemoduiArticle) {
      if (LOG_CONFIG.ENABLE_FEED_LOGS) {
        console.log(`[HomePage] 芥末堆文章，保留原始日期: ${formatDate(existingArticle.publishDate, true)}`);
      }
      finalPublishDate = existingArticle.publishDate;
                    } else {
                      // 日期更新逻辑:
                      // 1. 如果新获取的文章有准确日期(非首次获取时间)，而原文章使用的是首次获取时间，则更新日期
                      // 2. 如果两者都不是首次获取时间，保留较早的日期（避免文章日期不断变化）
                      // 3. 如果两者都是首次获取时间，保留原始日期（保持稳定性）
                      if (!fetchedArticle.isFirstFetchDate) {
                        if (existingArticle.isFirstFetchDate) {
                                    // 情况1: 找到了更准确的日期
          if (LOG_CONFIG.ENABLE_FEED_LOGS) {
            console.log(`[HomePage] 找到更准确的日期，从首次获取时间更新为实际发布时间`);
          }
          finalPublishDate = fetchedArticle.publishDate;
          finalIsFirstFetchDate = false;
          
          // 记录日期变更
          if (LOG_CONFIG.ENABLE_FEED_LOGS) {
            logDateIssue(
              `日期更新 (首次获取 → 实际日期)`,
              existingArticle.title,
              existingArticle.originalPubDate,
              finalPublishDate,
              false
            );
          }
                        } else {
                                      // 情况2: 两者都有准确日期，保留较早的那个
            if (fetchedArticle.publishDate < existingArticle.publishDate) {
              if (LOG_CONFIG.ENABLE_FEED_LOGS) {
                console.log(`[HomePage] 发现更早的准确日期，更新文章日期`);
              }
              finalPublishDate = fetchedArticle.publishDate;
              
              // 记录日期变更
              if (LOG_CONFIG.ENABLE_FEED_LOGS) {
                logDateIssue(
                  `日期更新 (发现更早日期)`,
                  existingArticle.title,
                  existingArticle.originalPubDate,
                  finalPublishDate,
                  false
                );
              }
                          }
                        }
                      }
                    }
                    
                    articlesToUpdate.push({
                      ...fetchedArticle,
                      // 保留这些字段不变
                      publishDate: finalPublishDate, // 使用决定的发布日期
                      isRead: existingArticle.isRead,
                      isStarred: existingArticle.isStarred,
                      isReadLater: existingArticle.isReadLater,
                      scrollPosition: existingArticle.scrollPosition,
                      annotations: existingArticle.annotations,
                      // 可以更新的字段
                      content: fetchedArticle.content || existingArticle.content,
                      summary: fetchedArticle.summary || existingArticle.summary,
                      imageUrl: fetchedArticle.imageUrl || existingArticle.imageUrl,
                      fetchDate: fetchedArticle.fetchDate, // 更新获取时间
                      // 更新首次获取时间标记
                      isFirstFetchDate: finalIsFirstFetchDate,
                    });
                  } else {
                    // 新文章 - 直接添加
                    log.feed(`[HomePage] 添加新文章: ${fetchedArticle.title}, ID: ${fetchedArticle.id}, 日期: ${formatDate(fetchedArticle.publishDate, true)}`);
                    articlesToAdd.push(fetchedArticle);
                  }
                }
                
                // 批量更新和添加文章
                if (articlesToUpdate.length > 0) {
                  await db.articles.bulkPut(articlesToUpdate);
                  log.feed(`[HomePage] 已更新 ${articlesToUpdate.length} 篇文章`);
                }
                
                if (articlesToAdd.length > 0) {
                  await db.articles.bulkAdd(articlesToAdd);
                  log.feed(`[HomePage] 已添加 ${articlesToAdd.length} 篇新文章`);
                }
                
                // 更新未读计数
                await updateUnreadCountOptimized(db, feed.id!);
              }
            }
            
            // 触发文章列表刷新
            triggerArticleListRefresh();
          }
        }
      } catch (error) {
        log.error('[HomePage] 刷新订阅源失败:', error);
      }
    } finally {
      if (!options?.silent) {
        setTimeout(() => {
          setIsPullRefreshing(false);
        }, 500);
      } else {
        setIsPullRefreshing(false);
      }
      
      // 手动更新订阅源列表，确保UI显示最新数据
      loadFeeds();
    }
  }, [loadFeeds]);
  
  const handleLocalListRefresh = useCallback(() => {
    // 增加列表刷新键值，强制重新渲染列表
    setListRefreshKey(prev => prev + 1);
    
    // 如果是今天视图，也刷新数据，但要避免循环刷新
    // 使用已经添加的防抖机制来防止频繁刷新
    if (isTodayView) {
      // 调用handleRefreshAll时会自动检查时间间隔
      handleRefreshAll({ silent: true });
    }
  }, [isTodayView, handleRefreshAll]);

  useEffect(() => {
    document.addEventListener('request-list-refresh', handleLocalListRefresh);
    return () => {
      document.removeEventListener('request-list-refresh', handleLocalListRefresh);
    };
  }, [handleLocalListRefresh]);

  useEffect(() => {
    if (dbInitialized && isTodayView) {
      // 只有在初始加载或明确要求刷新时才进行刷新
      if (!initialLoadRefreshed) {
        handleRefreshAll({ silent: true });
        setInitialLoadRefreshed();
      }
    }
  }, [dbInitialized, isTodayView, initialLoadRefreshed, setInitialLoadRefreshed, handleRefreshAll]);

  useEffect(() => {
    if (searchModeActive && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchModeActive]);

  useEffect(() => {
    if (selectedArticleId && detailPanelRef.current?.isCollapsed() && settings.general.layoutMode === 'three-column') {
      detailPanelRef.current.expand();
    }
  }, [selectedArticleId, settings.general.layoutMode]);

  useEffect(() => {
    if (settings.general.layoutMode === 'two-column' && selectedArticleId) {
        if (listPanelRef.current && !listPanelRef.current.isCollapsed()) {
            listPanelRef.current.collapse();
        }
    } else if (settings.general.layoutMode === 'three-column') {
        if (listPanelRef.current && listPanelRef.current.isCollapsed()) {
            listPanelRef.current.expand();
        }
        if (detailPanelRef.current && detailPanelRef.current.isCollapsed()) {
            detailPanelRef.current.expand();
        }
    }
  }, [selectedArticleId, settings.general.layoutMode]);

  useEffect(() => {
    if (listPanelRef.current) {
        const isCollapsed = listPanelRef.current.isCollapsed();
        if (isArticleListVisible && isCollapsed) {
            listPanelRef.current.expand();
        } else if (!isArticleListVisible && !isCollapsed) {
            listPanelRef.current.collapse();
        }
    }
  }, [isArticleListVisible]);

  const handleArticleSelect = (articleId: string | null) => {
    const selectedArticle = articleListRef.current?.getArticles().find(a => a.id === articleId);

    if (selectedArticle) {
      const mode = selectedArticle.isFullText ? 'full' : 'original';
      setArticleDetailViewMode(mode);
    }
    
    setSelectedArticleId(articleId);

    if (articleId && listPanelRef.current?.getSize() === 0) {
      listPanelRef.current?.expand();
    }
  };

  const handleNavigate = (direction: 'next' | 'prev') => {
    const articles = articleListRef.current?.getArticles() || [];
    if (articles.length === 0 || !selectedArticleId) return;

    const currentIndex = articles.findIndex(a => a.id === selectedArticleId);
    if (currentIndex === -1) return;

    let nextIndex;
    if (direction === 'next') {
      nextIndex = currentIndex + 1;
    } else {
      nextIndex = currentIndex - 1;
    }

    if (nextIndex >= 0 && nextIndex < articles.length) {
      const nextArticleId = articles[nextIndex].id;
      handleArticleSelect(nextArticleId);
      // 可以在这里添加滚动到新选中文章的逻辑
      articleListRef.current?.scrollToArticle(nextArticleId);
    } else {
      // 可以在这里给用户一些提示，比如 "已经是最后一篇了"
      message.info(direction === 'next' ? '已经是最后一篇了' : '已经是第一篇了');
    }
  };

  const handleCloseArticle = () => {
    setSelectedArticleId(null);
  };

  const handleArticleModified = (articleId: string, changes: Partial<Article>) => {
    setLastUpdatedArticleInfo({ id: articleId, changes });
  };
  
  const handleManualListRefresh = () => {
    handleRefreshAll();
  };

  const articleFilterForList = useMemo(() => {
    const conditions: any = {};

    // 1. Establish the main context from URL params or filter prop
    if (feedId) {
      conditions.sourceId = feedId;
    } else if (groupId) {
      conditions.groupId = groupId; // Pass to consumers like ArticleList and handleMarkAllReadLocal
    } else if (filter === 'starred') {
      conditions.isStarred = 'true';
    } else if (filter === 'unread') {
      conditions.isRead = 'false';
    } else if (window.location.pathname === '/today' || (filter === undefined && !feedId && !groupId)) {
      // Today view (either via route prop or default route)
      const todayRange = getTodayRange();
      conditions.publishDate = { $gte: todayRange.start, $lte: todayRange.end };
    }
    // `filter === 'all'` needs no initial condition.
    
    // 2. Additively apply the Radio.Group filter from the bottom bar.
    if (activeListFilter === 'starred') {
      conditions.isStarred = 'true';
    } else if (activeListFilter === 'unread') {
      conditions.isRead = 'false';
    }
    
    return conditions;
  }, [feedId, groupId, activeListFilter, filter]);

  const handleAddFirstFeed = (feed: FeedSource) => {
    navigate(`/feed/${feed.id}`);
    triggerArticleListRefresh();
  };

  const handleArticleDetailViewModeChange = (mode: 'full' | 'web' | 'original') => {
    setArticleDetailViewMode(mode);
  };

  const handleMarkAllReadLocal = async () => {
    if (!db) return;

    const currentFilter = articleFilterForList;
    let articlesToUpdateQuery = db.articles.where('isRead').equals('false');
    
    // Special handling for groupId, as articles don't have it directly.
    if (currentFilter.groupId) {
      const feedsInGroup = await db.feeds.where('groupId').equals(currentFilter.groupId).toArray();
      const feedIdsInGroup = feedsInGroup.map((f: FeedSource) => f.id);
      if (feedIdsInGroup.length === 0) {
        message.info('该分组下没有订阅源。');
        return;
      }
      articlesToUpdateQuery = articlesToUpdateQuery.and((a: Article) => feedIdsInGroup.includes(a.sourceId));
      delete currentFilter.groupId; // Remove so it's not processed below
    }

    // Applying the rest of the dynamic filter
    if (currentFilter) {
      const { sourceId, isStarred, publishDate } = currentFilter;
      if (sourceId) {
        articlesToUpdateQuery = articlesToUpdateQuery.and((a: Article) => a.sourceId === sourceId);
      }
      if (isStarred === 'true') {
        articlesToUpdateQuery = articlesToUpdateQuery.and((a: Article) => a.isStarred === 'true');
      }
      if (publishDate && typeof publishDate === 'object' && '$gte' in publishDate && '$lte' in publishDate) {
         articlesToUpdateQuery = articlesToUpdateQuery.and((a: Article) => a.publishDate >= publishDate.$gte && a.publishDate <= publishDate.$lte);
      }
    }
    
    const unreadArticles = await articlesToUpdateQuery.toArray();
    
    if (unreadArticles.length === 0) {
      message.info('没有需要标记的未读文章。');
      return;
    }

    Modal.confirm({
      title: '确认全部已读',
      content: `确定要将当前筛选下的 ${unreadArticles.length} 篇文章标记为已读吗？此操作不可撤销。`,
      okText: '全部设为已读',
      cancelText: '取消',
      onOk: async () => {
        try {
          const articleIds = unreadArticles.map(a => a.id);
          const sourceIds = [...new Set(unreadArticles.map(a => a.sourceId))];

          await db.articles.where('id').anyOf(articleIds).modify({ isRead: 'true' });

          for (const sId of sourceIds) {
            await updateUnreadCountOptimized(db, sId);
          }
          
          triggerArticleListRefresh();

        } catch (error) {
          console.error('Failed to mark all as read:', error);
          message.error('操作失败，请重试。');
        }
      },
    });
  };

  // 检查是否有文章存在
  const [hasArticles, setHasArticles] = useState(true);
  
  // 检查是否有任何文章存在的函数
  useEffect(() => {
    const checkForArticles = async () => {
      if (!db || !dbInitialized) return;
      
      try {
        // 检查是否至少有一篇文章
        const count = await db.articles.count();
        setHasArticles(count > 0);
      } catch (error) {
        console.error('检查文章失败:', error);
        setHasArticles(true); // 出错时假设有文章，避免不必要地显示欢迎页面
      }
    };
    
    checkForArticles();
  }, [db, dbInitialized, articleListRefreshTrigger]);

  // 仅当确认没有订阅源且没有文章时才显示欢迎页面
  const showWelcomePage = dbInitialized && settingsInitialized && feeds.length === 0 && !hasArticles && !searchTerm;

  // 从URL查询参数中获取articleId
  useEffect(() => {
    const articleIdFromUrl = searchParams.get('articleId');
    if (articleIdFromUrl) {
      console.log(`[HomePage] 从URL查询参数中获取articleId: ${articleIdFromUrl}`);
      setSelectedArticleId(articleIdFromUrl);
    }
  }, [searchParams, feedId, groupId]);

  // 添加一个函数，用于清理数据库中的重复文章
  const cleanupDuplicateArticles = useCallback(async () => {
    if (!db) return;
    
    try {
      console.log('[HomePage] 开始清理重复文章...');
      
      // 获取所有文章
      const allArticles = await db.articles.toArray();
      
      // 按源和标题分组，找出重复项
      const articleGroups = new Map<string, Article[]>();
      
      allArticles.forEach(article => {
        // 使用源ID和标题作为分组键
        const key = `${article.sourceId}#${article.title}`;
        if (!articleGroups.has(key)) {
          articleGroups.set(key, []);
        }
        articleGroups.get(key)!.push(article);
      });
      
      // 找出并删除重复项
      const articlesToDelete: string[] = [];
      
      articleGroups.forEach(group => {
        if (group.length > 1) {
          // 按发布日期排序，保留最新的一篇（对于芥末堆文章，保留最新的）
          group.sort((a, b) => b.publishDate - a.publishDate);
          
          // 保留第一篇（最新的），删除其余的
          for (let i = 1; i < group.length; i++) {
            articlesToDelete.push(group[i].id);
          }
        }
      });
      
      // 批量删除重复文章
      if (articlesToDelete.length > 0) {
        await db.articles.bulkDelete(articlesToDelete);
        console.log(`[HomePage] 已删除 ${articlesToDelete.length} 篇重复文章`);
        
        // 刷新文章列表
        triggerArticleListRefresh();
      } else {
        console.log('[HomePage] 没有发现重复文章');
      }
    } catch (error) {
      console.error('[HomePage] 清理重复文章失败:', error);
    }
  }, [db, triggerArticleListRefresh]);
  
  // 在应用初始化时清理重复文章并调试过滤规则
  useEffect(() => {
    if (dbInitialized && db) {
      cleanupDuplicateArticles();
      
      // 延迟调试过滤规则，确保在数据库完全加载后执行
      const timer = setTimeout(async () => {
        console.log('[HomePage] 应用初始化完成，开始检查和修复过滤规则...');
        
        // 第一步：检查并修复所有订阅源的过滤规则状态
        console.log('[HomePage] 检查并修复订阅源过滤规则...');
        try {
          await checkAndFixAllFeedRules(db);
          console.log(`[HomePage] 完成过滤规则一致性检查和修复`);
        } catch (error) {
          console.error('[HomePage] 检查和修复过滤规则时出错:', error);
        }
        
        // 第二步：强制应用所有订阅源过滤规则（最高优先级）
        console.log('[HomePage] 强制应用所有订阅源过滤规则...');
        try {
          const updatedCount = await forceApplyAllFeedRules(db);
          console.log(`[HomePage] 强制应用订阅源过滤规则完成，更新了 ${updatedCount} 篇文章`);
          triggerArticleListRefresh(); // 刷新文章列表显示
        } catch (error) {
          console.error('[HomePage] 强制应用订阅源过滤规则时出错:', error);
        }
        
        // 调试全局过滤规则
        console.log('[HomePage] 检查全局过滤规则...');
        try {
          debugGlobalFilterRules();
        } catch (error) {
          console.error('[HomePage] 调试全局过滤规则时出错:', error);
        }
        
        // 调试订阅源过滤规则
        console.log('[HomePage] 检查订阅源过滤规则...');
        try {
          await debugFeedFilterRules(db);
        } catch (error) {
          console.error('[HomePage] 调试订阅源过滤规则时出错:', error);
        }
      }, 1000); // 缩短延迟时间，确保尽快应用规则
      
      return () => clearTimeout(timer);
    }
  }, [dbInitialized, cleanupDuplicateArticles, db, triggerArticleListRefresh]);

  /**
   * 直接修复文章的显示状态，绕过常规的过滤规则
   * 这个函数用于在正常过滤规则失效时强制设置文章的状态
   */
  const forceFixArticleDisplayStates = async () => {
    if (!db || !dbInitialized) {
      console.error('[HomePage] 无法修复文章状态：数据库未初始化');
      return;
    }
    
    console.log('[HomePage] 开始强制修复文章显示状态...');
    
    try {
      // 获取所有订阅源
      const feeds = await db.feeds.toArray();
      
      for (const feed of feeds) {
        if (!feed.id) continue;
        
        // 仅处理"人人都是产品经理"订阅源
        if (feed.title === "人人都是产品经理") {
          console.log(`[HomePage] 处理订阅源 "${feed.title}" 的文章`);
          
          // 获取该订阅源的所有文章
          const articles = await db.articles.where('sourceId').equals(feed.id).toArray();
          console.log(`[HomePage] 找到 ${articles.length} 篇文章需要检查`);
          
          // 记录需要修复的文章
          const articlesToFix: Array<{
            id: string;
            title: string;
            isHidden: boolean;
            reason: string;
          }> = [];
          
          // 检查每篇文章
          for (const article of articles) {
            const title = article.title.toLowerCase();
            
            // 检查是否包含特定关键词
            const hasO2O = title.includes('o2o');
            const hasAI = title.includes('ai');
            const has1700 = title.includes('1700');
            const hasXiaohongshu = title.includes('小红书');
            
            // 如果包含任一关键词，应该被隐藏
            const shouldBeHidden = hasO2O || hasAI || has1700 || hasXiaohongshu;
            
            // 如果当前状态与应有状态不符，则加入修复列表
            if (article.isHidden !== shouldBeHidden) {
              articlesToFix.push({
                id: article.id,
                title: article.title,
                isHidden: shouldBeHidden,
                reason: hasO2O ? 'O2O' : 
                        hasAI ? 'AI' : 
                        has1700 ? '1700' : 
                        hasXiaohongshu ? '小红书' : '未知'
              });
            }
          }
          
          console.log(`[HomePage] 需要修复 ${articlesToFix.length} 篇文章`);
          
          // 显示需要修复的文章信息
          articlesToFix.forEach(article => {
            console.log(`[HomePage] 文章 "${article.title}" 将被${article.isHidden ? '隐藏' : '显示'}，原因: ${article.reason}`);
          });
          
          // 批量修复文章
          if (articlesToFix.length > 0) {
            await db.transaction('rw', db.articles, async () => {
              for (const article of articlesToFix) {
                await db.articles.update(article.id, { 
                  isHidden: article.isHidden,
                  lastUpdated: new Date().toISOString() + '_force'
                });
              }
            });
            
            console.log(`[HomePage] 已修复 ${articlesToFix.length} 篇文章`);
            triggerArticleListRefresh();
          }
        }
      }
      
      console.log('[HomePage] 文章显示状态修复完成');
    } catch (error) {
      console.error('[HomePage] 修复文章显示状态时出错:', error);
    }
  };

  // 调用一次强制修复
  useEffect(() => {
    if (dbInitialized && db) {
      // 延迟5秒执行强制修复，确保在其他初始化完成后
      const timer = setTimeout(() => {
        forceFixArticleDisplayStates();
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [dbInitialized, db]);

  if (showWelcomePage) {
    return <WelcomePage onAddFirstFeed={handleAddFirstFeed} />;
  }

  if (!dbInitialized || !settingsInitialized) {
    return (
      <Layout className={styles.homeLayout}>
        <Header className={styles.header}>
          <Title level={4} className={styles.headerTitle}>&nbsp;</Title>
        </Header>
        <Content style={{ padding: '20px', textAlign: 'center' }}>
          <Skeleton active paragraph={{ rows: 10 }} />
        </Content>
      </Layout>
    );
  }

  return (
    <div className={styles.homeLayout}>
      <div 
        className={`${styles.contentLayout} ${isResizing ? styles.isResizing : ''}`}
        ref={panelGroupContainerRef}
      >
        <PanelGroup 
          direction="horizontal" 
          ref={panelGroupHandleRef}
          onLayout={handleMainLayout}
          className={`${styles.panelGroup} ${isFocusMode ? styles.focusMode : ''}`}
        >
          {isArticleListVisible && (
            <>
              <Panel
                ref={listPanelRef}
                defaultSize={settings.layout.mainLayout?.[0] ?? 33}
                minSize={25}
                maxSize={50}
                collapsible
                id="article-list-panel"
                className={styles.articleListPanel}
              >
                <div 
                  className={styles.articleListColumn}
                  onScrollCapture={handleScrollCapture}
                >
                  <div className={styles.listHeader}>
                    <div className={styles.listTitle}>
                      <Title level={4} className={styles.panelHeaderTitle} ellipsis>
                        {pageTitle}
                      </Title>
                      <Space className={styles.panelHeaderControls}>
                        {isPullRefreshing && (
                          <div className={styles.headerRefreshIndicator}>
                            <Spin size="small" />
                          </div>
                        )}
                        <Tooltip title={searchModeActive ? "收起搜索" : "搜索文章"}>
                            <Button
                              icon={<SearchOutlined />}
                              type={'text'} 
                              onClick={() => setSearchModeActive(!searchModeActive)}
                              className={styles.controlButton}
                            />
                        </Tooltip>
                        <Tooltip title="标记当前列表已读">
                            <Button 
                              icon={<CheckCircleOutlined />} 
                              onClick={handleMarkAllReadLocal} 
                              type="text" 
                              className={styles.controlButton}
                            />
                        </Tooltip>
                      </Space>
                    </div>

                    {searchModeActive && (
                      <div className={styles.panelSearchInputContainer}>
                        <Input
                            ref={searchInputRef}
                            placeholder="搜索"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={styles.panelSearchInput}
                            allowClear
                            autoFocus
                        />
                      </div>
                    )}


                  </div>
                  
                  <div 
                    className={styles.articleListContainerWrapper}
                    ref={articleListContainerRef}
                    onWheel={handleWheel}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >
                    {feeds.length > 0 || groupId || feedId ? (
                      <ArticleList
                        ref={articleListRef}
                        key={`${feedId}-${groupId}-${activeListFilter}-${listRefreshKey}`}
                        filter={articleFilterForList}
                        searchTerm={searchTerm}
                        onSelectArticle={handleArticleSelect}
                        selectedArticleId={selectedArticleId}
                        isTodayView={isTodayView}
                        currentFeedId={feedId}
                        currentGroupId={groupId}
                        lastUpdatedArticleInfo={lastUpdatedArticleInfo}
                        onLastUpdatedArticleInfoChange={setLastUpdatedArticleInfo}
                        isPullingDown={pullDownProgress > 0}
                      />
                    ) : (
                      <Empty description="没有文章，请添加订阅源或分组。" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center'}} />
                    )}
                  </div>
                  <div className={styles.listFooterControls}>
                    <Radio.Group
                      value={activeListFilter}
                      onChange={(e) => {
                          const newFilter = e.target.value as FilterType;
                          // console.log('[HomePage] Radio.Group onChange CALLED. newFilter:', newFilter, 'Current context:', { feedId, groupId });
                          setFilter(newFilter);
                        }}
                      style={{ width: '100%', display: 'flex' }}
                    >
                      <Radio.Button value="all" style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <AppstoreAddOutlined />
                          <span>全部</span>
                        </div>
                      </Radio.Button>
                      <Radio.Button value="unread" style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <CheckCircleOutlined />
                          <span>未读</span>
                        </div>
                      </Radio.Button>
                      <Radio.Button value="starred" style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <StarOutlined />
                          <span>收藏</span>
                        </div>
                      </Radio.Button>
                    </Radio.Group>
                  </div>
                </div>
              </Panel>
              <PanelResizeHandle 
                className={styles.resizeHandle} 
                onDragging={setIsResizing}
              />
            </>
          )}
          <Panel
            ref={detailPanelRef}
            defaultSize={settings.layout.mainLayout[1]}
            minSize={30}
          >
            <div className={styles.articleDetailContainer}>
              {selectedArticleId ? (
                <ArticleDetail 
                  key={selectedArticleId}
                  articleId={selectedArticleId} 
                  viewMode={articleDetailViewMode} 
                  onChangeViewMode={handleArticleDetailViewModeChange}
                  onClose={handleCloseArticle}
                  onArticleModified={handleArticleModified}
                  onNavigate={handleNavigate}
                />
              ) : (
                <div className={styles.emptyDetailPane}>
                  {/* 隐藏的可拖拽区域已通过CSS ::before伪元素添加 */}
                  <div style={{ textAlign: 'center' }}>
                    <div className={styles.artisticTitle}>Readix</div>
                    <div className={styles.emptyDescription}>阅读点亮心智</div>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};

export default HomePage; 