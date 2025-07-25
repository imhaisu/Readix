import React, { useState, useEffect, useCallback, useRef, Key as ReactKey } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Skeleton, Modal, message, Input, Tag } from 'antd';
import { useDatabase } from '../../contexts/DatabaseContext';
import { useFilter } from '../../contexts/FilterContext';
import { FeedSource, Group, Topic } from '../../db/database';
import { useLiveQuery } from 'dexie-react-hooks';
import IconNavBar from './IconNavBar';
import FeedSection from './FeedSection';
import TopicSection from './TopicSection';
import EditFeedModal from '../EditFeedModal';
import AddTopicModal from '../AddTopicModal';

// 导入自定义钩子
import { useFeedCounts } from './hooks/useFeedCounts';
import { useTopicCounts } from './hooks/useTopicCounts';
import { useNavCounts } from './hooks/useNavCounts';
import { useIconProcessor } from './hooks/useIconProcessor';

import styles from './FeedList.module.css';

interface FeedListProps {
  collapsed: boolean;
  feeds: FeedSource[];
  groups: Group[];
  onRefreshFeeds?: () => void;
}

// 删除版本标签样式

const FeedList: React.FC<FeedListProps> = ({ 
  collapsed, 
  feeds: feedsFromProps, 
  groups: groupsFromProps, 
  onRefreshFeeds 
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { feedId, groupId: currentRouteGroupId, topicId: currentRouteTopicId } = useParams<{ 
    feedId?: string; 
    groupId?: string; 
    topicId?: string 
  }>();

  const { db, triggerArticleListRefresh, feedCountRefreshTrigger } = useDatabase();
  const { filter } = useFilter();
  
  // 基本状态
  const [loading, setLoading] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<ReactKey[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<ReactKey[]>([]);
  const [refreshingFeedId, setRefreshingFeedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // 区域展开/收起状态
  const [isSubscriptionsExpanded, setIsSubscriptionsExpanded] = useState<boolean>(true);
  const [isTopicsExpanded, setIsTopicsExpanded] = useState<boolean>(true);
  
  // 用于跟踪当前选中的路由类型
  const [activeNavItem, setActiveNavItem] = useState<string>('');

  // 模态框状态
  const [isRenameGroupModalVisible, setIsRenameGroupModalVisible] = useState(false);
  const [renamingGroupData, setRenamingGroupData] = useState<{ id: string; currentName: string } | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [isEditFeedModalVisible, setIsEditFeedModalVisible] = useState(false);
  const [editingFeedData, setEditingFeedData] = useState<FeedSource | null>(null);
  const [isAddTopicModalVisible, setIsAddTopicModalVisible] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [initialActiveTab, setInitialActiveTab] = useState('1');

  // 使用自定义钩子获取实时数据
  const liveFeeds = useLiveQuery(() => {
    if (db) {
      return db.feeds.toArray();
    }
    return [];
  }, [db, feedCountRefreshTrigger, refreshKey]) || [];
  
  const liveGroups = useLiveQuery(() => {
    if (db) return db.groups.toArray();
    return [];
  }, [db, feedCountRefreshTrigger, refreshKey]) || [];
  
  const liveTopics = useLiveQuery(() => {
    if (db) return db.topics.toArray();
    return [];
  }, [db, feedCountRefreshTrigger, refreshKey]) || [];

  // 使用实时数据或者传入的数据
  const feeds = liveFeeds.length > 0 ? liveFeeds : feedsFromProps;
  const groups = liveGroups.length > 0 ? liveGroups : groupsFromProps;
  
  // 处理订阅源图标
  const processedFeeds = useIconProcessor(feeds);
  
  // 获取订阅源计数
  const dynamicCounts = useFeedCounts(feeds, filter);
  
  // 获取主题计数和关联
  const { counts: topicCounts, topicFeeds } = useTopicCounts(liveTopics, filter);
  
  // 获取导航栏计数
  const { todayCount, allCount, notesCount, readLaterCount } = useNavCounts();

  // 添加对强制刷新事件的监听
  useEffect(() => {
    const handleForceRefresh = () => {
      // 强制重新获取数据
      setRefreshKey(prev => prev + 1);
    };
    
    document.addEventListener('FORCE_FEEDLIST_REFRESH_EVENT', handleForceRefresh);
    
    return () => {
      document.removeEventListener('FORCE_FEEDLIST_REFRESH_EVENT', handleForceRefresh);
    };
  }, [db]);

  // 初始化展开的分组
  useEffect(() => {
    if (groupsFromProps) {
      const defaultExpanded = groupsFromProps
        .filter(g => !g.collapsed)
        .map(g => `group-${g.id}` as ReactKey);
      setExpandedKeys(defaultExpanded);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [groupsFromProps]);

  // 根据路由参数设置选中状态
  useEffect(() => {
    if (feedId) {
      setSelectedKeys([`feed-${feedId}`]);
    } else if (currentRouteGroupId) {
      setSelectedKeys([`group-${currentRouteGroupId}`]);
    } else if (currentRouteTopicId) {
      setSelectedKeys([`topic-${currentRouteTopicId}`]);
    } else {
      setSelectedKeys([]);
    }
  }, [feedId, currentRouteGroupId, currentRouteTopicId]);

  // 处理路由变化，更新选中状态
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/today')) {
      setActiveNavItem('today');
    } else if (path.includes('/all')) {
      setActiveNavItem('all');
    } else if (path.includes('/notes')) {
      setActiveNavItem('notes');
    } else if (path.includes('/readlater')) {
      setActiveNavItem('readlater');
    } else {
      setActiveNavItem('');
    }
  }, [location.pathname]);

  // 处理分组展开/折叠
  const handleGroupExpanderClick = useCallback((e: React.MouseEvent, key: ReactKey) => {
    e.stopPropagation();
    setExpandedKeys(prevKeys => {
      if (prevKeys.includes(key)) {
        return prevKeys.filter(k => k !== key);
      } else {
        return [...prevKeys, key];
      }
    });
  }, []);
  
  // 处理订阅区域和主题区域的展开/折叠
  const handleSubscriptionsExpanderClick = useCallback(() => {
    setIsSubscriptionsExpanded(prev => !prev);
  }, []);

  const handleTopicsExpanderClick = useCallback(() => {
    setIsTopicsExpanded(prev => !prev);
  }, []);

  // 处理项目选中
  const handleSelect = useCallback((key: string) => {
    if (key.startsWith('feed-')) {
      const newFeedId = key.replace('feed-', '');
      if (newFeedId === feedId) {
        document.dispatchEvent(new CustomEvent('request-list-refresh'));
      } else {
        navigate(`/feed/${newFeedId}`);
      }
    } else if (key.startsWith('group-')) {
      const newGroupId = key.replace('group-', '');
      if (newGroupId === currentRouteGroupId) {
        document.dispatchEvent(new CustomEvent('request-list-refresh'));
      } else {
        navigate(`/group/${newGroupId}`);
      }
    } else if (key.startsWith('topic-')) {
      const newTopicId = key.replace('topic-', '');
      if (newTopicId === currentRouteTopicId) {
        document.dispatchEvent(new CustomEvent('request-list-refresh'));
      } else {
        navigate(`/topic/${newTopicId}`);
      }
    }
  }, [navigate, feedId, currentRouteGroupId, currentRouteTopicId]);

  // 处理导航栏项目点击
  const handleNavItemClick = useCallback((key: string) => {
    setActiveNavItem(key);
    switch (key) {
      case 'today':
        navigate('/today');
        break;
      case 'all':
        navigate('/all');
        break;
      case 'notes':
        navigate('/notes');
        break;
      case 'readlater':
        navigate('/readlater');
        break;
    }
  }, [navigate]);

  // 处理订阅源相关操作
  const handleRefreshFeed = async (feedIdToRefresh: string) => {
    if (!onRefreshFeeds) return;
    setRefreshingFeedId(feedIdToRefresh);
    try {
      await onRefreshFeeds();
    } catch (error) {
      console.error(`刷新订阅源失败: ${feedIdToRefresh}`, error);
    } finally {
      setRefreshingFeedId(null);
    }
  };

  const handleDeleteFeed = async (feedIdToDelete: string) => {
    if (!db) return;
    Modal.confirm({
      title: '确认删除订阅源?',
      content: '删除此订阅源将同时删除其下所有文章。此操作无法撤销。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await db.transaction('rw', db.feeds, db.articles, async () => {
            await db.feeds.delete(feedIdToDelete);
            await db.articles.where('sourceId').equals(feedIdToDelete).delete();
          });
          triggerArticleListRefresh();
          if (selectedKeys[0] === `feed-${feedIdToDelete}`) {
            navigate('/');
          }
          message.success(`订阅源已删除。`);
        } catch (error) {
          console.error('删除订阅源失败:', error);
          Modal.error({ title: '删除失败', content: '删除订阅源时发生错误。' });
        }
      },
    });
  };

  const handleMarkAllAsReadForFeed = async (feedId: string, feedTitle: string) => {
    if (!db) return;
    Modal.confirm({
      title: `将 "${feedTitle}" 下所有文章标为已读?`,
      content: '此操作会影响未读计数，但不会删除文章。',
      okText: '全部标为已读',
      cancelText: '取消',
      onOk: async () => {
        try {
          const articlesToUpdate = await db.articles.where({ sourceId: feedId, isRead: 'false' }).toArray();
          if (articlesToUpdate.length > 0) {
            const idsToUpdate = articlesToUpdate.map(a => a.id);
            await db.articles.where('id').anyOf(idsToUpdate).modify({ isRead: 'true' });
            await db.feeds.update(feedId, { unreadCount: 0 });
            triggerArticleListRefresh();
            message.success(`"${feedTitle}" 下 ${articlesToUpdate.length} 篇文章已标为已读。`);
          } else {
            message.info(`"${feedTitle}" 没有未读文章。`);
          }
        } catch (error) {
          console.error('标记全部已读失败:', error);
          message.error('操作失败，请重试。');
        }
      },
    });
  };

  // 处理分组相关操作
  const showRenameGroupModal = (group: Group) => {
    if (typeof group.id === 'undefined') return;
    setRenamingGroupData({ id: group.id, currentName: group.name });
    setNewGroupName(group.name);
    setIsRenameGroupModalVisible(true);
  };

  const handleRenameGroupOk = async () => {
    if (!db || !renamingGroupData || !newGroupName.trim()) {
      return;
    }

    const trimmedName = newGroupName.trim();
    if (trimmedName === renamingGroupData.currentName) {
      setIsRenameGroupModalVisible(false);
      return;
    }

    try {
      // 检查新分组名是否已存在
      const existingGroup = await db.groups.where('name').equalsIgnoreCase(trimmedName).first();
      if (existingGroup && existingGroup.id !== renamingGroupData.id) {
        message.error('该分组名称已存在，请使用其他名称。');
        return;
      }

      // 执行更新
      const updatedCount = await db.groups.update(renamingGroupData.id, { name: trimmedName });
      
      // 根据影响的行数判断是否成功
      if (updatedCount > 0) {
        triggerArticleListRefresh();
        message.success("分组已重命名");
      } else {
        message.error("重命名失败，未找到该分组。");
      }
    } catch (error) {
      console.error("重命名分组失败:", error);
      message.error("重命名失败，发生未知错误。");
    } finally {
      setIsRenameGroupModalVisible(false);
      setRenamingGroupData(null);
      setNewGroupName('');
    }
  };

  const handleMarkAllAsReadForGroup = async (groupId: string, groupName: string) => {
    if (!db) return;
    Modal.confirm({
      title: `将分组 "${groupName}" 下所有文章标为已读?`,
      content: '此操作会影响该分组下所有订阅源的未读计数。',
      okText: '全部标为已读',
      cancelText: '取消',
      onOk: async () => {
        try {
          const feedsInGroup = await db.feeds.where('groupId').equals(groupId).toArray();
          let totalMarked = 0;
          for (const feed of feedsInGroup) {
            if (typeof feed.id === 'string') {
              const articlesToUpdate = await db.articles.where({ sourceId: feed.id, isRead: 'false' }).toArray();
              if (articlesToUpdate.length > 0) {
                const idsToUpdate = articlesToUpdate.map(a => a.id);
                await db.articles.where('id').anyOf(idsToUpdate).modify({ isRead: 'true' });
                await db.feeds.update(feed.id, { unreadCount: 0 });
                totalMarked += articlesToUpdate.length;
              }
            }
          }
          triggerArticleListRefresh();
          if (totalMarked > 0) {
            message.success(`分组 "${groupName}" 下 ${totalMarked} 篇文章已标为已读。`);
          } else {
            message.info(`分组 "${groupName}" 没有未读文章。`);
          }
        } catch (error) {
          console.error('标记分组全部已读失败:', error);
          message.error('操作失败，请重试。');
        }
      },
    });
  };
  
  const handleDeleteGroupWithConfirmation = (groupId: string, groupName: string) => {
    if (!db) return;
    Modal.confirm({
      title: `确认删除分组 "${groupName}"?`,
      content: '删除分组后，其中的所有订阅源将被移动到根目录（无分组状态）。此操作无法撤销。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await db.transaction('rw', db.feeds, db.groups, async () => {
            const feedsInGroup = await db.feeds.where('groupId').equals(groupId).toArray();
            
            // 将这些订阅源移动到默认分组（无分组）
            for (const feed of feedsInGroup) {
              await db.feeds.update(feed.id!, { groupId: '' });
            }

            // 删除分组
            await db.groups.delete(groupId);
          });
          triggerArticleListRefresh();
          if (selectedKeys[0] === `group-${groupId}`) {
            navigate('/');
          }
          message.success(`分组 "${groupName}" 已删除，其下的订阅源已移至默认分组。`);
        } catch (error) {
          console.error(`Error deleting group ${groupId}:`, error);
          Modal.error({ title: '删除分组失败', content: `删除分组时发生错误。`});
        }
      },
    });
  };

  // 处理订阅源编辑
  const showEditFeedModal = (feed: FeedSource) => {
    setEditingFeedData(feed);
    setIsEditFeedModalVisible(true);
  };
  
  const handleEditFeedSuccess = () => {
    triggerArticleListRefresh();
    setIsEditFeedModalVisible(false);
    setEditingFeedData(null);
  };

  const handleEditFeedCancel = () => {
    setIsEditFeedModalVisible(false);
    setEditingFeedData(null);
  };

  // 处理主题相关操作
  const handleEditTopic = (topic: Topic, initialTab?: string) => {
    setEditingTopic(topic);
    setInitialActiveTab(initialTab || '1');
    setIsAddTopicModalVisible(true);
  };
  
  const handleTopicSuccess = () => {
    triggerArticleListRefresh();
    setIsAddTopicModalVisible(false);
    setEditingTopic(null);
    setRefreshKey(prev => prev + 1);
  };
  
  const handleDeleteTopic = (topicId: string, topicName: string) => {
    if (!db) return;
    Modal.confirm({
      title: `确认删除主题 "${topicName}"?`,
      content: '此操作只会删除主题，不会影响订阅源和文章。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await db.transaction('rw', db.topics, db.topicFeeds, async () => {
            // 删除主题与订阅源的关联
            await db.topicFeeds.where('topicId').equals(topicId).delete();
            
            // 删除主题
            await db.topics.delete(topicId);
          });
          
          setRefreshKey(prev => prev + 1);
          
          if (selectedKeys[0] === `topic-${topicId}`) {
            navigate('/');
          }
          
          message.success(`主题 "${topicName}" 已删除。`);
        } catch (error) {
          console.error('删除主题失败:', error);
          Modal.error({ title: '删除失败', content: '删除主题时发生错误。' });
        }
      },
    });
  };

  // 准备数据
  const sortedGroups = [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const sortedTopics = [...liveTopics].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  return (
    <div className={styles.feedListContainer}>
      {/* 精致图标导航栏 */}
      <IconNavBar
        todayCount={todayCount}
        allCount={allCount}
        notesCount={notesCount}
        readLaterCount={readLaterCount}
        activeNavItem={activeNavItem}
        onNavItemClick={handleNavItemClick}
      />

      {/* 订阅区域 */}
      <FeedSection
        collapsed={collapsed}
        feeds={processedFeeds}
        groups={sortedGroups}
        expandedKeys={expandedKeys}
        selectedKeys={selectedKeys}
        dynamicCounts={dynamicCounts}
        isExpanded={isSubscriptionsExpanded}
        onExpanderClick={handleSubscriptionsExpanderClick}
        onGroupExpanderClick={handleGroupExpanderClick}
        onSelect={handleSelect}
        onRefreshFeed={handleRefreshFeed}
        onDeleteFeed={handleDeleteFeed}
        onMarkAllAsReadForFeed={handleMarkAllAsReadForFeed}
        onMarkAllAsReadForGroup={handleMarkAllAsReadForGroup}
        refreshingFeedId={refreshingFeedId}
        onEditFeed={showEditFeedModal}
        onRenameGroup={showRenameGroupModal}
        onDeleteGroup={handleDeleteGroupWithConfirmation}
      />

      {/* 主题区域 */}
      <TopicSection
        topics={sortedTopics}
        selectedKeys={selectedKeys}
        topicCounts={topicCounts}
        isExpanded={isTopicsExpanded}
        onExpanderClick={handleTopicsExpanderClick}
        onSelect={handleSelect}
        onEditTopic={handleEditTopic}
        onEditTopicRules={(topic) => handleEditTopic(topic, '2')}
        onDeleteTopic={handleDeleteTopic}
      />

      {/* 模态框 */}
      <Modal
        title="重命名分组"
        open={isRenameGroupModalVisible}
        onOk={handleRenameGroupOk}
        onCancel={() => setIsRenameGroupModalVisible(false)}
      >
        <Input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onPressEnter={handleRenameGroupOk}
        />
      </Modal>

      {editingFeedData && (
        <EditFeedModal
          feed={editingFeedData}
          open={isEditFeedModalVisible}
          groups={groups}
          onSuccess={handleEditFeedSuccess}
          onCancel={handleEditFeedCancel}
        />
      )}
      
      <AddTopicModal
        visible={isAddTopicModalVisible}
        onClose={() => setIsAddTopicModalVisible(false)}
        onSuccess={handleTopicSuccess}
        editingTopic={editingTopic}
        initialActiveTab={initialActiveTab}
      />
    </div>
  );
};

export default FeedList; 