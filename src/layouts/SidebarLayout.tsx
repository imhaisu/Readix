import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Tooltip, Badge, Dropdown } from 'antd';
import {
  HomeOutlined,
  StarOutlined,
  ReadOutlined,
  SettingOutlined,
  PlusOutlined,
  InboxOutlined,
  ReloadOutlined,
  EditOutlined,
  FolderAddOutlined,
  ClockCircleOutlined,
  MenuOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  HighlightOutlined,
} from '@ant-design/icons';
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import FeedList from '../components/FeedList';
import AddFeedModal from '../components/AddFeedModal';
import AddGroupModal from '../components/AddGroupModal';
import DiscoverFeedsModal from '../components/DiscoverFeedsModal';
import { useDatabase } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { FeedSource, Group, Article as DbArticle } from '../db/database';
import { refreshAllFeeds, fetchRssFeed } from '../utils/rssParser';
import { cleanupOldArticles, cleanupOrphanedArticles, detectAndCleanupDuplicateArticles } from '../utils/cleanupHelper';
import { getTodayRange, updateUnreadCountOptimized } from '../utils/helpers';
import { processFeedIcons } from '../utils/iconUtils';
import { useFilter } from '../contexts/FilterContext';
import styles from './SidebarLayout.module.css';
import { useLayout } from '../contexts/LayoutContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTitleBar } from '../contexts/TitleBarContext';

const { Content } = Layout;

// 添加日志控制配置
const LOG_CONFIG = {
  ENABLE_COUNT_LOGS: false, // 计数日志
  ENABLE_ERROR_LOGS: true   // 错误日志
};

// 封装日志函数
const log = {
  count: (message: string) => {
    if (LOG_CONFIG.ENABLE_COUNT_LOGS) console.log(message);
  },
  error: (message: string, error?: any) => {
    if (LOG_CONFIG.ENABLE_ERROR_LOGS) {
      if (error) console.error(message, error);
      else console.error(message);
    }
  }
};

// 防抖函数
const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<F>): void => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), waitFor);
  };
};


const SidebarLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, isInitialized: settingsInitialized, updateLayoutSettings } = useSettings();
  const { db, articleListRefreshTrigger, feedCountRefreshTrigger, isInitialized: dbInitialized, triggerArticleListRefresh, triggerFeedCountRefresh } = useDatabase();
  const { filter } = useFilter();
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [showAddFeedModal, setShowAddFeedModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [isDiscoverModalOpen, setIsDiscoverModalOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const siderPanelRef = useRef<ImperativePanelHandle>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const startupTasksDone = useRef(false);
  const refreshIntervalId = useRef<NodeJS.Timeout | null>(null);

  // 新增 state 用于存储文章数量
  const [todayCount, setTodayCount] = useState(0);
  const [allCount, setAllCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [starredCount, setStarredCount] = useState(0);
  const [readLaterCount, setReadLaterCount] = useState(0);

  // 新增 state 用于存储笔记数量
  const [notesCount, setNotesCount] = useState(0);

  const { isFeedListVisible, setIsFeedListVisible, setIsArticleListVisible } = useLayout();
  const layoutRef = useRef<HTMLDivElement>(null);

  // 使用 useCallback 来记忆防抖函数，防止每次渲染都创建新的
  const debouncedUpdateLayout = useCallback(
    debounce((layout: number[]) => {
      updateLayoutSettings({ sidebarLayout: layout });
    }, 500),
    [updateLayoutSettings]
  );

  // 监听笔记侧边栏的开关事件，实现"专注模式"
  useEffect(() => {
    const handleAnnotationSidebarToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ isVisible: boolean }>;
      if (!customEvent.detail) return;
      
      const { isVisible } = customEvent.detail;
      setIsFocusMode(isVisible);
      
      if (siderPanelRef.current) {
        const isSiderCollapsed = siderPanelRef.current.isCollapsed();
        if (isVisible && !isSiderCollapsed) {
          siderPanelRef.current.collapse();
        } else if (!isVisible && isSiderCollapsed) {
          siderPanelRef.current.expand();
        }
      }
    };

    document.addEventListener('annotationSidebarToggled', handleAnnotationSidebarToggle);

    return () => {
      document.removeEventListener('annotationSidebarToggled', handleAnnotationSidebarToggle);
    };
  }, []); // 空依赖数组，确保只在组件挂载和卸载时运行

  useEffect(() => {
    const container = layoutRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
        if (entries[0]) {
            const width = entries[0].contentRect.width;
            
            // Define min widths
            const minWidthCol1 = 250; // px
            const minWidthCol2 = 350; // px
            const minWidthCol3 = 450; // px

            const minWidthCols23 = minWidthCol2 + minWidthCol3;
            const minWidthAllCols = minWidthCol1 + minWidthCol2 + minWidthCol3;

            if (width < minWidthCols23) {
                setIsFeedListVisible(false);
                setIsArticleListVisible(false);
            } else if (width < minWidthAllCols) {
                setIsFeedListVisible(false);
                setIsArticleListVisible(true);
            } else {
                setIsFeedListVisible(true);
                setIsArticleListVisible(true);
            }
        }
    });

    observer.observe(container);

    return () => {
        observer.unobserve(container);
    };
  }, [setIsFeedListVisible, setIsArticleListVisible]);

  useEffect(() => {
    if (siderPanelRef.current) {
        const isCollapsed = siderPanelRef.current.isCollapsed();
        if (isFeedListVisible && isCollapsed) {
            siderPanelRef.current.expand();
        } else if (!isFeedListVisible && !isCollapsed) {
            siderPanelRef.current.collapse();
        }
    }
  }, [isFeedListVisible]);

  // 日志：监控弹窗状态变化
  useEffect(() => {
    // console.log(`[SidebarLayout] isDiscoverModalOpen 状态变为: ${isDiscoverModalOpen}`);
  }, [isDiscoverModalOpen]);

  useEffect(() => {
    if (dbInitialized && settingsInitialized && db && !startupTasksDone.current) {
      // console.log('[SidebarLayout] Running startup tasks...');
      
      cleanupOldArticles(db, settings.general.retentionDays)
        .then(() => console.log('[SidebarLayout] Article cleanup task completed on startup.'))
        .catch(err => console.error('[SidebarLayout] Error during startup article cleanup:', err))
        .finally(() => {
          triggerArticleListRefresh(); 
        });

      if (settings.general.syncOnStartup) {
        // console.log('[SidebarLayout] Syncing feeds on startup...');
        handleRefreshAll(true);
      }
      
      startupTasksDone.current = true;
    }
  }, [dbInitialized, settingsInitialized, db, settings.general.syncOnStartup, settings.general.retentionDays, triggerArticleListRefresh]);

  useEffect(() => {
    if (refreshIntervalId.current) {
      clearInterval(refreshIntervalId.current);
      refreshIntervalId.current = null;
    }

    if (dbInitialized && settingsInitialized && db && settings.general.updateFrequency > 0) {
      const intervalMinutes = settings.general.updateFrequency;
      // console.log(`[SidebarLayout] Setting up periodic refresh every ${intervalMinutes} minutes.`);
      
      refreshIntervalId.current = setInterval(() => {
        // console.log('[SidebarLayout] Performing periodic feeds refresh...');
        handleRefreshAll(true);
      }, intervalMinutes * 60 * 1000);
    }

    return () => {
      if (refreshIntervalId.current) {
        clearInterval(refreshIntervalId.current);
        // console.log('[SidebarLayout] Cleared periodic refresh interval.');
      }
    };
  }, [dbInitialized, settingsInitialized, db, settings.general.updateFrequency]);

  useEffect(() => {
    if (!db) return;
    const loadSupportingData = async () => {
      try {
      // console.log('[SidebarLayout] Initial data load or db instance changed.');
      const groupsData = await db.groups.toArray();
      const feedsData = await db.feeds.toArray();
        
        // 处理订阅源图标
        const processedFeedsData = await processFeedIcons(feedsData);
        
      setGroups(groupsData.sort((a, b) => a.order - b.order));
        setFeeds(processedFeedsData);
      } catch (error) {
        console.error('[SidebarLayout] Error loading supporting data:', error);
        // 不触发重新初始化，避免循环
      }
    };
    loadSupportingData();
  }, [db]);

  useEffect(() => {
    if (!db || !dbInitialized) {
      // console.log('[SidebarLayout] Skipping feed reload because db or dbInitialized is not ready.');
      return;
    }

    const reloadFeedsForRefresh = async () => {
      // console.log(`[SidebarLayout] articleListRefreshTrigger changed to ${articleListRefreshTrigger}. Reloading feeds and groups for UI update.`);
      try {
        const [feedsData, groupsData] = await Promise.all([
          db.feeds.toArray(),
          db.groups.toArray()
        ]);

        // console.log('[SidebarLayout] Fetched data after refresh trigger. Feeds count:', feedsData.length, 'Groups count:', groupsData.length);
        
        // 处理订阅源图标
        const processedFeedsData = await processFeedIcons(feedsData);
        
        setFeeds(processedFeedsData);
        setGroups(groupsData.sort((a, b) => a.order - b.order));

      } catch (error) {
        console.error('[SidebarLayout] Error reloading feeds after refresh trigger:', error);
      }
    };

    if (typeof articleListRefreshTrigger === 'number' && articleListRefreshTrigger > 0) {
      // console.log(`[SidebarLayout] Condition met for reloading feeds: articleListRefreshTrigger (${articleListRefreshTrigger}) > 0 and db is initialized.`);
      reloadFeedsForRefresh();
    } else {
      // console.log(`[SidebarLayout] Condition NOT met for reloading feeds: articleListRefreshTrigger=${articleListRefreshTrigger}, dbInitialized=${dbInitialized}`);
    }
  }, [db, articleListRefreshTrigger, dbInitialized]);

  // useEffect 用于获取和更新文章数量
  useEffect(() => {
    if (!db || !dbInitialized) return;

    const fetchCounts = async () => {
      try {
        log.count('[SidebarLayout] 开始计算各种数量...');
        
        // 根据 filter 状态构建查询条件
        const filterCondition = (article: DbArticle) => {
          // 首先排除被隐藏的文章
          if (article.isHidden === true) {
            return false;
          }
          
          if (filter === 'unread') {
            return article.isRead === 'false';
          }
          if (filter === 'starred') {
            return article.isStarred === 'true';
          }
          return true; // 'all' 或其他情况
        };

        const allArticles = await db.articles.toArray();
        
        // 分别计算各个分类的数量
        const todayRange = getTodayRange();
        const todayPromise = db.articles
          .where('publishDate').between(todayRange.start, todayRange.end, true, true)
          .filter(article => !article.isHidden && filterCondition(article))
          .count();

        const allPromise = db.articles
          .filter(article => !article.isHidden && filterCondition(article))
          .count();
         
        const readLaterPromise = db.articles
          .where({ isReadLater: 'true' })
          .filter(article => !article.isHidden && filterCondition(article))
          .count();

        const totalUnreadPromise = db.articles
          .where('isRead').equals('false')
          .filter(article => !article.isHidden)
          .count();
         
        const starredPromise = db.articles
          .where({ isStarred: 'true' })
          .filter(article => !article.isHidden && filterCondition(article))
          .count();

        // 新增：获取笔记和高亮的数量
        const notesPromise = db.annotations.count();

        const [today, all, readLater, unread, starred, notes] = await Promise.all([
          todayPromise,
          allPromise,
          readLaterPromise,
          totalUnreadPromise,
          starredPromise,
          notesPromise
        ]);

        log.count(`[SidebarLayout] 计数结果: 今日=${today}, 所有=${all}, 稍后读=${readLater}, 未读=${unread}, 星标=${starred}, 笔记=${notes}`);

        setTodayCount(today);
        setAllCount(all);
        setReadLaterCount(readLater);
        setUnreadCount(unread);
        setStarredCount(starred);
        setNotesCount(notes); // 新增：设置笔记数量
      } catch (error) {
        console.error("[SidebarLayout] Error fetching article counts:", error);
      }
    };

    if (dbInitialized) {
      fetchCounts();
    }
  }, [db, dbInitialized, filter, articleListRefreshTrigger, feedCountRefreshTrigger]);

  // 添加一个监听器，当笔记数量变化时更新
  useEffect(() => {
    const handleAnnotationChange = () => {
      log.count('[SidebarLayout] 检测到笔记变化，更新计数');
      if (db && dbInitialized) {
        db.annotations.count().then(count => {
          log.count(`[SidebarLayout] 新的笔记数量: ${count}`);
          setNotesCount(count);
        });
      }
    };

    // 监听笔记变化事件
    document.addEventListener('annotation-changed', handleAnnotationChange);

    return () => {
      document.removeEventListener('annotation-changed', handleAnnotationChange);
    };
  }, [db, dbInitialized]);

  // 监听从笔记页面返回的标记
  useEffect(() => {
    const returnToNotes = sessionStorage.getItem('returnToNotes') === 'true';
    
    if (returnToNotes) {
      log.count('[SidebarLayout] 检测到returnToNotes标记，准备导航到笔记页面');
      log.count(`[SidebarLayout] 当前路径: ${location.pathname}`);
      
      // 清除标记，防止重复导航
      sessionStorage.removeItem('returnToNotes');
      
      // 确保FeedList可见，立即设置
      if (!isFeedListVisible) {
        log.count('[SidebarLayout] 设置FeedList可见');
        setIsFeedListVisible(true);
      }
      
      // 延迟导航到笔记页面，确保侧边栏已完全加载并且FeedList可见
      setTimeout(() => {
        log.count('[SidebarLayout] 延迟导航到笔记页面，保持侧边栏FeedList可见');
        // 导航到笔记页面
        navigate('/notes');
      }, 500);
    }
  }, [navigate, location, isFeedListVisible, setIsFeedListVisible]);

  // 添加一个ref来跟踪导航是否已经执行
  const navigationExecutedRef = useRef(false);

  useEffect(() => {
    // 确保数据库和设置都已初始化，且导航尚未执行
    if (!dbInitialized || !settingsInitialized || navigationExecutedRef.current) {
      if (!dbInitialized || !settingsInitialized) {
        console.log('[SidebarLayout] 等待数据库和设置初始化完成...');
      }
      return;
    }
    
    // 标记导航已执行，防止重复执行
    navigationExecutedRef.current = true;
    
    console.log('[SidebarLayout] 数据库和设置已初始化，开始恢复浏览状态...');
    
    // 优先尝试使用完整的浏览状态
    const savedStateJson = localStorage.getItem('lastBrowsingState');
    if (savedStateJson) {
      try {
        const savedState = JSON.parse(savedStateJson);
        console.log('[SidebarLayout] 找到保存的浏览状态:', savedState);
        
        // 如果有保存的路径，使用它
        if (savedState.path && savedState.path !== '/') {
          // 如果有选中的文章，添加到查询参数
          if (savedState.selectedArticleId) {
            // 使用encodeURIComponent处理文章ID中的特殊字符
            const encodedArticleId = encodeURIComponent(savedState.selectedArticleId);
            console.log(`[SidebarLayout] 恢复到路径和文章: ${savedState.path}?articleId=${encodedArticleId}`);
            navigate(`${savedState.path}?articleId=${encodedArticleId}`, { replace: true });
          } else {
            console.log(`[SidebarLayout] 恢复到路径: ${savedState.path}`);
            navigate(savedState.path, { replace: true });
          }
          return; // 导航后退出
        }
        
        // 如果有保存的订阅源
        if (savedState.feedId) {
          if (savedState.selectedArticleId) {
            // 使用encodeURIComponent处理文章ID中的特殊字符
            const encodedArticleId = encodeURIComponent(savedState.selectedArticleId);
            console.log(`[SidebarLayout] 恢复到订阅源和文章: /feed/${savedState.feedId}?articleId=${encodedArticleId}`);
            navigate(`/feed/${savedState.feedId}?articleId=${encodedArticleId}`, { replace: true });
          } else {
            console.log(`[SidebarLayout] 恢复到订阅源: /feed/${savedState.feedId}`);
            navigate(`/feed/${savedState.feedId}`, { replace: true });
          }
          return; // 导航后退出
        }
        
        // 如果有保存的分组
        if (savedState.groupId) {
          if (savedState.selectedArticleId) {
            // 使用encodeURIComponent处理文章ID中的特殊字符
            const encodedArticleId = encodeURIComponent(savedState.selectedArticleId);
            console.log(`[SidebarLayout] 恢复到分组和文章: /group/${savedState.groupId}?articleId=${encodedArticleId}`);
            navigate(`/group/${savedState.groupId}?articleId=${encodedArticleId}`, { replace: true });
          } else {
            console.log(`[SidebarLayout] 恢复到分组: /group/${savedState.groupId}`);
            navigate(`/group/${savedState.groupId}`, { replace: true });
          }
          return; // 导航后退出
        }
      } catch (error) {
        console.error('[SidebarLayout] 恢复浏览状态失败:', error);
      }
    } else {
      console.log('[SidebarLayout] 未找到保存的浏览状态，尝试使用lastPath');
    }
    
    // 如果没有完整的浏览状态，回退到使用lastPath
    const lastPath = localStorage.getItem('lastPath');
    console.log(`[SidebarLayout] lastPath = ${lastPath}`);
    
    // 验证路径是否有效的函数
    const isValidPath = (path: string) => {
      // 基本路径总是有效的
      if (['/all', '/today', '/notes', '/readlater', '/settings'].includes(path)) {
        return true;
      }
      
      // 检查订阅源路径
      if (path.startsWith('/feed/')) {
        const feedId = path.split('/feed/')[1];
        // 如果feeds已加载，检查feedId是否存在
        if (feeds.length > 0) {
          return feeds.some(feed => feed.id && feed.id === feedId);
        }
        // 如果feeds未加载，暂时认为路径有效，后续会重定向
        return true;
      }
      
      // 检查分组路径
      if (path.startsWith('/group/')) {
        const groupId = path.split('/group/')[1];
        // 如果groups已加载，检查groupId是否存在
        if (groups.length > 0) {
          return groups.some(group => group.id && group.id === groupId);
        }
        // 如果groups未加载，暂时认为路径有效，后续会重定向
        return true;
      }
      
      // 检查主题路径
      if (path.startsWith('/topic/')) {
        const topicId = path.split('/topic/')[1];
        // 暂时认为主题路径有效，因为我们还没有在组件状态中保存topics列表
        return true;
      }
      
      // 其他情况认为无效
      return false;
    };

    if (lastPath && lastPath !== '/' && isValidPath(lastPath)) {
      console.log(`[SidebarLayout] 导航到上次的路径: ${lastPath}`);
      navigate(lastPath, { replace: true });
    } else {
      console.log('[SidebarLayout] 导航到默认视图: /all');
      navigate('/all', { replace: true });
    }
  }, [navigate, feeds, groups, dbInitialized, settingsInitialized]);

  useEffect(() => {
    if (location.pathname !== '/settings') {
      // 当路径不是设置页面时，记录当前路径
      localStorage.setItem('lastPath', location.pathname);
    }
  }, [location.pathname]);

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/today') {
      return 'home';
    }
    if (path === '/') {
      // 根路径默认也选中"今日"菜单项
      return 'home';
    }
    if (path === '/all') {
      return 'all';
    }
    if (path.startsWith('/feed/') || path.startsWith('/group/')) {
      return '';
    }
    return path.substring(1);
  };

  // 添加状态管理refreshCompletedTrigger
  const [refreshCompletedTrigger, setRefreshCompletedTrigger] = useState(0);

  const handleRefreshAll = useCallback(async (isSilent: boolean = false) => {
    if (!db || (refreshing && !isSilent) || feeds.length === 0) {
        if (refreshing && !isSilent) log.count('[SidebarLayout] Refresh already in progress or no feeds.');
        return;
    }
    if (!isSilent) {
        setRefreshing(true);
    }
    
    try {
      const feedsToRefresh = await db.feeds.toArray();
      if(feedsToRefresh.length === 0) {
        setRefreshing(false);
        return;
      }
      
      const results = await refreshAllFeeds(feedsToRefresh);
      
      // 确保results是数组且可迭代
      if (results && Array.isArray(results)) {
        for (const result of results) {
          const { feed, articles: fetchedArticles } = result;
          if (fetchedArticles.length > 0 && feed.id) {
            const existingArticles = await db.articles.where('sourceId').equals(feed.id).toArray();
            const existingArticlesMap = new Map(existingArticles.map(a => [a.id, a]));

            const articlesToPut = fetchedArticles.map((fetchedArticle: DbArticle) => {
              const existingArticle = existingArticlesMap.get(fetchedArticle.id);
              if (existingArticle) {
                return {
                  ...fetchedArticle,
                  isRead: existingArticle.isRead,
                  isStarred: existingArticle.isStarred,
                  scrollPosition: existingArticle.scrollPosition,
                  isReadLater: existingArticle.isReadLater,
                  // 如果原文章使用的是首次获取时间，则保留原始日期
                  publishDate: existingArticle.isFirstFetchDate ? existingArticle.publishDate : fetchedArticle.publishDate,
                  // 保留首次获取时间标记
                  isFirstFetchDate: existingArticle.isFirstFetchDate || fetchedArticle.isFirstFetchDate,
                  // 添加一个时间戳字段，确保数据库能检测到变化
                  lastRefreshed: Date.now()
                };
              } else {
                return fetchedArticle;
              }
            });
            
            await db.articles.bulkPut(articlesToPut);
            await updateUnreadCountOptimized(db, feed.id);
          }
        }
      } else {
        console.warn('[SidebarLayout] refreshAllFeeds返回的结果不是数组或为空:', results);
      }

      // 强制刷新文章列表
      triggerFeedCountRefresh();
      triggerArticleListRefresh();
      
      // 如果当前在查看某个订阅源，强制重新加载该订阅源的文章
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/feed/')) {
        const feedId = currentPath.split('/feed/')[1];
        const currentFeed = feeds.find(f => f.id === feedId);
        if (currentFeed) {
          // 延迟一点执行，确保前面的操作已完成
          setTimeout(() => {
            triggerArticleListRefresh();
          }, 100);
        }
      }

    } catch (error) {
      console.error('[SidebarLayout] Feed refresh operation failed:', error);
    } finally {
      if (!isSilent) {
        setRefreshing(false);
      }
      // 增加这一行，更新完成触发器
      setRefreshCompletedTrigger(prev => prev + 1);
    }
  }, [db, refreshing, feeds, triggerArticleListRefresh, triggerFeedCountRefresh]);

  // 新增: 应用启动时自动刷新
  useEffect(() => {
    // 确保只在DB初始化后执行一次
    if (dbInitialized && !startupTasksDone.current) {
      // console.log('[SidebarLayout] Initializing startup refresh.');
      handleRefreshAll(true); // silent refresh
      startupTasksDone.current = true;
    }
  }, [dbInitialized, handleRefreshAll]);

  // 新增：专门刷新单个订阅源的文章
  const refreshSingleFeedArticles = useCallback(async (feedToRefresh: FeedSource) => {
    if (!db || !feedToRefresh.id) {
      console.error('[SidebarLayout] DB not available or feed ID missing for refreshSingleFeedArticles');
      return;
    }
    // console.log(`[SidebarLayout] Refreshing articles for feed: ${feedToRefresh.title} (ID: ${feedToRefresh.id})`);
    // 我们可以暂时不设置全局 refreshing 状态，或者创建一个更细粒度的状态
    // setRefreshing(true); 
    try {
      // 从 utils/rssParser.ts 导入 fetchRssFeed
      const articles = await fetchRssFeed(feedToRefresh); 
      if (articles.length > 0) {
        // 确保 sourceId 正确设置
        await db.articles.bulkAdd(articles.map(a => ({ ...a, sourceId: feedToRefresh.id! })));
        const currentFeed = await db.feeds.get(feedToRefresh.id!); // 从数据库获取最新的 feed 信息
        if (currentFeed) {
          await db.feeds.update(feedToRefresh.id!, {
            lastUpdated: new Date(),
            unreadCount: (currentFeed.unreadCount || 0) + articles.length,
            // 如果 fetchRssFeed 也返回更新后的 feed title/icon，可以在此一并更新
            // title: feedToRefresh.title // 假设 title 可能在解析时被修正
          });
        }
        // console.log(`[SidebarLayout] Added ${articles.length} new articles for feed: ${feedToRefresh.title}`);
      } else {
        // 即使没有新文章，也更新 lastUpdated 时间戳
        await db.feeds.update(feedToRefresh.id!, { lastUpdated: new Date() });
        // console.log(`[SidebarLayout] No new articles for feed: ${feedToRefresh.title}. Updated lastUpdated.`);
      }
      // 再次触发刷新，以确保UI（如未读计数、文章列表本身如果正在查看该源）得到更新
      triggerArticleListRefresh(); 
    } catch (error) {
      console.error(`[SidebarLayout] Error refreshing single feed ${feedToRefresh.title}:`, error);
    } finally {
      // setRefreshing(false);
    }
  }, [db, triggerArticleListRefresh]);

  const handleAddFeedSuccess = async (addedFeedFromModal: FeedSource) => {
    if (!db) { 
      console.error("Database not initialized in handleAddFeedSuccess");
      return;
    }
    setShowAddFeedModal(false);
    // console.log('[SidebarLayout] handleAddFeedSuccess received feed:', addedFeedFromModal);
    
    // 触发数据库和UI的全面刷新
    triggerArticleListRefresh();

    // 添加成功后，自动跳转到新添加的订阅源
    if (addedFeedFromModal.id) {
      navigate(`/feed/${addedFeedFromModal.id}`);
    }
  };

  const handleAddGroupSuccess = async (group: Group) => {
    if (!db) { 
      console.error("Database not initialized in handleAddGroupSuccess");
      return;
    }
    setShowAddGroupModal(false);
    triggerArticleListRefresh();
  };

  const handleSiderCollapseToggle = (collapsed: boolean) => {
    // console.log(`[SidebarLayout] Sider panel collapsed state changed to: ${collapsed}`);
    setIsPanelCollapsed(collapsed);
    if (collapsed) {
      siderPanelRef.current?.collapse();
    } else {
      siderPanelRef.current?.expand();
    }
  };

  // 修改清理任务的useEffect
  useEffect(() => {
    // 启动应用时和每次刷新所有订阅源后，执行一次清理
    let cleanupTimeout: NodeJS.Timeout;
    
    const scheduleCleanup = () => {
      // 延迟2秒执行，确保刷新操作已完成
      cleanupTimeout = setTimeout(async () => {
        if (db && dbInitialized) {
          try {
            console.log('[SidebarLayout] 开始执行自动清理任务...');
            
            // 清理重复文章
            await detectAndCleanupDuplicateArticles(db);
            
            // 清理无效文章 
            await cleanupOrphanedArticles(db);
            
            // 根据保留天数清理旧文章
            if (settings && settings.general.retentionDays > 0) {
              await cleanupOldArticles(db, settings.general.retentionDays);
            }
            
            console.log('[SidebarLayout] 自动清理任务完成');
          } catch (error) {
            console.error('[SidebarLayout] 自动清理过程中发生错误:', error);
          }
        }
      }, 2000);
    };
    
    // 数据库初始化后执行一次
    if (dbInitialized) {
      scheduleCleanup();
    }
    
    // 返回清理函数
    return () => {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }
    };
  }, [dbInitialized, refreshCompletedTrigger, settings, db]);

  return (
    <Layout 
      ref={layoutRef} 
      className={`${styles.sidebarLayout} ${isDragging ? styles.isResizing : ''}`}
    >
      <PanelGroup 
        direction="horizontal" 
        className={`${styles.layoutContainer_rH} ${isFocusMode ? styles.focusMode : ''}`}
        onLayout={debouncedUpdateLayout}
      >
        <Panel
          ref={siderPanelRef}
          defaultSize={settings.layout.sidebarLayout[0]}
          minSize={15}
          maxSize={35}
          collapsible={true}
          collapsedSize={0}
          onCollapse={() => handleSiderCollapseToggle(true)}
          onExpand={() => handleSiderCollapseToggle(false)}
          id="sider-main-panel"
          className={styles.sider}
        >
          <div className={styles.siderHeader}>
            <div className={styles.siderTitle}>
              {/* 移除Readix文案 */}
            </div>
            <div className={styles.headerActions}>
              {!isPanelCollapsed && (
                <Tooltip title="刷新全部">
                  <Button 
                    type="text" 
                    icon={<ReloadOutlined spin={refreshing} />} 
                    size="small"
                    onClick={() => handleRefreshAll(false)}
                    disabled={refreshing || feeds.length === 0}
                    className={styles.refreshButton}
                  />
                </Tooltip>
              )}
              {isPanelCollapsed ? (
                <Tooltip title="添加" placement="right">
                  <Button
                    type="text"
                    icon={<PlusOutlined />}
                    onClick={() => setShowAddFeedModal(true)}
                    className={styles.addButton}
                  />
                </Tooltip>
              ) : (
                <Dropdown
                    menu={{
                        items: [
                            { key: 'add-feed', icon: <EditOutlined />, label: '添加订阅源' },
                            { key: 'add-group', icon: <FolderAddOutlined />, label: '添加分组' },
                            { key: 'discover-feeds', icon: <AppstoreOutlined />, label: '发现订阅源' }
                        ],
                        onClick: ({ key }) => {
                            if (key === 'add-feed') {
                                setShowAddFeedModal(true);
                            } else if (key === 'add-group') {
                                setShowAddGroupModal(true);
                            } else if (key === 'discover-feeds') {
                                // console.log('[SidebarLayout] "发现订阅源" 菜单项被点击');
                                setIsDiscoverModalOpen(true);
                            }
                        }
                    }}
                    trigger={['click']}
                >
                    <Button
                        type="text"
                        icon={<PlusOutlined />}
                        className={styles.addButton}
                    />
                </Dropdown>
              )}
            </div>
          </div>

          <Menu
            mode="inline"
            selectedKeys={[getSelectedKey()]}
            className={styles.menu}
            inlineCollapsed={isPanelCollapsed}
            items={[
              {
                key: 'home',
                icon: <HomeOutlined />,
                label: (
                  <div className={styles.menuItemContainer}>
                    <span>今日</span>
                    {todayCount > 0 && <span className={styles.menuItemBadge}>{todayCount}</span>}
                  </div>
                ),
                onClick: () => {
                  if (location.pathname === '/today') {
                    // 即使已经在"今天"页面，也触发刷新
                    handleRefreshAll(false);
                    document.dispatchEvent(new CustomEvent('request-list-refresh'));
                  } else {
                    navigate('/today');
                  }
                }
              },
              {
                key: 'all',
                icon: <AppstoreOutlined />,
                label: (
                  <div className={styles.menuItemContainer}>
                    <span>所有</span>
                    {allCount > 0 && <span className={styles.menuItemBadge}>{allCount}</span>}
                  </div>
                ),
                onClick: () => {
                  if (location.pathname === '/all') {
                    document.dispatchEvent(new CustomEvent('request-list-refresh'));
                  } else {
                    navigate('/all');
                  }
                }
              },
              {
                key: 'notes',
                icon: <FileTextOutlined />,
                label: (
                  <div className={styles.menuItemContainer}>
                    <span>笔记</span>
                    {notesCount > 0 && (
                      <span className={styles.menuItemBadge} data-testid="notes-count">
                        {notesCount}
                      </span>
                    )}
                  </div>
                ),
                onClick: () => navigate('/notes')
              },
              {
                key: 'readlater',
                icon: <ClockCircleOutlined />,
                label: (
                  <div className={styles.menuItemContainer}>
                    <span>稍后读</span>
                    {readLaterCount > 0 && <span className={styles.menuItemBadge}>{readLaterCount}</span>}
                  </div>
                ),
                onClick: () => navigate('/readlater')
              }
            ]}
          />

          <div className={styles.feedsContainer}>
            <div className={`${styles.feedsHeader} ${isPanelCollapsed ? styles.feedsHeaderCollapsed : ''}`}>
              {!isPanelCollapsed && (
                <span className={styles.feedsTitle}>订阅</span>
              )}
            </div>
            <FeedList feeds={feeds} groups={groups} collapsed={isPanelCollapsed} onRefreshFeeds={handleRefreshAll} />
          </div>

          <div className={`${styles.siderFooter} ${isPanelCollapsed ? styles.siderFooterCollapsed : ''}`}>
            {isPanelCollapsed ? (
              <Tooltip title="设置" placement="right">
                <Button
                  type="text"
                  icon={<SettingOutlined />}
                  onClick={() => navigate('/settings')}
                  className={`${styles.settingsButton} ${styles.settingsButtonCollapsed}`}
                />
              </Tooltip>
            ) : (
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => navigate('/settings')}
                className={styles.settingsButton}
              >
                设置
              </Button>
            )}
          </div>
        </Panel>

        <PanelResizeHandle 
          className={styles.siderResizeHandle_rH} 
          onDragging={setIsDragging}
        />

        <Panel 
          defaultSize={settings.layout.sidebarLayout[1]}
          minSize={30}
          className={styles.contentPanel}
        >
          <Layout className={styles.contentLayout_rH}>
            <Content className={styles.content_rH}>
              <Outlet />
            </Content>
          </Layout>
        </Panel>

        {showAddFeedModal && (
          <AddFeedModal
            open={showAddFeedModal}
            onCancel={() => setShowAddFeedModal(false)}
            onOk={handleAddFeedSuccess}
            groups={groups}
          />
        )}
        {showAddGroupModal && (
          <AddGroupModal
            open={showAddGroupModal}
            onCancel={() => setShowAddGroupModal(false)}
            onSuccess={handleAddGroupSuccess}
            existingGroups={groups}
          />
        )}
        <DiscoverFeedsModal 
          isOpen={isDiscoverModalOpen} 
          onClose={() => setIsDiscoverModalOpen(false)}
          existingFeeds={feeds} 
          existingGroups={groups}
        />
      </PanelGroup>
    </Layout>
  );
};

export default SidebarLayout; 
