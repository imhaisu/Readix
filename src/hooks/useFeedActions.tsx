import { useDatabase } from '../contexts/DatabaseContext';
import { FeedSource, Group, Topic } from '../db/database';
import { Modal, message } from 'antd';
import { ExclamationCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';

export function useFeedActions() {
  const { db, triggerArticleListRefresh } = useDatabase();

  const handleDeleteFeed = async (feedId: string, navigate: (path: string) => void, selectedKeys: React.Key[]) => {
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
            await db.feeds.delete(feedId);
            await db.articles.where('sourceId').equals(feedId).delete();
          });
          triggerArticleListRefresh();
          if (selectedKeys[0] === `feed-${feedId}`) {
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

  const handleDeleteGroup = async (groupId: string, groupName: string, navigate: (path: string) => void, selectedKeys: React.Key[]) => {
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
          await db.transaction('rw', db.feeds, db.groups, async () => {
            const feedsInGroup = await db.feeds.where('groupId').equals(groupId).toArray();
            for (const feed of feedsInGroup) {
              await db.feeds.update(feed.id!, { groupId: '' });
            }
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

  const handleRenameGroup = async (renamingGroupData: { id: string; currentName: string } | null, newGroupName: string) => {
    if (!db || !renamingGroupData || !newGroupName.trim()) {
      return false;
    }
    const trimmedName = newGroupName.trim();
    if (trimmedName === renamingGroupData.currentName) {
      return true;
    }
    try {
      const existingGroup = await db.groups.where('name').equalsIgnoreCase(trimmedName).first();
      if (existingGroup && existingGroup.id !== renamingGroupData.id) {
        message.error('该分组名称已存在，请使用其他名称。');
        return false;
      }
      const updatedCount = await db.groups.update(renamingGroupData.id, { name: trimmedName });
      if (updatedCount > 0) {
        triggerArticleListRefresh();
        message.success("分组已重命名");
        return true;
      } else {
        message.error("重命名失败，未找到该分组。");
        return false;
      }
    } catch (error) {
      console.error("重命名分组失败:", error);
      message.error("重命名失败，发生未知错误。");
      return false;
    }
  };

  const handleDeleteTopic = (topicId: string, topicName: string, navigate: (path: string) => void, selectedKeys: React.Key[], setRefreshKey: (updater: (prev: number) => number) => void) => {
    if (!db) return;
    Modal.confirm({
      title: `确认删除主题 "${topicName}"?`,
      icon: <ExclamationCircleOutlined />,
      content: '此操作只会删除主题，不会影响订阅源和文章。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await db.transaction('rw', db.topics, db.topicFeeds, async () => {
            await db.topicFeeds.where('topicId').equals(topicId).delete();
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
                triggerArticleListRefresh();
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

  const handleMarkAllAsReadForTopic = async (tId: string, tName: string, topicFeedMap: Map<string, string[]>, setRefreshKey: (updater: (prev: number) => number) => void) => {
    if(!db) return;
    
    const feedIds = topicFeedMap.get(tId) || [];
    if (feedIds.length === 0) {
      message.info(`主题 "${tName}" 下没有订阅源。`);
      return;
    }
    
    Modal.confirm({
      title: `将主题 "${tName}" 下所有文章标为已读?`,
      icon: <CheckCircleOutlined />,
      content: '此操作会影响该主题下所有订阅源的未读计数。',
      okText: '全部标为已读',
      cancelText: '取消',
      onOk: async () => {
        try {
          let totalMarked = 0;
          
          for (const feedId of feedIds) {
            const articlesToUpdate = await db.articles.where({ sourceId: feedId, isRead: 'false' }).toArray();
            if (articlesToUpdate.length > 0) {
              const idsToUpdate = articlesToUpdate.map(a => a.id);
              await db.articles.where('id').anyOf(idsToUpdate).modify({ isRead: 'true' });
              
              const actualUnreadCount = await db.articles
                .where({ sourceId: feedId, isRead: 'false' })
                .filter(article => article.isHidden !== true)
                .count();
                
              await db.feeds.update(feedId, { unreadCount: actualUnreadCount });
              totalMarked += articlesToUpdate.length;
            }
          }
          
          triggerArticleListRefresh();
          setRefreshKey(prev => prev + 1);
          
          if (totalMarked > 0) {
            message.success(`主题 "${tName}" 下 ${totalMarked} 篇文章已标为已读。`);
          } else {
            message.info(`主题 "${tName}" 没有未读文章。`);
          }
        } catch (error) {
          console.error('标记主题全部已读失败:', error);
          message.error('操作失败，请重试。');
        }
      },
    });
  };


  return {
    handleDeleteFeed,
    handleDeleteGroup,
    handleRenameGroup,
    handleDeleteTopic,
    handleMarkAllAsReadForFeed,
    handleMarkAllAsReadForGroup,
    handleMarkAllAsReadForTopic,
  };
} 