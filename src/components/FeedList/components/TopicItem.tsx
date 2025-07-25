import React from 'react';
import { Dropdown } from 'antd';
import { EditOutlined, DeleteOutlined, FilterOutlined } from '@ant-design/icons';
import { Topic } from '../../../db/database';
import { MenuProps } from 'antd';
import { getIconByName } from '../../../utils/topicIconUtils';
import styles from '../TopicSection.module.css';

interface TopicItemProps {
  topic: Topic;
  count: number;
  isSelected: boolean;
  onClick: () => void;
  onEdit: (topic: Topic) => void;
  onEditRules: (topic: Topic) => void;
  onDelete: (topicId: string, topicName: string) => void;
}

const TopicItem: React.FC<TopicItemProps> = ({
  topic,
  count,
  isSelected,
  onClick,
  onEdit,
  onEditRules,
  onDelete
}) => {
  // 获取主题图标
  const TopicIcon = getIconByName(topic.iconName);

  // 创建右键菜单项
  const createMenuItems = (): MenuProps['items'] => {
    return [
      {
        key: 'edit',
        label: '编辑主题',
        icon: <EditOutlined />,
        onClick: (e) => {
          e.domEvent.stopPropagation();
          onEdit(topic);
        }
      },
      {
        key: 'rules',
        label: '阅读偏好',
        icon: <FilterOutlined />,
        onClick: (e) => {
          e.domEvent.stopPropagation();
          onEditRules(topic);
        }
      },
      { type: 'divider' },
      { 
        key: 'delete', 
        label: '删除', 
        icon: <DeleteOutlined />, 
        danger: true, 
        onClick: () => topic.id && onDelete(topic.id, topic.name) 
      },
    ];
  };

  // 处理右键菜单可见性变化
  const handleDropdownVisibleChange = (visible: boolean) => {
    // 可以添加自定义逻辑
  };

  return (
    <Dropdown 
      menu={{ items: createMenuItems() }} 
      trigger={['contextMenu']}
      onOpenChange={handleDropdownVisibleChange}
      destroyOnHidden
      overlayClassName={styles.contextMenu}
    >
      <div
        className={`${styles.topicItem} ${isSelected ? styles.selected : ''}`}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className={styles.topicIconWrapper}>
          <TopicIcon className={styles.topicIcon} />
        </div>
        <span className={styles.title}>{topic.name}</span>
        {count > 0 && <span className={styles.count}>{count}</span>}
      </div>
    </Dropdown>
  );
};

export default React.memo(TopicItem); // 使用memo优化性能 