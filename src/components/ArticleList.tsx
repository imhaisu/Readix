import React, { useState, useEffect, useRef, useCallback, memo, forwardRef, useImperativeHandle } from 'react';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { format, isToday, isYesterday, isThisWeek, isThisYear } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Avatar, Dropdown, Empty, MenuProps } from 'antd';
import {
  GlobalOutlined,
  StarOutlined,
  StarFilled,
  CopyOutlined,
  CheckSquareOutlined,
  CheckSquareFilled,
  ArrowUpOutlined,
  ArrowDownOutlined
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { extractFirstParagraphText, extractFirstImage } from '../utils/helpers';
import { useArticleListManager } from '../hooks/useArticleListManager';
import { Article, FeedSource } from '../db/database';
import { usePrevious } from '../hooks/usePrevious';
import PulsingLoader from './PulsingLoader';
import styles from './ArticleList.module.css';
import { EnhancedLogger } from '../utils/logConfig';

// 高级日期格式化，根据日期与当前时间的关系显示不同格式
const formatArticleDate = (dateString: string | undefined): string => {
  if (!dateString) return '日期未知';
  
  try {
    const date = new Date(dateString);
    
    // 检查日期是否有效
    if (isNaN(date.getTime())) return '日期无效';
    
    // 根据日期与当前时间的关系显示不同格式
    if (isToday(date)) {
      // 今天: 显示时间 "今天 15:30"
      return `今天 ${format(date, 'HH:mm')}`;
    } else if (isYesterday(date)) {
      // 昨天: 显示 "昨天 15:30"
      return `昨天 ${format(date, 'HH:mm')}`;
    } else if (isThisWeek(date)) {
      // 本周: 显示星期和时间 "周一 15:30"
      return format(date, 'EEE HH:mm', { locale: zhCN });
    } else if (isThisYear(date)) {
      // 本年: 显示月日 "3月15日"
      return format(date, 'M月d日', { locale: zhCN });
    } else {
      // 更早: 显示完整日期 "2022年3月15日"
      return format(date, 'yyyy年M月d日', { locale: zhCN });
    }
  } catch (e) {
    EnhancedLogger.error('ARTICLES', `日期格式化错误: ${e}`);
    return '日期未知';
  }
};

// 文章行组件，使用framer-motion提供动画效果
const Row = memo(({ index, style, data }: any) => {
  const { articles, selectedArticleId, feedInfoMap, handleArticleClick, createContextMenuItems, isInTransition } = data;
  const article = articles[index];
  const [isImageError, setIsImageError] = useState(false);

  // 当行被重用于不同的文章时，重置错误状态
  useEffect(() => {
    setIsImageError(false);
  }, [article.id]);
  
  // 加快动画延迟，最大延迟限制在60ms
  const animationDelay = Math.min(index * 0.008, 0.06);
  
  // 确定文章是否已读
  const isRead = article.isRead === 'true';
  const isSelected = article.id === selectedArticleId;
  
  // 从文章内容中提取摘要和图片
  const articleSummary = article.summary || extractFirstParagraphText(article.content) || article.contentText || '没有摘要';
  const articleImage = article.imageUrl || extractFirstImage(article.content);
  
  // 文章来源信息
  const feed = article.sourceId ? feedInfoMap.get(article.sourceId) : undefined;
  let articleSourceTitle = feed?.title || '未知来源';
  const articleSourceIconUrl = feed?.iconUrl;
  
  // 使用高级格式化日期
  const formattedDate = formatArticleDate(article.publishDate);
  
  // 菜单项
  const contextMenuItems = createContextMenuItems(article);
  
  // 使用更高效的渲染方式
  // 如果是切换状态，使用更简单的动画
  if (isInTransition) {
    return (
      <div 
        style={{
          ...style,
          opacity: 0.9,
          transform: 'translateY(0px)',
        }}
        className={`${styles.listItemV5} ${
          isRead ? styles.readItemV5 : styles.unreadItemV5
        } ${isSelected ? styles.selectedItemV5 : ''}`}
        onClick={() => handleArticleClick(article.id)}
      >
        <div className={styles.metaHeaderV5}>
          <div className={styles.sourceInfoV5}>
            <Avatar 
              src={articleSourceIconUrl} 
              size={18} 
              icon={<GlobalOutlined />} 
              className={styles.sourceIconV5}
            />
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
          {!isImageError && articleImage && (
            <div className={styles.imageContainerV5}>
              <img 
                src={articleImage} 
                alt={article.title || '文章图片'} 
                className={styles.imageV5} 
                loading="lazy" 
                onError={() => setIsImageError(true)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // 正常状态下使用完整动画
  return (
    <motion.div
      style={{
        ...style,
        position: 'absolute',
        top: style.top,
        left: style.left,
        width: style.width,
        height: style.height,
      }}
      initial={{ opacity: 0.9, y: 5 }} // 减少初始Y偏移，提高初始透明度
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.12, // 加快动画速度
        delay: animationDelay, // 减少延迟
        ease: "easeOut"
      }}
    >
      <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
        <div
          className={`${styles.listItemV5} ${
            isRead ? styles.readItemV5 : styles.unreadItemV5
          } ${isSelected ? styles.selectedItemV5 : ''}`}
          onClick={() => handleArticleClick(article.id)}
          data-article-id={article.id}
        >
          <div className={styles.metaHeaderV5}>
            <div className={styles.sourceInfoV5}>
              <Avatar 
                src={articleSourceIconUrl} 
                size={18} 
                icon={<GlobalOutlined />} 
                className={styles.sourceIconV5}
              />
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
            {!isImageError && articleImage && (
              <div className={styles.imageContainerV5}>
                <img 
                  src={articleImage} 
                  alt={article.title || '文章图片'} 
                  className={styles.imageV5} 
                  loading="lazy" 
                  onError={() => setIsImageError(true)}
                />
              </div>
            )}
          </div>
        </div>
      </Dropdown>
    </motion.div>
  );
});

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
  
  // 添加状态变量，用于触发重新渲染
  const [imageErrorRefresh, setImageErrorRefresh] = useState(0);
  
  useEffect(() => {
    selectArticleRef.current = onSelectArticle;
  }, [onSelectArticle]);

  // 使用增强日志记录组件初始化
  useEffect(() => {
    EnhancedLogger.debug('ARTICLES', '文章列表组件已挂载', {
      feedId: currentFeedId,
      groupId: currentGroupId,
      topicId: currentTopicId
    });
    
    return () => {
      EnhancedLogger.debug('ARTICLES', '文章列表组件已卸载');
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
  }, [selectedArticleId, prevSelectedArticleId, scrollToArticle, imageErrorRefresh]);

  useEffect(() => {
    if (displayedArticles.length > 0) {
      EnhancedLogger.info('ARTICLES', `加载了 ${displayedArticles.length} 篇文章`, {
        isRefreshing,
        filter: JSON.stringify(filter),
        contextInfo: { feedId: currentFeedId, groupId: currentGroupId, topicId: currentTopicId }
      });
    }
  }, [displayedArticles.length, isRefreshing, filter, currentFeedId, currentGroupId, currentTopicId]);

  const handleArticleClick = (articleId: string) => {
    EnhancedLogger.debug('ARTICLES', `文章点击: ${articleId}`);
    selectArticleRef.current(articleId);
  };
  
  // 菜单操作函数
  const toggleStar = async (articleId: string) => {
    EnhancedLogger.startPerf(`toggleStar-${articleId}`);
    await handleToggleStar(articleId);
    EnhancedLogger.endPerf(`toggleStar-${articleId}`, 'ARTICLES');
  };

  const handleMarkAboveAsRead = async (articleId: string) => {
    const index = displayedArticles.findIndex(a => a.id === articleId);
    if (index <= 0) return;
    
    const articlesToMark = displayedArticles.slice(0, index).filter(a => a.isRead === 'false');
    if (articlesToMark.length > 0) {
      EnhancedLogger.info('ARTICLES', `标记${articlesToMark.length}篇文章为已读 (上方)`);
      EnhancedLogger.startPerf(`markAboveAsRead-${articlesToMark.length}`);
      await handleMarkArticlesAsRead(articlesToMark);
      EnhancedLogger.endPerf(`markAboveAsRead-${articlesToMark.length}`, 'ARTICLES');
    }
  };

  const handleMarkBelowAsRead = async (articleId: string) => {
    const index = displayedArticles.findIndex(a => a.id === articleId);
    if (index === -1 || index >= displayedArticles.length - 1) return;
    
    const articlesToMark = displayedArticles.slice(index + 1).filter(a => a.isRead === 'false');
    if (articlesToMark.length > 0) {
      EnhancedLogger.info('ARTICLES', `标记${articlesToMark.length}篇文章为已读 (下方)`);
      EnhancedLogger.startPerf(`markBelowAsRead-${articlesToMark.length}`);
      await handleMarkArticlesAsRead(articlesToMark);
      EnhancedLogger.endPerf(`markBelowAsRead-${articlesToMark.length}`, 'ARTICLES');
    }
  };

  const handleCopyLink = async (articleUrl: string) => {
    await navigator.clipboard.writeText(articleUrl);
  };
  
  // 创建右键菜单项 - 使用useCallback避免不必要的重新创建
  const createContextMenuItems = useCallback((article: Article): MenuProps['items'] => [
    {
      key: 'toggleRead',
      label: article.isRead === 'true' ? '标记为未读' : '标记为已读',
      icon: article.isRead === 'true' ? <CheckSquareOutlined /> : <CheckSquareFilled />,
      onClick: () => toggleArticleReadStatus(article.id, article.isRead as 'true' | 'false', article.sourceId)
    },
    {
      key: 'toggleStar',
      label: article.isStarred === 'true' ? '取消收藏' : '收藏文章',
      icon: article.isStarred === 'true' ? <StarFilled /> : <StarOutlined />,
      onClick: () => toggleStar(article.id)
    },
    {
      key: 'markAboveAsRead',
      label: '上方全部标为已读',
      icon: <ArrowUpOutlined />,
      onClick: () => handleMarkAboveAsRead(article.id)
    },
    {
      key: 'markBelowAsRead',
      label: '下方全部标为已读',
      icon: <ArrowDownOutlined />,
      onClick: () => handleMarkBelowAsRead(article.id)
    },
    {
      key: 'copyLink',
      label: '复制链接',
      icon: <CopyOutlined />,
      onClick: () => handleCopyLink(article.url)
    }
  ], [toggleArticleReadStatus, toggleStar, handleMarkAboveAsRead, handleMarkBelowAsRead, handleCopyLink]);

  const ITEM_HEIGHT = 107; // 基于CSS的计算结果
  
  // 渲染内容
  const renderContent = () => {
    if (error) {
      EnhancedLogger.error('ARTICLES', `加载文章失败: ${error}`);
      return (
        <motion.div 
          className={styles.emptyState}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }} // 加快动画速度
        >
          <Empty description={`加载失败: ${error}`} />
        </motion.div>
      );
    }
    
    const isInTransition = loading && !isSwitchingFilter;

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
    
    const itemData = {
      articles: displayedArticles,
      selectedArticleId,
      feedInfoMap,
      handleArticleClick,
      createContextMenuItems,
      isInTransition: isInTransition,
    };
    
    return (
      <div className={styles.scrollableArticleListContainer} ref={containerRef}>
        {isSwitchingFilter && (
          <div className={styles.loadingOverlay}>
            <PulsingLoader />
          </div>
        )}
        {isRefreshing && <div className={styles.refreshingIndicator} />}
        
        {(displayedArticles.length > 0) && (
          <AutoSizer>
            {({ height, width }) => (
              <FixedSizeList
                height={height}
                itemCount={displayedArticles.length}
                itemSize={ITEM_HEIGHT}
                width={width}
                itemData={itemData}
                ref={listRef}
                overscanCount={12}
                className={styles.virtualList}
                style={{ 
                  transition: 'opacity 0.12s ease',
                  opacity: isSwitchingFilter ? 0.7 : 1,
                  filter: isInTransition ? 'blur(0.3px)' : 'none',
                }}
              >
                {Row}
              </FixedSizeList>
            )}
          </AutoSizer>
        )}
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

  return (
    <>
      <div className={styles.draggableHeader}></div>
      {renderContent()}
    </>
  );
}));

export default ArticleList; 