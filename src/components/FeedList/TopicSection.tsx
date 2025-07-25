import React, { Key as ReactKey } from 'react';
import { RightOutlined } from '@ant-design/icons';
import { Topic } from '../../db/database';
import TopicItem from './components/TopicItem';
import styles from './FeedList.module.css';

interface TopicSectionProps {
  topics: Topic[];
  selectedKeys: ReactKey[];
  topicCounts: Map<string, number>;
  isExpanded: boolean;
  onExpanderClick: () => void;
  onSelect: (key: string) => void;
  onEditTopic: (topic: Topic) => void;
  onEditTopicRules: (topic: Topic) => void;
  onDeleteTopic: (topicId: string, topicName: string) => void;
}

const TopicSection: React.FC<TopicSectionProps> = ({
  topics,
  selectedKeys,
  topicCounts,
  isExpanded,
  onExpanderClick,
  onSelect,
  onEditTopic,
  onEditTopicRules,
  onDeleteTopic
}) => {
  // 如果没有主题数据，不渲染
  if (topics.length === 0) {
    return null;
  }

  return (
    <>
      {/* 分隔线 - 只有在有订阅和有主题时才显示 */}
      <div className={styles.separator} />

      {/* 主题阅读区域标题 */}
      <div className={styles.sectionHeader} onClick={onExpanderClick}>
        <div className={styles.sectionTitleWrapper}>
          <span className={styles.sectionTitle}>主题</span>
          <div className={`${styles.expanderIcon} ${isExpanded ? styles.expanded : ''}`}>
            <RightOutlined />
          </div>
        </div>
      </div>

      {/* 根据展开状态决定是否显示主题内容 */}
      {isExpanded && (
        <>
          {topics.map(topic => {
            if (!topic.id) return null;
            const topicKey = `topic-${topic.id}`;
            const count = topicCounts.get(topic.id) ?? 0;
            const isSelected = selectedKeys.includes(topicKey);
            
            return (
              <TopicItem
                key={topicKey}
                topic={topic}
                count={count}
                isSelected={isSelected}
                onClick={() => onSelect(topicKey)}
                onEdit={onEditTopic}
                onEditRules={onEditTopicRules}
                onDelete={onDeleteTopic}
              />
            );
          })}
        </>
      )}
    </>
  );
};

export default React.memo(TopicSection); // 使用memo优化性能 