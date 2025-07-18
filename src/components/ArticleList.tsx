import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, memo } from 'react';
import { List, Empty, Dropdown, message, Spin, Menu, Skeleton, Avatar } from 'antd';
import { 
  StarOutlined, StarFilled, CheckOutlined, CheckCircleOutlined, EyeOutlined, 
  ArrowUpOutlined, ArrowDownOutlined, CopyOutlined, RightOutlined, MenuOutlined,
  LeftOutlined, ClockCircleOutlined, ClockCircleFilled, GlobalOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Article } from '../db/database';
import { useDatabase } from '../contexts/DatabaseContext';
import { extractFirstParagraphText, extractFirstImage } from '../utils/helpers';
import styles from './ArticleList.module.css';
import PulsingLoader from './PulsingLoader';
import { debounce } from 'lodash';
import { useArticleListManager } from '../hooks/useArticleListManager';
import { usePrevious } from '../hooks/usePrevious';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { motion } from 'framer-motion';

// 添加图标错误缓存
const iconErrorCache = new Map<string, boolean>();

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
  getArticleCount: () => number; // 添加高效获取文章数量的方法
  scrollToArticle: (articleId: string, alignment?: 'auto' | 'smart' | 'center' | 'end' | 'start') => void;
  getScrollPosition: () => number;
  setScrollPosition: (position: number) => void;
}

interface ArticleListProps {
  filter: any;
  searchTerm?: string;
  onSelectArticle: (articleId: string | null) => void;
  selectedArticleId: string | null;
  isTodayView?: boolean; 
  currentFeedId?: string;
  currentGroupId?: string;
  currentTopicId?: string;
  lastUpdatedArticleInfo?: { id: string, changes: Partial<Article> } | null;
  listRefreshKey?: number;
  onLastUpdatedArticleInfoChange: (info: { id: string, changes: Partial<Article> } | null) => void;
  isPullingDown?: boolean;
}

// 列表项渲染组件 (Row)
const Row = memo(({ index, style, data }: ListChildComponentProps) => {
  const { 
    articles, 
    selectedArticleId, 
    feedInfoMap,
    handleArticleClick,
    createContextMenuItems,
  } = data;
  
  const article = articles[index];
  if (!article) return null;

  const feed = article.sourceId ? feedInfoMap.get(article.sourceId) : undefined;
    
  let articleSourceTitle = '未知来源';
  if (feed?.title) {
    articleSourceTitle = feed.title;
  } else if (article.sourceId) {
    try {
      if (article.sourceId.startsWith('http')) {
        const url = new URL(article.sourceId);
        articleSourceTitle = url.hostname;
      } else {
        articleSourceTitle = article.sourceId.split('-')[0] || '未知来源';
      }
    } catch (e) {
      articleSourceTitle = '未知来源';
    }
  }
    
  const articleSourceIconUrl = feed ? feed.iconUrl : undefined;
  const isArticleSelected = selectedArticleId === article.id;
  const isRead = article.isRead === 'true';
  const hasIconError = article.sourceId ? iconErrorCache.get(article.sourceId) : false;

  const handleIconError = (articleSourceId: string) => {
    if (articleSourceId) {
      iconErrorCache.set(articleSourceId, true);
      // 在虚拟化列表中，需要一种更好的方式来触发重绘
      // 暂时依赖其他状态更新
    }
    return false;
  };

  const formattedDate = article.publishDate 
    ? formatDistanceToNowStrict(new Date(article.publishDate), { addSuffix: true, locale: zhCN })
    : '日期未知';

  const articleSummary = article.summary || extractFirstParagraphText(article.content) || article.contentText || '没有摘要';
  const articleImage = article.imageUrl || extractFirstImage(article.content);
  const contextMenuItems = createContextMenuItems(article);

  return (
    <div style={style}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 15, stiffness: 100 }}
      >
        <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
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
                {hasIconError || !articleSourceIconUrl ? (
                  <Avatar size={18} icon={<GlobalOutlined />} className={styles.sourceIcon} />
                ) : (
                  <Avatar 
                    src={articleSourceIconUrl} 
                    size={18} 
                    icon={<GlobalOutlined />} 
                    className={styles.sourceIcon} 
                    onError={() => handleIconError(article.sourceId)} 
                  />
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
          </div>
        </Dropdown>
      </motion.div>
    </div>
  );
});

const ArticleList = memo(forwardRef<ArticleListHandle, ArticleListProps>(({ 
  filter, 
  searchTerm,
  onSelectArticle,
  selectedArticleId,
  isTodayView,
  currentFeedId,
  currentGroupId,
  currentTopicId,
  lastUpdatedArticleInfo,
  listRefreshKey,
  onLastUpdatedArticleInfoChange,
  isPullingDown,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<FixedSizeList>(null);
  const selectArticleRef = useRef(onSelectArticle);
  
  useEffect(() => {
    selectArticleRef.current = onSelectArticle;
  }, [onSelectArticle]);

  const {
    loading,
    isRefreshing,
    error,
    articles: displayedArticles,
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
    currentTopicId,
    lastUpdatedArticleInfo,
    listRefreshKey,
    onSelectArticle: selectArticleRef.current,
    onLastUpdatedArticleInfoChange,
  });

  const listScrollPositionKey = `articleList_scrollPos_${currentFeedId || ''}_${currentGroupId || ''}_${filter?.isRead || ''}`;
  
  const scrollToArticle = useCallback((articleId: string, align: 'auto' | 'smart' | 'center' | 'end' | 'start' = 'auto') => {
    const index = displayedArticles.findIndex(a => a.id === articleId);
    if (index !== -1 && listRef.current) {
      listRef.current.scrollToItem(index, align);
    }
  }, [displayedArticles]);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => listRef.current?.scrollTo(0),
    getScrollableElement: () => containerRef.current,
    getArticles: () => displayedArticles,
    getArticleCount: () => displayedArticles.length,
    scrollToArticle,
    getScrollPosition: () => containerRef.current?.scrollTop ?? 0,
    setScrollPosition: (position: number) => {
      if (listRef.current) {
        listRef.current.scrollTo(position);
      }
    },
  }), [displayedArticles, scrollToArticle]);
  
  const prevSelectedArticleId = usePrevious(selectedArticleId);

  useEffect(() => {
    if (selectedArticleId && prevSelectedArticleId !== selectedArticleId) {
      scrollToArticle(selectedArticleId, 'smart');
    }
  }, [selectedArticleId, prevSelectedArticleId, scrollToArticle]);

  const handleArticleClick = (articleId: string) => {
    selectArticleRef.current(articleId);
  };
  
  // ... (toggleStar, markAbove/Below, copyLink functions are now passed to Row, so they need to be defined here)
  const toggleStar = async (articleId: string) => {
    await handleToggleStar(articleId);
  };
  const handleMarkAboveAsRead = async (articleId: string) => {
    const index = displayedArticles.findIndex(a => a.id === articleId);
    if (index > 0) {
      const articlesToMark = displayedArticles.slice(0, index).filter(a => a.isRead === 'false');
      if (articlesToMark.length > 0) {
        await handleMarkArticlesAsRead(articlesToMark);
        message.success(`已标记 ${articlesToMark.length} 篇文章为已读`);
      }
    }
  };
  const handleMarkBelowAsRead = async (articleId: string) => {
    const index = displayedArticles.findIndex(a => a.id === articleId);
    if (index !== -1 && index < displayedArticles.length - 1) {
      const articlesToMark = displayedArticles.slice(index + 1).filter(a => a.isRead === 'false');
      if (articlesToMark.length > 0) {
        await handleMarkArticlesAsRead(articlesToMark);
        message.success(`已标记 ${articlesToMark.length} 篇文章为已读`);
      }
    }
  };
  const handleCopyLink = async (articleUrl: string) => {
    await navigator.clipboard.writeText(articleUrl);
    message.success('已复制链接');
  };

  const createContextMenuItems = useCallback((article: Article): MenuProps['items'] => [
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
  ], [toggleArticleReadStatus, handleToggleStar, handleMarkArticlesAsRead, handleMarkAboveAsRead, handleMarkBelowAsRead, handleCopyLink]);

  const itemData = {
    articles: displayedArticles,
    selectedArticleId,
    feedInfoMap,
    handleArticleClick,
    createContextMenuItems,
  };
  
  const ITEM_HEIGHT = 107; // 基于CSS的计算结果

  const renderContent = () => {
    if (loading && displayedArticles.length === 0) {
      return (
        <div style={{ padding: '20px' }}>
          <Skeleton active paragraph={{ rows: 4 }} />
          <Skeleton active paragraph={{ rows: 4 }} />
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      );
    }

    if (error) {
      return <div className={styles.emptyState}><Empty description={`加载失败: ${error}`} /></div>;
    }
    
    if (displayedArticles.length === 0) {
      return <div className={styles.emptyState}><Empty description="没有文章" /></div>;
    }

    return (
      <div className={styles.scrollableArticleListContainer} ref={containerRef}>
        {isRefreshing && <div className={styles.refreshingLoaderContainer}><PulsingLoader inline={true} compact={true} /></div>}
        <AutoSizer>
          {({ height, width }) => (
            <FixedSizeList
              height={height}
              itemCount={displayedArticles.length}
              itemSize={ITEM_HEIGHT}
              width={width}
              itemData={itemData}
              ref={listRef}
              outerRef={containerRef}
            >
              {Row}
            </FixedSizeList>
          )}
        </AutoSizer>
      </div>
    );
  };
  
  // 键盘事件处理
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!selectedArticleId || displayedArticles.length === 0) return;
    const currentIndex = displayedArticles.findIndex(article => article.id === selectedArticleId);
    if (currentIndex === -1) return;
    
    let nextIndex = currentIndex;
    if (event.key === 'ArrowUp') {
      nextIndex = Math.max(0, currentIndex - 1);
      event.preventDefault();
    } else if (event.key === 'ArrowDown') {
      nextIndex = Math.min(displayedArticles.length - 1, currentIndex + 1);
      event.preventDefault();
    } else {
      return;
    }

    if (nextIndex !== currentIndex) {
      const nextArticleId = displayedArticles[nextIndex].id;
      onSelectArticle(nextArticleId);
      scrollToArticle(nextArticleId, 'auto');
    }
  }, [selectedArticleId, displayedArticles, onSelectArticle, scrollToArticle]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.setAttribute('tabIndex', '0');
    }
  }, []);

  return (
    <>
      <div className={styles.draggableHeader}></div>
      {renderContent()}
    </>
  );
}));

export default ArticleList; 