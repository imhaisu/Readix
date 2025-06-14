import React, { useState } from 'react';
import { Button, Typography, Steps, Card, Empty } from 'antd';
import { 
  PlusOutlined, 
  ReadOutlined, 
  SettingOutlined,
  StarOutlined,
  SyncOutlined
} from '@ant-design/icons';
import AddFeedModal from './AddFeedModal';
import { useDatabase } from '../contexts/DatabaseContext';
import { FeedSource, Group } from '../contexts/DatabaseContext';
import styles from './WelcomePage.module.css';

const { Title, Text, Paragraph } = Typography;
const { Step } = Steps;

const WelcomePage: React.FC<{ onAddFirstFeed: (feed: FeedSource) => void }> = ({ onAddFirstFeed }) => {
  const { db } = useDatabase();
  const [showAddFeedModal, setShowAddFeedModal] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);

  // 处理添加订阅源成功
  const handleAddFeedSuccess = (feed: FeedSource) => {
    setShowAddFeedModal(false);
    onAddFirstFeed(feed);
  };

  return (
    <div className={styles.welcomeContainer}>
      <Card className={styles.welcomeCard}>
        <Title level={2} className={styles.welcomeTitle}>
          欢迎使用 NewReader
        </Title>
        
        <div className={styles.welcomeContent}>
          <Empty
            image={<ReadOutlined className={styles.emptyIcon} />}
            description={
              <Text>您还没有添加任何RSS订阅源</Text>
            }
          />
          
          <Paragraph className={styles.welcomeDescription}>
            NewReader 是一个轻量级的RSS阅读器，可以帮助您随时了解您关注的网站的最新内容。
            开始使用前，请先添加您的第一个RSS订阅源。
          </Paragraph>
          
          <div className={styles.welcomeSteps}>
            <Steps direction="vertical" current={-1}>
              <Step 
                title="添加RSS订阅源" 
                description="添加您喜欢的网站的RSS订阅源"
                icon={<PlusOutlined />}
              />
              <Step 
                title="阅读最新内容" 
                description="浏览和阅读最新的文章"
                icon={<ReadOutlined />}
              />
              <Step 
                title="收藏和管理" 
                description="收藏喜欢的文章，管理您的订阅源"
                icon={<StarOutlined />}
              />
              <Step 
                title="保持更新" 
                description="定期刷新以获取最新内容"
                icon={<SyncOutlined />}
              />
              <Step 
                title="个性化设置" 
                description="根据您的偏好自定义阅读体验"
                icon={<SettingOutlined />}
              />
            </Steps>
          </div>
          
          <div className={styles.welcomeActions}>
            <Button 
              type="primary" 
              size="large" 
              icon={<PlusOutlined />}
              onClick={() => setShowAddFeedModal(true)}
            >
              添加您的第一个RSS订阅源
            </Button>
          </div>

          <div className={styles.welcomeTips}>
            <Title level={4}>常见RSS订阅源举例：</Title>
            <ul>
              <li><Text copyable>https://www.zhihu.com/rss</Text> - 知乎每日精选</li>
              <li><Text copyable>http://www.ruanyifeng.com/blog/atom.xml</Text> - 阮一峰的网络日志</li>
              <li><Text copyable>https://feeds.appinn.com/appinns/</Text> - 小众软件</li>
              <li><Text copyable>https://www.ithome.com/rss</Text> - IT之家</li>
              <li><Text copyable>https://36kr.com/feed</Text> - 36氪</li>
            </ul>
          </div>
        </div>
      </Card>
      
      {/* 添加订阅源模态框 */}
      <AddFeedModal
        visible={showAddFeedModal}
        onCancel={() => setShowAddFeedModal(false)}
        onSuccess={handleAddFeedSuccess}
        groups={groups}
      />
    </div>
  );
};

export default WelcomePage; 