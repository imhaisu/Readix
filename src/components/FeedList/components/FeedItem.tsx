import React from 'react';
import { Dropdown } from 'antd';
import { 
  GlobalOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  SettingOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { Avatar } from 'antd';
import { FeedSource } from '../../../db/database';
import { MenuProps } from 'antd';
import styles from '../FeedSection.module.css';

interface FeedItemProps {
  feed: FeedSource;
  count: number;
  isSelected: boolean;
  refreshingFeedId: string | null;
  onClick: () => void;
  onRefreshFeed: (feedId: string) => void;
  onMarkAllAsRead: (feedId: string, feedTitle: string) => void;
  onDeleteFeed: (feedId: string) => void;
  onEditFeed: (feed: FeedSource) => void;
}

const FeedItem: React.FC<FeedItemProps> = ({
  feed,
  count,
  isSelected,
  refreshingFeedId,
  onClick,
  onRefreshFeed,
  onMarkAllAsRead,
  onDeleteFeed,
  onEditFeed
}) => {
  // 处理图标加载错误
  const [hasIconError, setHasIconError] = React.useState(false);

  const handleIconError = () => {
    setHasIconError(true);
    return false; // 防止默认错误处理
  };

  // 创建右键菜单项
  const createMenuItems = (): MenuProps['items'] => [
    { 
      key: 'sync', 
      label: '立即刷新', 
      icon: <SyncOutlined spin={refreshingFeedId === feed.id} />, 
      onClick: () => feed.id && onRefreshFeed(feed.id) 
    },
    { 
      key: 'mark-all-read', 
      label: '标记已读', 
      icon: <CheckCircleOutlined />, 
      onClick: () => feed.id && onMarkAllAsRead(feed.id, feed.title) 
    },
    { type: 'divider' },
    { 
      key: 'edit', 
      label: '编辑', 
      icon: <SettingOutlined />, 
      onClick: () => onEditFeed(feed) 
    },
    { 
      key: 'delete', 
      label: '删除', 
      icon: <DeleteOutlined />, 
      danger: true, 
      onClick: () => feed.id && onDeleteFeed(feed.id) 
    },
  ];

  // 处理右键菜单可见性变化
  const handleDropdownVisibleChange = (visible: boolean) => {
    // 可以添加自定义逻辑
  };

  return (
    <div 
      className={`${styles.feedItemWrapper} ${isSelected ? styles.selected : ''}`}
      onClick={onClick}
    >
      <Dropdown 
        menu={{ items: createMenuItems() }} 
        trigger={['contextMenu']}
        onOpenChange={handleDropdownVisibleChange}
        destroyOnHidden
        overlayClassName={styles.contextMenu}
      >
        <div
          className={styles.feedItem}
          onContextMenu={(e) => {
            e.preventDefault(); // 阻止默认的浏览器右键菜单
            e.stopPropagation(); // 阻止事件冒泡
          }}
        >
          {hasIconError || !feed.iconUrl ? (
            <Avatar size={16} icon={<GlobalOutlined />} className={styles.feedIcon} />
          ) : (
            <Avatar 
              src={feed.iconUrl} 
              size={16} 
              icon={<GlobalOutlined />} 
              className={styles.feedIcon} 
              onError={handleIconError} 
            />
          )}
          <span className={styles.title}>{feed.title}</span>
          {count > 0 && <span className={styles.count}>{count}</span>}
        </div>
      </Dropdown>
    </div>
  );
};

export default React.memo(FeedItem); // 使用memo优化性能 