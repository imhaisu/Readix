import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { List, Card, Empty, Skeleton, Badge, Tooltip, Avatar, Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import { 
  StarOutlined, 
  StarFilled, 
  ClockCircleOutlined, 
  GlobalOutlined, 
  FileImageOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CopyOutlined
} from '@ant-design/icons';
import { format, isToday, formatDistanceToNowStrict, isYesterday } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useDatabase } from '../contexts/DatabaseContext';
import { Article, FeedSource } from '../contexts/DatabaseContext';
import { processIconUrl } from '../utils/iconUtils';
import styles from './ArticleList.module.css';
import Dexie from 'dexie'; // 引入 Dexie 以便使用类型 (取消注释)
import { Settings, defaultSettings } from '../types/settings';

// 自定义 hook，用于获取前一个 props/state 的值
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

interface ArticleListProps {
  viewMode: 'list' | 'card' | 'magazine' | 'compact';
  filter: any; // 过滤条件, HomePage.getArticleFilter() 返回的对象
  searchTerm?: string; // 新增 searchTerm prop (可选)
  onSelectArticle: (articleId: string) => void;
  selectedArticleId: string | null;
  // 新增一个 prop 来处理"今日"这个特殊情况，因为 HomePage.getArticleFilter 对"今日"的处理是返回一个 publishDate 的范围
  // 但 ArticleList 可能需要更明确的指示，或者 HomePage 直接传递一个更通用的 filter 对象
  // 为了简单起见，我们先假设 filter 包含了所有情况，对于"今日"，ArticleList 自己再判断一下
  isTodayView?: boolean; 
  currentFeedId?: string; // 新增
  currentGroupId?: string; // 新增
  lastUpdatedArticleInfo?: { id: string, changes: Partial<Article> } | null; // 新增 prop
  listRefreshKey?: number; // 新增 prop
}

// 辅助函数：格式化日期
const formatDate = (date: number | Date): string => {
  const d = new Date(date);
  return format(d, 'yyyy-MM-dd HH:mm');
};

// 辅助函数：从 HTML 内容中提取第一张图片
const extractFirstImage = (htmlContent: string): string | null => {
  if (!htmlContent) return null;
  const imgRegex = /<img[^>]+src="([^">]+)"/;
  const match = htmlContent.match(imgRegex);
  return match ? match[1] : null;
};

// 辅助函数：从 HTML 内容中提取第一段的纯文本
const extractFirstParagraphText = (htmlContent: string): string | null => {
  if (!htmlContent) return null;
  try {
    // 使用 DOMParser 解析 HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // 查找第一个 <p> 标签
    const firstParagraph = doc.querySelector('p');
    if (firstParagraph && firstParagraph.textContent) {
      return firstParagraph.textContent.trim();
    }
    
    // 如果没有 <p>，尝试从 body 中提取纯文本并截取一部分作为摘要
    if (doc.body && doc.body.textContent) {
        const text = doc.body.textContent.trim().replace(/\s+/g, ' '); // 替换多个空白为一个空格
        // 尝试找到一个自然的断点，比如句号，或者固定长度
        const sentenceEnd = text.indexOf('.');
        if (sentenceEnd > 0 && sentenceEnd < 150) { // 150 是一个大致的长度限制
            return text.substring(0, sentenceEnd + 1);
        }
        return text.substring(0, 120) + (text.length > 120 ? '...' : ''); // 截取前120个字符
    }
  } catch (e) {
    console.error("Error parsing HTML for summary extraction:", e);
  }
  return null;
};

// 辅助函数：格式化日期和时间
const formatDateTime = (date: number | Date): string => {
  const d = new Date(date);
  return format(d, 'MM-dd HH:mm', { locale: zhCN });
};

export interface ArticleListHandle {
  scrollToTop: () => void;
  getScrollableElement: () => HTMLDivElement | null;
}

const ArticleList = forwardRef<ArticleListHandle, ArticleListProps>(({ 
  viewMode, 
  filter, 
  searchTerm, // 接收 searchTerm
  onSelectArticle,
  selectedArticleId,
  isTodayView, // 接收 isTodayView
  currentFeedId, // 接收
  currentGroupId, // 接收
  lastUpdatedArticleInfo, // 接收 prop
  listRefreshKey // 接收 prop
}, ref) => {
  console.log('[ArticleList] Component rendered or re-rendered. Current filter:', filter, 'Key:', listRefreshKey);
  const { db, isInitialized, triggerRefresh } = useDatabase();
  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<Article[]>([]); // 重命名回 articles, 移除 displayedArticles 和 allArticlesForCurrentContext
  const [feedInfoMap, setFeedInfoMap] = useState<Map<string, FeedSource>>(new Map());
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false); // 添加初始加载标志
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 重新定义 prev* 变量
  const prevFilter = usePrevious(filter);
  const prevSearchTerm = usePrevious(searchTerm);
  const prevCurrentFeedId = usePrevious(currentFeedId);
  const prevCurrentGroupId = usePrevious(currentGroupId);
  const prevListRefreshKey = usePrevious(listRefreshKey);
  // prevIsTodayView 似乎没有在 effect 内部的比较逻辑中使用，如果确实不用可以考虑移除
  // const prevIsTodayView = usePrevious(isTodayView);

  // 键盘事件处理函数
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 如果没有选中的文章或者文章列表为空，不处理键盘事件
    if (!selectedArticleId || articles.length === 0) return;

    const currentIndex = articles.findIndex(article => article.id === selectedArticleId);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;

    if (event.key === 'ArrowUp') {
      // 上键：选择上一篇文章
      nextIndex = currentIndex > 0 ? currentIndex - 1 : articles.length - 1; // 循环到最后一篇
      event.preventDefault(); // 防止页面滚动
    } else if (event.key === 'ArrowDown') {
      // 下键：选择下一篇文章
      nextIndex = currentIndex < articles.length - 1 ? currentIndex + 1 : 0; // 循环到第一篇
      event.preventDefault(); // 防止页面滚动
    } else {
      return; // 其他键不处理
    }

    const nextArticle = articles[nextIndex];
    if (nextArticle) {
      onSelectArticle(nextArticle.id);
      
      // 自动滚动到选中的文章
      const articleElement = containerRef.current?.querySelector(`[data-article-id="${nextArticle.id}"]`) as HTMLElement;
      if (articleElement) {
        articleElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, [selectedArticleId, articles, onSelectArticle]);

  // 添加键盘事件监听
  useEffect(() => {
    const handleKeyDownEvent = (event: KeyboardEvent) => {
      // 只有当焦点在列表容器内或者没有其他输入元素获得焦点时才处理键盘事件
      const activeElement = document.activeElement;
      const isInputFocused = activeElement instanceof HTMLInputElement || 
                           activeElement instanceof HTMLTextAreaElement ||
                           activeElement?.tagName === 'INPUT' ||
                           activeElement?.tagName === 'TEXTAREA';
      
      if (!isInputFocused) {
        handleKeyDown(event);
      }
    };

    document.addEventListener('keydown', handleKeyDownEvent);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDownEvent);
    };
  }, [handleKeyDown]);

  // 当组件挂载时，给容器设置 tabIndex 以便能够接收焦点
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.setAttribute('tabIndex', '0');
    }
  }, []);

  // 恢复处理 lastUpdatedArticleInfo 的 useEffect
  useEffect(() => {
    if (lastUpdatedArticleInfo && lastUpdatedArticleInfo.id) {
      console.log('[ArticleList] lastUpdatedArticleInfo triggered:', lastUpdatedArticleInfo);
      setArticles(prevArticles => {
        const newArticles = prevArticles.map(article =>
          article.id === lastUpdatedArticleInfo.id
            ? { ...article, ...lastUpdatedArticleInfo.changes }
            : article
        );
        console.log('[ArticleList] Articles after lastUpdatedArticleInfo update:', newArticles.find(a => a.id === lastUpdatedArticleInfo.id), 'All count:', newArticles.length);
        return newArticles;
      });
    }
  }, [lastUpdatedArticleInfo]);

  // Main data loading effect
  useEffect(() => {
    if (!isInitialized || !db) return;

    const loadArticles = async () => {
      const hasFilterChanged = JSON.stringify(filter) !== JSON.stringify(prevFilter);
      const hasSearchTermChanged = searchTerm !== prevSearchTerm;
      const hasFeedIdChanged = currentFeedId !== prevCurrentFeedId;
      const hasGroupIdChanged = currentGroupId !== prevCurrentGroupId;
      const hasListRefreshKeyChanged = listRefreshKey !== prevListRefreshKey;

      const isInitialLoad = !hasInitialLoaded;
      const isInitialLoadOrCriticalChange = 
        isInitialLoad || 
        hasFilterChanged || 
        hasSearchTermChanged || 
        hasFeedIdChanged ||
        hasGroupIdChanged ||
        hasListRefreshKeyChanged;

      if (isInitialLoadOrCriticalChange) {
        console.log('[ArticleList] Performing hard refresh. Reason:');
        if (isInitialLoad) console.log('  - Initial load (hasInitialLoaded === false)');
        if (hasFilterChanged) console.log('  - Filter changed', { prev: prevFilter, current: filter });
        if (hasSearchTermChanged) console.log('  - Search term changed', { prev: prevSearchTerm, current: searchTerm });
        if (hasFeedIdChanged) console.log('  - FeedId changed', { prev: prevCurrentFeedId, current: currentFeedId });
        if (hasGroupIdChanged) console.log('  - GroupId changed', { prev: prevCurrentGroupId, current: currentGroupId });
        if (hasListRefreshKeyChanged) console.log('  - ListRefreshKey changed', { prev: prevListRefreshKey, current: listRefreshKey });
        setLoading(true);
        
        // 标记已经进行过初始加载
        if (isInitialLoad) {
          setHasInitialLoaded(true);
        }
        
        // 如果是关键变化（非初始加载），重置初始加载标志以便下次能正确处理
        if (!isInitialLoad && (hasFilterChanged || hasFeedIdChanged || hasGroupIdChanged)) {
          setHasInitialLoaded(true); // 确保标志保持正确状态
        }
      } else {
        return; 
      }
      
      console.log('[ArticleList] loadArticles: Starting DB query with filter object:', JSON.stringify(filter));
      try {
        let query;
        
        // 1. 处理日期范围 (首先检查 fetchDate, 然后是 publishDate)
        if (filter && filter.fetchDate && typeof filter.fetchDate === 'object' && 
            filter.fetchDate.hasOwnProperty('$gte') && filter.fetchDate.hasOwnProperty('$lte')) {
          console.log('[ArticleList] Applying fetchDate range:', filter.fetchDate);
          query = db.articles.where('fetchDate').between(filter.fetchDate.$gte, filter.fetchDate.$lte, true, true);
          
          // 应用其他可能的筛选条件 (isRead, isStarred)
          const { fetchDate, ...otherFilters } = filter;
          if (otherFilters.isRead === 'true' || otherFilters.isRead === 'false') {
            query = query.and((article: Article) => article.isRead === otherFilters.isRead);
          }
          if (otherFilters.isStarred === 'true') {
            query = query.and((article: Article) => article.isStarred === otherFilters.isStarred);
          }
        } else if (filter && filter.publishDate && typeof filter.publishDate === 'object' && 
            filter.publishDate.hasOwnProperty('$gte') && filter.publishDate.hasOwnProperty('$lte')) {
          console.log('[ArticleList] Applying publishDate range:', filter.publishDate);
          query = db.articles.where('publishDate').between(filter.publishDate.$gte, filter.publishDate.$lte, true, true);
          
          const { publishDate, ...otherFilters } = filter;
          if (otherFilters.isRead === 'true' || otherFilters.isRead === 'false') {
            query = query.and((article: Article) => article.isRead === otherFilters.isRead);
          }
          if (otherFilters.isStarred === 'true') {
            query = query.and((article: Article) => article.isStarred === otherFilters.isStarred);
          }
        } else {
          // 2. 如果没有日期范围，处理其他条件
          const conditionsForWhere: any = {};
          if (currentFeedId) {
            conditionsForWhere.sourceId = currentFeedId;
            if (filter && filter.isRead !== undefined) conditionsForWhere.isRead = String(filter.isRead);
            if (filter && filter.isStarred === 'true') conditionsForWhere.isStarred = 'true';
            query = db.articles.where(conditionsForWhere);
          } else if (currentGroupId) {
            const feedsInGroup = await db.feeds.where('groupId').equals(currentGroupId).toArray();
            const feedIdsInGroup = feedsInGroup.map(f => f.id).filter((id): id is string => !!id);
            if (feedIdsInGroup.length > 0) {
              query = db.articles.where('sourceId').anyOf(feedIdsInGroup);
              if (filter && filter.isRead !== undefined) {
                query = query.and((article: Article) => article.isRead === String(filter.isRead));
              }
              if (filter && filter.isStarred === 'true') {
                query = query.and((article: Article) => article.isStarred === 'true');
              }
            } else {
              setArticles([]);
              setLoading(false);
              return;
            }
          } else if (filter && (filter.isRead !== undefined || filter.isStarred === 'true')) {
            if (filter.isRead !== undefined) conditionsForWhere.isRead = String(filter.isRead);
            if (filter.isStarred === 'true') conditionsForWhere.isStarred = 'true';
            if (Object.keys(conditionsForWhere).length > 0) {
                 query = db.articles.where(conditionsForWhere);
            } else {
                 query = db.articles.toCollection(); 
            }
          } else {
            query = db.articles.toCollection();
          }
        }
        
        if (!query) { 
            console.warn("[ArticleList] Query was not constructed. Defaulting to all articles.");
            query = db.articles.toCollection();
        }
        
        const articlesFromDb = await (query as Dexie.Collection<Article, string>).toArray(); 

        let fetchedArticles: Article[];
        if (searchTerm && searchTerm.trim() !== '') {
          const lowerSearchTerm = searchTerm.toLowerCase();
          fetchedArticles = articlesFromDb.filter((article: Article) =>
            article.title.toLowerCase().includes(lowerSearchTerm) ||
            (!!(article.author && article.author.toLowerCase().includes(lowerSearchTerm))) ||
            (!!(article.summary && typeof article.summary === 'string' && article.summary.toLowerCase().includes(lowerSearchTerm))) ||
            (!!(article.contentText && article.contentText.toLowerCase().includes(lowerSearchTerm)))
          );
        } else {
          fetchedArticles = articlesFromDb;
        }

        fetchedArticles.sort((a: Article, b: Article) => {
          // publishDate 现在是时间戳，可以直接比较
          // 默认按 publishDate 降序排序，如果需要按 fetchDate 排序，可以在调用处或根据视图类型调整
          return b.publishDate - a.publishDate;
        });

        console.log('[ArticleList] loadArticles: Fetched articles count:', fetchedArticles.length);
        setArticles(fetchedArticles);

        if (fetchedArticles.length > 0) {
          const sourceIds = [...new Set(fetchedArticles.map(article => article.sourceId).filter(id => !!id))];
          if (sourceIds.length > 0) {
            const feeds = await db.feeds.where('id').anyOf(sourceIds).toArray();
            const newFeedInfoMap = new Map<string, FeedSource>();
            
            // 处理每个订阅源的图标
            for (const feed of feeds) {
              if (feed && feed.id) {
                const processedIconUrl = await processIconUrl(feed.iconUrl);
                const processedFeed = { ...feed, iconUrl: processedIconUrl };
                newFeedInfoMap.set(feed.id, processedFeed);
              }
            }
            
            setFeedInfoMap(newFeedInfoMap);
          } else {
            setFeedInfoMap(new Map());
          }
        } else {
          setFeedInfoMap(new Map());
        }

      } catch (error) {
        console.error('获取文章失败:', error);
        setArticles([]);
        
        // 如果是数据库连接问题，记录错误但不尝试重新初始化
        if (error && typeof error === 'object' && 'name' in error) {
          const errorName = (error as any).name;
          if (errorName === 'DatabaseError' || errorName === 'InvalidStateError' || errorName === 'NotFoundError' || errorName === 'DatabaseClosedError') {
            console.log('[ArticleList] 检测到数据库连接问题:', errorName);
            // 不在这里触发重新初始化，避免循环
          }
        }
      } finally {
        if (isInitialLoadOrCriticalChange) {
            setLoading(false);
        }
      }
    };

    loadArticles();
  }, [
    db, isInitialized, filter, currentGroupId, currentFeedId, 
    searchTerm, listRefreshKey // 正确的依赖项
  ]);

  const handleArticleClick = async (articleId: string) => {
    onSelectArticle(articleId);
    const articleIndex = articles.findIndex(a => a.id === articleId);
    if (articleIndex === -1) return;
    const articleToUpdate = articles[articleIndex];

    if (articleToUpdate.isRead === 'false') {
      try {
        if (db) {
          console.log(`[ArticleList] handleArticleClick: Marking article ${articleId} as read in DB.`);
          await db.articles.update(articleId, { isRead: 'true' });
          const updatedArticles = [...articles];
          updatedArticles[articleIndex] = { ...articleToUpdate, isRead: 'true' };
          console.log('[ArticleList] handleArticleClick: Local articles updated. Clicked article:', updatedArticles[articleIndex], 'All count:', updatedArticles.length);
          setArticles(updatedArticles);

          if (articleToUpdate.sourceId) {
            const feed = feedInfoMap.get(articleToUpdate.sourceId) || await db.feeds.get(articleToUpdate.sourceId);
            if (feed && typeof feed.unreadCount === 'number' && feed.unreadCount > 0) {
              const newUnreadCount = await db.articles.where({ sourceId: articleToUpdate.sourceId, isRead: 'false'}).count();
              if (feed.id) {
                await db.feeds.update(feed.id, { unreadCount: newUnreadCount });
              console.log(`[ArticleList] handleArticleClick: Feed ${articleToUpdate.sourceId} unread count updated to ${newUnreadCount} in DB.`);
              }
            }
          }
        }
        // triggerRefresh();
      } catch (error) {
        console.error("Error marking article as read:", error);
      }
    }
  };

  // 右键菜单功能函数
  const handleToggleRead = async (articleId: string) => {
    if (!db) return;
    
    const articleIndex = articles.findIndex(a => a.id === articleId);
    if (articleIndex === -1) return;
    const article = articles[articleIndex];
    
    const newReadStatus = article.isRead === 'true' ? 'false' : 'true';
    
    try {
      await db.articles.update(articleId, { isRead: newReadStatus });
      
      // 更新本地state
      const updatedArticles = [...articles];
      updatedArticles[articleIndex] = { ...article, isRead: newReadStatus };
      setArticles(updatedArticles);
      
      // 同步更新feeds的未读计数
      if (article.sourceId) {
        const newUnreadCount = await db.articles
          .where({ sourceId: article.sourceId, isRead: 'false' })
          .count();
        await db.feeds.update(article.sourceId, { unreadCount: newUnreadCount });
      }
      
      message.success(newReadStatus === 'true' ? '已标记为已读' : '已标记为未读');
    } catch (error) {
      console.error('更新文章已读状态失败:', error);
      message.error('操作失败');
    }
  };

  const handleToggleStar = async (articleId: string) => {
    if (!db) return;
    
    const article = articles.find(a => a.id === articleId);
    if (!article) return;

    const newIsStarred = article.isStarred === 'true' ? 'false' : 'true';
    
    try {
      await db.articles.update(articleId, { isStarred: newIsStarred });
      
      // 更新本地状态
      setArticles(prevArticles => 
        prevArticles.map(a => 
          a.id === articleId ? { ...a, isStarred: newIsStarred } : a
        )
      );

      message.success(newIsStarred === 'true' ? '已添加到收藏' : '已取消收藏');
      triggerRefresh(); // 正确的函数名
    } catch (error) {
      console.error('更新文章收藏状态失败:', error);
      message.error('操作失败');
    }
  };

  const handleMarkAboveAsRead = async (articleId: string) => {
    if (!db) return;
    
    const currentIndex = articles.findIndex(a => a.id === articleId);
    if (currentIndex === -1) return;

    const articlesToMark = articles.slice(0, currentIndex).filter(a => a.isRead === 'false');
    
    if (articlesToMark.length === 0) {
      message.info('上方没有未读文章');
      return;
    }

    try {
      const articleIds = articlesToMark.map(a => a.id);
      await db.articles.where('id').anyOf(articleIds).modify({ isRead: 'true' });
      
      // 更新本地状态
      setArticles(prevArticles => 
        prevArticles.map(a => 
          articleIds.includes(a.id) ? { ...a, isRead: 'true' } : a
        )
      );

      // 更新对应订阅源的未读计数
      const affectedFeeds = new Set(articlesToMark.map(a => a.sourceId).filter(Boolean));
      for (const feedId of affectedFeeds) {
        if (feedId) {
          const newUnreadCount = await db.articles.where({ sourceId: feedId, isRead: 'false' }).count();
          const feedInfo = feedInfoMap.get(feedId);
          if (feedInfo && feedInfo.id) {
            await db.feeds.update(feedInfo.id, { unreadCount: newUnreadCount });
          }
        }
      }

      message.success(`已标记上方 ${articlesToMark.length} 篇文章为已读`);
      triggerRefresh(); // 正确的函数名
    } catch (error) {
      console.error('批量标记文章为已读失败:', error);
      message.error('操作失败');
    }
  };

  const handleMarkBelowAsRead = async (articleId: string) => {
    if (!db) return;
    
    const currentIndex = articles.findIndex(a => a.id === articleId);
    if (currentIndex === -1) return;

    const articlesToMark = articles.slice(currentIndex + 1).filter(a => a.isRead === 'false');
    
    if (articlesToMark.length === 0) {
      message.info('下方没有未读文章');
      return;
    }

    try {
      const articleIds = articlesToMark.map(a => a.id);
      await db.articles.where('id').anyOf(articleIds).modify({ isRead: 'true' });
      
      // 更新本地状态
      setArticles(prevArticles => 
        prevArticles.map(a => 
          articleIds.includes(a.id) ? { ...a, isRead: 'true' } : a
        )
      );

      // 更新对应订阅源的未读计数
      const affectedFeeds = new Set(articlesToMark.map(a => a.sourceId).filter(Boolean));
      for (const feedId of affectedFeeds) {
        if (feedId) {
          const newUnreadCount = await db.articles.where({ sourceId: feedId, isRead: 'false' }).count();
          const feedInfo = feedInfoMap.get(feedId);
          if (feedInfo && feedInfo.id) {
            await db.feeds.update(feedInfo.id, { unreadCount: newUnreadCount });
          }
        }
      }

      message.success(`已标记下方 ${articlesToMark.length} 篇文章为已读`);
      triggerRefresh(); // 正确的函数名
    } catch (error) {
      console.error('批量标记文章为已读失败:', error);
      message.error('操作失败');
    }
  };

  const handleCopyLink = async (articleUrl: string) => {
    try {
      await navigator.clipboard.writeText(articleUrl);
      message.success('链接已复制到剪贴板');
    } catch (error) {
      console.error('复制链接失败:', error);
      message.error('复制失败');
    }
  };

  // 创建右键菜单项
  const createContextMenuItems = (article: Article): MenuProps['items'] => [
    {
      key: 'read',
      label: article.isRead === 'true' ? '标记为未读' : '标记为已读',
      icon: article.isRead === 'true' ? <EyeOutlined /> : <CheckCircleOutlined />,
      onClick: () => handleToggleRead(article.id)
    },
    {
      key: 'star',
      label: article.isStarred === 'true' ? '取消收藏' : '收藏',
      icon: article.isStarred === 'true' ? <StarFilled /> : <StarOutlined />,
      onClick: () => handleToggleStar(article.id)
    },
    { type: 'divider' },
    {
      key: 'markAboveRead',
      label: '标记上方为已读',
      icon: <ArrowUpOutlined />,
      onClick: () => handleMarkAboveAsRead(article.id)
    },
    {
      key: 'markBelowRead',
      label: '标记下方为已读',
      icon: <ArrowDownOutlined />,
      onClick: () => handleMarkBelowAsRead(article.id)
    },
    { type: 'divider' },
    {
      key: 'copyLink',
      label: '复制链接',
      icon: <CopyOutlined />,
      onClick: () => handleCopyLink(article.url)
    }
  ];

  const renderContent = () => {
    if (loading && articles.length === 0) { // 使用 'articles'
      return (
        <List
          itemLayout="vertical"
          size="large"
          dataSource={Array(5).fill(undefined).map((_, index) => ({ id: `skeleton-${index}` }))}
          renderItem={(item) => (
            <List.Item key={item.id} className={styles.listItem}>
              <Skeleton active avatar paragraph={{ rows: viewMode === 'compact' ? 1 : 3 }} />
            </List.Item>
          )}
        />
      );
    }

    if (articles.length === 0 && !loading) { // 使用 'articles'
      const message = "没有文章"; // 简化消息，因为现在没有上下文筛选和底部筛选的区别
      return <Empty description={message} className={styles.emptyState} />;
    }

    const renderListItem = (article: Article) => {
      const feed = article.sourceId ? feedInfoMap.get(article.sourceId) : undefined;
      const articleSourceTitle = feed ? feed.title : '未知来源';
      const articleSourceIconUrl = feed ? feed.iconUrl : undefined;
      const isArticleSelected = selectedArticleId === article.id;

      const formattedDate = article.publishDate 
        ? formatDistanceToNowStrict(new Date(article.publishDate), { addSuffix: true, locale: zhCN })
        : '日期未知';

      const articleSummary = article.summary || extractFirstParagraphText(article.content) || article.contentText || '没有摘要';
      const articleImage = article.imageUrl || extractFirstImage(article.content);
      
      switch (viewMode) {
        case 'card':
          return (
            <Dropdown 
              key={article.id} 
              menu={{ items: createContextMenuItems(article) }} 
              trigger={['contextMenu']}
            >
              <Card 
                hoverable 
                className={[
                  styles.articleCardNew,
                  article.isRead === 'true' ? styles.readCard : '',
                  isArticleSelected ? styles.selectedCardNew : ''
                ].join(' ').trim()}
                onClick={() => handleArticleClick(article.id)}
                data-article-id={article.id}
                onContextMenu={(e) => e.stopPropagation()}
              >
              <div className={styles.cardHeaderNew}>
                {articleSourceIconUrl ? (
                  <Avatar src={articleSourceIconUrl} icon={<GlobalOutlined />} className={styles.sourceIcon} />
                ) : (
                  <Avatar icon={<GlobalOutlined />} className={styles.sourceIcon} />
                )}
                <span className={styles.sourceTitle}>{articleSourceTitle}</span>
                <span className={styles.updateTime}>{formattedDate}</span>
              </div>
              <div className={styles.cardBodyNew}>
                <div className={styles.cardContentNew}>
                    <h3 className={`${styles.articleTitleNew} ${article.isRead === 'true' ? styles.readTitle : styles.unreadTitle} ${styles['title-lines-2']}`}>
                        {article.title || '无标题'}
                    </h3>
                    {articleSummary !== '没有摘要' && 
                        <p className={`${styles.articleDescriptionNew} ${styles['desc-lines-2']}`}>
                            {articleSummary}
                        </p>
                    }
                </div>
                {articleImage && (
                    <div className={styles.cardImageContainerNew}>
                        <img src={articleImage} alt={article.title || '文章图片'} className={styles.cardImageNew}/>
                    </div>
                )}
              </div>
              </Card>
            </Dropdown>
          );

        case 'magazine':
            return (
              <Dropdown 
                key={article.id} 
                menu={{ items: createContextMenuItems(article) }} 
                trigger={['contextMenu']}
              >
                <List.Item 
                  className={`${styles.magazineItem} ${article.isRead === 'true' ? styles.read : styles.unread} ${isArticleSelected ? styles.selectedMagazine : ''}`}
                  onClick={() => handleArticleClick(article.id)}
                  data-article-id={article.id}
                  onContextMenu={(e) => e.stopPropagation()}
                >
                {articleImage && (
                  <div className={styles.magazineImage}>
                    <img src={articleImage} alt={article.title || '文章图片'} />
                  </div>
                )}
                <div className={styles.magazineContent}>
                    <div className={styles.feedInfo}>
                        {articleSourceIconUrl ? (
                            <Avatar size="small" src={articleSourceIconUrl} icon={<GlobalOutlined />} />
                        ) : (
                            <Avatar size="small" icon={<GlobalOutlined />} />
                        )}
                        <span className={styles.sourceName}>{articleSourceTitle}</span>
                        <span className={styles.publishDate}>{formattedDate}</span>
                    </div>
                    <div className={styles.magazineTitle}>{article.title || '无标题'}</div>
                    <div className={styles.magazineSummary}>{articleSummary.substring(0, 150)}...</div>
                </div>
                </List.Item>
              </Dropdown>
            );

        case 'compact':
          return (
            <Dropdown 
              key={article.id} 
              menu={{ items: createContextMenuItems(article) }} 
              trigger={['contextMenu']}
            >
              <List.Item 
                className={`${styles.compactItem} ${article.isRead === 'true' ? styles.read : styles.unread} ${isArticleSelected ? styles.selectedItem : ''}`}
                onClick={() => handleArticleClick(article.id)}
                data-article-id={article.id}
                onContextMenu={(e) => e.stopPropagation()}
              >
                <div >
                  <div >
                    {articleSourceIconUrl && <Avatar size="small" src={articleSourceIconUrl} icon={<GlobalOutlined />} />}
                    <span >{article.title || '无标题'}</span>
                  </div>
                  <div >
                    <span >{articleSourceTitle}</span>
                    <span >{formattedDate}</span>
                  </div>
                </div>
              </List.Item>
            </Dropdown>
          );
        
        case 'list':
        default:
          const isV5Unread = article.isRead === 'false';
          const v5ItemClasses = [
            styles.listItemV5,
            isV5Unread ? styles.unreadItemV5 : styles.readItemV5,
            isArticleSelected ? styles.selectedItemV5 : ''
          ].join(' ').trim();

          const v5DisplayTime = article.publishDate
            ? formatDistanceToNowStrict(new Date(article.publishDate), { addSuffix: true, locale: zhCN })
            : '日期未知';

          return (
            <Dropdown 
              key={article.id} 
              menu={{ items: createContextMenuItems(article) }} 
              trigger={['contextMenu']}
            >
              <div
                className={v5ItemClasses}
                onClick={() => handleArticleClick(article.id)}
                data-article-id={article.id}
                onContextMenu={(e) => e.stopPropagation()}
              >
                <div className={styles.mainTextContentV5}>
                  <div className={styles.itemHeaderV5}>
                    {articleSourceIconUrl ? (
                      <Avatar src={articleSourceIconUrl} className={styles.sourceIconV5} icon={<GlobalOutlined />} />
                    ) : (
                      <Avatar className={styles.sourceIconV5} icon={<GlobalOutlined />} />
                    )}
                    {articleSourceTitle && <span className={styles.sourceNameV5}>{articleSourceTitle}</span>}
                    {v5DisplayTime && <span className={styles.metaSeparator}>·</span>}
                    {v5DisplayTime && <span className={styles.timestampV5}>{v5DisplayTime}</span>}
                  </div>
                  <div className={styles.textContentV5}>
                    {(article.title || '无标题') &&
                      <h3 className={`${styles.titleV5} ${styles['title-lines-2']}`}>{article.title || '无标题'}</h3>
                    }
                    {(articleSummary && articleSummary !== '没有摘要') &&
                      <p className={`${styles.summaryV5} ${styles['desc-lines-2']}`}>{articleSummary}</p>
                    }
                  </div>
                </div>

                {articleImage && (
                  <div className={styles.imageContainerV5}>
                    <img src={articleImage} alt={article.title || '文章图片'} className={styles.imageV5} />
                  </div>
                )}
              </div>
            </Dropdown>
          );
      }
    };
    
    console.log('[ArticleList] Rendering with articles count:', articles.length, 'Loading:', loading);
    return (
      <div className={styles.scrollableArticleListContainer} ref={containerRef}> 
        {viewMode === 'card' ? (
          <div className={styles.cardContainerGridNew}> 
            {articles.map(article => renderListItem(article))}
          </div>
        ) : viewMode === 'list' || viewMode === 'compact' || viewMode === 'magazine' ? (
          articles.map(article => renderListItem(article))
        ) : (
          <List
            dataSource={articles}
            renderItem={renderListItem}
          />
        )}
      </div>
    );
  };

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
    },
    getScrollableElement: () => {
      return containerRef.current;
    }
  }));

  return renderContent();
});

export default ArticleList; 