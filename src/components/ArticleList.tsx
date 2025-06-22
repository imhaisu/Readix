import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { List, Card, Empty, Skeleton, Badge, Tooltip, Avatar, Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
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
  CopyOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { format, isToday, formatDistanceToNowStrict, isYesterday } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useDatabase } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { Article, FeedSource } from '../db/database';
import { processIconUrl } from '../utils/iconUtils';
import styles from './ArticleList.module.css';
import Dexie from 'dexie'; // 引入 Dexie 以便使用类型 (取消注释)
import { Settings, defaultSettings } from '../types/settings';
import PulsingLoader from './PulsingLoader';
import { updateUnreadCountOptimized } from '../utils/helpers';

// 自定义 hook，用于获取前一个 props/state 的值
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

interface ArticleListProps {
  filter: any; // 过滤条件, HomePage.getArticleFilter() 返回的对象
  searchTerm?: string; // 新增 searchTerm prop (可选)
  onSelectArticle: (articleId: string | null) => void; // 允许传递 null
  selectedArticleId: string | null;
  // 新增一个 prop 来处理"今日"这个特殊情况，因为 HomePage.getArticleFilter 对"今日"的处理是返回一个 publishDate 的范围
  // 但 ArticleList 可能需要更明确的指示，或者 HomePage 直接传递一个更通用的 filter 对象
  // 为了简单起见，我们先假设 filter 包含了所有情况，对于"今日"，ArticleList 自己再判断一下
  isTodayView?: boolean; 
  currentFeedId?: string; // 新增
  currentGroupId?: string; // 新增
  lastUpdatedArticleInfo?: { id: string, changes: Partial<Article> } | null; // 新增 prop
  listRefreshKey?: number; // 新增 prop
  onLastUpdatedArticleInfoChange: (info: { id: string, changes: Partial<Article> } | null) => void;
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
  setDisplayedArticles: (articles: Article[]) => void;
}

const ArticleList = forwardRef<ArticleListHandle, ArticleListProps>(({ 
  filter, 
  searchTerm, // 接收 searchTerm
  onSelectArticle,
  selectedArticleId,
  isTodayView, // 接收 isTodayView
  currentFeedId, // 接收
  currentGroupId, // 接收
  lastUpdatedArticleInfo, // 接收 prop
  listRefreshKey, // 接收 prop
  onLastUpdatedArticleInfoChange
}, ref) => {
  // 移除不再需要的诊断日志
  // console.log('[ArticleList] Component rendered or re-rendered. Current filter:', filter, 'Key:', listRefreshKey);
  const { db, isInitialized, triggerRefresh, refreshTrigger } = useDatabase();
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // 新增：用于防止重复刷新
  const [allArticles, setAllArticles] = useState<Article[]>([]); // 新增：存储当前上下文的所有文章
  const [displayedArticles, setDisplayedArticles] = useState<Article[]>([]); // 修改：用于显示的、经过筛选的文章
  const [feedInfoMap, setFeedInfoMap] = useState<Map<string, FeedSource>>(new Map());
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false); // 添加初始加载标志
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();
  const articlesRef = useRef(allArticles);
  articlesRef.current = allArticles;

  // 重新定义 prev* 变量
  const prevFilter = usePrevious(filter);
  const prevSearchTerm = usePrevious(searchTerm);
  const prevCurrentFeedId = usePrevious(currentFeedId);
  const prevCurrentGroupId = usePrevious(currentGroupId);
  const prevListRefreshKey = usePrevious(listRefreshKey);
  // prevIsTodayView 似乎没有在 effect 内部的比较逻辑中使用，如果确实不用可以考虑移除
  // const prevIsTodayView = usePrevious(isTodayView);

  const toggleArticleReadStatus = useCallback(async (articleId: string, currentStatus: 'true' | 'false', sourceId: string | undefined) => {
    if (!db) return;

    const newStatus = currentStatus === 'true' ? 'false' : 'true';

    try {
      console.log(`[ArticleList] toggleArticleReadStatus: Marking article ${articleId} as ${newStatus === 'true' ? 'read' : 'unread'} in DB.`);
      await db.articles.update(articleId, { isRead: newStatus });
      
      setAllArticles(prevAll => 
        prevAll.map(a => a.id === articleId ? { ...a, isRead: newStatus } : a)
      );
      
      if (lastUpdatedArticleInfo?.id === articleId) {
        onLastUpdatedArticleInfoChange(null);
      }

      if (sourceId) {
        const feed = feedInfoMap.get(sourceId) || await db.feeds.get(sourceId);
        if (feed?.id) {
          const change = newStatus === 'true' ? -1 : 1;
          await db.feeds.where('id').equals(feed.id).modify(f => {
            f.unreadCount = (f.unreadCount || 0) + change;
          });
          const updatedFeed = await db.feeds.get(feed.id);
          console.log(`[ArticleList] toggleArticleReadStatus: Feed ${feed.id} unread count updated to ${updatedFeed?.unreadCount} in DB.`);
          triggerRefresh();
        }
      }
    } catch (error) {
      console.error("Error toggling article read status:", error);
    }
  }, [db, feedInfoMap, triggerRefresh, onLastUpdatedArticleInfoChange, lastUpdatedArticleInfo]);

  const toggleFnRef = useRef(toggleArticleReadStatus);
  toggleFnRef.current = toggleArticleReadStatus;

  // 监听 selectedArticleId 的变化，并根据设置自动将选中的文章标记为已读
  useEffect(() => {
    if (!selectedArticleId || !settings.appearance.reading.autoMarkAsRead) {
      return;
    }
  
    const article = articlesRef.current.find(a => a.id === selectedArticleId);
    if (article && article.isRead === 'false') {
      toggleFnRef.current(article.id, 'false', article.sourceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArticleId, settings.appearance.reading.autoMarkAsRead]);

  // 键盘事件处理函数
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 如果没有选中的文章或者文章列表为空，不处理键盘事件
    if (!selectedArticleId || displayedArticles.length === 0) return;

    const currentIndex = displayedArticles.findIndex(article => article.id === selectedArticleId);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;

    if (event.key === 'ArrowUp') {
      // 上键：选择上一篇文章
      nextIndex = currentIndex > 0 ? currentIndex - 1 : displayedArticles.length - 1; // 循环到最后一篇
      event.preventDefault(); // 防止页面滚动
    } else if (event.key === 'ArrowDown') {
      // 下键：选择下一篇文章
      nextIndex = currentIndex < displayedArticles.length - 1 ? currentIndex + 1 : 0; // 循环到第一篇
      event.preventDefault(); // 防止页面滚动
    } else {
      return; // 其他键不处理
    }

    const nextArticle = displayedArticles[nextIndex];
    if (nextArticle) {
      onSelectArticle(nextArticle.id);
      // markAsRead(nextArticle.id); // 移除: 交给 useEffect 处理
      
      // 自动滚动到选中的文章
      const articleElement = containerRef.current?.querySelector(`[data-article-id="${nextArticle.id}"]`) as HTMLElement;
      if (articleElement) {
        articleElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, [selectedArticleId, displayedArticles, onSelectArticle]);

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
      setDisplayedArticles(prevArticles => {
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

  // Effect 1: Fetch articles from DB when context changes (feed, group, search, or forced refresh)
  useEffect(() => {
    if (!isInitialized || !db) {
      return;
    }

    const loadArticlesForContext = async () => {
      // 检查是否正在进行刷新，如果是，则中止新的加载
      if (isRefreshing) {
        console.log('[ArticleList] Refresh already in progress, skipping new data load.');
        return;
      }

      console.log('[ArticleList] useEffect[loadArticlesForContext]: Running with context', { currentFeedId, currentGroupId, searchTerm });
      
      // 只有在首次加载时才显示重量级的加载动画
      if (!hasInitialLoaded) {
        setLoading(true);
      }
      setIsRefreshing(true); // 开始加载/刷新，设置锁定
      setError(null);
      
      try {
        let collection: Dexie.Collection<Article, string> = db.articles.toCollection();

        // Filter by Feed or Group
        if (currentFeedId) {
          collection = collection.filter(article => article.sourceId === currentFeedId);
        } else if (currentGroupId) {
          const feedsInGroup = await db.feeds.where('groupId').equals(currentGroupId).toArray();
          const feedIdsInGroup = new Set(feedsInGroup.map(f => f.id).filter((id): id is string => !!id));
          if (feedIdsInGroup.size > 0) {
            collection = collection.filter(article => article.sourceId ? feedIdsInGroup.has(article.sourceId) : false);
          } else {
            setAllArticles([]);
            setLoading(false);
            setIsRefreshing(false);
            setHasInitialLoaded(true);
            return;
          }
        }
        
        let fetchedArticles = await collection.toArray();
        fetchedArticles.sort((a, b) => b.publishDate - a.publishDate);

        // Client-side search term filter
        if (searchTerm && searchTerm.trim() !== '') {
          const lowerSearchTerm = searchTerm.toLowerCase();
          fetchedArticles = fetchedArticles.filter((article: Article) =>
            article.title.toLowerCase().includes(lowerSearchTerm) ||
            (article.author && article.author.toLowerCase().includes(lowerSearchTerm)) ||
            (article.summary && article.summary.toLowerCase().includes(lowerSearchTerm)) ||
            (article.contentText && article.contentText.toLowerCase().includes(lowerSearchTerm))
          );
        }

        setAllArticles(fetchedArticles);
        console.log(`[ArticleList] Loaded ${fetchedArticles.length} articles into allArticles.`);

        // Fetch associated feed info for the loaded articles
        if (fetchedArticles.length > 0) {
          const sourceIds = [...new Set(fetchedArticles.map(a => a.sourceId).filter(Boolean))];
          if (sourceIds.length > 0) {
            const feeds = await db.feeds.where('id').anyOf(sourceIds as string[]).toArray();
            const newFeedInfoMap = new Map<string, FeedSource>();
            for (const feed of feeds) {
              if (feed && feed.id) {
                newFeedInfoMap.set(feed.id, {
                  ...feed,
                  iconUrl: await processIconUrl(feed.iconUrl),
                });
              }
            }
            setFeedInfoMap(newFeedInfoMap);
          }
        }
        
        if (!hasInitialLoaded) {
          setHasInitialLoaded(true);
        }

      } catch (err) {
        console.error('获取文章失败:', err);
        setError('加载文章失败，请稍后重试。');
        if (err instanceof Error) {
            console.error(`Error name: ${err.name}, message: ${err.message}`);
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false); // 加载/刷新完成，解除锁定
      }
    };

    loadArticlesForContext();
    
  }, [db, isInitialized, currentFeedId, currentGroupId, searchTerm, listRefreshKey, refreshTrigger]);

  // Effect 2: Filter and sort articles when allArticles or filter changes
  useEffect(() => {
    console.log('[ArticleList] useEffect[filterAndSort]: Running with filter', filter);
    
    let filtered = [...allArticles];

    // Apply main filters from the 'filter' prop
    if (filter) {
      if (typeof filter.isRead === 'string') {
        filtered = filtered.filter(article => article.isRead === filter.isRead);
      }
      if (filter.isStarred === 'true') {
        filtered = filtered.filter(article => article.isStarred === 'true');
      }
      // Handle 'Today' view filter if passed as a date range
      if (filter.publishDate) {
         filtered = filtered.filter(article => article.publishDate >= filter.publishDate.from && article.publishDate <= filter.publishDate.to);
      }
    }

    // Sort the final list
    filtered.sort((a, b) => b.publishDate - a.publishDate);

    // [最终修复逻辑] 遵照用户规则: 只要有文章被选中，就不能从列表中消失。
    if (selectedArticleId) {
      const isSelectedInList = filtered.some((a: Article) => a.id === selectedArticleId);

      // 如果选中的文章因为筛选被排除了
      if (!isSelectedInList) {
        // 从 "数据母版" a`llArticles` 中找到它
        const selectedArticle = allArticles.find((a: Article) => a.id === selectedArticleId);
        
        // 如果找到了，就把它加回到要显示的列表中，并重新排序
        if (selectedArticle) {
          filtered.push(selectedArticle);
          filtered.sort((a, b) => b.publishDate - a.publishDate);
        }
      }
    }

    setDisplayedArticles(filtered);
    console.log(`[ArticleList] Filtered to ${filtered.length} displayed articles.`);

    // Deselect article if filter changes (Problem 3)
    if (JSON.stringify(filter) !== JSON.stringify(prevFilter)) {
        onSelectArticle(null);
    }

  }, [allArticles, filter, selectedArticleId, onSelectArticle]);


  const handleArticleClick = (articleId: string) => {
    onSelectArticle(articleId);
  };

  const handleToggleStar = async (articleId: string) => {
    if (!db) return;
    
    const article = allArticles.find(a => a.id === articleId);
    if (!article) return;

    const newIsStarred = article.isStarred === 'true' ? 'false' : 'true';
    
    try {
      await db.articles.update(articleId, { isStarred: newIsStarred });
      
      // Optimistically update local state
      setAllArticles(prev => 
        prev.map(a => 
          a.id === articleId ? { ...a, isStarred: newIsStarred } : a
        )
      );
      
      message.success(newIsStarred === 'true' ? '已添加到收藏' : '已取消收藏');
      triggerRefresh();
    } catch (error) {
      console.error('更新文章收藏状态失败:', error);
      message.error('操作失败');
    }
  };

  const handleMarkAboveAsRead = async (articleId: string) => {
    if (!db) return;
    
    const currentIndex = displayedArticles.findIndex(a => a.id === articleId);
    if (currentIndex === -1) return;

    const articlesToMark = displayedArticles.slice(0, currentIndex).filter(a => a.isRead === 'false');
    
    if (articlesToMark.length === 0) {
      message.info('上方没有未读文章');
      return;
    }

    try {
      const articleIds = articlesToMark.map(a => a.id);
      await db.articles.where('id').anyOf(articleIds).modify({ isRead: 'true' });
      
      // 统一更新 allArticles
      setAllArticles(prev => 
        prev.map(a => 
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
    
    const currentIndex = displayedArticles.findIndex(a => a.id === articleId);
    if (currentIndex === -1) return;

    const articlesToMark = displayedArticles.slice(currentIndex + 1).filter(a => a.isRead === 'false');
    
    if (articlesToMark.length === 0) {
      message.info('下方没有未读文章');
      return;
    }

    try {
      const articleIds = articlesToMark.map(a => a.id);
      await db.articles.where('id').anyOf(articleIds).modify({ isRead: 'true' });
      
      // 统一更新 allArticles
      setAllArticles(prev => 
        prev.map(a => 
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
      key: 'toggleRead',
      label: article.isRead === 'true' ? '标记为未读' : '标记为已读',
      icon: article.isRead === 'true' ? <EyeOutlined /> : <CheckCircleOutlined />,
      onClick: () => toggleArticleReadStatus(article.id, article.isRead as 'true' | 'false', article.sourceId)
    },
    {
      key: 'toggleStar',
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

  const renderListItem = (article: Article) => {
    const feed = article.sourceId ? feedInfoMap.get(article.sourceId) : undefined;
    const articleSourceTitle = feed ? feed.title : '未知来源';
    const articleSourceIconUrl = feed ? feed.iconUrl : undefined;
    const isArticleSelected = selectedArticleId === article.id;
    const isRead = article.isRead === 'true';

    // 移除不再需要的诊断日志

    const formattedDate = article.publishDate 
      ? formatDistanceToNowStrict(new Date(article.publishDate), { addSuffix: true, locale: zhCN })
      : '日期未知';

    const articleSummary = article.summary || extractFirstParagraphText(article.content) || article.contentText || '没有摘要';
    const articleImage = article.imageUrl || extractFirstImage(article.content);

    const contextMenuItems = createContextMenuItems(article);

    const motionWrapper = (content: React.ReactNode) => (
      <motion.div
        layout
        key={article.id}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ duration: 0.2, type: 'tween' }}
      >
        <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
          {content}
        </Dropdown>
      </motion.div>
    );

    // 移除 switch 语句，只保留唯一的列表视图渲染逻辑
    return motionWrapper(
      <div
        className={`${styles.listItemV5} ${
          isRead ? styles.readItemV5 : styles.unreadItemV5
        } ${isArticleSelected ? styles.selectedItemV5 : ''}`}
        onClick={() => handleArticleClick(article.id)}
        data-article-id={article.id}
        onContextMenu={e => e.stopPropagation()}
      >
        <div className={styles.metaHeaderV5}>
          <div className={styles.sourceInfoV5}>
            {articleSourceIconUrl ? (
              <Avatar src={articleSourceIconUrl} shape="square" size={14} className={styles.sourceIconV5} icon={<GlobalOutlined />} />
            ) : (
              <Avatar shape="square" size={14} className={styles.sourceIconV5} icon={<GlobalOutlined />} />
            )}
            <span className={styles.sourceNameV5}>{articleSourceTitle}</span>
          </div>
          <span className={styles.timestampV5}>{formattedDate}</span>
        </div>

        <div className={styles.bottomContentV5}>
          <div className={styles.textContentV5}>
            <h4 className={`${styles.titleV5} title-lines-2`}>{article.title || '无标题'}</h4>
            {articleSummary !== '没有摘要' && (
              <p className={`${styles.summaryV5} desc-lines-2`}>{articleSummary}</p>
            )}
          </div>
          {articleImage && (
            <div className={styles.imageContainerV5}>
              <img src={articleImage} alt={article.title || '文章图片'} className={styles.imageV5} loading="lazy" />
            </div>
          )}
        </div>
      </div>,
    );
  };
  
  const renderContent = () => {
    if (loading && displayedArticles.length === 0) {
      // Show skeleton only on initial load
      return (
        <div style={{ padding: '24px' }}>
          <Skeleton active paragraph={{ rows: 4 }} />
          <Skeleton active paragraph={{ rows: 4 }} />
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      );
    }
  
    if (error) {
      return <div style={{ padding: '24px', color: 'red' }}>Error: {error}</div>;
    }
  
    if (displayedArticles.length === 0) {
      return null;
    }
  
    return (
      <div className={styles.scrollableArticleListContainer} ref={containerRef} tabIndex={-1}>
        {loading && (
          <motion.div 
            className={styles.refreshingLoaderContainer}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <ReloadOutlined spin style={{ fontSize: '24px', color: 'var(--primary-color)' }} />
          </motion.div>
        )}
        <AnimatePresence>
          {displayedArticles.map(article => renderListItem(article))}
        </AnimatePresence>
      </div>
    );
  };
  
  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
    },
    getScrollableElement: () => containerRef.current,
    setDisplayedArticles: (articles: Article[]) => {
      console.log('[ArticleList] Imperatively setting displayed articles. Count:', articles.length);
      setDisplayedArticles(articles);
    }
  }));

  return renderContent();
});

export default ArticleList; 