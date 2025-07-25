import React, { Key as ReactKey, useCallback } from 'react';
import { RightOutlined } from '@ant-design/icons';
import { FeedSource, Group } from '../../db/database';
import FeedItem from './components/FeedItem';
import GroupItem from './components/GroupItem';
import styles from './FeedList.module.css';
import sectionStyles from './FeedSection.module.css';

interface FeedSectionProps {
  collapsed: boolean;
  feeds: FeedSource[];
  groups: Group[];
  expandedKeys: ReactKey[];
  selectedKeys: ReactKey[];
  dynamicCounts: Map<string, number>;
  isExpanded: boolean;
  onExpanderClick: () => void;
  onGroupExpanderClick: (e: React.MouseEvent, key: ReactKey) => void;
  onSelect: (key: string) => void;
  onRefreshFeed: (feedId: string) => void;
  onDeleteFeed: (feedId: string) => void;
  onMarkAllAsReadForFeed: (feedId: string, feedTitle: string) => void;
  onMarkAllAsReadForGroup: (groupId: string, groupName: string) => void;
  refreshingFeedId: string | null;
  onEditFeed: (feed: FeedSource) => void;
  onRenameGroup: (group: Group) => void;
  onDeleteGroup: (groupId: string, groupName: string) => void;
}

const FeedSection: React.FC<FeedSectionProps> = ({
  collapsed,
  feeds,
  groups,
  expandedKeys,
  selectedKeys,
  dynamicCounts,
  isExpanded,
  onExpanderClick,
  onGroupExpanderClick,
  onSelect,
  onRefreshFeed,
  onDeleteFeed,
  onMarkAllAsReadForFeed,
  onMarkAllAsReadForGroup,
  refreshingFeedId,
  onEditFeed,
  onRenameGroup,
  onDeleteGroup
}) => {
  // 准备数据：未分组的订阅源
  const feedsWithoutGroup = feeds.filter(f => !f.groupId);
  
  // 如果折叠或没有数据，返回null
  if (collapsed || (!groups.length && !feedsWithoutGroup.length)) {
    return null;
  }

  // 渲染一个组下的所有订阅源
  const renderFeeds = (feedList: FeedSource[]) => {
    return feedList.map(feed => {
      if (typeof feed.id === 'undefined') return null;
      const feedKey = `feed-${feed.id}`;
      const count = dynamicCounts.get(feed.id) ?? 0;
      const isSelected = selectedKeys.includes(feedKey);
      
      return (
        <FeedItem
          key={feedKey}
          feed={feed}
          count={count}
          isSelected={isSelected}
          refreshingFeedId={refreshingFeedId}
          onClick={() => onSelect(feedKey)}
          onRefreshFeed={onRefreshFeed}
          onMarkAllAsRead={onMarkAllAsReadForFeed}
          onDeleteFeed={onDeleteFeed}
          onEditFeed={onEditFeed}
        />
      );
    });
  };

  return (
    <>
      {/* 订阅区域标题 */}
      <div className={styles.sectionHeader} onClick={onExpanderClick}>
        <div className={styles.sectionTitleWrapper}>
          <span className={styles.sectionTitle}>订阅</span>
          <div className={`${styles.expanderIcon} ${isExpanded ? styles.expanded : ''}`}>
            <RightOutlined />
          </div>
        </div>
      </div>

      {/* 根据展开状态决定是否显示订阅内容 */}
      {isExpanded && (
        <>
          {/* 订阅分组 */}
          {groups.map((group) => {
            if (typeof group.id === 'undefined') return null;
            const groupKey = `group-${group.id}`;
            const isExpanded = expandedKeys.includes(groupKey);
            const isSelected = selectedKeys.includes(groupKey);
            
            // 获取该分组下的所有订阅源
            const feedsInGroup = feeds.filter(f => f.groupId === group.id);
            
            // 计算该分组下所有订阅源的未读数总和
            const groupTotalCount = feedsInGroup.reduce((total, feed) => {
              return total + (dynamicCounts.get(feed.id!) ?? 0);
            }, 0);

            return (
              <div key={groupKey}>
                <GroupItem
                  group={group}
                  isExpanded={isExpanded}
                  isSelected={isSelected}
                  groupTotalCount={groupTotalCount}
                  onClick={() => onSelect(groupKey)}
                  onExpanderClick={(e) => onGroupExpanderClick(e, groupKey)}
                  onRenameGroup={onRenameGroup}
                  onMarkAllAsRead={onMarkAllAsReadForGroup}
                  onDeleteGroup={onDeleteGroup}
                />

                {isExpanded && (
                  <div className={sectionStyles.feedListWrapper}>
                    {renderFeeds(feedsInGroup)}
                  </div>
                )}
              </div>
            );
          })}

          {/* 未分组订阅源 */}
          {feedsWithoutGroup.length > 0 && renderFeeds(feedsWithoutGroup)}
        </>
      )}
    </>
  );
};

export default React.memo(FeedSection); // 使用memo优化性能 