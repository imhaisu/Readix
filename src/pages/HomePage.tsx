import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, Empty, Select, Button, Dropdown, Menu, Typography, Skeleton, Input, Space, Tooltip, Popover, message, Radio, Spin } from 'antd';
import type { InputRef } from 'antd';
import { 
  UnorderedListOutlined, 
  AppstoreOutlined, 
  CheckCircleOutlined,
  SearchOutlined,
  BookOutlined,
  BarsOutlined,
  ProfileOutlined,
  LayoutOutlined,
  DownOutlined,
  StarOutlined,
  CheckSquareOutlined,
  AppstoreAddOutlined
} from '@ant-design/icons';
import ArticleList from '../components/ArticleList';
import ArticleDetail from '../components/ArticleDetail';
import WelcomePage from '../components/WelcomePage';
import { useDatabase } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFilter, FilterType } from '../contexts/FilterContext';
import { refreshAllFeeds } from '../utils/rssParser';
import { FeedSource, Article } from '../contexts/DatabaseContext';
import { getTodayRange } from '../utils/helpers';
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import styles from './HomePage.module.css';
import { useLayout } from '../contexts/LayoutContext';

const { Header, Content } = Layout;
const { Option } = Select;
const { Title, Text } = Typography;

interface HomePageProps {
  filter?: 'all' | 'unread' | 'starred' | 'today';
}

// Minimal local definition for GeneralSettings to avoid import error
interface GeneralSettings {
  defaultViewMode: 'list' | 'compact' | 'card' | 'magazine';
  layoutMode: 'two-column' | 'three-column';
  sidebarWidth?: number; // Make sidebarWidth optional as it was causing issues
  // Add other fields from GeneralSettings if they are used in this component
}

const viewIcons: { [key: string]: React.ReactNode } = {
  list: <UnorderedListOutlined />,
  compact: <BarsOutlined />,
  card: <AppstoreOutlined />,
  magazine: <ProfileOutlined />,
};

const HomePage: React.FC<HomePageProps> = ({ filter }) => {
  const { db, refreshTrigger, triggerRefresh, isInitialized: dbInitialized, initialLoadRefreshed, setInitialLoadRefreshed } = useDatabase();
  const { settings, isInitialized: settingsInitialized } = useSettings();
  const { filter: activeListFilter, setFilter } = useFilter();
  const navigate = useNavigate();
  const { feedId, groupId } = useParams<{ feedId?: string; groupId?: string }>();

  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card' | 'magazine' | 'compact'>('list');
  const [articleDetailViewMode, setArticleDetailViewMode] = useState<'full' | 'web' | 'original'>('full');
  const [pageTitle, setPageTitle] = useState('所有文章');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isTodayView, setIsTodayView] = useState(false);
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [searchModeActive, setSearchModeActive] = useState(false);
  const [lastUpdatedArticleInfo, setLastUpdatedArticleInfo] = useState<{ id: string, changes: Partial<Article> } | null>(null);
  const [articleListRefreshKey, setArticleListRefreshKey] = useState<number>(0);

  // 新增：下拉刷新状态 和 ref
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const articleListContainerRef = useRef<HTMLDivElement>(null);

  const listPanelRef = useRef<ImperativePanelHandle>(null);
  const detailPanelRef = useRef<ImperativePanelHandle>(null);
  const searchInputRef = useRef<InputRef>(null);
  const { isArticleListVisible } = useLayout();

  // 监听笔记侧边栏的开关事件，实现"专注模式"
  useEffect(() => {
    const handleAnnotationSidebarToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ isVisible: boolean }>;
      if (!customEvent.detail) return;

      const { isVisible } = customEvent.detail;
      
      // 只在三栏布局下才折叠文章列表
      if (settings.general.layoutMode === 'three-column' && listPanelRef.current) {
        const isListCollapsed = listPanelRef.current.isCollapsed();
        if (isVisible && !isListCollapsed) {
          listPanelRef.current.collapse();
        } else if (!isVisible && isListCollapsed) {
          listPanelRef.current.expand();
        }
      }
    };

    document.addEventListener('annotationSidebarToggled', handleAnnotationSidebarToggle);

    return () => {
      document.removeEventListener('annotationSidebarToggled', handleAnnotationSidebarToggle);
    };
  }, [settings.general.layoutMode]); // 依赖布局模式，以便在切换布局后行为正确

  // 新增一个 ref 来跟踪初始刷新是否已完成
  const initialRefreshDoneRef = useRef(false);

  // Refs to store previous feedId and groupId to detect navigation
  const prevFeedIdRef = useRef<string | undefined>();
  const prevGroupIdRef = useRef<string | undefined>();
  const prevFilterPropRef = useRef<string | undefined>(); // 用于跟踪 filter prop 的变化

  useEffect(() => {
    setViewMode(settings.general.defaultViewMode || 'list');
  }, [settings.general.defaultViewMode]);

  const loadFeeds = async () => {
    if (!db) return;
    const allFeeds = await db.feeds.toArray();
    setFeeds(allFeeds);
  };

  useEffect(() => {
    loadFeeds();
  }, [db, refreshTrigger]);
  
  const fetchTitle = useCallback(async () => {
    let titleText = '所有文章';
    if (!db) {
      setPageTitle(titleText);
      return;
    }
    if (feedId) {
      const feed = await db.feeds.get(feedId);
      titleText = feed?.title || '订阅源文章';
    } else if (groupId) {
      const group = await db.groups.get(groupId);
      titleText = group?.name || '分组文章';
    } else if (filter === 'starred') {
      titleText = '我的收藏';
    } else if (filter === 'unread') {
      titleText = '未读文章';
    } else if (window.location.pathname === '/today') {
      titleText = '今日文章';
    }
    setPageTitle(titleText);
  }, [db, feedId, groupId, filter]);

  useEffect(() => {
    // 这个 effect 应该在 filter prop (来自路由), feedId, 或 groupId 变化时运行
    // 它的主要职责是重置文章详情选择、搜索词，并判断是否需要强制 ArticleList 重建 (通过 key)

    const prevFeed = prevFeedIdRef.current;
    const prevGroup = prevGroupIdRef.current;
    const prevFilter = prevFilterPropRef.current;

    let needsListRefresh = false;

    if (feedId !== prevFeed || groupId !== prevGroup) {
      // 场景1: 订阅源或分组发生了变化 (进入/退出/切换 feed/group)
      needsListRefresh = true;
    } else if (!feedId && !groupId && filter !== prevFilter) {
      // 场景2: 在全局视图之间切换 (e.g., / -> /all -> /unread -> /starred)
      // feedId 和 groupId 必须当前和之前都为 undefined，仅 filter prop 变化
      needsListRefresh = true;
    }

    if (needsListRefresh) {
      console.log('[HomePage] Critical navigation change detected. Refreshing ArticleList key.', { feedId, prevFeed, groupId, prevGroup, filter, prevFilter });
      setSelectedArticleId(null); 
      // 修复：不要每次都清空搜索词，保留用户的搜索状态
      // setSearchTerm(''); 
      setArticleListRefreshKey(prev => prev + 1);
    }
    
    // 更新isTodayView状态，这不应该触发列表的强制刷新，列表会根据filter对象自行调整
    const newIsToday = filter === undefined && !feedId && !groupId;
    setIsTodayView(newIsToday);

    // 更新 refs 以供下次比较
    prevFeedIdRef.current = feedId;
    prevGroupIdRef.current = groupId;
    prevFilterPropRef.current = filter;

  }, [filter, feedId, groupId]); // 依赖项保持不变

  // 新增 Effect 用于应用启动时自动刷新
  useEffect(() => {
    // 确保只在应用首次加载"今日"视图时执行一次
    if (dbInitialized && isTodayView && !initialLoadRefreshed) {
      console.log('[HomePage] Initial load on Today view, triggering silent auto-refresh.');
      setInitialLoadRefreshed(); // 立即标记，防止重复触发
      handleRefreshAll({ silent: true });
    }
  }, [dbInitialized, isTodayView, initialLoadRefreshed, setInitialLoadRefreshed]);

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

  const handleArticleSelect = useCallback((articleId: string) => {
    setSelectedArticleId(articleId);
    setArticleDetailViewMode('full'); 
  }, []);

  const handleCloseArticle = () => {
    setSelectedArticleId(null);
  };

  const handleArticleModified = (articleId: string, changes: Partial<Article>) => {
    setLastUpdatedArticleInfo({ id: articleId, changes });
    // Potentially trigger a soft refresh or specific update for FeedList counts here if needed in future.
    // For now, FeedList updates on its own cycle or full refresh.
  };
  
  const handleManualListRefresh = () => {
    setArticleListRefreshKey(prev => prev + 1);
  };

  const getArticleFilter = useCallback(() => {
    console.log('[HomePage] getArticleFilter CALLED. Inputs:', { feedId, groupId, activeListFilter, filterProp: filter });
    const conditions: any = {};

    // 优先处理特定订阅源或分组的情况
    if (feedId || groupId) {
      if (activeListFilter === 'starred') {
        conditions.isStarred = 'true';
      } else if (activeListFilter === 'unread') {
        conditions.isRead = 'false';
      }
      console.log('[HomePage] getArticleFilter (Feed/Group View) RETURNING conditions:', conditions);
      return conditions;
    }

    // 全局视图 (没有 feedId 或 groupId)
    // 判断是否为"今日"视图 (基于 filter prop === undefined)
    if (filter === undefined) { // '/' 路径, 视为"今日"
      // 修复：使用统一的今日时间范围工具函数
      const todayRange = getTodayRange();
      
      // 使用 fetchDate 进行筛选，确保使用本地时区的时间戳
      conditions.fetchDate = { $gte: todayRange.start, $lte: todayRange.end };
      
      // 在"今日"视图下，如果底部筛选器不是'all',则应用额外筛选
      if (activeListFilter === 'starred') {
        conditions.isStarred = 'true';
      } else if (activeListFilter === 'unread') {
        conditions.isRead = 'false';
      }
              console.log('[HomePage] getArticleFilter (Today View - Local) RETURNING conditions:', conditions, {start: new Date(todayRange.start).toISOString(), end: new Date(todayRange.end).toISOString()});
      return conditions;
    }

    // 处理其他全局视图，最主要的是 /all (当 filter === 'all')
    // 以及 /unread, /starred (如果这些路由被恢复)
    // 在这些视图下，我们仍然根据 activeListFilter 来筛选，因为用户可能期望
    // 在"所有文章"这个大的分类下，再通过底部筛选器进行"未读/收藏"的细分。
    if (activeListFilter === 'starred') {
      conditions.isStarred = 'true';
    } else if (activeListFilter === 'unread') {
      conditions.isRead = 'false';
    }
    // 如果 activeListFilter === 'all' (并且 filter prop 不是 undefined，例如 filter === 'all')
    // conditions 仍然是空 {}，代表不过滤已读/收藏，显示所有(/all视图下)或所有未读(/unread视图下)等。

    console.log(`[HomePage] getArticleFilter (Global View - ${filter}) RETURNING conditions:`, conditions);
    return conditions;

  }, [feedId, groupId, activeListFilter, filter]);

  const handleRefreshAll = async (options?: { silent?: boolean }) => {
    const isSilent = options?.silent || false;
    if (!db || loading) return;

    setLoading(true);
    if (!isSilent) {
      message.info('正在刷新所有订阅源...');
    }
    try {
      const allFeeds = await db.feeds.toArray();
      if (allFeeds.length > 0) {
        // 更新数据库中的文章
        const results = await refreshAllFeeds(allFeeds);
        await db.transaction('rw', db.articles, db.feeds, async () => {
          for (const result of results) {
            if (result.articles.length > 0) {
              const existingArticleIds = new Set(
                (await db.articles.where('sourceId').equals(result.feed.id!).toArray()).map(a => a.id)
              );
              const newArticles = result.articles.filter(a => !existingArticleIds.has(a.id));
              
              if (newArticles.length > 0) {
                await db.articles.bulkAdd(newArticles);
              }
            }
            // 更新 unreadCount
            const unreadCount = await db.articles.where({ sourceId: result.feed.id!, isRead: 'false' }).count();
            await db.feeds.update(result.feed.id!, { unreadCount, lastUpdated: new Date() });
          }
        });
        if (!isSilent) {
          message.success('所有订阅源已刷新');
        }
      } else if (!isSilent) {
        message.info('没有需要刷新的订阅源');
      }
    } catch (error) {
      console.error('刷新所有订阅源失败:', error);
      if (!isSilent) {
        message.error('刷新失败，请查看控制台获取详情');
      }
    } finally {
      setLoading(false);
      triggerRefresh();
    }
  };

  const handleAddFirstFeed = (feed: FeedSource) => {
    loadFeeds(); 
    navigate(`/feed/${feed.id}`);
  };

  const handleViewModeChange = (mode: 'list' | 'card' | 'magazine' | 'compact') => {
    setViewMode(mode);
    // Optionally, update settings if you want this to persist:
    // if (settings.updateGeneralSetting) settings.updateGeneralSetting('defaultViewMode', mode);
  };

  const handleArticleDetailViewModeChange = (mode: 'full' | 'web' | 'original') => {
    setArticleDetailViewMode(mode);
  };

  const handleMarkAllReadLocal = async () => {
    if (!db) return;
    let articlesToUpdateQuery;
    const isTodayView = !feedId && !groupId && !filter;

    if (feedId) {
        articlesToUpdateQuery = db.articles.where({ sourceId: feedId, isRead: 'false' });
    } else if (groupId) {
        const feedsInGroup = await db.feeds.where('groupId').equals(groupId).toArray();
        const feedIdsInGroup = feedsInGroup.map(f => f.id).filter((id): id is string => !!id);
        if (feedIdsInGroup.length === 0) {
            message.info('此分组中没有订阅源。');
            return;
        }
        articlesToUpdateQuery = db.articles.where('sourceId').anyOf(...feedIdsInGroup).and(article => article.isRead === 'false');
    } else if (filter === 'starred') {
        articlesToUpdateQuery = db.articles.where({ isStarred: 'true', isRead: 'false' });
    } else if (filter === 'unread') {
        articlesToUpdateQuery = db.articles.where({ isRead: 'false' });
    } else if (isTodayView) {
        const todayRange = getTodayRange();
        articlesToUpdateQuery = db.articles
            .where('fetchDate').between(todayRange.start, todayRange.end, true, true)
            .and(article => article.isRead === 'false');
    } else { // 'all' view
        articlesToUpdateQuery = db.articles.where({ isRead: 'false' });
    }

    if (!articlesToUpdateQuery) return;

    const articlesToMark = await articlesToUpdateQuery.toArray();
    if (articlesToMark.length > 0) {
        const articleIdsToMark = articlesToMark.map(a => a.id);
        await db.transaction('rw', db.articles, db.feeds, async () => {
            await db.articles.where('id').anyOf(articleIdsToMark).modify({ isRead: 'true' });
            const feedIdsAffected = [...new Set(articlesToMark.map(a => a.sourceId).filter(id => id))];
            for (const fId of feedIdsAffected) {
                if (fId) {
                    const count = await db.articles.where({ sourceId: fId, isRead: 'false' }).count();
                    await db.feeds.update(fId, { unreadCount: count });
                }
            }
        });
        triggerRefresh(); // Refresh FeedList counts and potentially other parts of UI
        setArticleListRefreshKey(prev => prev + 1); // Force ArticleList to re-evaluate its items
        message.success(`${articlesToMark.length}篇文章已标记为已读。`);
    } else {
        message.info('当前视图没有未读文章。');
    }
  };

  const articleFilterForList = getArticleFilter();
  console.log('[HomePage] RENDERING ArticleList with props:', { filterPropForArticleList: articleFilterForList, currentFeedId: feedId, currentGroupId: groupId, activeListFilterState: activeListFilter });

  const viewModeMenu = (
    <Menu onClick={({ key }) => handleViewModeChange(key as 'list' | 'card' | 'magazine' | 'compact')}>
      {Object.entries(viewIcons).map(([key, icon]) => (
        <Menu.Item key={key} icon={icon}>
          {key.charAt(0).toUpperCase() + key.slice(1)}
        </Menu.Item>
      ))}
    </Menu>
  );

  // 新增：下拉刷新处理函数
  const handlePullToRefresh = useCallback(async () => {
    if (isPullRefreshing || !db) return;

    setIsPullRefreshing(true);
    try {
      let feedsToRefreshLogic = feeds; // 默认刷新所有已知 feeds
      if (feedId) {
          const currentFeed = await db.feeds.get(feedId);
          if (currentFeed) feedsToRefreshLogic = [currentFeed];
          else feedsToRefreshLogic = []; // feedId 无效则不刷新
      } else if (groupId) {
          feedsToRefreshLogic = await db.feeds.where('groupId').equals(groupId).toArray();
      }

      if (feedsToRefreshLogic.length > 0) {
          console.log(`Pull to refresh: targeting ${feedsToRefreshLogic.length} feeds.`);
          await refreshAllFeeds(feedsToRefreshLogic,
              (_feed, _articles) => { /* item progress, optional */ },
              (_results: any) => {
                  triggerRefresh(); // 更新全局计数等
                  setArticleListRefreshKey(prev => prev + 1); // 强制 ArticleList 刷新
              }
          );
      } else if (!feedId && !groupId) { // 如果是聚合视图（全部、未读、收藏、今日）
          console.log("Pull to refresh: targeting all feeds for aggregate view.");
          const allSystemFeeds = await db.feeds.toArray(); // 获取所有 feeds
          if (allSystemFeeds.length > 0) {
            await refreshAllFeeds(allSystemFeeds,
                (_feed, _articles) => {},
                (_results: any) => {
                    triggerRefresh();
                    setArticleListRefreshKey(prev => prev + 1);
                }
            );
          } else { // 没有订阅源的情况
             setArticleListRefreshKey(prev => prev + 1); // 也尝试刷新列表（例如，清除空状态）
          }
      } else {
          // 如果 feedsToRefreshLogic 为空 (例如无效的 feedId/groupId, 或空的分组)
          // 仍然触发列表刷新，以防万一有本地状态需要更新
          setArticleListRefreshKey(prev => prev + 1);
      }
      
      // 确保加载动画至少显示一段时间
      await new Promise(resolve => setTimeout(resolve, 700));

    } catch (error) {
      console.error("Error during pull to refresh:", error);
      message.error("刷新失败");
    } finally {
      setIsPullRefreshing(false);
    }
  }, [db, feeds, feedId, groupId, isPullRefreshing, triggerRefresh, setArticleListRefreshKey]); // 依赖项中加入了 feeds

  // 新增：滚轮事件处理
  const handleWheelScroll = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (articleListContainerRef.current) {
      const { scrollTop } = articleListContainerRef.current;
      // deltaY < 0 表示向上滚动滚轮
      if (scrollTop === 0 && event.deltaY < 0 && !isPullRefreshing) {
        // 可以考虑加一个小的 debounce 或者阈值，防止过于频繁触发
        // event.preventDefault(); // 如果不希望页面因这个滚轮事件发生其他滚动，可以取消注释
        handlePullToRefresh();
      }
    }
  }, [isPullRefreshing, handlePullToRefresh]);

  useEffect(() => {
    // 这个 effect 专门用于响应全局刷新信号
    // 当 refreshTrigger 变化时 (通常意味着后台数据已更新)，
    // 我们通过更新 key 来强制 ArticleList 组件重新获取和渲染数据。
    if (refreshTrigger > 0) { // 仅在实际触发后执行，避免初始加载时触发
      console.log(`[HomePage] Global refresh triggered (refreshTrigger: ${refreshTrigger}). Forcing ArticleList to re-render.`);
      handleManualListRefresh();
    }
  }, [refreshTrigger]);

  // Initial loading state for the entire page if db isn't ready or basic feeds haven't loaded yet
  // This is a simplified check; you might have a more robust loading indicator in a real app
  if (!db || (feeds.length === 0 && !(feedId || groupId || filter || isTodayView))) {
     // Show loading only if not in a specific feed/group/filter context yet and feeds are empty
     // WelcomePage will be shown if feeds are empty AND no specific context is active
     if (!feedId && !groupId && !filter && !isTodayView && feeds.length === 0 ) {
        // Let WelcomePage handle the case of no feeds and no active filter/context
     } else if (loading && feeds.length === 0) { // Added `loading` check here for clarity
        return (
            <Layout className={styles.homeLayout}>
                <Header className={styles.header}>
                <Title level={4} className={styles.headerTitle}>{/* Placeholder */}</Title>
                </Header>
                <Content style={{ padding: '20px', textAlign: 'center' }}>
                <Skeleton active paragraph={{ rows: 10 }} />
                </Content>
            </Layout>
        );
     }
  }

  // Determine if WelcomePage should be shown
  const showWelcomePage = feeds.length === 0 && !feedId && !groupId && !filter && !isTodayView && !searchTerm;

  return (
    <Layout className={styles.homeLayout}>
      {/* <Header className={styles.header}>
        {searchModeActive && !feedId && !groupId && !filter ? (
            <Input
                ref={searchInputRef}
                placeholder="全局搜索... (如果需要)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.mainSearchInput} 
                allowClear
                autoFocus
            />
        ) : null } 
         <Space className={styles.headerControls}>
        </Space>
      </Header> */}
      <PanelGroup direction="horizontal" className={styles.contentLayout}>
        <Panel defaultSize={settings.general.sidebarWidth || 30} minSize={30} collapsible={true} collapsedSize={0} id="article-list-panel" ref={listPanelRef}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            {/* NEW: Header for the Article List Panel */}
            <div className={styles.articleListPanelHeader}>
              <Title level={4} className={styles.panelHeaderTitle} ellipsis>
                {pageTitle}
              </Title>
              <Space className={styles.panelHeaderControls}>
                <Tooltip title={searchModeActive ? "收起搜索" : "搜索文章"}>
                    <Button
                      icon={<SearchOutlined />}
                      type={'text'} 
                      onClick={() => setSearchModeActive(!searchModeActive)}
                      className={styles.controlButton}
                    />
                </Tooltip>
                {/* <Popover 
                    content={viewModeMenu} 
                    trigger="click"
                    open={popoverVisible} 
                    onOpenChange={setPopoverVisible}
                    placement="bottomRight"
                  >
                    <Button 
                        type="text" 
                        icon={viewIcons[viewMode]} 
                        className={styles.controlButton}
                    />
                </Popover> */}
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

            {/* Conditional Search Input Row */}
            {searchModeActive && (
              <div className={styles.panelSearchInputContainer}>
                <Input
                    ref={searchInputRef}
                    placeholder="搜索"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.panelSearchInput}
                    allowClear
                    autoFocus // autoFocus when it becomes visible
                />
              </div>
            )}

            {/* Pull to refresh indicator */}
            <div 
              className={`${styles.pullToRefreshIndicatorContainer} ${isPullRefreshing ? styles.visible : ''}`}
            >
              <Spin size="small" />
            </div>

            <div 
              className={styles.articleListContainer} 
              ref={articleListContainerRef} 
              onWheel={handleWheelScroll}
            >
              { showWelcomePage ? (
                <WelcomePage onAddFirstFeed={handleAddFirstFeed} />
              ) : (
                <ArticleList
                  filter={articleFilterForList}
                  searchTerm={searchTerm}
                  onSelectArticle={handleArticleSelect}
                  viewMode={viewMode}
                  currentFeedId={feedId}
                  currentGroupId={groupId}
                  isTodayView={isTodayView}
                  selectedArticleId={selectedArticleId}
                  lastUpdatedArticleInfo={lastUpdatedArticleInfo}
                  listRefreshKey={articleListRefreshKey}
                />
              )}
            </div>
            <div className={styles.listFooterControls}>
              <Radio.Group
                value={activeListFilter}
                onChange={(e) => {
                  const newFilter = e.target.value as FilterType;
                  console.log('[HomePage] Radio.Group onChange CALLED. newFilter:', newFilter, 'Current context:', { feedId, groupId });
                  setFilter(newFilter);

                  // 重新触发文章列表的刷新，因为 activeListFilter 变了
                  setArticleListRefreshKey(prev => prev + 1);
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
        <PanelResizeHandle className={styles.resizeHandle} />
        <Panel defaultSize={100 - (settings.general.sidebarWidth || 30)} minSize={30} collapsible={true} collapsedSize={0} id="article-detail-panel" ref={detailPanelRef}>
          <div className={styles.articleDetail}>
            {selectedArticleId ? (
              <ArticleDetail 
                articleId={selectedArticleId} 
                viewMode={articleDetailViewMode} 
                onChangeViewMode={handleArticleDetailViewModeChange}
                onClose={handleCloseArticle}
                onArticleModified={handleArticleModified}
              />
            ) : (
              <Empty description="请选择一篇文章阅读" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center'}} />
            )}
          </div>
        </Panel>
      </PanelGroup>
    </Layout>
  );
};

export default HomePage; 