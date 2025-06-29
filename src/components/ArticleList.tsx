import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, memo } from 'react';
import { Card, Empty, Skeleton, Badge, Tooltip, Avatar, Dropdown, message } from 'antd';
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
import { Article, FeedSource } from '../db/database';
import styles from './ArticleList.module.css';
import PulsingLoader from './PulsingLoader';
import { useArticleListManager } from '../hooks/useArticleListManager'; // 导入新的 Hook
import { extractFirstImage, extractFirstParagraphText } from '../utils/helpers'; // 导入辅助函数

interface ArticleListProps {
  filter: any;
  searchTerm?: string;
  onSelectArticle: (articleId: string | null) => void;
  selectedArticleId: string | null;
  isTodayView?: boolean; 
  currentFeedId?: string;
  currentGroupId?: string;
  lastUpdatedArticleInfo?: { id: string, changes: Partial<Article> } | null;
  listRefreshKey?: number;
  onLastUpdatedArticleInfoChange: (info: { id: string, changes: Partial<Article> } | null) => void;
  isPullingDown?: boolean;
}

// 辅助函数：格式化日期
const formatDate = (date: number | Date): string => {
  const d = new Date(date);
  return format(d, 'yyyy-MM-dd HH:mm');
};

// 辅助函数：格式化日期和时间
const formatDateTime = (date: number | Date): string => {
  const d = new Date(date);
  return format(d, 'MM-dd HH:mm', { locale: zhCN });
};

export interface ArticleListHandle {
  scrollToTop: () => void;
  getScrollableElement: () => HTMLDivElement | null;
  getArticles: () => Article[];
  scrollToArticle: (articleId: string) => void;
}

// 优化ArticleList使用React.memo包装
const ArticleList = memo(forwardRef<ArticleListHandle, ArticleListProps>(({ 
  filter, 
  searchTerm,
  onSelectArticle,
  selectedArticleId,
  isTodayView,
  currentFeedId,
  currentGroupId,
  lastUpdatedArticleInfo,
  listRefreshKey,
  onLastUpdatedArticleInfoChange,
  isPullingDown,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    loading,
    isRefreshing,
    error,
    displayedArticles,
    feedInfoMap,
    toggleArticleReadStatus,
    handleToggleStar,
    handleMarkArticlesAsRead,
  } = useArticleListManager({
    filter,
    searchTerm,
    selectedArticleId,
    currentFeedId,
    currentGroupId,
    lastUpdatedArticleInfo,
    listRefreshKey,
    onSelectArticle,
    onLastUpdatedArticleInfoChange,
  });

  const scrollToArticle = (articleId: string) => {
    if (!containerRef.current) return;
    const articleElement = containerRef.current.querySelector(`[data-article-id="${articleId}"]`) as HTMLElement;
    if (articleElement) {
      articleElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  };

  useEffect(() => {
    if (selectedArticleId && !isPullingDown) {
      setTimeout(() => {
        if (!containerRef.current) return;
        const articleElement = containerRef.current.querySelector(`[data-article-id="${selectedArticleId}"]`) as HTMLElement;
        if (articleElement) {
          const rect = articleElement.getBoundingClientRect();
          const containerRect = containerRef.current.getBoundingClientRect();
          
          const isFullyVisible = (
              rect.top >= containerRect.top &&
              rect.bottom <= containerRect.bottom
          );

          if (!isFullyVisible) {
            scrollToArticle(selectedArticleId);
          }
        }
      }, 0);
    }
  }, [displayedArticles, selectedArticleId, isPullingDown]);

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
      
      // 自动滚动到选中的文章
      scrollToArticle(nextArticle.id);
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

  const handleArticleClick = (articleId: string) => {
    onSelectArticle(articleId);
  };

  const toggleStar = async (articleId: string) => {
    const article = displayedArticles.find(a => a.id === articleId);
    if (!article) return;
    
    const newIsStarred = article.isStarred === 'true' ? 'false' : 'true';
    
    try {
      await handleToggleStar(article.id);
      message.success(newIsStarred === 'true' ? '已添加到收藏' : '已取消收藏');
    } catch (error) {
      console.error('Failed to toggle star status:', error);
      message.error('收藏操作失败');
    }
  };

  const handleMarkAboveAsRead = async (articleId: string) => {
    const currentIndex = displayedArticles.findIndex(a => a.id === articleId);
    if (currentIndex === -1) return;

    const articlesToMark = displayedArticles.slice(0, currentIndex).filter(a => a.isRead === 'false');
    if (articlesToMark.length === 0) {
      message.info('上方没有未读文章');
      return;
    }

    try {
      const count = await handleMarkArticlesAsRead(articlesToMark);
      message.success(`已标记上方 ${count} 篇文章为已读`);
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleMarkBelowAsRead = async (articleId: string) => {
    const currentIndex = displayedArticles.findIndex(a => a.id === articleId);
    if (currentIndex === -1) return;

    const articlesToMark = displayedArticles.slice(currentIndex + 1).filter(a => a.isRead === 'false');
    if (articlesToMark.length === 0) {
      message.info('下方没有未读文章');
      return;
    }

    try {
      const count = await handleMarkArticlesAsRead(articlesToMark);
      message.success(`已标记下方 ${count} 篇文章为已读`);
    } catch (error) {
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
      onClick: () => toggleStar(article.id)
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
    getArticles: () => displayedArticles,
    scrollToArticle: scrollToArticle,
  }));

  return renderContent();
}));

export default ArticleList; 