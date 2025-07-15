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
  CloseOutlined,
  MenuOutlined,
  BugOutlined
} from '@ant-design/icons';
import ArticleList, { ArticleListHandle } from '../components/ArticleList';
import ArticleDetail from '../components/ArticleDetail';
import WelcomePage from '../components/WelcomePage';
import { useDatabase } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFilter, FilterType } from '../contexts/FilterContext';
import { refreshAllFeeds } from '../utils/rssParser';
import { FeedSource, Article, Topic } from '../db/database';
import { getTodayRange, debounce, updateUnreadCountOptimized, formatDate, logDateIssue } from '../utils/helpers';
import { debugFeedFilterRules, forceApplyAllFeedRules, checkAndFixAllFeedRules } from '../utils/filterUtils';
import { debugGlobalFilterRules } from '../contexts/FilterRulesContext';
import { applyAllRulesToAllArticles } from '../utils/filterApplier';
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
import { LogConfig } from '../utils/logConfig';
import { diagnoseTopicFilters } from '../utils/filterUtils';

const { Header, Content } = Layout;
const { Option } = Select;
const { Title, Text } = Typography;

// 使用新的日志函数
const log = {
  feed: (message: string) => {
    LogConfig.info('FEED', message);
  },
  error: (message: string, error?: any) => {
    if (error) LogConfig.error('HOMEPAGE', message, error);
    else LogConfig.error('HOMEPAGE', message);
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
  const { feedId, groupId, topicId } = useParams<{ feedId?: string; groupId?: string; topicId?: string }>();

  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [articleDetailViewMode, setArticleDetailViewMode] = useState<'full' | 'web' | 'original'>('full');
  const [pageTitle, setPageTitle] = useState('所有文章');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isTodayView, setIsTodayView] = useState(() => {
    // 只有在明确指定今日视图时才设置为true
    return window.location.pathname === '/today';
  });
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [searchModeActive, setSearchModeActive] = useState(false);
  const [lastUpdatedArticleInfo, setLastUpdatedArticleInfo] = useState<{ id: string, changes: Partial<Article> } | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [articleCount, setArticleCount] = useState(0);
  
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
      } else if (topicId) {
        const topic = await db.topics.get(topicId);
        setPageTitle(topic?.name || '主题');
      } else if (filter === 'starred') {
        setPageTitle('我的收藏');
      } else if (filter === 'unread') {
        setPageTitle('未读文章');
      } else if (filter === 'all') {
        setPageTitle('所有文章');
      } else if (window.location.pathname === '/today') {
        setPageTitle('今日文章');
      } else if (filter === undefined && !feedId && !groupId && !topicId) {
        // 如果没有明确的筛选条件，使用通用标题
        if (isTodayView) {
          setPageTitle('今日文章');
        } else {
          setPageTitle('我的阅读');
        }
      } else {
        setPageTitle('所有文章');
      }
    };

    updateTitle();
  }, [db, feedId, groupId, topicId, filter, isTodayView]);

  const loadFeeds = async () => {
    if (!db) return;
    
    // 添加日志，帮助调试
    LogConfig.info('HOMEPAGE', '加载订阅源列表');
    const allFeeds = await db.feeds.toArray();
    setFeeds(allFeeds);
    
    // 调试订阅源过滤规则
    try {
      LogConfig.debug('HOMEPAGE', '开始调试订阅源过滤规则...');
      await debugFeedFilterRules(db);
    } catch (error) {
      LogConfig.error('HOMEPAGE', '调试订阅源过滤规则时出错:', error);
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
    
    // 只在路由参数变化时更新isTodayView
    const isToday = window.location.pathname === '/today' || 
                   (filter === undefined && !feedId && !groupId);
    
    if (isToday !== isTodayView) {
      setIsTodayView(isToday);
    }

    prevFeedIdRef.current = feedId;
    prevGroupIdRef.current = groupId;
    prevFilterPropRef.current = filter;

  }, [filter, feedId, groupId, isTodayView]);
  
  const handleRefreshAll = useCallback(async (options?: { silent?: boolean }) => {
    // 防抖：避免短时间内多次刷新
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 5000) { // 5秒内不重复刷新
      // 完全移除这个提示，下拉刷新时不需要告诉用户刚刚已经刷新过了
      return;
    }
    lastRefreshTimeRef.current = now;

    if (!db) return;
    
    const { feedId, groupId } = refreshDependenciesRef.current;
    
    if (!options?.silent) {
      setIsPullRefreshing(true);
    }
    
    try {
      LogConfig.info('HOMEPAGE', '开始刷新订阅源');
      
      if (feedId) {
        // 刷新单个订阅源
        const feed = await db.feeds.get(feedId);
        if (feed) {
          LogConfig.info('HOMEPAGE', `刷新订阅源: ${feed.title}`);
          const result = await window.electron.parseRssFeed(feed.url);
          // 只在失败时显示提示，成功时不需要提示
          if (!result.success && !options?.silent) {
            message.error(`更新失败: ${feed.title}`);
          }
        }
      } else if (groupId) {
        // 刷新分组内的所有订阅源
        const feeds = await db.feeds.where('groupId').equals(groupId).toArray();
        LogConfig.info('HOMEPAGE', `刷新分组内的 ${feeds.length} 个订阅源`);
        
        if (feeds.length > 0) {
          let failCount = 0;
          for (const feed of feeds) {
            try {
              await window.electron.parseRssFeed(feed.url);
            } catch (error) {
              LogConfig.error('HOMEPAGE', `刷新订阅源 ${feed.title} 失败:`, error);
              failCount++;
            }
          }
          // 只在有失败且非静默模式时显示提示
          if (failCount > 0 && !options?.silent) {
            message.warning(`${feeds.length - failCount}/${feeds.length} 个订阅源更新成功`);
          }
        }
      } else {
        // 刷新所有订阅源
        const allFeeds = await db.feeds.toArray();
        LogConfig.info('HOMEPAGE', `刷新所有 ${allFeeds.length} 个订阅源`);
        
        if (allFeeds.length > 0) {
          try {
            // 使用refreshAllFeeds函数刷新所有订阅源
            const results = await refreshAllFeeds(allFeeds);
            const successCount = results.filter(result => result.articles.length > 0).length;
            const failCount = allFeeds.length - successCount;
            
            // 只在有失败且非静默模式时显示提示
            if (failCount > 0 && !options?.silent) {
              message.warning(`${successCount}/${allFeeds.length} 个订阅源更新成功`);
            }
            
            // 触发文章列表刷新
            triggerArticleListRefresh();
          } catch (error) {
            LogConfig.error('HOMEPAGE', '刷新订阅源失败:', error);
          }
        }
      }
    } catch (error) {
      LogConfig.error('HOMEPAGE', '刷新订阅源失败:', error);
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
      
      // 确保在刷新后应用所有过滤规则
      if (db) {
        try {
          LogConfig.info('HOMEPAGE', '在刷新后重新应用所有过滤规则');
          // 使用从filterApplier导入的函数
          await applyAllRulesToAllArticles(db);
          // 强制刷新文章列表
          triggerArticleListRefresh();
        } catch (error) {
          LogConfig.error('HOMEPAGE', '应用过滤规则失败:', error);
        }
      }
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
    
    // 保存当前状态
    if (articleId) {
      saveCurrentBrowsingState();
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
    }
    // 移除到达边界的提示，用户可以从界面上看出来
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
    } else if (topicId) {
      conditions.topicId = topicId; // 添加主题ID条件
    } else if (filter === 'starred') {
      conditions.isStarred = 'true';
    } else if (filter === 'unread') {
      conditions.isRead = 'false';
    } else if (filter === 'all') {
      // 不添加额外条件
    } else if (filter === 'today' || window.location.pathname === '/today') {
      // 明确指定今日视图
      LogConfig.info('HOMEPAGE', '应用今日筛选条件');
      const todayRange = getTodayRange();
      conditions.publishDate = { $gte: todayRange.start, $lte: todayRange.end };
      // 确保isTodayView状态正确
      if (!isTodayView) {
        LogConfig.info('HOMEPAGE', '设置isTodayView为true');
        setIsTodayView(true);
      }
    } else if (window.location.pathname === '/today' || isTodayView) {
      // 只有在明确指定今日视图或isTodayView为true时才应用今日筛选条件
      const todayRange = getTodayRange();
      conditions.publishDate = { $gte: todayRange.start, $lte: todayRange.end };
    }
    // 移除默认应用今日视图的逻辑
    
    // 2. Additively apply the Radio.Group filter from the bottom bar.
    if (activeListFilter === 'starred') {
      conditions.isStarred = 'true';
    } else if (activeListFilter === 'unread') {
      conditions.isRead = 'false';
    }
    
    return conditions;
  }, [feedId, groupId, topicId, activeListFilter, filter, isTodayView]);

  const handleAddFirstFeed = (feed: FeedSource) => {
    navigate(`/feed/${feed.id}`);
    triggerArticleListRefresh();
  };

  const handleArticleDetailViewModeChange = (mode: 'full' | 'web' | 'original') => {
    setArticleDetailViewMode(mode);
    // 保存当前的视图模式
    saveCurrentBrowsingState();
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
        return; // 移除提示
      }
      articlesToUpdateQuery = articlesToUpdateQuery.and((a: Article) => feedIdsInGroup.includes(a.sourceId));
      delete currentFilter.groupId; // Remove so it's not processed below
    }

    // Special handling for topicId, as articles don't have it directly.
    if (currentFilter.topicId) {
      const topicFeeds = await db.topicFeeds.where('topicId').equals(currentFilter.topicId).toArray();
      const feedIdsInTopic = topicFeeds.map(tf => tf.feedId);
      if (feedIdsInTopic.length === 0) {
        return; // 如果没有关联的订阅源，直接返回
      }
      articlesToUpdateQuery = articlesToUpdateQuery.and((a: Article) => feedIdsInTopic.includes(a.sourceId));
      delete currentFilter.topicId; // 移除已处理的条件
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
      return; // 移除提示
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
          LogConfig.error('HOMEPAGE', 'Failed to mark all as read:', error);
          message.error('操作失败');
        }
      },
    });
  };

  // 检查是否有文章存在
  const [hasArticles, setHasArticles] = useState(true);
  
  // 检查是否应该显示欢迎页面
  const [shouldShowWelcomePage, setShouldShowWelcomePage] = useState(false);
  
  // 检查是否有文章存在的函数
  useEffect(() => {
    const checkForArticles = async () => {
      if (!db || !dbInitialized) return;
      
      try {
        // 检查是否至少有一篇文章
        const count = await db.articles.count();
        setHasArticles(count > 0);
        
        // 检查是否有保存的浏览状态
        const hasSavedState = localStorage.getItem('lastBrowsingState') !== null;
        
        // 只有在没有订阅源、没有文章且没有保存状态的情况下才显示欢迎页面
        setShouldShowWelcomePage(feeds.length === 0 && !count && !hasSavedState && !searchTerm);
      } catch (error) {
        LogConfig.error('HOMEPAGE', '检查文章失败:', error);
        setHasArticles(true); // 出错时假设有文章，避免不必要地显示欢迎页面
        setShouldShowWelcomePage(false);
      }
    };
    
    checkForArticles();
  }, [db, dbInitialized, articleListRefreshTrigger, feeds.length, searchTerm]);

  // 从URL查询参数中获取articleId
  useEffect(() => {
    const articleIdFromUrl = searchParams.get('articleId');
    if (articleIdFromUrl) {
      // 解码URL参数中的文章ID
      const decodedArticleId = decodeURIComponent(articleIdFromUrl);
      LogConfig.info('HOMEPAGE', `从URL查询参数中获取articleId: ${decodedArticleId}`);
      setSelectedArticleId(decodedArticleId);
    }
  }, [searchParams, feedId, groupId]);
  
  // 监听全局刷新事件
  useEffect(() => {
    const handleRefreshEvent = () => {
      console.log('收到全局刷新事件，正在刷新文章列表...');
      triggerArticleListRefresh();
      // 强制重新加载文章列表
      setListRefreshKey(prev => prev + 1);
    };
    
    window.addEventListener('refresh-article-list', handleRefreshEvent);
    
    return () => {
      window.removeEventListener('refresh-article-list', handleRefreshEvent);
    };
  }, []);

  // 添加一个函数，用于清理数据库中的重复文章
  const cleanupDuplicateArticles = useCallback(async () => {
    if (!db) return;
    
    try {
      LogConfig.info('HOMEPAGE', '开始清理重复文章...');
      
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
        LogConfig.info('HOMEPAGE', `已成功清理 ${articlesToDelete.length} 篇重复文章`);
      }
    } catch (error) {
      LogConfig.error('HOMEPAGE', '清理重复文章失败:', error);
    }
  }, [db]);

  // 保存浏览状态到 localStorage
  const saveCurrentBrowsingState = useCallback(() => {
    if (!dbInitialized) return;
    
    const browsingState = {
      feedId: feedId || null,
      groupId: groupId || null,
      selectedArticleId,
      articleDetailViewMode,
      pageTitle,
      path: location.pathname,
      searchTerm,
      activeListFilter
    };
    
    localStorage.setItem('lastBrowsingState', JSON.stringify(browsingState));
    LogConfig.info('HOMEPAGE', '保存浏览状态:', browsingState);
  }, [feedId, groupId, selectedArticleId, articleDetailViewMode, pageTitle, location.pathname, searchTerm, dbInitialized, activeListFilter]);

  // 在组件卸载或窗口关闭时保存状态
  useEffect(() => {
    // 在组件卸载时保存状态
    return () => {
      saveCurrentBrowsingState();
    };
  }, [saveCurrentBrowsingState]);

  // 添加窗口关闭事件监听器
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveCurrentBrowsingState();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveCurrentBrowsingState]);

  // 从 localStorage 恢复浏览状态
  useEffect(() => {
    if (!dbInitialized || !settingsInitialized) return;
    
    LogConfig.info('HOMEPAGE', '开始尝试恢复浏览状态...');
    LogConfig.info('HOMEPAGE', `当前路径: ${location.pathname}, 查询参数: ${searchParams.toString()}`);
    
    // 检查 URL 是否已经有指定的路径，如果有就不恢复存储的状态
    // 修改：只有当路径是根路径时才恢复状态，避免覆盖明确的导航
    const isRootPath = location.pathname === '/';
    if (!isRootPath) {
      LogConfig.info('HOMEPAGE', '检测到特定路径，不恢复存储状态');
      return;
    }
    
    const savedStateJson = localStorage.getItem('lastBrowsingState');
    if (!savedStateJson) {
      LogConfig.info('HOMEPAGE', '没有找到保存的浏览状态');
      // 如果没有保存的状态，可以选择设置为今日视图
      LogConfig.info('HOMEPAGE', '没有保存的状态，设置为今日视图');
      setIsTodayView(true);
      return;
    }
    
    try {
      const savedState = JSON.parse(savedStateJson);
      LogConfig.info('HOMEPAGE', '恢复浏览状态:', savedState);
      
      // 恢复路径和选择的文章
      if (savedState.path && savedState.path !== '/' && savedState.path !== location.pathname) {
        // 如果有特定路径，先导航过去
        LogConfig.info('HOMEPAGE', `恢复到保存的路径: ${savedState.path}`);
        if (savedState.selectedArticleId) {
          // 如果有选中的文章，添加到查询参数
          LogConfig.info('HOMEPAGE', `恢复路径和文章ID: ${savedState.path}?articleId=${savedState.selectedArticleId}`);
          navigate(`${savedState.path}?articleId=${savedState.selectedArticleId}`);
        } else {
          LogConfig.info('HOMEPAGE', `恢复路径: ${savedState.path}`);
          navigate(savedState.path);
        }
        return; // 导航后退出，避免重复设置状态
      } 
      
      if (savedState.feedId) {
        // 恢复订阅源
        LogConfig.info('HOMEPAGE', `恢复到保存的订阅源: ${savedState.feedId}`);
        if (savedState.selectedArticleId) {
          LogConfig.info('HOMEPAGE', `恢复订阅源和文章ID: /feed/${savedState.feedId}?articleId=${savedState.selectedArticleId}`);
          navigate(`/feed/${savedState.feedId}?articleId=${savedState.selectedArticleId}`);
        } else {
          LogConfig.info('HOMEPAGE', `恢复订阅源: /feed/${savedState.feedId}`);
          navigate(`/feed/${savedState.feedId}`);
        }
        return; // 导航后退出
      } else if (savedState.groupId) {
        // 恢复分组
        LogConfig.info('HOMEPAGE', `恢复到保存的分组: ${savedState.groupId}`);
        if (savedState.selectedArticleId) {
          LogConfig.info('HOMEPAGE', `恢复分组和文章ID: /group/${savedState.groupId}?articleId=${savedState.selectedArticleId}`);
          navigate(`/group/${savedState.groupId}?articleId=${savedState.selectedArticleId}`);
        } else {
          LogConfig.info('HOMEPAGE', `恢复分组: /group/${savedState.groupId}`);
          navigate(`/group/${savedState.groupId}`);
        }
        return; // 导航后退出
      } else if (savedState.selectedArticleId) {
        // 只恢复选中的文章
        LogConfig.info('HOMEPAGE', `恢复选中的文章ID: ${savedState.selectedArticleId}`);
        setSelectedArticleId(savedState.selectedArticleId);
        if (savedState.articleDetailViewMode) {
          LogConfig.info('HOMEPAGE', `恢复文章视图模式: ${savedState.articleDetailViewMode}`);
          setArticleDetailViewMode(savedState.articleDetailViewMode);
        }
      }
      
      // 恢复搜索词
      if (savedState.searchTerm) {
        LogConfig.info('HOMEPAGE', `恢复搜索词: ${savedState.searchTerm}`);
        setSearchTerm(savedState.searchTerm);
        setSearchModeActive(true);
      }
      
      // 如果没有特定的路径或订阅源/分组，但有保存的activeListFilter，恢复它
      if (savedState.activeListFilter) {
        LogConfig.info('HOMEPAGE', `恢复筛选器: ${savedState.activeListFilter}`);
        setFilter(savedState.activeListFilter);
      }
      
      // 根据保存的页面标题决定是否是今日视图
      if (savedState.pageTitle === '今日文章') {
        LogConfig.info('HOMEPAGE', '根据保存的页面标题设置为今日视图');
        setIsTodayView(true);
      } else {
        LogConfig.info('HOMEPAGE', `根据保存的页面标题设置为非今日视图: ${savedState.pageTitle}`);
        setIsTodayView(false);
      }
      
    } catch (error) {
      LogConfig.error('HOMEPAGE', '恢复浏览状态失败:', error);
    }
  }, [dbInitialized, settingsInitialized, navigate, location.pathname, searchParams, setFilter]);

  // 监控isTodayView状态变化
  useEffect(() => {
    LogConfig.info('HOMEPAGE', `isTodayView状态变化: ${isTodayView}`);
  }, [isTodayView]);

  // 监控filter状态变化
  useEffect(() => {
    LogConfig.info('HOMEPAGE', `filter状态变化: ${filter}`);
  }, [filter]);

  // 监控activeListFilter状态变化
  useEffect(() => {
    LogConfig.info('HOMEPAGE', `activeListFilter状态变化: ${activeListFilter}`);
  }, [activeListFilter]);

  // 调试按钮组件
  const DebugButton: React.FC<{topicId?: string}> = ({ topicId }) => {
    const { db } = useDatabase();
    
    const handleClick = async () => {
      console.clear(); // 清空控制台
      console.log('执行诊断...');
      await diagnoseTopicFilters(db, topicId);
      
      // 强制刷新文章列表，确保过滤规则被正确应用
      setTimeout(() => {
        setListRefreshKey(prev => prev + 1);
        
        // 显示刷新提示
        message.success('已强制刷新文章列表');
      }, 500);
    };
    
    // 永远不显示调试按钮
    return null;
  };

  // 定时更新文章数量显示
  useEffect(() => {
    // 文章数量更新函数
    const updateArticleCount = () => {
      if (articleListRef.current) {
        const articles = articleListRef.current.getArticles();
        setArticleCount(articles.length);
        // 移除日志输出，避免大量日志刷屏
        // console.log(`文章数量更新: ${articles.length} 篇`);
      }
    };
    
    // 初始化和列表刷新时更新数量
    updateArticleCount();
    
    // 设置定时器，将间隔从1秒改为5秒，减少更新频率
    const timer = setInterval(updateArticleCount, 5000);
    
    // 清理定时器
    return () => clearInterval(timer);
  }, [listRefreshKey, articleListRefreshTrigger]);

  return (
    <div className={styles.homeLayout}>
      {shouldShowWelcomePage ? (
        <WelcomePage onAddFirstFeed={handleAddFirstFeed} />
      ) : !dbInitialized || !settingsInitialized ? (
        <Layout className={styles.homeLayout}>
          <Header className={styles.header}>
            <Title level={4} className={styles.headerTitle}>&nbsp;</Title>
          </Header>
          <Content style={{ padding: '20px', textAlign: 'center' }}>
            <Skeleton active paragraph={{ rows: 10 }} />
          </Content>
        </Layout>
      ) : (
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
                          <span style={{ fontSize: '14px', fontWeight: 'normal', marginLeft: '8px', color: 'var(--text-secondary)' }}>
                            ({articleCount})
                          </span>
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
                          key={`${feedId}-${groupId}-${topicId}-${activeListFilter}-${listRefreshKey}`}
                          filter={articleFilterForList}
                          searchTerm={searchTerm}
                          onSelectArticle={handleArticleSelect}
                          selectedArticleId={selectedArticleId}
                          isTodayView={isTodayView}
                          currentFeedId={feedId}
                          currentGroupId={groupId}
                          currentTopicId={topicId}
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
      )}
      {/* 添加调试按钮 */}
      <DebugButton topicId={topicId} />
    </div>
  );
};

export default HomePage;