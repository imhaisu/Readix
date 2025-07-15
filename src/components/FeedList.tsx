import React, { useState, useEffect, Key as ReactKey, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Empty, Skeleton, Avatar, message, Modal, Dropdown, Menu, Input, Button } from 'antd';
import type { MenuProps } from 'antd';
import { 
  LinkOutlined,
  RightOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
  SwapOutlined,
  TagOutlined,
  PlusOutlined,
  FilterOutlined,
  GlobalOutlined
} from '@ant-design/icons';
import { useDatabase } from '../contexts/DatabaseContext';
import { useFilter } from '../contexts/FilterContext';
import { FeedSource, Group, Topic, TopicFeed, Article } from '../db/database';
import { processFeedIcons } from '../utils/iconUtils';
import styles from './FeedList.module.css';
import EditFeedModal from './EditFeedModal';
import AddTopicModal from './AddTopicModal';
import { getIconByName } from '../utils/topicIconUtils';

interface FeedListProps {
  collapsed: boolean;
  feeds: FeedSource[];
  groups: Group[];
  onRefreshFeeds?: () => void;
}

// 创建一个记录图标加载错误的Map
const iconErrorCache = new Map<string, boolean>();

// 在组件顶部添加一个计数缓存和相关的更新时间
const countCache = new Map<string, {count: number, timestamp: number}>();
const CACHE_VALID_DURATION = 10000; // 缓存有效期10秒

const FeedList: React.FC<FeedListProps> = ({ collapsed, feeds: feedsFromProps, groups: groupsFromProps, onRefreshFeeds }) => {
  const navigate = useNavigate();
  const { feedId, groupId: currentRouteGroupId, topicId: currentRouteTopicId } = useParams<{ feedId?: string; groupId?: string; topicId?: string }>();
  const { db, triggerArticleListRefresh, feedCountRefreshTrigger } = useDatabase();
  const { filter } = useFilter();
  const [loading, setLoading] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<ReactKey[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<ReactKey[]>([]);
  const [refreshingFeedId, setRefreshingFeedId] = useState<string | null>(null);
  const [processedFeeds, setProcessedFeeds] = useState<FeedSource[]>([]);
  const [dynamicCounts, setDynamicCounts] = useState<Map<string, number>>(new Map());
  const countCacheRef = useRef(countCache);

  // 主题相关状态
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicFeeds, setTopicFeeds] = useState<Map<string, string[]>>(new Map());
  const [topicCounts, setTopicCounts] = useState<Map<string, number>>(new Map());
  const [isAddTopicModalVisible, setIsAddTopicModalVisible] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [initialActiveTab, setInitialActiveTab] = useState('1'); // 新增状态，用于控制AddTopicModal的初始标签页
  
  // 记录已经处理过的图标URL，防止重复处理
  const processedIconUrls = useRef<Map<string, string | undefined>>(new Map());

  // Modals State
  const [isRenameGroupModalVisible, setIsRenameGroupModalVisible] = useState(false);
  const [renamingGroupData, setRenamingGroupData] = useState<{ id: string; currentName: string } | null>(null);
  const [newGroupName, setNewGroupName] = useState('');

  const [isEditFeedModalVisible, setIsEditFeedModalVisible] = useState(false);
  const [editingFeedData, setEditingFeedData] = useState<FeedSource | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  // 处理单个图标URL的函数
  const processSingleIconUrl = useCallback(async (iconUrl: string | undefined): Promise<string | undefined> => {
    if (!iconUrl) return undefined;
    
    // 检查缓存中是否已有处理结果
    if (processedIconUrls.current.has(iconUrl)) {
      return processedIconUrls.current.get(iconUrl);
    }
    
    try {
      // 处理不同类型的URL
      let result: string | undefined = iconUrl;
      
      // 如果是 file:// 协议，使用electron API处理
      if (iconUrl.startsWith('file://') && window.electron?.getLocalIconBase64) {
        const response = await window.electron.getLocalIconBase64(iconUrl);
        if (response.success && response.data) {
          result = response.data;
        } else {
          console.warn('处理本地图标失败:', response.error);
          result = undefined;
        }
      }
      
      // 将结果存入缓存
      processedIconUrls.current.set(iconUrl, result);
      return result;
    } catch (error) {
      console.error('处理图标URL出错:', error);
      processedIconUrls.current.set(iconUrl, undefined);
      return undefined;
    }
  }, []);
  
  // 批量处理订阅源图标
  const processAllFeedIcons = useCallback(async (feeds: FeedSource[]): Promise<FeedSource[]> => {
    return Promise.all(feeds.map(async (feed) => {
      if (!feed.iconUrl) return feed;
      
      const processedUrl = await processSingleIconUrl(feed.iconUrl);
      return { ...feed, iconUrl: processedUrl };
    }));
  }, [processSingleIconUrl]);

  useEffect(() => {
    const calculateCounts = async () => {
      if (!db || feedsFromProps.length === 0) {
        setDynamicCounts(new Map());
        return;
      }

      const now = Date.now();
      const counts = new Map<string, number>();
      const feedsToQuery = [];
      const cacheHits = [];
      
      // 首先尝试从缓存中获取计数
      for (const feed of feedsFromProps) {
        if (!feed.id) continue;
        
        // 检查是否有有效的缓存数据
        const cacheEntry = countCacheRef.current.get(`${feed.id}-${filter}`);
        if (cacheEntry && (now - cacheEntry.timestamp) < CACHE_VALID_DURATION) {
          // 使用缓存的计数
          counts.set(feed.id, cacheEntry.count);
          cacheHits.push(feed.id);
        } else {
          // 需要查询数据库
          feedsToQuery.push(feed);
        }
      }
      
      // 如果所有数据都在缓存中，直接返回
      if (feedsToQuery.length === 0) {
        setDynamicCounts(counts);
        return;
      }
      
      // 只有缓存未命中的订阅源才需要查询数据库
      const feedIdsToQuery = feedsToQuery.map(feed => feed.id).filter(Boolean) as string[];
      
      if (feedIdsToQuery.length > 0) {
        try {
          let allArticles: Article[];
          
          if (filter === 'all') {
            allArticles = await db.articles
              .where('sourceId')
              .anyOf(feedIdsToQuery)
              .filter(article => article.isHidden !== true)
              .toArray();
          } else if (filter === 'unread') {
            allArticles = await db.articles
              .where('[sourceId+isRead]')
              .anyOf(feedIdsToQuery.map(id => [id, 'false']))
              .filter(article => article.isHidden !== true)
              .toArray();
          } else if (filter === 'starred') {
            allArticles = await db.articles
              .where('[sourceId+isStarred]')
              .anyOf(feedIdsToQuery.map(id => [id, 'true']))
              .filter(article => article.isHidden !== true)
              .toArray();
          } else {
            // 默认为未读
            allArticles = await db.articles
              .where('[sourceId+isRead]')
              .anyOf(feedIdsToQuery.map(id => [id, 'false']))
              .filter(article => article.isHidden !== true)
              .toArray();
          }
          
          // 统计并缓存结果
          const queryResults = new Map<string, number>();
          
          // 分组计数
          for (const article of allArticles) {
            if (article.sourceId) {
              queryResults.set(article.sourceId, (queryResults.get(article.sourceId) || 0) + 1);
            }
          }
          
          // 更新缓存和结果
          for (const feedId of feedIdsToQuery) {
            const count = queryResults.get(feedId) || 0;
            counts.set(feedId, count);
            
            // 更新缓存
            countCacheRef.current.set(`${feedId}-${filter}`, {
              count,
              timestamp: now
            });
          }
        } catch (error) {
          console.error('计算文章数量出错:', error);
        }
      }
      
      setDynamicCounts(counts);
    };

    calculateCounts();
  }, [db, filter, feedsFromProps, feedCountRefreshTrigger, refreshKey]);

  // 添加主题计数缓存
  const topicCountCache = new Map<string, {count: number, timestamp: number}>();
  const topicCountCacheRef = useRef(topicCountCache);
  
  // 添加缓存清除功能
  useEffect(() => {
    // 当feedCountRefreshTrigger更新时，清除缓存
    // 这通常发生在文章被标记为已读或未读，或者添加、删除文章时
    countCacheRef.current.clear();
    topicCountCacheRef.current.clear();
    // 不需要立即触发重新计算，calculateCounts和loadTopics会在依赖项变化时自动执行
  }, [feedCountRefreshTrigger]);

  // 加载主题数据
  useEffect(() => {
    const loadTopics = async () => {
      if (!db) return;
      
      try {
        // 获取所有主题
        const allTopics = await db.topics.toArray();
        setTopics(allTopics.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
        
        // 获取所有主题-订阅源关联
        const allTopicFeeds = await db.topicFeeds.toArray();
        
        // 构建主题->订阅源ID映射
        const topicFeedMap = new Map<string, string[]>();
        allTopicFeeds.forEach(tf => {
          if (!topicFeedMap.has(tf.topicId)) {
            topicFeedMap.set(tf.topicId, []);
          }
          topicFeedMap.get(tf.topicId)?.push(tf.feedId);
        });
        setTopicFeeds(topicFeedMap);
        
        // 计算每个主题的未读文章数 - 考虑主题过滤规则
        const topicCountMap = new Map<string, number>();
        const now = Date.now();
        
        // 检查哪些主题需要重新计算计数
        const topicsToUpdate: Topic[] = [];
        
        for (const topic of allTopics) {
          if (!topic.id) continue;
          
          // 检查缓存
          const cacheKey = `${topic.id}-${filter}`;
          const cacheEntry = topicCountCacheRef.current.get(cacheKey);
          
          if (cacheEntry && (now - cacheEntry.timestamp) < CACHE_VALID_DURATION) {
            // 使用缓存数据
            topicCountMap.set(topic.id, cacheEntry.count);
          } else {
            // 需要重新计算
            topicsToUpdate.push(topic);
          }
        }
        
        if (topicsToUpdate.length === 0) {
          // 所有数据都在缓存中
          setTopicCounts(topicCountMap);
          return;
        }
        
        // 加载来自其他模块的过滤函数
        const { applyTopicFilterRules } = await import('../utils/filterApplier');
        
        // 收集所有需要查询的订阅源ID
        const allFeedIdsToQuery = new Set<string>();
        for (const topic of topicsToUpdate) {
          if (topic.id) {
            const feedIds = topicFeedMap.get(topic.id) || [];
            feedIds.forEach(id => allFeedIdsToQuery.add(id));
          }
        }
        
        if (allFeedIdsToQuery.size === 0) {
          // 更新主题没有关联的订阅源
          for (const topic of topicsToUpdate) {
            if (topic.id) {
              topicCountMap.set(topic.id, 0);
              topicCountCacheRef.current.set(`${topic.id}-${filter}`, {
                count: 0,
                timestamp: now
              });
            }
          }
          setTopicCounts(topicCountMap);
          return;
        }
        
        // 获取所有符合条件的文章
        let allRelevantArticles: Article[] = [];
        
        try {
          // 创建一个事务，确保查询过程中不会有变化
          await db.transaction('r', db.articles, async () => {
            const feedIdsArray = Array.from(allFeedIdsToQuery);
            
            if (filter === 'all') {
              allRelevantArticles = await db.articles
                .where('sourceId')
                .anyOf(feedIdsArray)
                .filter(article => article.isHidden !== true)
                .toArray();
            } else if (filter === 'unread') {
              allRelevantArticles = await db.articles
                .where('[sourceId+isRead]')
                .anyOf(feedIdsArray.map(id => [id, 'false']))
                .filter(article => article.isHidden !== true)
                .toArray();
            } else if (filter === 'starred') {
              allRelevantArticles = await db.articles
                .where('[sourceId+isStarred]')
                .anyOf(feedIdsArray.map(id => [id, 'true']))
                .filter(article => article.isHidden !== true)
                .toArray();
            } else {
              // 默认为未读
              allRelevantArticles = await db.articles
                .where('[sourceId+isRead]')
                .anyOf(feedIdsArray.map(id => [id, 'false']))
                .filter(article => article.isHidden !== true)
                .toArray();
            }
          
            // 遍历所有需要更新的主题，根据文章列表计算计数
            for (const topic of topicsToUpdate) {
              if (!topic.id) continue;
              
              const feedIds = topicFeedMap.get(topic.id) || [];
              if (feedIds.length === 0) {
                topicCountMap.set(topic.id, 0);
                topicCountCacheRef.current.set(`${topic.id}-${filter}`, {
                  count: 0,
                  timestamp: now
                });
                continue;
              }
              
              // 获取主题过滤规则
              const topicFilterRules = topic.filterRules || [];
              
              // 过滤出属于当前主题的文章
              const topicArticles = allRelevantArticles.filter(
                article => feedIds.includes(article.sourceId)
              );
              
              // 如果有主题过滤规则，应用过滤规则
              let passedCount = 0;
              
              // 遍历所有文章，检查是否通过过滤规则
              for (const article of topicArticles) {
                const passed = applyTopicFilterRules(article, topicFilterRules);
                if (passed) {
                  passedCount++;
                }
              }
              
              // 设置主题文章数量并更新缓存
              topicCountMap.set(topic.id, passedCount);
              topicCountCacheRef.current.set(`${topic.id}-${filter}`, {
                count: passedCount,
                timestamp: now
              });
            }
          });
        } catch (error) {
          console.error('获取主题文章数量失败:', error);
        }
        
        setTopicCounts(topicCountMap);
        
      } catch (error) {
        console.error('加载主题数据失败:', error);
      }
    };
    
    loadTopics();
  }, [db, refreshKey, filter]);

  useEffect(() => {
    if (groupsFromProps) {
      const defaultExpanded = groupsFromProps
        .filter(g => !g.collapsed)
        .map(g => `group-${g.id}` as ReactKey);
      setExpandedKeys(defaultExpanded);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [groupsFromProps]);

  // 处理图标
  useEffect(() => {
    const processIcons = async () => {
      if (feedsFromProps.length > 0) {
        try {
          // 使用自定义函数处理图标
          const processed = await processAllFeedIcons(feedsFromProps);
          setProcessedFeeds(processed);
        } catch (error) {
          console.error('处理订阅源图标出错:', error);
          setProcessedFeeds(feedsFromProps);
        }
      } else {
        setProcessedFeeds([]);
      }
    };

    processIcons();
  }, [feedsFromProps, processAllFeedIcons]);

  useEffect(() => {
    if (feedId) {
      setSelectedKeys([`feed-${feedId}`]);
    } else if (currentRouteGroupId) {
      setSelectedKeys([`group-${currentRouteGroupId}`]);
    } else if (currentRouteTopicId) {
      setSelectedKeys([`topic-${currentRouteTopicId}`]);
    } else {
      setSelectedKeys([]);
    }
  }, [feedId, currentRouteGroupId, currentRouteTopicId]);

  const handleGroupExpanderClick = useCallback(async (e: React.MouseEvent, groupKey: ReactKey) => {
    e.stopPropagation();
    if (!db) return;
    const groupId = (groupKey as string).replace('group-', '');
    const isCurrentlyExpanded = expandedKeys.includes(groupKey);
    setExpandedKeys(prevKeys => 
      isCurrentlyExpanded ? prevKeys.filter(k => k !== groupKey) : [...prevKeys, groupKey]
    );
    try {
      await db.groups.update(groupId, { collapsed: isCurrentlyExpanded });
    } catch (err) {
      console.error("Error updating group collapsed state", err);
      message.error('Failed to save view state.');
      setExpandedKeys(prevKeys => 
        isCurrentlyExpanded ? [...prevKeys, groupKey] : prevKeys.filter(k => k !== groupKey)
      );
    }
  }, [db, expandedKeys]);

  const handleSelect = (key: string) => {
    if (key.startsWith('feed-')) {
      const newFeedId = key.replace('feed-', '');
      if (newFeedId === feedId) {
        document.dispatchEvent(new CustomEvent('request-list-refresh'));
      } else {
        navigate(`/feed/${newFeedId}`);
      }
    } else if (key.startsWith('group-')) {
      const newGroupId = key.replace('group-', '');
      if (newGroupId === currentRouteGroupId) {
        document.dispatchEvent(new CustomEvent('request-list-refresh'));
      } else {
        navigate(`/group/${newGroupId}`);
      }
    } else if (key.startsWith('topic-')) {
      const newTopicId = key.replace('topic-', '');
      if (newTopicId === currentRouteTopicId) {
        document.dispatchEvent(new CustomEvent('request-list-refresh'));
      } else {
        navigate(`/topic/${newTopicId}`);
      }
    }
  };
  
  // 主题相关处理函数
  const handleAddTopic = () => {
    setEditingTopic(null);
    setInitialActiveTab('1'); // 默认打开第一个标签页
    setIsAddTopicModalVisible(true);
  };
  
  const handleEditTopic = (topic: Topic, initialTab?: string) => {
    setEditingTopic(topic);
    setInitialActiveTab(initialTab || '1');
    setIsAddTopicModalVisible(true);
  };
  
  const handleTopicSuccess = (topic: Topic) => {
    triggerArticleListRefresh();
    setIsAddTopicModalVisible(false);
    setEditingTopic(null);
    setRefreshKey(prev => prev + 1);
  };
  
  const handleDeleteTopic = (topicId: string, topicName: string) => {
    if (!db) return;
    Modal.confirm({
      title: `确认删除主题 "${topicName}"?`,
      icon: <ExclamationCircleOutlined />,
      content: '此操作只会删除主题，不会影响订阅源和文章。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await db.transaction('rw', db.topics, db.topicFeeds, async () => {
            // 删除主题与订阅源的关联
            await db.topicFeeds.where('topicId').equals(topicId).delete();
            
            // 删除主题
            await db.topics.delete(topicId);
          });
          
          setRefreshKey(prev => prev + 1);
          
          if (selectedKeys[0] === `topic-${topicId}`) {
            navigate('/');
          }
          
          message.success(`主题 "${topicName}" 已删除。`);
        } catch (error) {
          console.error('删除主题失败:', error);
          Modal.error({ title: '删除失败', content: '删除主题时发生错误。' });
        }
      },
    });
  };

  const handleRefreshFeed = async (feedIdToRefresh: string) => {
    if (!onRefreshFeeds) return;
    setRefreshingFeedId(feedIdToRefresh);
    try {
      // Assuming onRefreshFeeds can trigger a refresh for a specific feed or all feeds.
      // The actual implementation is in the parent component.
      await onRefreshFeeds();
    } catch (error) {
      console.error(`刷新订阅源失败: ${feedIdToRefresh}`, error);
    } finally {
      setRefreshingFeedId(null);
    }
  };

  const handleDeleteFeed = async (feedIdToDelete: string) => {
    if (!db) return;
    Modal.confirm({
      title: '确认删除订阅源?',
      icon: <ExclamationCircleOutlined />,
      content: '删除此订阅源将同时删除其下所有文章。此操作无法撤销。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await db.transaction('rw', db.feeds, db.articles, async () => {
            await db.feeds.delete(feedIdToDelete);
            await db.articles.where('sourceId').equals(feedIdToDelete).delete();
          });
          triggerArticleListRefresh();
          if (selectedKeys[0] === `feed-${feedIdToDelete}`) {
            navigate('/');
          }
          message.success(`订阅源已删除。`);
        } catch (error) {
          console.error('删除订阅源失败:', error);
          Modal.error({ title: '删除失败', content: '删除订阅源时发生错误。' });
        }
      },
    });
  };
  
  const showRenameGroupModal = (group: Group) => {
    if (typeof group.id === 'undefined') return;
    setRenamingGroupData({ id: group.id, currentName: group.name });
    setNewGroupName(group.name);
    setIsRenameGroupModalVisible(true);
  };

  const handleRenameGroupOk = async () => {
    if (!db || !renamingGroupData || !newGroupName.trim()) {
      return;
    }

    const trimmedName = newGroupName.trim();
    if (trimmedName === renamingGroupData.currentName) {
      setIsRenameGroupModalVisible(false);
      return;
    }

    try {
      // 检查新分组名是否已存在
      const existingGroup = await db.groups.where('name').equalsIgnoreCase(trimmedName).first();
      if (existingGroup && existingGroup.id !== renamingGroupData.id) {
        message.error('该分组名称已存在，请使用其他名称。');
        return;
      }

      // 执行更新
      const updatedCount = await db.groups.update(renamingGroupData.id, { name: trimmedName });
      
      // 根据影响的行数判断是否成功
      if (updatedCount > 0) {
        triggerArticleListRefresh();
        message.success("分组已重命名");
      } else {
        // 这种情况很少见，但可能发生（例如，在另一处删除了该分组）
        message.error("重命名失败，未找到该分组。");
      }
    } catch (error) {
      console.error("重命名分组失败:", error);
      message.error("重命名失败，发生未知错误。");
    } finally {
      setIsRenameGroupModalVisible(false);
      setRenamingGroupData(null);
      setNewGroupName('');
    }
  };
  
  const handleDeleteGroupWithConfirmation = (groupId: string, groupName: string) => {
    if (!db) return;
    Modal.confirm({
      title: `确认删除分组 "${groupName}"?`,
      icon: <ExclamationCircleOutlined />,
      content: '删除分组后，其中的所有订阅源将被移动到根目录（无分组状态）。此操作无法撤销。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await db.transaction('rw', db.feeds, db.groups, async () => {
            const feedsInGroup = await db.feeds.where('groupId').equals(groupId).toArray();
            
            // 将这些订阅源移动到默认分组（无分组）
            for (const feed of feedsInGroup) {
              await db.feeds.update(feed.id!, { groupId: null });
            }

            // 删除分组
            await db.groups.delete(groupId);
          });
          triggerArticleListRefresh();
          if (selectedKeys[0] === `group-${groupId}`) {
            navigate('/');
          }
          message.success(`分组 "${groupName}" 已删除，其下的订阅源已移至默认分组。`);
        } catch (error) {
          console.error(`Error deleting group ${groupId}:`, error);
          Modal.error({ title: '删除分组失败', content: `删除分组时发生错误。`});
        }
      },
    });
  };

  const handleMarkAllAsReadForFeed = async (feedId: string, feedTitle: string) => {
    if (!db) return;
    Modal.confirm({
      title: `将 "${feedTitle}" 下所有文章标为已读?`,
      icon: <CheckCircleOutlined />,
      content: '此操作会影响未读计数，但不会删除文章。',
      okText: '全部标为已读',
      cancelText: '取消',
      onOk: async () => {
        try {
          const articlesToUpdate = await db.articles.where({ sourceId: feedId, isRead: 'false' }).toArray();
          if (articlesToUpdate.length > 0) {
            const idsToUpdate = articlesToUpdate.map(a => a.id);
            await db.articles.where('id').anyOf(idsToUpdate).modify({ isRead: 'true' });
            await db.feeds.update(feedId, { unreadCount: 0 });
            triggerArticleListRefresh();
            message.success(`"${feedTitle}" 下 ${articlesToUpdate.length} 篇文章已标为已读。`);
          } else {
            message.info(`"${feedTitle}" 没有未读文章。`);
          }
        } catch (error) {
          console.error('标记全部已读失败:', error);
          message.error('操作失败，请重试。');
        }
      },
    });
  };
  
  const handleMarkAllAsReadForGroup = async (gId: string, gName: string) => {
    if(!db) return;
    Modal.confirm({
        title: `将分组 "${gName}" 下所有文章标为已读?`,
        icon: <CheckCircleOutlined />,
        content: '此操作会影响该分组下所有订阅源的未读计数。',
        okText: '全部标为已读',
        cancelText: '取消',
        onOk: async () => {
            try {
                const feedsInGroup = await db.feeds.where('groupId').equals(gId).toArray();
                let totalMarked = 0;
                for (const feed of feedsInGroup) {
                    if (typeof feed.id === 'string') {
                        const articlesToUpdate = await db.articles.where({ sourceId: feed.id, isRead: 'false' }).toArray();
                        if (articlesToUpdate.length > 0) {
                            const idsToUpdate = articlesToUpdate.map(a => a.id);
                            await db.articles.where('id').anyOf(idsToUpdate).modify({ isRead: 'true' });
                            await db.feeds.update(feed.id, { unreadCount: 0 });
                            totalMarked += articlesToUpdate.length;
                        }
                    }
                }
                triggerArticleListRefresh();
                if (totalMarked > 0) {
                    message.success(`分组 "${gName}" 下 ${totalMarked} 篇文章已标为已读。`);
                } else {
                    message.info(`分组 "${gName}" 没有未读文章。`);
                }
            } catch (error) {
                console.error('标记分组全部已读失败:', error);
                message.error('操作失败，请重试。');
            }
        },
    });
  };
  
  const showEditFeedModal = (feed: FeedSource) => {
    setEditingFeedData(feed);
    setIsEditFeedModalVisible(true);
  };
  
  const handleEditFeedSuccess = (updatedFeed: FeedSource) => {
    triggerArticleListRefresh();
    setIsEditFeedModalVisible(false);
    setEditingFeedData(null);
  };

  const handleEditFeedCancel = () => {
    setIsEditFeedModalVisible(false);
    setEditingFeedData(null);
  };

  const createFeedMenuItems = (feed: FeedSource): MenuProps['items'] => [
    { key: 'sync', label: '立即刷新', icon: <SyncOutlined spin={refreshingFeedId === feed.id} />, onClick: () => feed.id && handleRefreshFeed(feed.id) },
    { key: 'mark-all-read', label: '标记已读', icon: <CheckCircleOutlined />, onClick: () => feed.id && handleMarkAllAsReadForFeed(feed.id, feed.title) },
    { type: 'divider' },
    { key: 'edit', label: '编辑', icon: <SettingOutlined />, onClick: () => showEditFeedModal(feed) },
    { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => feed.id && handleDeleteFeed(feed.id) },
  ];

  const createGroupMenuItems = (group: Group, hasUnreads: boolean): MenuProps['items'] => {
    const items: MenuProps['items'] = [
      { key: 'mark-all-read', label: '标记已读', icon: <CheckCircleOutlined />, disabled: !hasUnreads, onClick: () => group.id && handleMarkAllAsReadForGroup(group.id, group.name) },
      { key: 'rename', label: '重命名', icon: <EditOutlined />, onClick: () => showRenameGroupModal(group) },
      { type: 'divider' },
      { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => group.id && handleDeleteGroupWithConfirmation(group.id, group.name) },
    ];
    return items;
  };

  const createTopicMenuItems = (topic: Topic, hasUnreads: boolean): MenuProps['items'] => {
    return [
      {
        key: 'edit',
        label: '编辑主题',
        icon: <EditOutlined />,
        onClick: (e) => {
          e.domEvent.stopPropagation();
          handleEditTopic(topic);
        }
      },
      {
        key: 'rules',
        label: '阅读偏好',
        icon: <FilterOutlined />,
        onClick: (e) => {
          e.domEvent.stopPropagation();
          handleEditTopic(topic, '2'); // 直接打开第二个标签页
        }
      },
      { type: 'divider' },
      { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => topic.id && handleDeleteTopic(topic.id, topic.name) },
    ];
  };

  // 处理主题下所有文章标记为已读
  const handleMarkAllAsReadForTopic = async (tId: string, tName: string) => {
    if(!db) return;
    
    // 获取与该主题关联的所有订阅源ID
    const feedIds = topicFeeds.get(tId) || [];
    if (feedIds.length === 0) {
      message.info(`主题 "${tName}" 下没有订阅源。`);
      return;
    }
    
    Modal.confirm({
      title: `将主题 "${tName}" 下所有文章标为已读?`,
      icon: <CheckCircleOutlined />,
      content: '此操作会影响该主题下所有订阅源的未读计数。',
      okText: '全部标为已读',
      cancelText: '取消',
      onOk: async () => {
        try {
          let totalMarked = 0;
          
          // 遍历该主题下的所有订阅源
          for (const feedId of feedIds) {
            const articlesToUpdate = await db.articles.where({ sourceId: feedId, isRead: 'false' }).toArray();
            if (articlesToUpdate.length > 0) {
              const idsToUpdate = articlesToUpdate.map(a => a.id);
              await db.articles.where('id').anyOf(idsToUpdate).modify({ isRead: 'true' });
              
              // 使用精确查询获取真实的未读数量
              const actualUnreadCount = await db.articles
                .where({ sourceId: feedId, isRead: 'false' })
                .filter(article => article.isHidden !== true)
                .count();
                
              await db.feeds.update(feedId, { unreadCount: actualUnreadCount });
              totalMarked += articlesToUpdate.length;
            }
          }
          
          // 强制刷新计数和文章列表
          triggerArticleListRefresh();
          setRefreshKey(prev => prev + 1);
          
          if (totalMarked > 0) {
            message.success(`主题 "${tName}" 下 ${totalMarked} 篇文章已标为已读。`);
          } else {
            message.info(`主题 "${tName}" 没有未读文章。`);
          }
        } catch (error) {
          console.error('标记主题全部已读失败:', error);
          message.error('操作失败，请重试。');
        }
      },
    });
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (feedsFromProps.length === 0) {
    return null;
  }
  
  const sortedGroups = [...groupsFromProps].sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  const feedsWithoutGroup = processedFeeds.filter(f => !f.groupId).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  const sortedTopics = [...topics].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const renderFeeds = (feedList: FeedSource[], isGrouped: boolean) => {
    return feedList.map(feed => {
      if (typeof feed.id === 'undefined') return null;
      const feedKey = `feed-${feed.id}`;
      const count = dynamicCounts.get(feed.id) ?? 0;
      
      // 使用缓存检查图标是否已知错误
      const hasIconError = iconErrorCache.get(feed.id) || false;
      
      // 图标加载错误处理函数
      const handleIconError = () => {
        if (feed.id) {
          iconErrorCache.set(feed.id, true);
          // 强制重新渲染
          setRefreshKey(prev => prev + 1);
        }
        return false; // 防止默认错误处理
      };
      
      return (
        <div 
          key={feedKey}
          className={`${styles.feedItemWrapper} ${selectedKeys.includes(feedKey) ? styles.selected : ''}`}
          onClick={() => handleSelect(feedKey)}
        >
          <Dropdown menu={{ items: createFeedMenuItems(feed) }} trigger={['contextMenu']} getPopupContainer={triggerNode => triggerNode.parentElement!}>
            <div
              className={styles.feedItem}
              onContextMenu={(e) => e.stopPropagation()}
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
    });
  };

  return (
    <div className={styles.feedListContainer}>
      {/* 订阅分组 */}
      {sortedGroups.map((group, index) => {
        const groupKey = `group-${group.id}`;
        const isExpanded = expandedKeys.includes(groupKey);
        const feedsInGroup = processedFeeds
          .filter(f => f.groupId === group.id)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const groupTotalCount = feedsInGroup.reduce((total, feed) => {
          return total + (dynamicCounts.get(feed.id!) ?? 0);
        }, 0);
        const hasUnreads = groupTotalCount > 0;

        return (
          <Dropdown key={groupKey} menu={{ items: createGroupMenuItems(group, hasUnreads) }} trigger={['contextMenu']}>
            <div>
              <div
                className={`${styles.groupItem} ${selectedKeys.includes(groupKey) ? styles.selected : ''}`}
                onClick={() => handleSelect(groupKey)}
              >
                <div
                  className={`${styles.expanderIcon} ${isExpanded ? styles.expanded : ''}`}
                  onClick={(e) => handleGroupExpanderClick(e, groupKey)}
                >
                  <RightOutlined />
                </div>
                <span className={styles.title}>{group.name}</span>
                {hasUnreads && <span className={styles.count}>{groupTotalCount}</span>}
              </div>

              {isExpanded && (
                <div className={styles.feedListWrapper}>
                  {renderFeeds(feedsInGroup, true)}
                </div>
              )}
            </div>
          </Dropdown>
        );
      })}
      
      {(feedsWithoutGroup.length > 0 || sortedGroups.length > 0) && 
        sortedTopics.length > 0 && <div className={styles.separator} />}
      
      {/* 主题阅读部分 */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>主题阅读</span>
        <Button 
          type="text" 
          size="small" 
          className={styles.addButton}
          icon={<PlusOutlined />} 
          onClick={handleAddTopic}
        />
      </div>
      
      {sortedTopics.map(topic => {
        if (!topic.id) return null;
        const topicKey = `topic-${topic.id}`;
        const count = topicCounts.get(topic.id) ?? 0;
        const hasUnreads = count > 0;
        const TopicIcon = getIconByName(topic.iconName);
        
        return (
          <Dropdown key={topicKey} menu={{ items: createTopicMenuItems(topic, hasUnreads) }} trigger={['contextMenu']}>
            <div
              className={`${styles.topicItem} ${selectedKeys.includes(topicKey) ? styles.selected : ''}`}
              onClick={() => handleSelect(topicKey)}
            >
              <TopicIcon className={styles.topicIcon} />
              <span className={styles.title}>{topic.name}</span>
              {hasUnreads && <span className={styles.count}>{count}</span>}
            </div>
          </Dropdown>
        );
      })}

      {feedsWithoutGroup.length > 0 && sortedGroups.length > 0 && <div className={styles.separator} />}

      {renderFeeds(feedsWithoutGroup, false)}

      <Modal
        title="重命名分组"
        open={isRenameGroupModalVisible}
        onOk={handleRenameGroupOk}
        onCancel={() => setIsRenameGroupModalVisible(false)}
      >
        <Input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onPressEnter={handleRenameGroupOk}
        />
      </Modal>

      {editingFeedData && (
        <EditFeedModal
          feed={editingFeedData}
          open={isEditFeedModalVisible}
          groups={groupsFromProps}
          onSuccess={handleEditFeedSuccess}
          onCancel={handleEditFeedCancel}
        />
      )}
      
      <AddTopicModal
        visible={isAddTopicModalVisible}
        onClose={() => setIsAddTopicModalVisible(false)}
        onSuccess={handleTopicSuccess}
        editingTopic={editingTopic}
        initialActiveTab={initialActiveTab}
      />
    </div>
  );
};

export default FeedList; 