import React from 'react';
import { Dropdown } from 'antd';
import { RightOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { Group } from '../../../db/database';
import { MenuProps } from 'antd';
import styles from '../FeedSection.module.css';

interface GroupItemProps {
  group: Group;
  isExpanded: boolean;
  isSelected: boolean;
  groupTotalCount: number;
  onClick: () => void;
  onExpanderClick: (e: React.MouseEvent) => void;
  onRenameGroup: (group: Group) => void;
  onMarkAllAsRead: (groupId: string, groupName: string) => void;
  onDeleteGroup: (groupId: string, groupName: string) => void;
}

const GroupItem: React.FC<GroupItemProps> = ({
  group,
  isExpanded,
  isSelected,
  groupTotalCount,
  onClick,
  onExpanderClick,
  onRenameGroup,
  onMarkAllAsRead,
  onDeleteGroup
}) => {
  // 创建右键菜单项
  const createMenuItems = (): MenuProps['items'] => {
    const hasUnreads = groupTotalCount > 0;
    
    const items: MenuProps['items'] = [
      { 
        key: 'mark-all-read', 
        label: '标记已读', 
        icon: <CheckCircleOutlined />, 
        disabled: !hasUnreads, 
        onClick: () => group.id && onMarkAllAsRead(group.id, group.name) 
      },
      { 
        key: 'rename', 
        label: '重命名', 
        icon: <EditOutlined />, 
        onClick: () => onRenameGroup(group) 
      },
      { type: 'divider' },
      { 
        key: 'delete', 
        label: '删除', 
        icon: <DeleteOutlined />, 
        danger: true, 
        onClick: () => group.id && onDeleteGroup(group.id, group.name) 
      },
    ];
    
    return items;
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
        className={`${styles.groupItem} ${isSelected ? styles.selected : ''}`}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div
          className={`${styles.expanderIcon} ${isExpanded ? styles.expanded : ''}`}
          onClick={onExpanderClick}
        >
          <RightOutlined />
        </div>
        <span className={styles.title}>{group.name}</span>
        {groupTotalCount > 0 && <span className={styles.count}>{groupTotalCount}</span>}
      </div>
    </Dropdown>
  );
};

export default React.memo(GroupItem); // 使用memo优化性能 