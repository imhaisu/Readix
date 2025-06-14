import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Skeleton, Typography, Tag, Tooltip, Spin, Empty, message } from 'antd';
import { 
  StarOutlined, 
  StarFilled,
  GlobalOutlined,
  ExportOutlined,
  ClockCircleOutlined,
  ClockCircleFilled,
  CheckCircleOutlined,
  MinusCircleOutlined,
  ArrowLeftOutlined,
  ShareAltOutlined,
  DeleteOutlined,
  LeftOutlined
} from '@ant-design/icons';
import { useDatabase, Article, FeedSource } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { debounce } from '../utils/helpers';
import styles from './ArticleDetail.module.css';
import { useNavigate } from 'react-router-dom';
import UnstarIcon from './icons/UnstarIcon';
// import BionicReadingToggle from '../components/BionicReadingToggle'; // Temporarily commented out

// const { Title, Text } = Typography; // 移除未使用的 Typography 成员

interface ArticleDetailProps {
  articleId: string | null;
  onClose?: () => void;
  viewMode: 'full' | 'web' | 'original';
  onChangeViewMode: (mode: 'full' | 'web' | 'original') => void;
  onArticleModified: (articleId: string, changes: Partial<Article>) => void;
  onNavigate?: (nextOrPrevArticleId: string) => void;
}

const ArticleDetail: React.FC<ArticleDetailProps> = ({ articleId, onClose, viewMode, onChangeViewMode, onArticleModified, onNavigate }) => {
  const { db, triggerRefresh } = useDatabase();
  const { settings } = useSettings();
  const [article, setArticle] = useState<Article | null | undefined>(undefined);
  const [sourceTitle, setSourceTitle] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollableContentRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();

  const readingSettings = settings.reading;

  const saveScrollPosition = useCallback(async (articleIdToSave: string, position: number) => {
    if (!db || !articleIdToSave) return;
    try {
      await db.articles.update(articleIdToSave, { scrollPosition: position });
    } catch (error) {
      console.error('保存文章滚动位置失败:', error);
    }
  }, [db]);

  const debouncedSaveScrollPosition = useCallback(
    debounce((articleIdToSave: string, position: number) => {
      saveScrollPosition(articleIdToSave, position);
    }, 500),
    [saveScrollPosition]
  );

  useEffect(() => {
    if (articleId) {
      const loadArticleAndProcess = async () => {
        if (!db) return;

        if (viewMode !== 'web' || !article || article.id !== articleId) {
          setLoading(true);
          setArticle(undefined);
          setSourceTitle(undefined);

          try {
            const currentArticleData = await db.articles.get(articleId);

            if (currentArticleData) {
              setArticle(currentArticleData);

              if (viewMode !== 'web' && currentArticleData.isRead === 'false') {
                await db.articles.update(articleId, { isRead: 'true' });
                setArticle(prev => prev ? { ...prev, isRead: 'true' } : null);
                
                if (currentArticleData.sourceId) {
                  const feed = await db.feeds.get(currentArticleData.sourceId);
                  if (feed) {
                    const newUnreadCount = await db.articles.where({ sourceId: currentArticleData.sourceId, isRead: 'false' }).count();
                    await db.feeds.update(currentArticleData.sourceId, { unreadCount: newUnreadCount });
                    console.log(`[ArticleDetail autoMarkRead] Feed ${currentArticleData.sourceId} unread count updated to ${newUnreadCount}`);
                    onArticleModified(articleId, { isRead: 'true' });
                    triggerRefresh();
                  }
                } else {
                  onArticleModified(articleId, { isRead: 'true' });
                  triggerRefresh();
                }
              }

              if (currentArticleData.sourceId) {
                const feed = await db.feeds.get(currentArticleData.sourceId);
                setSourceTitle(feed?.title);
              }
              
              if (viewMode === 'full' && contentRef.current && currentArticleData.scrollPosition !== undefined && currentArticleData.scrollPosition > 0) {
                setTimeout(() => {
                  if (contentRef.current) {
                    contentRef.current.scrollTop = currentArticleData.scrollPosition!;
                  }
                }, 0);
              } else if (contentRef.current) {
                contentRef.current.scrollTop = 0;
              }

            } else {
              setArticle(null);
            }
          } catch (error) {
            console.error('加载文章详情或自动标记已读失败:', error);
            setArticle(null);
          } finally {
            if (viewMode !== 'web') {
              setLoading(false);
            }
          }
        } else if (viewMode === 'web' && article && contentRef.current) {
          contentRef.current.scrollTop = 0;
          setLoading(false);
        } else if (viewMode !== 'web' && article && article.id === articleId) {
          setLoading(false);
        }
      };
      loadArticleAndProcess();
    } else {
      setArticle(null);
      setSourceTitle(undefined);
      setLoading(false);
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }
  }, [db, articleId, viewMode]);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement || viewMode !== 'full') return;

    let scrollSaveTimer: NodeJS.Timeout;

    const handleScroll = () => {
      if (article && articleId) {
        clearTimeout(scrollSaveTimer);
        scrollSaveTimer = setTimeout(() => {
          if (db) {
            db.articles.update(articleId, { scrollPosition: contentElement.scrollTop });
          }
        }, 250);
      }
    };

    if (article && article.scrollPosition && article.scrollPosition > 0) {
      contentElement.scrollTop = article.scrollPosition;
    } else {
      contentElement.scrollTop = 0;
    }

    contentElement.addEventListener('scroll', handleScroll);
    return () => {
      contentElement.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollSaveTimer);
      if (article && articleId && contentElement.scrollTop > 0 && db) {
        db.articles.update(articleId, { scrollPosition: contentElement.scrollTop });
      }
    };
  }, [article, articleId, db, viewMode]);

  useEffect(() => {
    if (viewMode === 'web') {
        setIsScrolled(false);
        return;
    }
    const contentEl = scrollableContentRef.current;
    if (!contentEl) return;

    const checkScroll = () => {
      if (contentEl.scrollTop > 0) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    contentEl.addEventListener('scroll', checkScroll);
    checkScroll();

    return () => {
      contentEl.removeEventListener('scroll', checkScroll);
    };
  }, [articleId, viewMode]);

  const handleToggleStar = async () => {
    if (!db || !article || !articleId) return;
    try {
      const newIsStarred = article.isStarred === 'true' ? 'false' : 'true';
      await db.articles.update(articleId, { isStarred: newIsStarred });
      setArticle(prevArticle => prevArticle ? { ...prevArticle, isStarred: newIsStarred } : null);
      onArticleModified(articleId, { isStarred: newIsStarred });
      triggerRefresh();
    } catch (error) {
      console.error('更新收藏状态失败:', error);
    }
  };

  const handleToggleReadLater = async () => {
    if (!db || !article || !articleId) return;
    try {
      const newIsReadLater = article.isReadLater === 'true' ? 'false' : 'true';
      await db.articles.update(articleId, { isReadLater: newIsReadLater });
      setArticle(prevArticle => prevArticle ? { ...prevArticle, isReadLater: newIsReadLater } : null);
      onArticleModified(articleId, { isReadLater: newIsReadLater });
    } catch (error) {
      console.error('更新稍后读状态失败:', error);
    }
  };

  const handleToggleReadStatus = async () => {
    if (!db || !article || !articleId) return;

    const newIsRead = article.isRead === 'true' ? 'false' : 'true';
    try {
      await db.articles.update(articleId, { isRead: newIsRead });
      
      setArticle(prev => prev ? { ...prev, isRead: newIsRead } : null); 

      if (article.sourceId) {
        const feed = await db.feeds.get(article.sourceId);
        if (feed) {
          const newUnreadCount = await db.articles
            .where({ sourceId: article.sourceId, isRead: 'false' })
            .count();
          await db.feeds.update(article.sourceId, { unreadCount: newUnreadCount });
          console.log(`[ArticleDetail handleToggleReadStatus] Feed ${article.sourceId} unread count updated to ${newUnreadCount}`);
        }
      }
      onArticleModified(articleId, { isRead: newIsRead });
      triggerRefresh();
    } catch (error) {
      console.error('更新文章已读状态失败:', error);
    }
  };

  const handleViewModeChange = (mode: 'full' | 'web' | 'original') => {
    onChangeViewMode(mode);
  };

  const handleOpenInBrowser = () => {
    if (article && article.url) {
      if (window.electronAPI && window.electronAPI.shellOpenExternal) {
        window.electronAPI.shellOpenExternal(article.url);
      } else {
        // Fallback for non-Electron environments or if API is not exposed
        console.warn('electronAPI.shellOpenExternal is not available. Opening in new tab as fallback.');
        window.open(article.url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  if (loading && (!article || viewMode !== 'web')) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
      </div>
    );
  }

  if (viewMode === 'web') {
    if (!articleId || !article || !article.url) {
        return (
            <div className={`${styles.container} ${styles.webViewContainerFullPage}`}>
                <div className={styles.webViewHeader}>
                    <Tooltip title="返回文章">
                        <Button 
                            type="text" 
                            icon={<ArrowLeftOutlined />} 
                            onClick={() => handleViewModeChange('full')} 
                            className={styles.webViewBackButton}
                        />
                    </Tooltip>
                </div>
                <Empty description="无法加载原始链接，文章信息不完整" />
            </div>
        );
    }
    return (
      <div className={`${styles.container} ${styles.webViewContainerFullPage}`}>
        <div className={styles.webViewHeader}>
            <Tooltip title="返回文章">
                <Button 
                    type="text" 
                    icon={<ArrowLeftOutlined />} 
                    onClick={() => handleViewModeChange('full')}
                    className={styles.webViewBackButton}
                />
            </Tooltip>
            {article.title && <span className={styles.webViewPageTitle}>{article.title} (原始链接)</span>}
        </div>
        <webview
          src={article.url}
          className={styles.webFrameFullPage}
        />
      </div>
    );
  }

  if (!article) {
    return (
      <div className={styles.errorContainer}>
        <Empty description={articleId ? "文章加载失败或不存在" : "未选择文章"} />
      </div>
    );
  }

  const renderArticleContent = () => {
    const contentToRender = article.content;
    return (
      <div
        ref={viewMode === 'full' ? contentRef : null}
        className={`${styles.articleContent}`}
        dangerouslySetInnerHTML={{ __html: contentToRender || '' }}
      />
    );
  };

  const articleStyle = {
    '--article-bg-color': readingSettings.backgroundColor,
    '--article-text-color': readingSettings.textColor,
    '--article-title-color': readingSettings.titleColor,
    '--article-font-size-body': `${readingSettings.fontSize}px`,
    '--article-font-size-title': `${readingSettings.titleFontSize}px`,
    '--article-line-height-body': readingSettings.lineHeight,
    fontFamily: readingSettings.fontFamily,
  } as React.CSSProperties;

  return (
    <div className={styles.container} style={articleStyle}>
      <div className={`${styles.fixedControlsBar} ${isScrolled ? styles.scrolled : ''}`}>
        <div className={styles.headerControls}>
          <Tooltip title={article.isRead === 'true' ? "标记为未读" : "标记为已读"}>
            <Button 
              type="text" 
              icon={article.isRead === 'true' ? <CheckCircleOutlined /> : <MinusCircleOutlined />}
              onClick={handleToggleReadStatus}
              className={styles.toolbarButton}
            />
          </Tooltip>
          <Tooltip title={article.isStarred === 'true' ? "取消收藏" : "收藏"}>
            <Button
              shape="circle"
              icon={article.isStarred === 'true' ? <UnstarIcon /> : <StarOutlined />}
              onClick={handleToggleStar}
              className={styles.toolbarButton}
              type="text"
            />
          </Tooltip>
          <Tooltip title={article.isReadLater === 'true' ? "从稍后阅读移除" : "添加到稍后阅读"}>
            <Button
              type="text"
              icon={article.isReadLater === 'true' ? <ClockCircleFilled /> : <ClockCircleOutlined />}
              onClick={handleToggleReadLater}
              className={styles.toolbarButton}
            />
          </Tooltip>
          <div className={styles.controlSeparator}></div>
          <Tooltip title="访问原址">
            <Button 
              type="text" 
              icon={<GlobalOutlined />} 
              onClick={() => handleViewModeChange('web')}
              className={styles.toolbarButton}
            />
          </Tooltip>
          <Tooltip title="浏览器打开">
            <Button 
              type="text" 
              icon={<ExportOutlined />} 
              onClick={handleOpenInBrowser} 
              className={styles.toolbarButton}
            />
          </Tooltip>
        </div>
      </div>

      <div className={styles.content} ref={scrollableContentRef}>
        <article className={styles.article}>
          <header className={styles.header}>
            {article.publishDate && (
              <p className={styles.publishDate}>
                {format(new Date(article.publishDate), 'EEEE, MMMM d, yyyy \'at\' HH:mm', { locale: zhCN })}
              </p>
            )}
            <h1 className={styles.title}>{article.title}</h1>
            {sourceTitle && <p className={styles.sourceName}>{sourceTitle}</p>}
          </header>
          
          {renderArticleContent()}

        </article>
      </div>
    </div>
  );
};

export default ArticleDetail; 