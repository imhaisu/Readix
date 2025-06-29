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
import { cleanupOldArticles } from '../utils/cleanupHelper';
import { getTodayRange, updateUnreadCountOptimized } from '../utils/helpers';
import { processFeedIcons } from '../utils/iconUtils';
import { useFilter } from '../contexts/FilterContext';
import styles from './SidebarLayout.module.css';
import { useLayout } from '../contexts/LayoutContext';

const { Content } = Layout;

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
        console.log('[SidebarLayout] 开始计算各种数量...');
        
        // 根据 filter 状态构建查询条件
        const filterCondition = (article: DbArticle) => {
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
          .filter(filterCondition)
          .count();

        const allPromise = db.articles.filter(filterCondition).count();
         
        const readLaterPromise = db.articles
          .where({ isReadLater: 'true' })
          .filter(filterCondition)
          .count();

        const totalUnreadPromise = db.articles.where('isRead').equals('false').count();
         
        const starredPromise = db.articles
          .where({ isStarred: 'true' })
          .filter(filterCondition)
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

        console.log(`[SidebarLayout] 计数结果: 今日=${today}, 所有=${all}, 稍后读=${readLater}, 未读=${unread}, 星标=${starred}, 笔记=${notes}`);

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
      console.log('[SidebarLayout] 检测到笔记变化，更新计数');
      if (db && dbInitialized) {
        db.annotations.count().then(count => {
          console.log(`[SidebarLayout] 新的笔记数量: ${count}`);
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
      console.log('[SidebarLayout] 检测到returnToNotes标记，准备导航到笔记页面');
      console.log('[SidebarLayout] 当前路径:', location.pathname);
      
      // 清除标记，防止重复导航
      sessionStorage.removeItem('returnToNotes');
      
      // 确保FeedList可见，立即设置
      if (!isFeedListVisible) {
        console.log('[SidebarLayout] 设置FeedList可见');
        setIsFeedListVisible(true);
      }
      
      // 延迟导航到笔记页面，确保侧边栏已完全加载并且FeedList可见
      setTimeout(() => {
        console.log('[SidebarLayout] 延迟导航到笔记页面，保持侧边栏FeedList可见');
        // 导航到笔记页面
        navigate('/notes');
      }, 500);
    }
  }, [navigate, location, isFeedListVisible, setIsFeedListVisible]);

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') {
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

  const handleRefreshAll = useCallback(async (isSilent: boolean = false) => {
    if (!db || (refreshing && !isSilent) || feeds.length === 0) {
        if (refreshing && !isSilent) console.log('[SidebarLayout] Refresh already in progress or no feeds.');
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

      for (const result of results) {
        const { feed, articles: fetchedArticles } = result;
        if (fetchedArticles.length > 0 && feed.id) {
          const existingArticles = await db.articles.where('sourceId').equals(feed.id).toArray();
          const existingArticlesMap = new Map(existingArticles.map(a => [a.id, a]));

          const articlesToPut = fetchedArticles.map(fetchedArticle => {
            const existingArticle = existingArticlesMap.get(fetchedArticle.id);
            if (existingArticle) {
              return {
                ...fetchedArticle,
                isRead: existingArticle.isRead,
                isStarred: existingArticle.isStarred,
                scrollPosition: existingArticle.scrollPosition,
                isReadLater: existingArticle.isReadLater,
              };
            } else {
              return fetchedArticle;
            }
          });
          
          await db.articles.bulkPut(articlesToPut);
          await updateUnreadCountOptimized(db, feed.id);
        }
      }

      triggerFeedCountRefresh();
      triggerArticleListRefresh();

    } catch (error) {
      console.error('[SidebarLayout] Feed refresh operation failed:', error);
    } finally {
      if (!isSilent) {
        setRefreshing(false);
      }
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
                  if (location.pathname === '/') {
                    document.dispatchEvent(new CustomEvent('request-list-refresh'));
                  } else {
                    navigate('/');
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
        />
      </PanelGroup>
    </Layout>
  );
};

export default SidebarLayout; 
