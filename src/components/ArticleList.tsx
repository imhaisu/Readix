import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, memo } from 'react';
import { List, Empty, Dropdown, message, Spin, Menu, Skeleton, Avatar } from 'antd';
import { 
  StarOutlined, StarFilled, CheckOutlined, CheckCircleOutlined, EyeOutlined, 
  ArrowUpOutlined, ArrowDownOutlined, CopyOutlined, RightOutlined, MenuOutlined,
  LeftOutlined, ClockCircleOutlined, ClockCircleFilled, GlobalOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';
import { Article } from '../db/database';
import { useDatabase } from '../contexts/DatabaseContext';
import { extractFirstParagraphText, extractFirstImage } from '../utils/helpers';
import styles from './ArticleList.module.css';
import PulsingLoader from './PulsingLoader';
import { debounce } from 'lodash';
import { useArticleListManager } from '../hooks/useArticleListManager'; // 导入ArticleListManager钩子
import { usePrevious } from '../hooks/usePrevious'; // 导入usePrevious钩子

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
  scrollToArticle: (articleId: string) => void;
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

// 优化ArticleList使用React.memo包装
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
  const selectArticleRef = useRef(onSelectArticle);
  
  // 更新ref的值，这样我们可以在副作用中安全地使用它
  useEffect(() => {
    selectArticleRef.current = onSelectArticle;
  }, [onSelectArticle]);

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
    currentTopicId,
    lastUpdatedArticleInfo,
    listRefreshKey,
    onSelectArticle: selectArticleRef.current,
    onLastUpdatedArticleInfoChange,
  });

  // 添加强制刷新状态
  const [forceRefreshKey, setForceRefreshKey] = useState(0);

  // 添加保存和恢复滚动位置的功能
  const listScrollPositionKey = `articleList_scrollPos_${currentFeedId || ''}_${currentGroupId || ''}_${filter?.isRead || ''}`;
  
  // 保存滚动位置
  const saveScrollPosition = useCallback(() => {
    if (containerRef.current) {
      const scrollTop = containerRef.current.scrollTop;
      localStorage.setItem(listScrollPositionKey, scrollTop.toString());
    }
  }, [listScrollPositionKey]);

  // 恢复滚动位置
  useEffect(() => {
    if (containerRef.current && !isPullingDown && displayedArticles.length > 0) {
      const savedPosition = localStorage.getItem(listScrollPositionKey);
      if (savedPosition) {
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = parseInt(savedPosition, 10);
          }
        }, 100); // 短暂延迟确保DOM已更新
      }
    }
  }, [displayedArticles, listScrollPositionKey, isPullingDown]);

  // 监听滚动事件保存位置
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = debounce(() => {
      saveScrollPosition();
    }, 200);

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [saveScrollPosition]);

  const scrollToArticle = (articleId: string) => {
    if (!containerRef.current) return;
    const articleElement = containerRef.current.querySelector(`[data-article-id="${articleId}"]`) as HTMLElement;
    if (articleElement) {
      // 计算滚动位置，确保元素位于容器中心位置
      const containerHeight = containerRef.current.clientHeight;
      const articleHeight = articleElement.offsetHeight;
      const articleTop = articleElement.offsetTop;
      const currentScroll = containerRef.current.scrollTop;
      
      // 计算目标滚动位置，使元素位于容器中间
      const targetScroll = articleTop - (containerHeight - articleHeight) / 2;
      
      // 如果目标位置与当前位置相差太小，不执行滚动操作
      const scrollThreshold = 100; // 像素阈值
      if (Math.abs(targetScroll - currentScroll) < scrollThreshold) {
        return; // 跳过无意义的小距离滚动
      }
      
      // 使用平滑滚动，但只在距离较远时才使用
      articleElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  };

  const { db } = useDatabase();
  const prevSelectedArticleId = usePrevious(selectedArticleId);

  // 添加文章选中状态持久化
  useEffect(() => {
    // 如果列表刷新后选中的文章不在列表中，尝试重新获取
    if (selectedArticleId && displayedArticles.length > 0 && !displayedArticles.some(a => a.id === selectedArticleId)) {
      console.log('选中的文章不在当前列表中，尝试保持选中状态');
      
      // 确保文章仍存在于数据库中
      if (db) {
        db.articles.get(selectedArticleId).then(article => {
          if (!article) {
            // 文章不存在，清除选中状态
            selectArticleRef.current(null);
          }
        }).catch(error => {
          console.error('检查文章状态失败:', error);
        });
      }
    }
  }, [selectedArticleId, displayedArticles, db]);
  
  // 确保选中的文章在视图内
  useEffect(() => {
    if (selectedArticleId && displayedArticles.length > 0 && !isPullingDown) {
      const selectedArticleIndex = displayedArticles.findIndex(a => a.id === selectedArticleId);
      if (selectedArticleIndex !== -1) {
        // 延迟执行，确保DOM已更新
      setTimeout(() => {
          if (containerRef.current) {
        const articleElement = containerRef.current.querySelector(`[data-article-id="${selectedArticleId}"]`) as HTMLElement;
        if (articleElement) {
          const rect = articleElement.getBoundingClientRect();
          const containerRect = containerRef.current.getBoundingClientRect();
          
              // 检查元素是否完全可见
          const isFullyVisible = (
              rect.top >= containerRect.top &&
              rect.bottom <= containerRect.bottom
          );

              // 如果元素不完全可见，则滚动到该位置
              // 但只有在列表刚刚加载或用户明确选择了文章时才滚动
              if (!isFullyVisible && (listRefreshKey || prevSelectedArticleId !== selectedArticleId)) {
            scrollToArticle(selectedArticleId);
          }
        }
          }
        }, 100);
      }
    }
  }, [selectedArticleId, displayedArticles, isPullingDown, filter, searchTerm, listRefreshKey, prevSelectedArticleId]);

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
      selectArticleRef.current(nextArticle.id);
      
      // 自动滚动到选中的文章
      scrollToArticle(nextArticle.id);
    }
  }, [selectedArticleId, displayedArticles]);

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
    // 记录点击时的滚动位置
    const currentScrollPosition = containerRef.current?.scrollTop || 0;
    
    // 调用选择文章的回调
    selectArticleRef.current(articleId);
    
    // 将当前滚动位置保存到本地存储
    if (containerRef.current) {
      localStorage.setItem(listScrollPositionKey, currentScrollPosition.toString());
    }
  };

  const toggleStar = async (articleId: string) => {
    const article = displayedArticles.find(a => a.id === articleId);
    if (!article) return;
    
    const newIsStarred = article.isStarred === 'true' ? 'false' : 'true';
    
    try {
      await handleToggleStar(article.id);
      // 移除收藏状态变化的提示，用户可以直接从界面上看到变化
    } catch (error) {
      console.error('无法切换星标状态', error);
      message.error('切换星标状态失败');
    }
  };

  const handleMarkAboveAsRead = async (articleId: string) => {
    const currentIndex = displayedArticles.findIndex(a => a.id === articleId);
    if (currentIndex === -1) return;

    const articlesToMark = displayedArticles.slice(0, currentIndex).filter(a => a.isRead === 'false');
    if (articlesToMark.length === 0) {
      return; // 移除没有未读文章的提示
    }

    try {
      const count = await handleMarkArticlesAsRead(articlesToMark);
      message.success(`已标记 ${count} 篇文章为已读`); // 简化提示
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleMarkBelowAsRead = async (articleId: string) => {
    const currentIndex = displayedArticles.findIndex(a => a.id === articleId);
    if (currentIndex === -1) return;

    const articlesToMark = displayedArticles.slice(currentIndex + 1).filter(a => a.isRead === 'false');
    if (articlesToMark.length === 0) {
      return; // 移除没有未读文章的提示
    }

    try {
      const count = await handleMarkArticlesAsRead(articlesToMark);
      message.success(`已标记 ${count} 篇文章为已读`); // 简化提示
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleCopyLink = async (articleUrl: string) => {
    try {
      await navigator.clipboard.writeText(articleUrl);
      // 简化提示
      message.success('已复制链接');
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
    
    // 优化未知来源的处理逻辑
    let articleSourceTitle = '未知来源';
    if (feed?.title) {
      articleSourceTitle = feed.title;
    } else if (article.sourceId) {
      // 尝试从文章的 sourceId 中提取域名或其他信息作为备用显示
      try {
        // 如果 sourceId 是 URL 形式，尝试提取主机名
        if (article.sourceId.startsWith('http')) {
          const url = new URL(article.sourceId);
          articleSourceTitle = url.hostname;
        } else {
          // 如果 sourceId 不是 URL 但包含有意义的标识符，则使用它
          articleSourceTitle = article.sourceId.split('-')[0] || '未知来源';
        }
      } catch (e) {
        articleSourceTitle = '未知来源';
      }
    }
    
    const articleSourceIconUrl = feed ? feed.iconUrl : undefined;
    const isArticleSelected = selectedArticleId === article.id;
    const isRead = article.isRead === 'true';

    // 检查图标是否已知错误
    const hasIconError = article.sourceId ? iconErrorCache.get(article.sourceId) : false;

    // 图标加载错误处理函数
    const handleIconError = (articleSourceId: string) => {
      if (articleSourceId) {
        iconErrorCache.set(articleSourceId, true);
        setForceRefreshKey(prev => prev + 1);
      }
      return false;
    };

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
      // 显示一个更友好的空状态
      return (
        <div className={styles.emptyState || ''} style={{ 
          padding: '48px 24px', 
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <Empty 
            description="没有找到文章" 
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      );
    }
  
    return (
      <div className={styles.scrollableArticleListContainer} ref={containerRef} tabIndex={-1}>
        {isRefreshing && (
          <div style={{ 
            padding: '6px', /* 减少内边距 */
            textAlign: 'center', 
            position: 'sticky', 
            top: 0, 
            backgroundColor: 'var(--bg-primary)',
            zIndex: 5,
            // 删除底部边框线
            // borderBottom: '1px solid var(--border-color)'
          }}>
            <PulsingLoader inline={true} compact={true} />
          </div>
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
    getArticles: () => displayedArticles,
    getArticleCount: () => displayedArticles.length, // 实现 getArticleCount
    scrollToArticle: scrollToArticle,
    getScrollPosition: () => containerRef.current?.scrollTop || 0,
    setScrollPosition: (position) => {
      if (containerRef.current) {
        containerRef.current.scrollTop = position;
      }
    }
  }));

  // 组件卸载时保存滚动位置
  useEffect(() => {
    return () => {
      saveScrollPosition();
    };
  }, [saveScrollPosition]);

  return (
    <div 
      className={styles.scrollableArticleListContainer}
      ref={containerRef}
      onClick={() => document.activeElement instanceof HTMLElement && document.activeElement.blur()}
    >
      <div className={styles.draggableHeader}></div>
      
      {renderContent()}
    </div>
  );
}));

export default ArticleList; 