import React, { useState, useCallback, useMemo } from 'react';
import { List, Button, Avatar, Typography, message } from 'antd';
import { v4 as uuidv4 } from 'uuid';
import { useDatabase } from '../contexts/DatabaseContext';
import { presetFeeds, PresetFeed } from '../data/presetFeeds';
import { FeedSource, Group } from '../db/database';
import styles from './DiscoverFeedsPage.module.css';
import { useLiveQuery } from "dexie-react-hooks";

interface DiscoverFeedsPageProps {
  existingFeeds: FeedSource[];
  existingGroups: Group[];
  onFeedRemoved?: (feedUrl: string) => void;
  onFeedAdded?: (feed: FeedSource) => void;
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
      className={styles.feedItem}
      actions={[
        isSubscribed ? (
          <Button key="remove" size="small" onClick={() => onRemove(feed.url)}>
            移除
          </Button>
        ) : (
          <Button key="add" type="primary" size="small" onClick={() => onAdd(feed, categoryTitle)}>
            添加
          </Button>
        ),
      ]}
    >
      <List.Item.Meta
        avatar={
          hasIconError ? (
            // 加载失败时，显示订阅源名称的第一个字母
            <Avatar size="small">{feed.name[0]?.toUpperCase()}</Avatar>
          ) : (
            <Avatar size="small" src={feed.favicon} onError={handleIconError} />
          )
        }
        title={<span className={styles.feedTitle}>{feed.name}</span>}
      />
    </List.Item>
  );
};

const DiscoverFeedsPage: React.FC<DiscoverFeedsPageProps> = ({ existingFeeds, existingGroups, onFeedRemoved, onFeedAdded }) => {
  const { db, triggerFeedCountRefresh, triggerArticleListRefresh } = useDatabase();
  const [localSubscribedUrls, setLocalSubscribedUrls] = useState<Set<string>>(new Set());

  // 合并 props 传入的订阅源 URL 和本地添加的订阅源 URL
  const subscribedUrls = useMemo(() => {
    const urlSet = new Set((existingFeeds || []).map(feed => feed.url));
    localSubscribedUrls.forEach(url => urlSet.add(url));
    return urlSet;
  }, [existingFeeds, localSubscribedUrls]);

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
      
      // 立即更新本地状态，使按钮状态变化
      setLocalSubscribedUrls(prev => new Set(prev).add(feed.url));
      
      // 通知父组件订阅源已添加
      if (onFeedAdded) {
        onFeedAdded(newFeed);
      }
      
      // 不再立即触发数据刷新，由父组件决定何时刷新
      // triggerFeedCountRefresh();
      // triggerArticleListRefresh();
      
      message.success(`已添加订阅源: ${feed.name}`);
    } catch (error) {
      console.error(`添加订阅源失败: ${feed.name}`, error);
      message.error(`添加订阅源失败: ${feed.name}`);
    }
  }, [db, getOrCreateGroup, onFeedAdded]);

  const handleRemoveFeed = async (feedUrl: string) => {
    try {
      if (!db) {
        message.error("数据库未初始化");
        return;
      }
      
      const feed = await db.feeds.where({ url: feedUrl }).first();
      if (feed && feed.id) {
        await db.transaction("rw", db.feeds, db.articles, async () => {
          // 删除该订阅源下的所有文章
          await db.articles.where("sourceId").equals(feed.id!).delete();
          // 删除订阅源
          await db.feeds.delete(feed.id!);
        });
        
        // 立即更新本地状态，使按钮状态变化
        setLocalSubscribedUrls(prev => {
          const newSet = new Set(prev);
          newSet.delete(feedUrl);
          return newSet;
        });
        
        message.success(`已移除订阅源`);
        
        // 通知父组件订阅源已被移除
        if (onFeedRemoved) {
          onFeedRemoved(feedUrl);
        }
        
        // 不再立即触发全局刷新，由父组件决定何时刷新
        // triggerFeedCountRefresh();
        // triggerArticleListRefresh();
      }
    } catch (error) {
      console.error("移除订阅源失败:", error);
      message.error("移除订阅源失败");
    }
  };

  return (
    <div className={styles.discoverFeedsPage}>
      {presetFeeds.map(category => (
        <div key={category.title} className={styles.categorySection}>
          <Typography.Title level={5} className={styles.categoryTitle}>{category.title}</Typography.Title>
          <List
            itemLayout="horizontal"
            dataSource={category.feeds}
            className={styles.feedList}
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
    </div>
  );
};

export default DiscoverFeedsPage; 