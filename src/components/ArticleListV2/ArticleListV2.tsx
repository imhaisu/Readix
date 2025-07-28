import React, { 
  useState, 
  useEffect, 
  useRef, 
  useCallback, 
  memo, 
  forwardRef, 
  useImperativeHandle,
  useMemo
} from 'react';
import { Empty } from 'antd';
import { motion } from 'framer-motion';
import { useArticleListManager } from '../../hooks/useArticleListManager';
import { Article, FeedSource } from '../../db/database';
import { usePrevious } from '../../hooks/usePrevious';
import PulsingLoader from '../PulsingLoader';
import styles from './ArticleListV2.module.css'; // 确保使用正确的样式文件
import { EnhancedLogger } from '../../utils/logConfig';
import ArticleItem from './ArticleItem';
import useArticleMenu, { ArticleMenuHandlers } from './ArticleMenu';
import VirtualList, { VirtualListHandle } from './VirtualList';

// 导出与原组件相同的 ArticleListHandle 接口
export interface ArticleListHandle {
  scrollToTop: () => void;
  getScrollableElement: () => HTMLDivElement | null;
  getArticles: () => Article[];
  getArticleCount: () => number;
  scrollToArticle: (articleId: string, alignment?: 'auto' | 'smart' | 'center' | 'end' | 'start') => void;
  getScrollPosition: () => number;
  setScrollPosition: (position: number) => void;
  markArticlesAsRead: (articleIds: string[]) => Promise<number | undefined>;
  markAsRead: (articleIds: string[]) => void;
}

// 保持与原组件相同的 props 接口
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

const ITEM_HEIGHT = 107; // 与V1保持一致的文章项高度

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
  const virtualListRef = useRef<VirtualListHandle>(null);
  const selectArticleRef = useRef(onSelectArticle);
  
  // 添加状态变量，用于触发重新渲染
  const [imageErrorRefresh, setImageErrorRefresh] = useState(0);
  
  useEffect(() => {
    selectArticleRef.current = onSelectArticle;
  }, [onSelectArticle]);

  // 使用增强日志记录初始化
  useEffect(() => {
    EnhancedLogger.debug('ARTICLES', '文章列表组件已挂载(V2)', {
      feedId: currentFeedId,
      groupId: currentGroupId,
      topicId: currentTopicId
    });
    
    return () => {
      EnhancedLogger.debug('ARTICLES', '文章列表组件已卸载(V2)');
    };
  }, [currentFeedId, currentGroupId, currentTopicId]);

  const {
    loading,
    isRefreshing,
    isSwitchingFilter,
    error,
    articles: displayedArticles,
    feedInfoMap,
    toggleArticleReadStatus,
    handleToggleStar,
    markArticlesAsRead,
    markAsRead,
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
  
  const scrollToArticle = useCallback((articleId: string, align: 'auto' | 'smart' | 'center' | 'end' | 'start' = 'auto') => {
    const index = displayedArticles.findIndex(a => a.id === articleId);
    if (index !== -1 && virtualListRef.current) {
      virtualListRef.current.scrollToItem(index, align);
    }
  }, [displayedArticles]);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => virtualListRef.current?.scrollToTop(),
    getScrollableElement: () => containerRef.current,
    getArticles: () => displayedArticles,
    getArticleCount: () => displayedArticles.length,
    scrollToArticle,
    getScrollPosition: () => virtualListRef.current?.getScrollPosition() ?? 0,
    setScrollPosition: (position: number) => {
      if (virtualListRef.current) {
        virtualListRef.current.scrollTo(position);
      }
    },
    markArticlesAsRead: async (articleIds: string[]) => {
      return await markArticlesAsRead(articleIds);
    },
    markAsRead,
  }), [displayedArticles, scrollToArticle, markArticlesAsRead, markAsRead]);
  
  const prevSelectedArticleId = usePrevious(selectedArticleId);

  useEffect(() => {
    if (selectedArticleId && prevSelectedArticleId !== selectedArticleId) {
      scrollToArticle(selectedArticleId, 'smart');
    }
  }, [selectedArticleId, prevSelectedArticleId, scrollToArticle, imageErrorRefresh]);

  useEffect(() => {
    if (displayedArticles.length > 0) {
      EnhancedLogger.info('ARTICLES', `加载了 ${displayedArticles.length} 篇文章(V2)`, {
        isRefreshing,
        filter: JSON.stringify(filter),
        contextInfo: { feedId: currentFeedId, groupId: currentGroupId, topicId: currentTopicId }
      });
    }
  }, [displayedArticles.length, isRefreshing, filter, currentFeedId, currentGroupId, currentTopicId]);

  const handleArticleClick = useCallback((articleId: string) => {
    EnhancedLogger.debug('ARTICLES', `文章点击: ${articleId}`);
    console.log('ArticleListV2 handleArticleClick:', articleId);
    selectArticleRef.current(articleId);
  }, []);
  
  // 处理上方标记已读
  const handleMarkAboveAsRead = useCallback(async (articleId: string) => {
    const index = displayedArticles.findIndex(a => a.id === articleId);
    if (index <= 0) return;
    
    const articlesToMark = displayedArticles.slice(0, index).filter(a => a.isRead === 'false');
    if (articlesToMark.length > 0) {
      EnhancedLogger.info('ARTICLES', `标记${articlesToMark.length}篇文章为已读(上方)(V2)`);
      EnhancedLogger.startPerf(`markAboveAsRead-${articlesToMark.length}`);
      await markArticlesAsRead(articlesToMark.map(a => a.id));
      EnhancedLogger.endPerf(`markAboveAsRead-${articlesToMark.length}`, 'ARTICLES');
    }
  }, [displayedArticles, markArticlesAsRead]);

  // 处理下方标记已读
  const handleMarkBelowAsRead = useCallback(async (articleId: string) => {
    const index = displayedArticles.findIndex(a => a.id === articleId);
    if (index === -1 || index >= displayedArticles.length - 1) return;
    
    const articlesToMark = displayedArticles.slice(index + 1).filter(a => a.isRead === 'false');
    if (articlesToMark.length > 0) {
      EnhancedLogger.info('ARTICLES', `标记${articlesToMark.length}篇文章为已读(下方)(V2)`);
      EnhancedLogger.startPerf(`markBelowAsRead-${articlesToMark.length}`);
      await markArticlesAsRead(articlesToMark.map(a => a.id));
      EnhancedLogger.endPerf(`markBelowAsRead-${articlesToMark.length}`, 'ARTICLES');
    }
  }, [displayedArticles, markArticlesAsRead]);

  // 配置菜单处理程序
  const menuHandlers: ArticleMenuHandlers = useMemo(() => ({
    toggleArticleReadStatus,
    toggleStar: handleToggleStar,
    markAboveAsRead: handleMarkAboveAsRead,
    markBelowAsRead: handleMarkBelowAsRead
  }), [toggleArticleReadStatus, handleToggleStar, handleMarkAboveAsRead, handleMarkBelowAsRead]);

  // 使用文章菜单 hook
  const { createContextMenuItems } = useArticleMenu({ handlers: menuHandlers });

  // 渲染单个文章项的函数
  const renderArticleItem = useCallback(({ index, style, data }: any) => {
    const { articles, selectedArticleId, feedInfoMap, handleArticleClick, createContextMenuItems, isInTransition } = data;
    const article = articles[index];
    
    return (
      <ArticleItem
        article={article}
        isSelected={article.id === selectedArticleId}
        feedInfo={article.sourceId ? feedInfoMap.get(article.sourceId) : undefined}
        onClick={handleArticleClick}
        isInTransition={isInTransition}
        index={index}
        style={style}
        createContextMenuItems={createContextMenuItems}
      />
    );
  }, []);
  
  // 处理键盘事件
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
      EnhancedLogger.debug('ARTICLES', `键盘导航: ${event.key}`, { currentIndex, nextIndex });
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

  // 准备虚拟列表的数据
  const itemData = useMemo(() => ({
    articles: displayedArticles,
    selectedArticleId,
    feedInfoMap,
    handleArticleClick,
    createContextMenuItems,
    isInTransition: loading && !isSwitchingFilter,
  }), [displayedArticles, selectedArticleId, feedInfoMap, handleArticleClick, createContextMenuItems, loading, isSwitchingFilter]);
  
  // 渲染内容
  const renderContent = () => {
    if (error) {
      EnhancedLogger.error('ARTICLES', `加载文章失败(V2): ${error}`);
      return (
        <motion.div 
          className={styles.emptyState}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Empty description={`加载失败: ${error}`} />
        </motion.div>
      );
    }
    
    if (displayedArticles.length === 0 && !isSwitchingFilter && !loading) {
      return (
        <motion.div 
          className={styles.emptyState}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Empty description="没有文章" />
        </motion.div>
      );
    }
    
    return (
      <div ref={containerRef} className={styles.scrollableArticleListContainer} tabIndex={0}>
        {isSwitchingFilter && (
          <div className={styles.loadingOverlay}>
            <PulsingLoader />
          </div>
        )}
        
        {isRefreshing && <div className={styles.refreshingIndicator} />}
        
        {(displayedArticles.length > 0) && (
          <VirtualList
            ref={virtualListRef}
            items={displayedArticles}
            itemHeight={ITEM_HEIGHT}
            renderItem={renderArticleItem}
            itemData={itemData}
            isInTransition={loading && !isSwitchingFilter}
            overscanCount={12}
          />
        )}
      </div>
    );
  };

  return (
    <>
      <div className={styles.draggableHeader}></div>
      {renderContent()}
    </>
  );
}));

export default ArticleList; 