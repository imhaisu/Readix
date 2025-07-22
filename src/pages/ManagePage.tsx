import React, { useState, useEffect } from 'react';
import { Tabs, Typography, Button } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  GlobalOutlined,
  PlusOutlined,
  FolderAddOutlined,
  TagOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useDatabase, forceFeedListRefresh } from '../contexts/DatabaseContext';
import styles from './ManagePage.module.css';

// 导入非模态组件
import DiscoverFeedsPage from '../components/DiscoverFeedsPage';
import AddFeedPage from '../components/AddFeedPage';
import AddGroupPage from '../components/AddGroupPage';
import AddTopicPage from '../components/AddTopicPage';

const { Title } = Typography;

const ManagePage: React.FC = () => {
  const { db, triggerArticleListRefresh, triggerFeedCountRefresh } = useDatabase();
  const navigate = useNavigate();
  const location = useLocation();
  
  // 状态
  const [feeds, setFeeds] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [dataChanged, setDataChanged] = useState(false);
  
  // 从URL获取初始tab
  const getInitialTab = () => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab');
    return tabParam || '1'; // 默认显示第一个标签页
  };
  
  const [activeTab, setActiveTab] = useState<string>(getInitialTab());

  // 加载数据
  useEffect(() => {
    const loadData = async () => {
      if (!db) return;
      
      try {
        const [feedsData, groupsData] = await Promise.all([
          db.feeds.toArray(),
          db.groups.toArray()
        ]);
        
        setFeeds(feedsData);
        setGroups(groupsData);
      } catch (error) {
        console.error('加载数据失败:', error);
      }
    };
    
    loadData();
  }, [db, triggerArticleListRefresh]);

  // 处理添加订阅源成功
  const handleAddFeedSuccess = (feed: any) => {
    setDataChanged(true);
    // 在页面内更新数据
    setFeeds(prevFeeds => [...prevFeeds, feed]);
    // 不再立即触发全局刷新
    // triggerArticleListRefresh();
    navigate('/');
  };

  // 处理添加分组成功
  const handleAddGroupSuccess = (group: any) => {
    setDataChanged(true);
    // 在页面内更新数据
    setGroups(prevGroups => [...prevGroups, group]);
    // 不再立即触发全局刷新
    // triggerArticleListRefresh();
  };

  // 处理添加主题成功
  const handleTopicSuccess = (topic: any) => {
    setDataChanged(true);
    // 不再立即触发全局刷新
    // triggerArticleListRefresh();
  };

  // 处理移除订阅源
  const handleFeedRemoved = (feedUrl: string) => {
    setDataChanged(true);
    // 在页面内更新数据
    setFeeds(prevFeeds => prevFeeds.filter(feed => feed.url !== feedUrl));
    // 不再立即触发全局刷新
    // triggerArticleListRefresh();
  };

  // 返回上一页
  const handleGoBack = () => {
    // 无论数据是否有变化，都强制触发一次全局刷新
    console.log('===== 管理页面: 返回按钮被点击 =====');
    console.log('触发全局刷新，dataChanged:', dataChanged);
    
    // 强制触发刷新
    triggerFeedCountRefresh();
    triggerArticleListRefresh();
    
    // 发送自定义事件，通知其他组件需要刷新
    forceFeedListRefresh();
    
    // 直接刷新数据库
    if (db) {
      console.log('===== 直接刷新数据库 =====');
      db.feeds.toArray().then(feeds => {
        console.log('===== 数据库中的订阅源数量:', feeds.length);
      });
    }
    
    // 给刷新一点时间后再导航
    setTimeout(() => {
      console.log('===== 延迟导航执行 =====');
      navigate(-1);
    }, 300);  // 增加延迟时间
  };

  // 定义标签页配置
  const tabItems = [
    {
      key: '1',
      label: <span className={styles.tabLabel}><GlobalOutlined className={styles.tabIcon} />发现订阅源</span>,
      children: (
        <div className={styles.tabContent}>
          {activeTab === '1' && (
            <DiscoverFeedsPage 
              existingFeeds={feeds}
              existingGroups={groups}
              onFeedRemoved={handleFeedRemoved}
              onFeedAdded={(feed) => {
                setDataChanged(true);
                setFeeds(prevFeeds => [...prevFeeds, feed]);
              }}
            />
          )}
        </div>
      ),
    },
    {
      key: '2',
      label: <span className={styles.tabLabel}><PlusOutlined className={styles.tabIcon} />添加订阅源</span>,
      children: (
        <div className={styles.tabContent}>
          {activeTab === '2' && (
            <AddFeedPage
              groups={groups}
              onSuccess={handleAddFeedSuccess}
            />
          )}
        </div>
      ),
    },
    {
      key: '3',
      label: <span className={styles.tabLabel}><FolderAddOutlined className={styles.tabIcon} />添加分组</span>,
      children: (
        <div className={styles.tabContent}>
          {activeTab === '3' && (
            <AddGroupPage
              onSuccess={handleAddGroupSuccess}
              existingGroups={groups}
            />
          )}
        </div>
      ),
    },
    {
      key: '4',
      label: <span className={styles.tabLabel}><TagOutlined className={styles.tabIcon} />添加主题</span>,
      children: (
        <div className={styles.tabContent}>
          {activeTab === '4' && (
            <AddTopicPage
              onSuccess={handleTopicSuccess}
            />
          )}
        </div>
      ),
    },
  ];

  // 组件卸载时触发全局刷新
  useEffect(() => {
    return () => {
      // 无论数据是否有变化，都强制触发一次全局刷新
      console.log('===== 组件卸载，触发全局刷新 =====');
      triggerFeedCountRefresh();
      triggerArticleListRefresh();
      forceFeedListRefresh();
      
      // 直接刷新数据库
      if (db) {
        console.log('===== 组件卸载时直接刷新数据库 =====');
        db.feeds.toArray().then(feeds => {
          console.log('===== 组件卸载时数据库中的订阅源数量:', feeds.length);
        });
      }
    };
  }, [triggerFeedCountRefresh, triggerArticleListRefresh, db]);

  return (
    <div className={styles.manageContainer}>
      {/* 添加可拖拽区域 */}
      <div className={styles.dragArea} />
      
      <div className={styles.pageHeader}>
        <Button 
          type="text" 
          icon={<ArrowLeftOutlined />} 
          onClick={handleGoBack}
          className={styles.backButton}
        />
        <Title level={5} className={styles.pageTitle}>管理订阅</Title>
      </div>

      <div className={styles.contentWrapper}>
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          className={styles.manageTabs}
          type="card"
          size="small"
          items={tabItems}
        />
      </div>
    </div>
  );
};

export default ManagePage; 