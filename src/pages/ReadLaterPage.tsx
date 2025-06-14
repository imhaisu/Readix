import React, { useState, useEffect } from 'react';
import { Layout, List, Button, Typography, Empty, Skeleton, Badge, Tooltip, Dropdown, Menu } from 'antd';
import { 
  DeleteOutlined, 
  EyeOutlined, 
  GlobalOutlined, 
  CheckOutlined,
  EllipsisOutlined,
  SortAscendingOutlined
} from '@ant-design/icons';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useDatabase } from '../contexts/DatabaseContext';
import { SavedLink } from '../contexts/DatabaseContext';
import styles from './ReadLaterPage.module.css';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const ReadLaterPage: React.FC = () => {
  const { db, isInitialized } = useDatabase();
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'title'>('newest');

  // 加载保存的链接
  useEffect(() => {
    if (!isInitialized || !db) return;

    const loadSavedLinks = async () => {
      setLoading(true);
      try {
        const result = await db.savedLinks.toArray();
        setSavedLinks(result);
      } catch (error) {
        console.error('获取稍后阅读列表失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSavedLinks();
  }, [db, isInitialized]);

  // 处理项目点击
  const handleItemClick = (itemId: string) => {
    setSelectedItemId(itemId);
  };

  // 删除保存的链接
  const handleDeleteItem = async (itemId: string) => {
    if (!db) return;

    try {
      await db.savedLinks.delete(itemId);
      setSavedLinks(savedLinks.filter(item => item.id !== itemId));
      if (selectedItemId === itemId) {
        setSelectedItemId(null);
      }
    } catch (error) {
      console.error('删除保存的链接失败:', error);
    }
  };

  // 标记为已读
  const handleMarkAsRead = async (itemId: string, isRead: boolean) => {
    if (!db) return;

    try {
      await db.savedLinks.update(itemId, { isRead: !isRead });
      // 更新本地状态
      setSavedLinks(savedLinks.map(item => 
        item.id === itemId 
          ? { ...item, isRead: !isRead } 
          : item
      ));
    } catch (error) {
      console.error('更新阅读状态失败:', error);
    }
  };

  // 在浏览器中打开链接
  const handleOpenInBrowser = (url: string) => {
    window.open(url, '_blank');
  };

  // 获取排序后的列表
  const getSortedLinks = () => {
    const sorted = [...savedLinks];
    switch (sortOrder) {
      case 'newest':
        return sorted.sort((a, b) => b.addedDate.getTime() - a.addedDate.getTime());
      case 'oldest':
        return sorted.sort((a, b) => a.addedDate.getTime() - b.addedDate.getTime());
      case 'title':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return sorted;
    }
  };

  // 排序菜单
  const sortMenu = (
    <Menu
      items={[
        {
          key: 'newest',
          label: '最新添加',
          onClick: () => setSortOrder('newest')
        },
        {
          key: 'oldest',
          label: '最早添加',
          onClick: () => setSortOrder('oldest')
        },
        {
          key: 'title',
          label: '按标题排序',
          onClick: () => setSortOrder('title')
        }
      ]}
    />
  );

  return (
    <Layout className={styles.readLaterLayout}>
      <Header className={styles.header}>
        <div className={styles.headerTitle}>稍后阅读</div>
        <div className={styles.headerControls}>
          <Dropdown overlay={sortMenu} trigger={['click']}>
            <Button 
              type="text" 
              icon={<SortAscendingOutlined />}
              title="排序方式"
            />
          </Dropdown>
        </div>
      </Header>
      
      <Content className={styles.content}>
        {loading ? (
          <div className={styles.loadingContainer}>
            <Skeleton active />
            <Skeleton active />
            <Skeleton active />
          </div>
        ) : savedLinks.length === 0 ? (
          <div className={styles.emptyContainer}>
            <Empty 
              description="您的稍后阅读列表为空" 
              image={Empty.PRESENTED_IMAGE_SIMPLE} 
            />
            <Text type="secondary">
              浏览文章时，点击"稍后阅读"按钮将文章添加到此列表
            </Text>
          </div>
        ) : (
          <List
            className={styles.list}
            dataSource={getSortedLinks()}
            renderItem={item => (
              <List.Item
                className={`${styles.listItem} ${selectedItemId === item.id ? styles.selectedItem : ''}`}
                onClick={() => handleItemClick(item.id)}
                actions={[
                  <Tooltip title="删除">
                    <Button 
                      type="text" 
                      icon={<DeleteOutlined />} 
                      onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                    />
                  </Tooltip>,
                  <Tooltip title="在浏览器中打开">
                    <Button 
                      type="text" 
                      icon={<GlobalOutlined />} 
                      onClick={(e) => { e.stopPropagation(); handleOpenInBrowser(item.url); }}
                    />
                  </Tooltip>,
                  <Tooltip title={item.isRead ? "标记为未读" : "标记为已读"}>
                    <Button 
                      type="text" 
                      icon={item.isRead ? <EyeOutlined /> : <CheckOutlined />}
                      onClick={(e) => { e.stopPropagation(); handleMarkAsRead(item.id, item.isRead); }}
                    />
                  </Tooltip>
                ]}
              >
                <List.Item.Meta
                  title={
                    <div className={styles.itemTitle}>
                      {!item.isRead && <Badge status="processing" className={styles.unreadBadge} />}
                      {item.title}
                    </div>
                  }
                  description={
                    <div className={styles.itemDescription}>
                      <Text type="secondary">
                        {format(item.addedDate, 'PPP', { locale: zhCN })}
                      </Text>
                      <Text type="secondary" ellipsis className={styles.itemUrl}>
                        {item.url}
                      </Text>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Content>
    </Layout>
  );
};

export default ReadLaterPage; 