import React, { useState, useEffect, Key as ReactKey, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Empty, Skeleton, Avatar, message, Modal, Dropdown, Menu, Input } from 'antd';
import type { MenuProps } from 'antd';
import { 
  LinkOutlined,
  RightOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useDatabase } from '../contexts/DatabaseContext';
import { useFilter } from '../contexts/FilterContext';
import { FeedSource, Group } from '../contexts/DatabaseContext';
import { processFeedIcons } from '../utils/iconUtils';
import styles from './FeedList.module.css';
import EditFeedModal from './EditFeedModal';

interface FeedListProps {
  collapsed: boolean;
  feeds: FeedSource[];
  groups: Group[];
  onRefreshFeeds?: () => void;
}

const FeedList: React.FC<FeedListProps> = ({ collapsed, feeds: feedsFromProps, groups: groupsFromProps, onRefreshFeeds }) => {
  const navigate = useNavigate();
  const { feedId, groupId: currentRouteGroupId } = useParams<{ feedId?: string; groupId?: string }>();
  const { db, triggerRefresh: triggerDbRefresh } = useDatabase();
  const { filter } = useFilter();
  const [loading, setLoading] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<ReactKey[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<ReactKey[]>([]);
  const [refreshingFeedId, setRefreshingFeedId] = useState<string | null>(null);
  const [processedFeeds, setProcessedFeeds] = useState<FeedSource[]>([]);
  const [dynamicCounts, setDynamicCounts] = useState<Map<string, number>>(new Map());

  // Modals State
  const [isRenameGroupModalVisible, setIsRenameGroupModalVisible] = useState(false);
  const [renamingGroupData, setRenamingGroupData] = useState<{ id: string; currentName: string } | null>(null);
  const [newGroupName, setNewGroupName] = useState('');

  const [isEditFeedModalVisible, setIsEditFeedModalVisible] = useState(false);
  const [editingFeedData, setEditingFeedData] = useState<FeedSource | null>(null);

  useEffect(() => {
    const calculateCounts = async () => {
      if (!db || feedsFromProps.length === 0) {
        setDynamicCounts(new Map());
        return;
      }

      const counts = new Map<string, number>();
      for (const feed of feedsFromProps) {
        if (!feed.id) continue;
        let query;
        if (filter === 'all') {
          query = db.articles.where('sourceId').equals(feed.id);
        } else if (filter === 'unread') {
          query = db.articles.where({ sourceId: feed.id, isRead: 'false' });
        } else if (filter === 'starred') {
          query = db.articles.where({ sourceId: feed.id, isStarred: 'true' });
        } else {
          // Default to unread
          query = db.articles.where({ sourceId: feed.id, isRead: 'false' });
        }
        const count = await query.count();
        counts.set(feed.id, count);
      }
      setDynamicCounts(counts);
    };

    calculateCounts();
  }, [db, filter, feedsFromProps]);

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

  useEffect(() => {
    const processIcons = async () => {
      if (feedsFromProps.length > 0) {
        try {
          const processed = await processFeedIcons(feedsFromProps);
          setProcessedFeeds(processed);
        } catch (error) {
          console.error('Error processing feed icons:', error);
          setProcessedFeeds(feedsFromProps);
        }
      } else {
        setProcessedFeeds([]);
      }
    };

    processIcons();
  }, [feedsFromProps]);

  useEffect(() => {
    if (feedId) {
      setSelectedKeys([`feed-${feedId}`]);
    } else if (currentRouteGroupId) {
      setSelectedKeys([`group-${currentRouteGroupId}`]);
    } else {
      setSelectedKeys([]);
    }
  }, [feedId, currentRouteGroupId]);

  const handleGroupExpanderClick = useCallback(async (e: React.MouseEvent, groupKey: ReactKey) => {
    e.stopPropagation();
    if (!db) return;
    const groupId = (groupKey as string).replace('group-', '');
    const isCurrentlyExpanded = expandedKeys.includes(groupKey);
    setExpandedKeys(prevKeys => 
      isCurrentlyExpanded ? prevKeys.filter(k => k !== groupKey) : [...prevKeys, groupKey]
    );
    try {
      await db.groups.update(groupId, { collapsed: isCurrentlyExpanded });
    } catch (err) {
      console.error("Error updating group collapsed state", err);
      message.error('Failed to save view state.');
      setExpandedKeys(prevKeys => 
        isCurrentlyExpanded ? [...prevKeys, groupKey] : prevKeys.filter(k => k !== groupKey)
      );
    }
  }, [db, expandedKeys]);

  const handleSelect = (key: string) => {
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
    }
  };

  const handleRefreshFeed = async (feedIdToRefresh: string) => {
    if (!onRefreshFeeds) return;
    setRefreshingFeedId(feedIdToRefresh);
    try {
      // Assuming onRefreshFeeds can trigger a refresh for a specific feed or all feeds.
      // The actual implementation is in the parent component.
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
      icon: <ExclamationCircleOutlined />,
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
          triggerDbRefresh();
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
        triggerDbRefresh();
        message.success("分组已重命名");
      } else {
        // 这种情况很少见，但可能发生（例如，在另一处删除了该分组）
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
  
  const handleDeleteGroupWithConfirmation = (groupId: string, groupName: string) => {
    if (!db) return;
    Modal.confirm({
      title: `确认删除分组 "${groupName}"?`,
      icon: <ExclamationCircleOutlined />,
      content: '删除分组后，其中的所有订阅源将被移动到根目录（无分组状态）。此操作无法撤销。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const feedsInGroup = await db.feeds.where('groupId').equals(groupId).toArray();
          const rootFeedsCount = await db.feeds.filter(f => !f.groupId).count();
          await db.transaction('rw', db.feeds, db.groups, async () => {
            const feedUpdates = feedsInGroup.map((feed, index) => 
              db.feeds.update(feed.id!, { groupId: undefined, order: rootFeedsCount + index })
            );
            await Promise.all(feedUpdates);
            await db.groups.delete(groupId);
          });
          triggerDbRefresh();
          if (selectedKeys[0] === `group-${groupId}`) {
            navigate('/');
          }
          message.success(`分组 "${groupName}" 已删除。`);
        } catch (error) {
          console.error(`Error deleting group ${groupId}:`, error);
          Modal.error({ title: '删除分组失败', content: `删除分组时发生错误。`});
        }
      },
    });
  };

  const handleMarkAllAsReadForFeed = async (feedId: string, feedTitle: string) => {
    if (!db) return;
    Modal.confirm({
      title: `将 "${feedTitle}" 下所有文章标为已读?`,
      icon: <CheckCircleOutlined />,
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
            triggerDbRefresh();
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
  
  const handleMarkAllAsReadForGroup = async (gId: string, gName: string) => {
    if(!db) return;
    Modal.confirm({
        title: `将分组 "${gName}" 下所有文章标为已读?`,
        icon: <CheckCircleOutlined />,
        content: '此操作会影响该分组下所有订阅源的未读计数。',
        okText: '全部标为已读',
        cancelText: '取消',
        onOk: async () => {
            try {
                const feedsInGroup = await db.feeds.where('groupId').equals(gId).toArray();
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
                triggerDbRefresh();
                if (totalMarked > 0) {
                    message.success(`分组 "${gName}" 下 ${totalMarked} 篇文章已标为已读。`);
                } else {
                    message.info(`分组 "${gName}" 没有未读文章。`);
                }
            } catch (error) {
                console.error('标记分组全部已读失败:', error);
                message.error('操作失败，请重试。');
            }
        },
    });
  };
  
  const showEditFeedModal = (feed: FeedSource) => {
    setEditingFeedData(feed);
    setIsEditFeedModalVisible(true);
  };
  
  const handleEditFeedSuccess = (updatedFeed: FeedSource) => {
    triggerDbRefresh();
    setIsEditFeedModalVisible(false);
    setEditingFeedData(null);
  };

  const handleEditFeedCancel = () => {
    setIsEditFeedModalVisible(false);
    setEditingFeedData(null);
  };

  const createFeedMenuItems = (feed: FeedSource): MenuProps['items'] => [
    { key: 'sync', label: '立即刷新', icon: <SyncOutlined spin={refreshingFeedId === feed.id} />, onClick: () => feed.id && handleRefreshFeed(feed.id) },
    { key: 'mark-all-read', label: '标记已读', icon: <CheckCircleOutlined />, onClick: () => feed.id && handleMarkAllAsReadForFeed(feed.id, feed.title) },
    { type: 'divider' },
    { key: 'edit', label: '编辑', icon: <SettingOutlined />, onClick: () => showEditFeedModal(feed) },
    { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => feed.id && handleDeleteFeed(feed.id) },
  ];

  const createGroupMenuItems = (group: Group, hasUnreads: boolean): MenuProps['items'] => {
    const items: MenuProps['items'] = [
      { key: 'mark-all-read', label: '标记已读', icon: <CheckCircleOutlined />, disabled: !hasUnreads, onClick: () => group.id && handleMarkAllAsReadForGroup(group.id, group.name) },
      { key: 'rename', label: '重命名', icon: <EditOutlined />, onClick: () => showRenameGroupModal(group) },
      { type: 'divider' },
      { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => group.id && handleDeleteGroupWithConfirmation(group.id, group.name) },
    ];
    return items;
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (processedFeeds.length === 0 && groupsFromProps.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <Empty 
          description={collapsed ? "" : "No feeds or groups"} 
          image={Empty.PRESENTED_IMAGE_SIMPLE} 
        />
      </div>
    );
  }
  
  const sortedGroups = [...groupsFromProps].sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  const feedsWithoutGroup = processedFeeds.filter(f => !f.groupId).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));

  const renderFeeds = (feedList: FeedSource[], isGrouped: boolean) => {
    return feedList.map(feed => {
      if (typeof feed.id === 'undefined') return null;
      const feedKey = `feed-${feed.id}`;
      const count = dynamicCounts.get(feed.id) ?? 0;
      return (
        <Dropdown key={feedKey} menu={{ items: createFeedMenuItems(feed) }} trigger={['contextMenu']}>
          <div
            className={`${styles.feedItem} ${selectedKeys.includes(feedKey) ? styles.selected : ''}`}
            onClick={() => handleSelect(feedKey)}
            onContextMenu={(e) => e.stopPropagation()}
          >
            <Avatar src={feed.iconUrl} size={16} icon={<LinkOutlined />} className={styles.feedIcon} />
            <span className={styles.title}>{feed.title}</span>
            {count > 0 && <span className={styles.count}>{count}</span>}
          </div>
        </Dropdown>
      );
    });
  };

  return (
    <div className={styles.feedListContainer}>
      {sortedGroups.map((group, index) => {
        const groupKey = `group-${group.id}`;
        const isExpanded = expandedKeys.includes(groupKey);
        const feedsInGroup = processedFeeds
          .filter(f => f.groupId === group.id)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const groupTotalCount = feedsInGroup.reduce((total, feed) => {
          return total + (dynamicCounts.get(feed.id!) ?? 0);
        }, 0);
        const hasUnreads = groupTotalCount > 0;

        return (
          <Dropdown key={groupKey} menu={{ items: createGroupMenuItems(group, hasUnreads) }} trigger={['contextMenu']}>
            <div>
              <div
                className={`${styles.groupItem} ${selectedKeys.includes(groupKey) ? styles.selected : ''}`}
                onClick={() => handleSelect(groupKey)}
              >
                <div
                  className={`${styles.expanderIcon} ${isExpanded ? styles.expanded : ''}`}
                  onClick={(e) => handleGroupExpanderClick(e, groupKey)}
                >
                  <RightOutlined />
                </div>
                <span className={styles.title}>{group.name}</span>
                {hasUnreads && <span className={styles.count}>{groupTotalCount}</span>}
              </div>

              {isExpanded && (
                <div className={styles.feedListWrapper}>
                  {renderFeeds(feedsInGroup, true)}
                </div>
              )}
            </div>
          </Dropdown>
        );
      })}

      {feedsWithoutGroup.length > 0 && sortedGroups.length > 0 && <div className={styles.separator} />}

      {renderFeeds(feedsWithoutGroup, false)}

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
          groups={groupsFromProps}
          onSuccess={handleEditFeedSuccess}
          onCancel={handleEditFeedCancel}
        />
      )}
    </div>
  );
};

export default FeedList; 