import React, { useState, useCallback, useMemo } from 'react';
import { Modal, List, Button, Avatar, Typography, message } from 'antd';
import { v4 as uuidv4 } from 'uuid';
import { useDatabase } from '../contexts/DatabaseContext';
import { presetFeeds, PresetFeed } from '../data/presetFeeds';
import { FeedSource, Group } from '../db/database';

interface DiscoverFeedsModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingFeeds: FeedSource[];
  existingGroups: Group[];
}

// 子组件：用于展示单个订阅源，并处理图标加载失败的回退逻辑
interface DiscoverFeedItemProps {
  feed: PresetFeed;
  isSubscribed: boolean;
  onAdd: (feed: PresetFeed, categoryTitle: string) => void;
  onRemove: (feedUrl: string) => void;
  categoryTitle: string;
}

const DiscoverFeedItem: React.FC<DiscoverFeedItemProps> = ({ feed, isSubscribed, onAdd, onRemove, categoryTitle }) => {
  const [hasIconError, setHasIconError] = useState(false);

  // antd Avatar 组件的 onError 回调，加载失败时触发
  const handleIconError = () => {
    setHasIconError(true);
    return false;
  };

  return (
    <List.Item
      actions={[
        isSubscribed ? (
          <Button key="remove" onClick={() => onRemove(feed.url)}>
            移除
          </Button>
        ) : (
          <Button key="add" type="primary" onClick={() => onAdd(feed, categoryTitle)}>
            添加
          </Button>
        ),
      ]}
    >
      <List.Item.Meta
        avatar={
          hasIconError ? (
            // 加载失败时，显示订阅源名称的第一个字母
            <Avatar>{feed.name[0]?.toUpperCase()}</Avatar>
          ) : (
            <Avatar src={feed.favicon} onError={handleIconError} />
          )
        }
        title={feed.name}
      />
    </List.Item>
  );
};

const DiscoverFeedsModal: React.FC<DiscoverFeedsModalProps> = ({ isOpen, onClose, existingFeeds, existingGroups }) => {
  const { db, triggerFeedCountRefresh, triggerArticleListRefresh } = useDatabase();

  const subscribedUrls = useMemo(() => {
    return new Set((existingFeeds || []).map(feed => feed.url));
  }, [existingFeeds]);

  // 获取或创建分组
  const getOrCreateGroup = useCallback(async (groupName: string) => {
    if (!db) return null;
    
    // 检查分组是否已存在
    const existingGroup = existingGroups.find(g => g.name === groupName);
    if (existingGroup) {
      return existingGroup.id;
    }
    
    // 如果不存在，创建新分组
    try {
      // 获取最大顺序值
      const maxOrder = existingGroups.length > 0 
        ? Math.max(...existingGroups.map(g => g.order))
        : 0;
        
      // 创建新分组
      const newGroup: Group = {
        id: uuidv4(),
        name: groupName,
        order: maxOrder + 1,
        collapsed: false
      };
      
      // 添加到数据库
      await db.groups.add(newGroup);
      message.success(`已创建分组: ${groupName}`);
      
      return newGroup.id;
    } catch (error) {
      console.error(`创建分组失败: ${groupName}`, error);
      return null;
    }
  }, [db, existingGroups]);

  const handleAddFeed = useCallback(async (feed: PresetFeed, categoryTitle: string) => {
    if (!db) return;

    try {
      // 先获取或创建对应的分组
      const groupId = await getOrCreateGroup(categoryTitle);
      
      const newFeed: FeedSource = {
        id: uuidv4(),
        url: feed.url,
        title: feed.name,
        iconUrl: feed.favicon,
        lastUpdated: new Date(0),
        unreadCount: 0,
        active: true,
        viewMode: 'full', // 确保使用全文模式
        updateFrequency: 60,
        bionicReading: false,
        groupId: groupId || undefined, // 如果创建分组失败，则不设置分组ID
      };

      await db.feeds.add(newFeed);
      triggerFeedCountRefresh();
      triggerArticleListRefresh();
      message.success(`已添加订阅源: ${feed.name}`);
    } catch (error) {
      console.error(`添加订阅源失败: ${feed.name}`, error);
      message.error(`添加订阅源失败: ${feed.name}`);
    }
  }, [db, triggerFeedCountRefresh, triggerArticleListRefresh, getOrCreateGroup]);

  const handleRemoveFeed = useCallback(async (feedUrl: string) => {
    if (!db) return;

    const feedToRemove = (existingFeeds || []).find(f => f.url === feedUrl);
    if (feedToRemove && feedToRemove.id) {
      try {
        await db.feeds.delete(feedToRemove.id);
        triggerFeedCountRefresh();
        triggerArticleListRefresh();
        message.success(`已移除订阅源`);
      } catch (error) {
        console.error(`移除订阅源失败: ${feedUrl}`, error);
        message.error(`移除订阅源失败`);
      }
    }
  }, [db, triggerFeedCountRefresh, triggerArticleListRefresh, existingFeeds]);

  return (
    <Modal
      title="发现订阅源"
      open={isOpen}
      onCancel={onClose}
      footer={null}
      width={700}
      destroyOnHidden
      styles={{ body: { maxHeight: '60vh', overflowY: 'auto' } }}
    >
      {presetFeeds.map(category => (
        <div key={category.title} style={{ marginBottom: 24 }}>
          <Typography.Title level={4}>{category.title}</Typography.Title>
          <List
            itemLayout="horizontal"
            dataSource={category.feeds}
            renderItem={feed => {
              const isSubscribed = subscribedUrls.has(feed.url);
              return (
                <DiscoverFeedItem
                  key={feed.url}
                  feed={feed}
                  isSubscribed={isSubscribed}
                  onAdd={handleAddFeed}
                  onRemove={handleRemoveFeed}
                  categoryTitle={category.title}
                />
              );
            }}
          />
        </div>
      ))}
    </Modal>
  );
};

export default React.memo(DiscoverFeedsModal); 