import React, { useState, useCallback } from 'react';
import { Button, Typography, Card, message, Avatar } from 'antd';
import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import { useDatabase } from '../contexts/DatabaseContext';
import { FeedSource, Group } from '../db/database';
import styles from './WelcomePage.module.css';
import { presetFeeds, PresetFeed } from '../data/presetFeeds';
import AddFeedModal from './AddFeedModal';
import { v4 as uuidv4 } from 'uuid';

const { Title, Paragraph } = Typography;

const WelcomePage: React.FC<{ onAddFirstFeed: (feed: FeedSource) => void }> = ({ onAddFirstFeed }) => {
  const { db } = useDatabase();
  const [addingFeedUrl, setAddingFeedUrl] = useState<string | null>(null);
  const [showAddFeedModal, setShowAddFeedModal] = useState(false);
  const [addedFeedUrls, setAddedFeedUrls] = useState<string[]>([]);
  const [firstAddedFeed, setFirstAddedFeed] = useState<FeedSource | null>(null);
  const [existingGroups, setExistingGroups] = useState<Group[]>([]);

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
      
      // 更新本地状态
      setExistingGroups(prev => [...prev, newGroup]);
      
      return newGroup.id;
    } catch (error) {
      console.error(`创建分组失败: ${groupName}`, error);
      return null;
    }
  }, [db, existingGroups]);

  const handleAddPresetFeed = async (feed: PresetFeed, categoryTitle: string) => {
    if (!db) {
      message.error('数据库未准备好，请稍后再试。');
      return;
    }

    setAddingFeedUrl(feed.url);

    try {
      const existing = await db.feeds.where('url').equals(feed.url).first();
      if (existing) {
        message.warning(`订阅源 "${feed.name}" 已存在。`);
        if (!addedFeedUrls.includes(feed.url)) {
          setAddedFeedUrls(prev => [...prev, feed.url]);
        }
        return;
      }
      
      // 获取或创建对应的分组
      const groupId = await getOrCreateGroup(categoryTitle);
      
      const newFeed: FeedSource = {
        id: crypto.randomUUID(),
        title: feed.name,
        url: feed.url,
        iconUrl: feed.favicon,
        updateFrequency: 3600,
        lastUpdated: new Date(0),
        unreadCount: 0,
        active: true,
        viewMode: 'full', // 确保使用全文模式
        bionicReading: false,
        groupId: groupId || undefined, // 如果创建分组失败，则不设置分组ID
      };
      
      await db.feeds.add(newFeed);
      message.success(`已成功添加订阅源 "${feed.name}"!`);
      
      if (!firstAddedFeed) {
        setFirstAddedFeed(newFeed);
      }
      setAddedFeedUrls(prev => [...prev, feed.url]);

    } catch (error) {
      console.error('添加预设订阅源失败:', error);
      message.error(`添加 "${feed.name}" 失败，请检查网络或稍后再试。`);
    } finally {
      setAddingFeedUrl(null);
    }
  };

  const handleFinish = async () => {
    if (addedFeedUrls.length === 0) {
      message.info('请至少添加一个订阅源来开始使用。');
      return;
    }
    
    try {
      // 显示加载提示
      message.loading('正在刷新订阅源...', 0);
      
      // 刷新所有订阅源
      if (db) {
        const allFeeds = await db.feeds.toArray();
        if (allFeeds.length > 0) {
          try {
            // 使用refreshAllFeeds函数刷新所有订阅源
            // 导入并使用rssParser中的函数
            const { refreshAllFeeds } = await import('../utils/rssParser');
            await refreshAllFeeds(allFeeds);
            
            // 触发全局刷新事件
            document.dispatchEvent(new Event('request-list-refresh'));
          } catch (err) {
            console.error('刷新订阅源时出错:', err);
          }
        }
      }
      
      // 关闭加载提示
      message.destroy();
      
      // 导航到今日视图
      window.location.href = '/';
      
      // 延迟一点时间后显示成功提示
      setTimeout(() => {
        message.success('订阅源已添加，开始您的阅读之旅！');
      }, 500);
    } catch (error) {
      console.error('刷新订阅源失败:', error);
      message.error('刷新订阅源时出错，请稍后再试');
      
      // 即使出错也导航到主页
      window.location.href = '/';
    }
  };

  return (
    <div className={styles.welcomeContainer}>
      <div className={styles.welcomeHeader}>
        <Title level={2}>欢迎使用 Readix</Title>
        <Paragraph type="secondary">
          选择您感兴趣的订阅源，或手动添加一个，开始您的阅读之旅。
        </Paragraph>
        <div className={styles.headerActions}>
            <Button 
                type="default" 
                size="large" 
                icon={<PlusOutlined />}
                onClick={() => setShowAddFeedModal(true)}
            >
                手动添加
            </Button>
            <Button 
                type="primary" 
                size="large" 
                icon={<CheckOutlined />}
                disabled={addedFeedUrls.length === 0}
                onClick={handleFinish}
            >
                完成并开始阅读
            </Button>
        </div>
      </div>
      
      <div className={styles.presetContainer}>
        {presetFeeds.map(category => (
          <div key={category.title} className={styles.categorySection}>
            <Title level={4} className={styles.categoryTitle}>{category.title}</Title>
            <div className={styles.feedGrid}>
              {category.feeds.map(feed => (
                <Card key={feed.url} className={styles.feedCard} hoverable>
                  <Card.Meta
                    avatar={<Avatar src={feed.favicon} />}
                    title={feed.name}
                  />
                  {addedFeedUrls.includes(feed.url) ? (
                    <Button
                      type="dashed"
                      shape="round"
                      icon={<CheckOutlined />}
                      className={styles.addButon}
                      disabled
                    >
                      已添加
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      shape="round"
                      icon={<PlusOutlined />}
                      className={styles.addButon}
                      loading={addingFeedUrl === feed.url}
                      onClick={() => handleAddPresetFeed(feed, category.title)}
                    >
                      添加
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <AddFeedModal
        open={showAddFeedModal}
        onCancel={() => setShowAddFeedModal(false)}
        onOk={(newFeed) => {
          if (!firstAddedFeed) setFirstAddedFeed(newFeed);
          setAddedFeedUrls(prev => [...prev, newFeed.url]);
          setShowAddFeedModal(false);
          message.success(`已成功添加订阅源 "${newFeed.title}"!`);
        }}
        groups={existingGroups}
      />
    </div>
  );
};

export default WelcomePage; 