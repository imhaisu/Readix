import React, { useState, useCallback, useMemo } from 'react';
import { Modal, List, Button, Avatar, Typography } from 'antd';
import { v4 as uuidv4 } from 'uuid';
import { useDatabase } from '../contexts/DatabaseContext';
import { presetFeeds, PresetFeed } from '../data/presetFeeds';
import { FeedSource } from '../db/database';

interface DiscoverFeedsModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingFeeds: FeedSource[];
}

// 子组件：用于展示单个订阅源，并处理图标加载失败的回退逻辑
interface DiscoverFeedItemProps {
  feed: PresetFeed;
  isSubscribed: boolean;
  onAdd: (feed: PresetFeed) => void;
  onRemove: (feedUrl: string) => void;
}

const DiscoverFeedItem: React.FC<DiscoverFeedItemProps> = ({ feed, isSubscribed, onAdd, onRemove }) => {
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
          <Button key="add" type="primary" onClick={() => onAdd(feed)}>
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

const DiscoverFeedsModal: React.FC<DiscoverFeedsModalProps> = ({ isOpen, onClose, existingFeeds }) => {
  const { db, triggerFeedCountRefresh, triggerArticleListRefresh } = useDatabase();

  const subscribedUrls = useMemo(() => {
    return new Set((existingFeeds || []).map(feed => feed.url));
  }, [existingFeeds]);

  const handleAddFeed = useCallback(async (feed: PresetFeed) => {
    if (!db) return;

    const newFeed: FeedSource = {
      id: uuidv4(),
      url: feed.url,
      title: feed.name,
      iconUrl: feed.favicon,
      lastUpdated: new Date(0),
      unreadCount: 0,
      active: true,
      viewMode: 'full',
      updateFrequency: 60,
      bionicReading: false,
    };

    try {
      await db.feeds.add(newFeed);
      triggerFeedCountRefresh();
      triggerArticleListRefresh();
    } catch (error) {
      console.error(`添加订阅源失败: ${feed.name}`, error);
    }
  }, [db, triggerFeedCountRefresh, triggerArticleListRefresh]);

  const handleRemoveFeed = useCallback(async (feedUrl: string) => {
    if (!db) return;

    const feedToRemove = (existingFeeds || []).find(f => f.url === feedUrl);
    if (feedToRemove && feedToRemove.id) {
      try {
        await db.feeds.delete(feedToRemove.id);
        triggerFeedCountRefresh();
        triggerArticleListRefresh();
      } catch (error) {
        console.error(`移除订阅源失败: ${feedUrl}`, error);
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