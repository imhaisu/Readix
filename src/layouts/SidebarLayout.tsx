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
  TagOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import FeedList from '../components/FeedList';
import { useDatabase } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { FeedSource, Group, Article as DbArticle } from '../db/database';
import { refreshAllFeeds, fetchRssFeed } from '../utils/rssParser';
import { cleanupOldArticles, cleanupOrphanedArticles, detectAndCleanupDuplicateArticles, cleanupArticlesByReadStatus } from '../utils/cleanupHelper';
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
  // 状态
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
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
  }, []);

  // 启动时清理任务 - 删除此段代码
  useEffect(() => {
    if (dbInitialized && settingsInitialized && db && !startupTasksDone.current && settings) {
      console.log('[SidebarLayout] 应用启动，检查清理设置:', settings.general);
      
      // 根据设置决定是否执行启动清理
      if (settings.general.autoCleanup) {
        console.log('[SidebarLayout] 自动清理已启用，准备清理文章');
        const performStartupCleanup = async () => {
          try {
            // 分别处理已读和未读文章
            if (settings.general.cleanupReadDays > 0 || settings.general.cleanupUnreadDays > 0) {
              await cleanupArticlesByReadStatus(
                db, 
                settings.general.cleanupReadDays, 
                settings.general.cleanupUnreadDays
              );
            }
            // 兼容旧版本 - 使用全局保留天数
            else if (settings.general.retentionDays > 0) {
              await cleanupOldArticles(db, settings.general.retentionDays);
            }
            console.log('[SidebarLayout] Article cleanup task completed on startup.');
          } catch (err) {
            console.error('[SidebarLayout] Error during startup article cleanup:', err);
          } finally {
            triggerArticleListRefresh();
          }
        };
        
        performStartupCleanup();
      } else {
        console.log('[SidebarLayout] 自动清理未启用，跳过清理');
      }

      if (settings.general.syncOnStartup) {
        console.log('[SidebarLayout] 启动同步已启用，开始同步订阅源');
        handleRefreshAll(true);
      } else {
        console.log('[SidebarLayout] 启动同步未启用，跳过同步');
      }
      
      startupTasksDone.current = true;
    }
  }, [dbInitialized, settingsInitialized, db, settings, triggerArticleListRefresh]);

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
  }, [dbInitialized, settingsInitialized, db, settings]);

  useEffect(() => {
    if (db) {
      loadSupportingData();
    }
  }, [db]);

  useEffect(() => {
    if (dbInitialized && settingsInitialized) {
      fetchCounts();
      //
    }
  }, [dbInitialized, settingsInitialized, filter, articleListRefreshTrigger]);

  const loadSupportingData = async () => {
    if (!db) return;
    try {
      const [groupsData, feedsData] = await Promise.all([
        db.groups.toArray(),
        db.feeds.toArray()
      ]);
      setGroups(groupsData);

      // 使用新的图标处理函数
      const processedFeeds = await processFeedIcons(feedsData);
      setFeeds(processedFeeds);
    } catch (error) {
      console.error('Error loading supporting data:', error);
    }
  };

  const reloadFeedsForRefresh = async () => {
    if (!db) return [];
    try {
      const feedsData = await db.feeds.toArray();
      const processedFeeds = await processFeedIcons(feedsData);
      setFeeds(processedFeeds);
      return processedFeeds;
    } catch (error) {
      console.error("Error reloading feeds:", error);
      return [];
    }
  };

  const handleRefreshAll = async (isPeriodicRefresh: boolean = false) => {
    if (refreshing || !db) return;
    setRefreshing(true);
    try {
      const reloadedFeeds = await reloadFeedsForRefresh();
      if (reloadedFeeds.length === 0) {
        console.log("No feeds to refresh.");
        setRefreshing(false);
        return;
      }

      await refreshAllFeeds(
        reloadedFeeds,
        async (feed, articles) => {
          // onProgress callback
          if (db && articles.length > 0) {
            await db.articles.bulkPut(articles);
            await updateUnreadCountOptimized(db, feed.id!);
          }
        },
        (results) => {
          // onComplete callback
          triggerArticleListRefresh();
          triggerFeedCountRefresh();
        }
      );

    } catch (error) {
      console.error("Failed to refresh all feeds:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchCounts = async () => {
    if (!db) return;

    const filterCondition = (article: DbArticle) => {
      if (article.isHidden) return false;
      switch(filter) {
        case 'unread': return article.isRead === 'false';
        case 'starred': return article.isStarred === 'true';
        default: return true;
      }
    };

    try {
      // 获取今日文章数量
      const todayRange = getTodayRange();
      const todayArticles = await db.articles
        .where('publishDate').between(todayRange.start, todayRange.end, true, true)
        .filter(article => !article.isHidden)
        .count();
      setTodayCount(todayArticles);
      
      // 获取所有文章数量
      const allArticles = await db.articles
        .filter(article => !article.isHidden)
        .count();
      setAllCount(allArticles);
      
      const unread = await db.articles.where({ isRead: 'false', isHidden: false }).count();
      setUnreadCount(unread);
      
      const starred = await db.articles.where({ isStarred: 'true', isHidden: false }).count();
      setStarredCount(starred);

      // 获取稍后读文章数量
      let readLater = 0;
      try {
        readLater = await db.savedLinks.count();
      } catch (error) {
        readLater = await db.articles.where({ isReadLater: 'true', isHidden: false }).count();
      }
      setReadLaterCount(readLater);
    } catch (error) {
      log.error('Error fetching counts:', error);
    }
  };

  // 监听数据库变化以更新笔记数量
  useEffect(() => {
    if (!db) return;
    const handleAnnotationChange = () => {
      db.annotations.count().then(setNotesCount).catch(err => console.error("无法更新笔记数量", err));
    };

    db.annotations.hook('creating', handleAnnotationChange);
    db.annotations.hook('updating', handleAnnotationChange);
    db.annotations.hook('deleting', handleAnnotationChange);

    // Initial count
    handleAnnotationChange();

    return () => {
      // Proper cleanup would involve using Dexie.Observable, but for this simple case,
      // we assume hooks are cleared when the component unmounts.
      // A more robust solution might be needed if this component's lifecycle is complex.
    };
  }, [db]);

  useEffect(() => {
    // 页面加载时执行一次，确保初始状态正确
    const path = location.pathname;
    if (!isValidPath(path)) {
      navigate('/today', { replace: true });
    }
  }, [location.pathname, navigate]);

  const isValidPath = (path: string) => {
    // 检查是否是文章详情页、分组页、订阅源页或主题页
    if (/^\/(article|group|feed|topic)\/\w+/.test(path)) {
      return true;
    }
    // 检查是否是固定的几个页面之一
    const validBasePaths = ['/today', '/all', '/notes', '/readlater', '/settings', '/manage', '/add-feed', '/add-group', '/discover', '/search'];
    return validBasePaths.some(base => path.startsWith(base));
  };
  
  useEffect(() => {
    const handleSiderVisibility = () => {
      if (siderPanelRef.current) {
        const isCollapsed = siderPanelRef.current.isCollapsed();
        if (isFeedListVisible && isCollapsed) {
          siderPanelRef.current.expand();
        } else if (!isFeedListVisible && !isCollapsed) {
          siderPanelRef.current.collapse();
        }
      }
    };
    handleSiderVisibility();
  }, [isFeedListVisible]);

  useEffect(() => {
    const refreshCurrentView = () => {
      // 这里可以根据当前的路由来决定刷新哪个部分
      if (location.pathname.startsWith('/feed/') || location.pathname.startsWith('/group/')) {
        // 如果在 feed 或 group 视图, 触发 feed list 刷新
        handleRefreshAll(true);
      }
      // 对于其他视图，可能需要触发文章列表的刷新
      triggerArticleListRefresh();
    };

    document.addEventListener('request-list-refresh', refreshCurrentView);
    return () => {
      document.removeEventListener('request-list-refresh', refreshCurrentView);
    };
  }, [location.pathname, filter, db, triggerArticleListRefresh]);

  const onLayout = (sizes: number[]) => {
    // console.log('Layout changed:', sizes);
    debouncedUpdateLayout(sizes);
  };
  
  const handleAddAction = (key: string) => {
    switch (key) {
      case 'add-feed':
        navigate('/manage?tab=1');
        break;
      case 'add-group':
        navigate('/manage?tab=2');
        break;
      case 'add-topic':
        navigate('/manage?tab=4');
        break;
      default:
        break;
    }
  };

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith('/today')) return 'today';
    if (path.startsWith('/all')) return 'all';
    if (path.startsWith('/notes')) return 'notes';
    if (path.startsWith('/readlater')) return 'readlater';
    if (path.startsWith('/settings')) return 'settings';
    return '';
  };

  // 根据当前路由确定菜单项
  const mainMenuItems = [
    {
      key: 'today',
      icon: <CalendarOutlined />,
      label: '今日',
      onClick: () => navigate('/today'),
    },
    {
      key: 'all',
      icon: <AppstoreOutlined />,
      label: '所有',
      onClick: () => navigate('/all'),
    },
    {
      key: 'readlater',
      icon: <ClockCircleOutlined />,
      label: '稍后阅读',
      onClick: () => navigate('/readlater'),
    },
    {
      key: 'notes',
      icon: <HighlightOutlined />,
      label: '我的笔记',
      onClick: () => navigate('/notes'),
    }
  ];

  const addMenuItems = (
    <Menu onClick={({ key }) => handleAddAction(key)}>
      <Menu.Item key="add-feed" icon={<FileTextOutlined />}>
        添加订阅
      </Menu.Item>
      <Menu.Item key="add-group" icon={<FolderAddOutlined />}>
        添加分组
      </Menu.Item>
      <Menu.Item key="add-topic" icon={<TagOutlined />}>
        添加主题
      </Menu.Item>
    </Menu>
  );

  const handleSiderCollapseToggle = (collapsed: boolean) => {
    setIsPanelCollapsed(collapsed);
    if (collapsed) {
      // 折叠时保存布局大小
      updateLayoutSettings({ sidebarLayout: [0, 100] });
    } else {
      // 展开时恢复默认或上一次的大小
      updateLayoutSettings({ sidebarLayout: [20, 80] });
    }
  };

  // 启动时自动清理旧文章和孤立文章
  useEffect(() => {
    const scheduleCleanup = () => {
      if (db) {
        cleanupOldArticles(db, settings.general.retentionDays);
        cleanupOrphanedArticles(db);
        detectAndCleanupDuplicateArticles(db); // 添加重复文章清理
      }
    };
    const timer = setTimeout(scheduleCleanup, 10000); // 10秒后执行
    return () => clearTimeout(timer);
  }, [db, settings.general.retentionDays]);

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
              {/* 保持标题区域为空 */}
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
                    onClick={() => navigate('/manage')}
                    className={styles.addButton}
                  />
                </Tooltip>
              ) : (
                <Tooltip title="添加订阅">
                  <Button
                    type="text"
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/manage')}
                    className={styles.addButton}
                  />
                </Tooltip>
              )}
            </div>
          </div>

          <Menu
            mode="inline"
            selectedKeys={[getSelectedKey()]}
            className={styles.menu}
            inlineCollapsed={isPanelCollapsed}
            items={[
              // 注释掉原有的导航菜单项
              // {
              //   key: 'home',
              //   icon: <CalendarOutlined />,
              //   label: (
              //     <div className={styles.menuItemContainer}>
              //       <span>今日</span>
              //       {todayCount > 0 && <span className={styles.menuItemBadge}>{todayCount}</span>}
              //     </div>
              //   ),
              //   onClick: () => {
              //     if (location.pathname === '/today') {
              //       // 即使已经在"今天"页面，也触发刷新
              //       handleRefreshAll(false);
              //       document.dispatchEvent(new CustomEvent('request-list-refresh'));
              //     } else {
              //       navigate('/today');
              //     }
              //   }
              // },
              // {
              //   key: 'all',
              //   icon: <AppstoreOutlined />,
              //   label: (
              //     <div className={styles.menuItemContainer}>
              //       <span>所有</span>
              //       {allCount > 0 && <span className={styles.menuItemBadge}>{allCount}</span>}
              //     </div>
              //   ),
              //   onClick: () => {
              //     if (location.pathname === '/all') {
              //       document.dispatchEvent(new CustomEvent('request-list-refresh'));
              //     } else {
              //       navigate('/all');
              //     }
              //   }
              // },
              // {
              //   key: 'notes',
              //   icon: <FileTextOutlined />,
              //   label: (
              //     <div className={styles.menuItemContainer}>
              //       <span>笔记</span>
              //       {notesCount > 0 && (
              //         <span className={styles.menuItemBadge} data-testid="notes-count">
              //           {notesCount}
              //         </span>
              //       )}
              //     </div>
              //   ),
              //   onClick: () => navigate('/notes')
              // }
            ]}
          />

          <div className={styles.feedsContainer}>
            <div className={`${styles.feedsHeader} ${isPanelCollapsed ? styles.feedsHeaderCollapsed : ''}`}>
              {/* 隐藏"订阅"文本 */}
              {/* {!isPanelCollapsed && (
                <span className={styles.feedsTitle}>订阅</span>
              )} */}
            </div>
            <div className={styles.feedListContainer}>
              {/* 顶部内容可以根据需要添加 */}
              {/* <div className={styles.topContent}>
                {显示文章统计或其他内容}
              </div> */}
              <FeedList feeds={feeds} groups={groups} collapsed={isPanelCollapsed} onRefreshFeeds={handleRefreshAll} />
            </div>
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
      </PanelGroup>
    </Layout>
  );
};

export default SidebarLayout; 
