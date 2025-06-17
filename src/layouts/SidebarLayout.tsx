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
} from '@ant-design/icons';
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import FeedList from '../components/FeedList';
import AddFeedModal from '../components/AddFeedModal';
import AddGroupModal from '../components/AddGroupModal';
import DiscoverFeedsModal from '../components/DiscoverFeedsModal';
import { useDatabase } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { FeedSource, Group, Article as DbArticle } from '../contexts/DatabaseContext';
import { refreshAllFeeds, fetchRssFeed } from '../utils/rssParser';
import { cleanupOldArticles } from '../utils/cleanupHelper';
import { getTodayRange } from '../utils/helpers';
import { processFeedIcons } from '../utils/iconUtils';
import { useFilter } from '../contexts/FilterContext';
import styles from './SidebarLayout.module.css';
import { useLayout } from '../contexts/LayoutContext';

const { Content } = Layout;

const SidebarLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, isInitialized: settingsInitialized } = useSettings();
  const { db, refreshTrigger, isInitialized: dbInitialized, triggerRefresh } = useDatabase();
  const { filter } = useFilter();
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [showAddFeedModal, setShowAddFeedModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [isDiscoverModalOpen, setIsDiscoverModalOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const siderPanelRef = useRef<ImperativePanelHandle>(null);
  const startupTasksDone = useRef(false);
  const refreshIntervalId = useRef<NodeJS.Timeout | null>(null);

  // 新增 state 用于存储文章数量
  const [todayCount, setTodayCount] = useState(0);
  const [allCount, setAllCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [starredCount, setStarredCount] = useState(0);
  const [readLaterCount, setReadLaterCount] = useState(0);

  const { isFeedListVisible, setIsFeedListVisible, setIsArticleListVisible } = useLayout();
  const layoutRef = useRef<HTMLDivElement>(null);

  // 监听笔记侧边栏的开关事件，实现"专注模式"
  useEffect(() => {
    const handleAnnotationSidebarToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ isVisible: boolean }>;
      if (!customEvent.detail) return;
      
      const { isVisible } = customEvent.detail;
      
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
    console.log(`[SidebarLayout] isDiscoverModalOpen 状态变为: ${isDiscoverModalOpen}`);
  }, [isDiscoverModalOpen]);

  useEffect(() => {
    if (dbInitialized && settingsInitialized && db && !startupTasksDone.current) {
      console.log('[SidebarLayout] Running startup tasks...');
      
      cleanupOldArticles(db, settings.general.retentionDays)
        .then(() => console.log('[SidebarLayout] Article cleanup task completed on startup.'))
        .catch(err => console.error('[SidebarLayout] Error during startup article cleanup:', err))
        .finally(() => {
          triggerRefresh(); 
        });

      if (settings.general.syncOnStartup) {
        console.log('[SidebarLayout] Syncing feeds on startup...');
        handleRefreshAll(true);
      }
      
      startupTasksDone.current = true;
    }
  }, [dbInitialized, settingsInitialized, db, settings.general.syncOnStartup, settings.general.retentionDays, triggerRefresh]);

  useEffect(() => {
    if (refreshIntervalId.current) {
      clearInterval(refreshIntervalId.current);
      refreshIntervalId.current = null;
    }

    if (dbInitialized && settingsInitialized && db && settings.general.updateFrequency > 0) {
      const intervalMinutes = settings.general.updateFrequency;
      console.log(`[SidebarLayout] Setting up periodic refresh every ${intervalMinutes} minutes.`);
      
      refreshIntervalId.current = setInterval(() => {
        console.log('[SidebarLayout] Performing periodic feeds refresh...');
        handleRefreshAll(true);
      }, intervalMinutes * 60 * 1000);
    }

    return () => {
      if (refreshIntervalId.current) {
        clearInterval(refreshIntervalId.current);
        console.log('[SidebarLayout] Cleared periodic refresh interval.');
      }
    };
  }, [dbInitialized, settingsInitialized, db, settings.general.updateFrequency]);

  useEffect(() => {
    if (!db) return;
    const loadSupportingData = async () => {
      try {
      console.log('[SidebarLayout] Initial data load or db instance changed.');
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
      console.log('[SidebarLayout] Skipping feed reload because db or dbInitialized is not ready.');
      return;
    }

    const reloadFeedsForRefresh = async () => {
      console.log(`[SidebarLayout] refreshTrigger changed to ${refreshTrigger}. Reloading feeds and groups for UI update.`);
      try {
        const [feedsData, groupsData] = await Promise.all([
          db.feeds.toArray(),
          db.groups.toArray()
        ]);

        console.log('[SidebarLayout] Fetched data after refresh trigger. Feeds count:', feedsData.length, 'Groups count:', groupsData.length);
        
        // 处理订阅源图标
        const processedFeedsData = await processFeedIcons(feedsData);
        
        setFeeds(processedFeedsData);
        setGroups(groupsData.sort((a, b) => a.order - b.order));

      } catch (error) {
        console.error('[SidebarLayout] Error reloading feeds after refresh trigger:', error);
      }
    };

    if (typeof refreshTrigger === 'number' && refreshTrigger > 0) {
      console.log(`[SidebarLayout] Condition met for reloading feeds: refreshTrigger (${refreshTrigger}) > 0 and db is initialized.`);
      reloadFeedsForRefresh();
    } else {
      console.log(`[SidebarLayout] Condition NOT met for reloading feeds: refreshTrigger=${refreshTrigger}, dbInitialized=${dbInitialized}`);
    }
  }, [db, refreshTrigger, dbInitialized]);

  // useEffect 用于获取和更新文章数量
  useEffect(() => {
    if (!db || !dbInitialized) return;

    const fetchCounts = async () => {
      try {
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

        // 1. 计算今日文章数
        const todayRange = getTodayRange();
        const todayPromise = db.articles
          .where('fetchDate').between(todayRange.start, todayRange.end, true, true)
          .filter(filterCondition)
          .count();

        // 2. 计算所有文章数
        const allPromise = db.articles.filter(filterCondition).count();
        
        // 3. 计算 "稍后读" 数量
        const readLaterPromise = db.articles
          .where({ isReadLater: 'true' })
          .filter(filterCondition)
          .count();

        // 4. 计算未读总数 (这个通常用于应用角标，可能不需要遵循筛选器)
        const totalUnreadPromise = db.articles.where('isRead').equals('false').count();
        
        // 5. 计算收藏总数 (同上，这个特定视图的 count 可能也不需要遵循筛选器)
        // 在这里我们让它遵循筛选器，以保持UI一致性
        const starredPromise = db.articles
          .where({ isStarred: 'true' })
          .filter(filterCondition)
          .count();

        const [today, all, readLater, unread, starred] = await Promise.all([
          todayPromise,
          allPromise,
          readLaterPromise,
          totalUnreadPromise, // totalUnreadPromise 仍然计算总未读
          starredPromise
        ]);

        setTodayCount(today);
        setAllCount(all);
        setReadLaterCount(readLater);
        setUnreadCount(unread); // 这个 state 也许可以重命名为 totalUnreadCount
        setStarredCount(starred); // 这个 state 也许可以重命名为 totalStarredCount
      } catch (error) {
        console.error("[SidebarLayout] Error fetching article counts:", error);
      }
    };

    if (dbInitialized) {
      fetchCounts();
    }
    // 3. 将 filter 和 refreshTrigger 添加到依赖项
  }, [db, dbInitialized, refreshTrigger, filter]);

  const getSelectedKey = () => {
    const path = location.pathname;
    console.log(`[SidebarLayout] getSelectedKey - path: ${path}`);
    if (path === '/') {
      console.log(`[SidebarLayout] getSelectedKey - returning: home`);
      return 'home';
    }
    if (path === '/all' || path.startsWith('/feed/') || path.startsWith('/group/')) {
      console.log(`[SidebarLayout] getSelectedKey - returning: all`);
      return 'all';
    }
    const key = path.substring(1);
    console.log(`[SidebarLayout] getSelectedKey - returning: ${key}`);
    return key;
  };

  const handleRefreshAll = useCallback(async (isSilent: boolean = false) => {
    if (!db || (refreshing && !isSilent) || feeds.length === 0) {
        if (refreshing && !isSilent) console.log('[SidebarLayout] Refresh already in progress or no feeds.');
        return;
    }
    if (!isSilent) {
        setRefreshing(true);
    }
    console.log(`[SidebarLayout] handleRefreshAll called. Silent: ${isSilent}`);
    try {
      await refreshAllFeeds(
        feeds,
        (feed, articles) => { /* perFeedCallback */ },
        async (results) => { /* allDoneCallback */
          let totalTrulyNewArticles = 0;
          const feedUpdatePromises = [];
          const updatedFeedIds = new Set<string>();

          for (const result of results) {
            if (!result.feed.id) {
              console.warn('[SidebarLayout] Skipping feed without ID:', result.feed);
              continue;
            }
            const incomingArticles = result.articles.map(a => ({...a, sourceId: result.feed.id! }));
            
            if (incomingArticles.length > 0 && db) {
              try {
                const incomingArticleIds = incomingArticles.map(a => a.id);
                
                const existingArticles = await db.articles.where('id').anyOf(incomingArticleIds).toArray();
                const existingArticleIds = new Set(existingArticles.map(a => a.id));
                
                const articlesToAdd = incomingArticles.filter(a => !existingArticleIds.has(a.id));
                
                let newlyAddedCount = 0;
                if (articlesToAdd.length > 0) {
                  await db.articles.bulkAdd(articlesToAdd);
                  newlyAddedCount = articlesToAdd.length;
                  totalTrulyNewArticles += newlyAddedCount;
                }
                
                const currentFeed = await db.feeds.get(result.feed.id!);
                if (currentFeed) {
                  const feedChanges: Partial<FeedSource> = {
                    lastUpdated: new Date()
                  };
                  if (result.feed.title && currentFeed.title !== result.feed.title) {
                    feedChanges.title = result.feed.title;
                  }
                  if (newlyAddedCount > 0) {
                    feedChanges.unreadCount = (currentFeed.unreadCount || 0) + newlyAddedCount;
                  }
                  
                  if (Object.keys(feedChanges).length > 1 || newlyAddedCount > 0 || (feedChanges.title && feedChanges.title !== currentFeed.title)) {
                     feedUpdatePromises.push(db.feeds.update(result.feed.id!, feedChanges));
                     updatedFeedIds.add(result.feed.id!);
                  } else if (!updatedFeedIds.has(result.feed.id!)) {
                    feedUpdatePromises.push(db.feeds.update(result.feed.id!, { lastUpdated: new Date() }));
                  }
                }
              } catch(e: any) {
                console.error(`[SidebarLayout] Error processing articles for feed: ${result.feed.id}`, e);
                if (e && e.name === 'BulkError') {
                    console.warn(`[SidebarLayout] BulkError occurred for feed ${result.feed.id} despite pre-filtering. This may indicate issues with ID generation or concurrent updates. Failures:`, e.failures);
                }
              }
            } else if (result.feed.title && db) {
               const currentFeed = await db.feeds.get(result.feed.id!);
               if (currentFeed && currentFeed.title !== result.feed.title) {
                   feedUpdatePromises.push(db.feeds.update(result.feed.id!, { title: result.feed.title, lastUpdated: new Date() }));
                   updatedFeedIds.add(result.feed.id!);
               } else if (currentFeed) {
                   feedUpdatePromises.push(db.feeds.update(result.feed.id!, { lastUpdated: new Date() }));
               }
            }
          }
          
          if (feedUpdatePromises.length > 0) {
            await Promise.all(feedUpdatePromises);
          }
          
          console.log(`[SidebarLayout] Feeds refresh complete. ${totalTrulyNewArticles} new articles actually added.`);
          
          if (totalTrulyNewArticles > 0 || updatedFeedIds.size > 0) {
            triggerRefresh();
          }
        }
      );
    } catch (error) {
      console.error('[SidebarLayout] Feed refresh operation failed:', error);
    } finally {
      if (!isSilent) {
        setRefreshing(false);
      }
      console.log('[SidebarLayout] handleRefreshAll finished.');
    }
  }, [db, refreshing, feeds, triggerRefresh]);

  // 新增：专门刷新单个订阅源的文章
  const refreshSingleFeedArticles = useCallback(async (feedToRefresh: FeedSource) => {
    if (!db || !feedToRefresh.id) {
      console.error('[SidebarLayout] DB not available or feed ID missing for refreshSingleFeedArticles');
      return;
    }
    console.log(`[SidebarLayout] Refreshing articles for feed: ${feedToRefresh.title} (ID: ${feedToRefresh.id})`);
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
        console.log(`[SidebarLayout] Added ${articles.length} new articles for feed: ${feedToRefresh.title}`);
      } else {
        // 即使没有新文章，也更新 lastUpdated 时间戳
        await db.feeds.update(feedToRefresh.id!, { lastUpdated: new Date() });
        console.log(`[SidebarLayout] No new articles for feed: ${feedToRefresh.title}. Updated lastUpdated.`);
      }
      // 再次触发刷新，以确保UI（如未读计数、文章列表本身如果正在查看该源）得到更新
      triggerRefresh(); 
    } catch (error) {
      console.error(`[SidebarLayout] Error refreshing single feed ${feedToRefresh.title}:`, error);
    } finally {
      // setRefreshing(false);
    }
  }, [db, triggerRefresh]);

  const handleAddFeedSuccess = async (addedFeedFromModal: FeedSource) => {
    if (!db) { 
      console.error("Database not initialized in handleAddFeedSuccess");
      return;
    }
    setShowAddFeedModal(false);

    // 1. 确保数据库中的 feed 已经被添加 (AddFeedModal 做的事情)
    // 2. 更新 SidebarLayout 自身的 feeds 状态，并触发 FeedList 的重新渲染
    try {
      console.log('[SidebarLayout] Fetching all feeds from DB after add to update SidebarLayout state...');
      const allFeedsFromDb = await db.feeds.toArray();
      setFeeds(allFeedsFromDb); // 直接更新 SidebarLayout 的 feeds 状态
      console.log('[SidebarLayout] SidebarLayout feeds state updated. Count:', allFeedsFromDb.length);
      // triggerRefresh(); // 调用 triggerRefresh() 可能仍然有益，以防其他依赖于它的组件
    } catch (error) {
      console.error('[SidebarLayout] Error fetching feeds directly after add:', error);
    }
    
    // 3. 导航到首页
    navigate('/');
    console.log('[SidebarLayout] New feed added, redirecting to home.');

    // 4. 专门为这个新添加的订阅源获取文章
    // 确保我们用的是正确的 feed 对象，最好是从 allFeedsFromDb 中找到它
    if (!addedFeedFromModal.id) {
      console.error('[SidebarLayout] Added feed missing ID');
      return;
    }
    const newlyAddedFeedInDb = await db.feeds.get(addedFeedFromModal.id);

    if (newlyAddedFeedInDb) {
      console.log(`[SidebarLayout] Attempting to refresh articles for new feed: ${newlyAddedFeedInDb.title}`);
      await refreshSingleFeedArticles(newlyAddedFeedInDb);
      console.log(`[SidebarLayout] Finished refreshing articles for new feed: ${newlyAddedFeedInDb.title}`);
    } else {
      console.error(`[SidebarLayout] Could not find newly added feed with ID ${addedFeedFromModal.id} in DB before refreshing articles.`);
      // 即使找不到，也触发一次全局刷新尝试恢复
      triggerRefresh();
    }
    // 确保最终的UI状态是最新的
    triggerRefresh();
  };

  const handleAddGroupSuccess = async (group: Group) => {
    if (!db) { 
      console.error("Database not initialized in handleAddGroupSuccess");
      return;
    }
    setShowAddGroupModal(false);
    const updatedGroups = await db.groups.toArray();
    setGroups(updatedGroups.sort((a,b) => a.order - b.order));
  };

  const handleSiderCollapseToggle = (collapsed: boolean) => {
    setIsPanelCollapsed(collapsed);
    if (collapsed) {
      siderPanelRef.current?.collapse();
    } else {
      siderPanelRef.current?.expand();
    }
  };

  return (
    <Layout ref={layoutRef} className={styles.sidebarLayout}>
      <PanelGroup direction="horizontal" className={styles.layoutContainer_rH}>
        <Panel
          ref={siderPanelRef}
          defaultSize={20}
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
              {!isPanelCollapsed && <h3>Readix</h3>}
            </div>
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
                overlay={
                  <Menu>
                    <Menu.Item key="add-feed" icon={<EditOutlined />} onClick={() => setShowAddFeedModal(true)}>
                      添加订阅源
                    </Menu.Item>
                    <Menu.Item key="add-group" icon={<FolderAddOutlined />} onClick={() => setShowAddGroupModal(true)}>
                      添加分组
                    </Menu.Item>
                    <Menu.Item 
                      key="discover-feeds" 
                      icon={<AppstoreOutlined />} 
                      onClick={() => {
                        console.log('[SidebarLayout] "发现订阅源" 菜单项被点击');
                        setIsDiscoverModalOpen(true);
                      }}
                    >
                      发现订阅源
                    </Menu.Item>
                  </Menu>
                }
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
                    navigate('/', { replace: true }); 
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
                onClick: () => navigate('/all')
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
              <Tooltip title="刷新全部">
                <Button 
                  type="text" 
                  icon={<ReloadOutlined spin={refreshing} />} 
                  size="small"
                  onClick={() => handleRefreshAll(false)}
                  disabled={refreshing || feeds.length === 0}
                />
              </Tooltip>
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

        <PanelResizeHandle className={styles.siderResizeHandle_rH} />

        <Panel defaultSize={80} minSize={30}>
          <Layout className={styles.contentLayout_rH}>
            <Content className={styles.content_rH}>
              <Outlet />
            </Content>
          </Layout>
        </Panel>

        {showAddFeedModal && (
          <AddFeedModal
            visible={showAddFeedModal}
            onCancel={() => setShowAddFeedModal(false)}
            onOk={handleAddFeedSuccess}
            groups={groups}
          />
        )}
        {showAddGroupModal && (
          <AddGroupModal
            visible={showAddGroupModal}
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
