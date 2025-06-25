import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, Empty, Select, Button, Typography, Skeleton, Input, Space, Tooltip, Popover, message, Radio, Spin, notification, Modal } from 'antd';
import type { InputRef } from 'antd';
import { 
  CheckCircleOutlined,
  SearchOutlined,
  StarOutlined,
  CheckSquareOutlined,
  AppstoreAddOutlined,
  ExclamationCircleOutlined,
  SyncOutlined
} from '@ant-design/icons';
import ArticleList, { ArticleListHandle } from '../components/ArticleList';
import ArticleDetail from '../components/ArticleDetail';
import WelcomePage from '../components/WelcomePage';
import { useDatabase } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFilter, FilterType } from '../contexts/FilterContext';
import { refreshAllFeeds } from '../utils/rssParser';
import { FeedSource, Article } from '../db/database';
import { getTodayRange, debounce, updateUnreadCountOptimized } from '../utils/helpers';
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import styles from './HomePage.module.css';
import { useLayout } from '../contexts/LayoutContext';
import { GeneralSettings } from '../types/settings';

const { Header, Content } = Layout;
const { Option } = Select;
const { Title, Text } = Typography;

interface HomePageProps {
  filter?: 'all' | 'unread' | 'starred' | 'today';
}

const HomePage: React.FC<HomePageProps> = ({ filter }) => {
  const { db, articleListRefreshTrigger, triggerArticleListRefresh, isInitialized: dbInitialized, initialLoadRefreshed, setInitialLoadRefreshed } = useDatabase();
  const { settings, isInitialized: settingsInitialized, updateLayoutSettings } = useSettings();
  const { filter: activeListFilter, setFilter } = useFilter();
  const navigate = useNavigate();
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
  
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [pullDownProgress, setPullDownProgress] = useState(0); 
  const articleListRef = useRef<ArticleListHandle>(null);
  const articleListContainerRef = useRef<HTMLDivElement>(null);
  const pullStartY = useRef(0);
  const isPulling = useRef(false);

  const PULL_TO_REFRESH_THRESHOLD = 250;

  const refreshDependenciesRef = useRef({ db, feedId, groupId, triggerArticleListRefresh, setIsPullRefreshing });
  useEffect(() => {
    refreshDependenciesRef.current = { db, feedId, groupId, triggerArticleListRefresh, setIsPullRefreshing };
  }, [db, feedId, groupId, triggerArticleListRefresh, setIsPullRefreshing]);

  const listPanelRef = useRef<ImperativePanelHandle>(null);
  const detailPanelRef = useRef<ImperativePanelHandle>(null);
  const searchInputRef = useRef<InputRef>(null);
  const { isArticleListVisible } = useLayout();
  const panelGroupRef = useRef<HTMLDivElement>(null); 
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const groupElement = panelGroupRef.current;
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
    if (panelGroupRef.current) {
      const containerWidth = panelGroupRef.current.getBoundingClientRect().width;
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
  }, [settings.general.layoutMode]);

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
    const allFeeds = await db.feeds.toArray();
    setFeeds(allFeeds);
  };

  useEffect(() => {
    loadFeeds();
  }, [db, articleListRefreshTrigger]);
  
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
    
    if (isPullRefreshing) {
      // console.log('Refresh is already in progress. Skipping.');
      return;
    }
    
    if (!db) return;

    if (!options?.silent) {
      setIsPullRefreshing(true);
    }

    const feedsToRefresh = feedId ? [feeds.find(f => f.id === feedId)].filter(Boolean) as FeedSource[] : feeds;

    try {
      if (feedsToRefresh.length > 0) {
        // console.log(`[HomePage] Refreshing ${feedsToRefresh.length} feeds...`);
        const results = await refreshAllFeeds(feedsToRefresh);

        if (db) {
          for (const result of results) {
            const { feed, articles: fetchedArticles } = result;
            if (fetchedArticles.length > 0) {
              const existingArticles = await db.articles.where('sourceId').equals(feed.id!).toArray();
              const existingArticlesMap = new Map(existingArticles.map(a => [a.id, a]));

              const articlesToPut = fetchedArticles.map(fetchedArticle => {
                const existingArticle = existingArticlesMap.get(fetchedArticle.id);
                if (existingArticle) {
                  // Merge to preserve user-specific state
                  return {
                    ...fetchedArticle, // Fresh data from feed
                    isRead: existingArticle.isRead,
                    isStarred: existingArticle.isStarred,
                    scrollPosition: existingArticle.scrollPosition,
                    isReadLater: existingArticle.isReadLater,
                  };
                } else {
                  return fetchedArticle; // New article
                }
              });

              await db.articles.bulkPut(articlesToPut);
              await updateUnreadCountOptimized(db, feed.id!);
            }
          }
        }
        
        triggerArticleListRefresh();

      } else {
        // console.log('No feeds to refresh.');
      }
    } catch (error) {
      console.error('Error during refresh all:', error);
      if (!options?.silent) {
        notification.error({
          message: '刷新失败',
          description: '同步订阅源时发生错误，请稍后重试。',
          placement: 'bottomRight',
        });
      }
    } finally {
      if (!options?.silent) {
        setTimeout(() => {
          setIsPullRefreshing(false);
        }, 500);
      } else {
        setIsPullRefreshing(false);
      }
    }
  }, [db, feeds, triggerArticleListRefresh]);
  
  const handleLocalListRefresh = useCallback(() => {
    // console.log('[HomePage] Triggering local list refresh via key increment.');
  }, []);

  useEffect(() => {
    document.addEventListener('request-list-refresh', handleLocalListRefresh);
    return () => {
      document.removeEventListener('request-list-refresh', handleLocalListRefresh);
    };
  }, [handleLocalListRefresh]);

  useEffect(() => {
    if (dbInitialized && isTodayView && !initialLoadRefreshed) {
      // console.log('[HomePage] Initial load on Today view, triggering silent auto-refresh.');
      setInitialLoadRefreshed();
      handleRefreshAll({ silent: true });
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

  const handleArticleSelect = useCallback((articleId: string | null) => {
    setSelectedArticleId(articleId);
    if (articleId) {
      setArticleDetailViewMode('full'); 
    }
  }, []);

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
    <div 
      className={`${styles.homePage} ${isPulling ? styles.isResizing : ''}`}
      ref={panelGroupRef}
    >
        <PanelGroup 
          direction="horizontal" 
          className={styles.panelGroup}
          onLayout={handleMainLayout}
        >
          {isArticleListVisible && (
            <>
              <Panel
                ref={listPanelRef}
                defaultSize={settings.layout.mainLayout[0]}
                minSize={25}
                maxSize={50}
                collapsible
                id="article-list-panel"
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
                />
              ) : (
                <div className={styles.emptyDetailPane}>
                  <Empty description="请选择一篇文章阅读" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center'}} />
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
    </div>
  );
};

export default HomePage; 