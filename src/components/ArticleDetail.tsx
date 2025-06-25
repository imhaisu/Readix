import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Skeleton, Tooltip, Spin, Empty, message, Modal } from 'antd';
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
  HighlightOutlined,
  CloseOutlined,
  ReadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useDatabase } from '../contexts/DatabaseContext';
import { Article } from '../db/database';
import { useSettings } from '../contexts/SettingsContext';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { debounce, updateUnreadCountOptimized } from '../utils/helpers';
import styles from './ArticleDetail.module.css';
import AnnotationSidebar from './AnnotationSidebar';
import { useAnnotations } from '../hooks/useAnnotations';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface ArticleDetailProps {
  articleId: string | null;
  onClose?: () => void;
  viewMode: 'full' | 'web' | 'original';
  onChangeViewMode: (mode: 'full' | 'web' | 'original') => void;
  onArticleModified: (articleId: string, changes: Partial<Article>) => void;
  onNavigate?: (nextOrPrevArticleId: string) => void;
}

const ArticleDetail: React.FC<ArticleDetailProps> = ({ articleId, onClose, viewMode, onChangeViewMode, onArticleModified }) => {
  const { db } = useDatabase();
  const { settings } = useSettings();
  const [article, setArticle] = useState<Article | null | undefined>(undefined);
  const [sourceTitle, setSourceTitle] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [fetchingFullText, setFetchingFullText] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollableContentRef = useRef<HTMLDivElement>(null);
  const mainContentAreaRef = useRef<HTMLDivElement>(null);
  const articleDetailContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState('');
  
  const iconButtonStyle: React.CSSProperties = {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: '50%',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
  };

  const iconStyle: React.CSSProperties = {
    color: 'white',
    fontSize: 16,
  };

  const {
    annotations,
    processedContent,
    setProcessedContent,
    isSidebarVisible,
    pendingAnnotation,
    autoEditNoteId,
    selectionPopup,
    popupRef,
    loadAnnotations,
    applyHighlights,
    handleToggleSidebar,
    handleScrollToAnnotation,
    handleSelection,
    handleHighlightClick,
    handleNoteClick,
    handleSaveNote,
    handleDeleteAnnotation,
    handleAutoEditApplied,
  } = useAnnotations({ articleId, scrollableContentRef });

  const readingSettings = settings.appearance.reading;

  const handleShare = () => {
    if (article) {
      navigator.clipboard.writeText(article.url)
        .then(() => message.success('文章链接已复制到剪贴板'))
        .catch(() => message.error('复制链接失败'));
    }
  };

  const saveScrollPosition = useCallback(async (articleIdToSave: string, position: number) => {
    if (!db || !articleIdToSave) return;
    try {
      await db.articles.update(articleIdToSave, { scrollPosition: position });
    } catch (error) {
      console.error('保存文章滚动位置失败:', error);
    }
  }, [db]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const loadArticleRef = useRef<((forceReload?: boolean) => Promise<void>) | null>(null);

  const performUpgrade = useCallback(async (articleToUpgrade: Article) => {
    if (!articleToUpgrade || !articleToUpgrade.url || !db || !isMounted) return;

    setFetchingFullText(true);
    try {
      const result = await window.electron.fetchArticleContent(articleToUpgrade.url);
      if (result && result.content) {
        await db.articles.update(articleToUpgrade.id, {
          content: result.content,
          title: result.title,
          isFullText: true,
        });
        if (loadArticleRef.current) {
          await loadArticleRef.current(true);
        }
      } else {
        message.error('无法获取文章全文，目标网站可能不支持。');
      }
    } catch (error: any) {
      console.error("获取全文失败:", error);
      message.error(`获取全文时发生错误: ${error.message}`);
    } finally {
      if (isMounted) {
        setFetchingFullText(false);
      }
    }
  }, [db, isMounted]);

  const loadArticle = useCallback(async (forceReload = false) => {
    if (articleId && db) {
      if (forceReload || !article || article.id !== articleId) {
        setLoading(true);
        setArticle(undefined);
        setSourceTitle(undefined);
        setProcessedContent('');
  
        try {
          const currentArticleData = await db.articles.get(articleId);
  
          if (currentArticleData) {
            const source = await db.feeds.get(currentArticleData.sourceId);
            setSourceTitle(source?.title);

            if (!currentArticleData.isFullText && source?.defaultViewMode === 'fulltext') {
              await performUpgrade(currentArticleData);
              return;
            }
            
            const annos = await loadAnnotations();
            const contentWithHighlights = applyHighlights(currentArticleData.content, annos);
            setProcessedContent(contentWithHighlights);

            setArticle(currentArticleData);
  
            if (source) {
              setSourceTitle(source.title);
            }

            if (currentArticleData.isRead === 'false' && readingSettings.autoMarkAsRead) {
              await db.articles.update(articleId, { isRead: 'true' });
              console.log(`文章 ${articleId} 已自动标记为已读。`);
            }
          } else {
            setArticle(null);
          }
        } catch (error) {
          console.error('加载文章详情失败:', error);
          setArticle(null);
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      } else if (viewMode === 'web' && article && contentRef.current) {
        contentRef.current.scrollTop = 0;
        setLoading(false);
      } else if (viewMode !== 'web' && article && article.id === articleId) {
        setLoading(false);
      }
    } else {
      setArticle(null);
      setLoading(false);
    }
  }, [articleId, db, article, isMounted, performUpgrade, loadAnnotations, applyHighlights, setProcessedContent, readingSettings]);
  
  useEffect(() => {
    loadArticleRef.current = loadArticle;
  }, [loadArticle]);

  useEffect(() => {
    loadArticle();
  }, [articleId, loadArticle]);

  const handleFetchAndUpgradeArticle = useCallback(async (articleToUpgrade: Article) => {
    if (annotations.length > 0) {
      Modal.confirm({
        title: '确认获取全文',
        content: '当前文章已有笔记或高亮。获取全文会替换内容，并可能导致笔记定位不准确。是否继续？',
        okText: '继续获取',
        cancelText: '取消',
        onOk: () => performUpgrade(articleToUpgrade),
      });
    } else {
      performUpgrade(articleToUpgrade);
    }
  }, [annotations, performUpgrade]);

  useEffect(() => {
    return () => {
      if (articleId && scrollableContentRef.current) {
        saveScrollPosition(articleId, scrollableContentRef.current.scrollTop);
      }
    };
  }, [articleId, saveScrollPosition]);

  useEffect(() => {
    const contentElement = scrollableContentRef.current;
    if (!contentElement || (viewMode !== 'full' && viewMode !== 'original')) return;

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
      setIsScrolled(contentEl.scrollTop > 0);
    };

    contentEl.addEventListener('scroll', checkScroll);
    checkScroll();

    return () => contentEl.removeEventListener('scroll', checkScroll);
  }, [articleId, viewMode]);

  useEffect(() => {
    const scrollableElement = scrollableContentRef.current;
    if (!scrollableElement) return;

    let scrollTimeout: NodeJS.Timeout | null = null;
    const handleScroll = () => {
      scrollableElement.classList.add(styles.scrolling);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        scrollableElement.classList.remove(styles.scrolling);
      }, 1500);
    };
    scrollableElement.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollableElement.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [articleId, viewMode]);

  const enhanceImageClickability = useCallback(() => {
    const contentElement = contentRef.current;
    if (!contentElement) return;

    const enhanceImgElements = () => {
      const imgElements = contentElement.querySelectorAll('img');
      imgElements.forEach(img => {
        if (!img.hasAttribute('data-enhanced-click')) {
          img.setAttribute('data-enhanced-click', 'true');
          img.style.cursor = 'pointer';
          
          // 添加图片错误处理
          img.addEventListener('error', () => {
            img.classList.add('broken-image');
            console.log('图片加载失败:', img.getAttribute('src'));
            
            // 尝试替换http为https，有时候这能解决问题
            const src = img.getAttribute('src');
            if (src && src.startsWith('http:')) {
              const newSrc = src.replace('http:', 'https:');
              img.setAttribute('src', newSrc);
            }
          });
          
          img.addEventListener('click', (e) => {
            if (img.classList.contains('broken-image')) return;
            
            e.preventDefault();
            e.stopPropagation();
            const src = img.getAttribute('src');
            if (src) {
              setImageModalUrl(src);
              setImageModalVisible(true);
            }
          });
        }
      });

      const potentialBgImgElements = contentElement.querySelectorAll('figure, div.image, div[style*="background-image"], span[style*="background-image"]');
      potentialBgImgElements.forEach(el => {
        if (!el.hasAttribute('data-enhanced-click')) {
          el.setAttribute('data-enhanced-click', 'true');
          const style = window.getComputedStyle(el);
          if (style.backgroundImage && style.backgroundImage !== 'none') {
            (el as HTMLElement).style.cursor = 'pointer';
            el.addEventListener('click', (e) => {
              const match = style.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
              if (match && match[1]) {
                e.preventDefault();
                e.stopPropagation();
                setImageModalUrl(match[1]);
                setImageModalVisible(true);
              }
            });
          }
        }
      });
    };

    enhanceImgElements();

    const observer = new MutationObserver(enhanceImgElements);
    observer.observe(contentElement, { 
      childList: true, 
      subtree: true 
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (article && !loading && processedContent) {
      const cleanup = enhanceImageClickability();
      return cleanup;
    }
  }, [article, loading, processedContent, enhanceImageClickability]);

  const handleToggleStar = async () => {
    if (!db || !article || !articleId) return;
    const newIsStarred = article.isStarred === 'true' ? 'false' : 'true';
    await db.articles.update(articleId, { isStarred: newIsStarred });
    setArticle(prev => prev ? { ...prev, isStarred: newIsStarred } : null);
    onArticleModified(articleId, { isStarred: newIsStarred });
  };

  const handleToggleReadLater = async () => {
    if (!db || !article || !articleId) return;
    const newIsReadLater = article.isReadLater === 'true' ? 'false' : 'true';
    await db.articles.update(articleId, { isReadLater: newIsReadLater });
    setArticle(prev => prev ? { ...prev, isReadLater: newIsReadLater } : null);
    onArticleModified(articleId, { isReadLater: newIsReadLater });
  };

  const handleToggleReadStatus = async () => {
    if (article && db) {
      const currentScrollPosition = scrollableContentRef.current?.scrollTop;
      const newReadStatus = article.isRead === 'true' ? 'false' : 'true';

      try {
        await db.articles.update(article.id, { 
          isRead: newReadStatus,
          ...(currentScrollPosition !== undefined && { scrollPosition: currentScrollPosition })
        });

        const updatedArticle = { 
          ...article, 
          isRead: newReadStatus,
          scrollPosition: currentScrollPosition ?? article.scrollPosition 
        };
        setArticle(updatedArticle);
        
        onArticleModified(article.id, { isRead: newReadStatus });

        if (article.sourceId) {
          updateUnreadCountOptimized(db, article.sourceId);
        }

      } catch (error) {
        console.error('更新文章已读状态失败:', error);
      }
    }
  };

  const handleViewModeChange = (mode: 'full' | 'web' | 'original') => {
    onChangeViewMode(mode);
  };

  const handleOpenInBrowser = () => {
    if (article?.url) {
      window.electron.shellOpenExternal(article.url);
    }
  };

  const handleCloseImageModal = () => {
    setImageModalVisible(false);
    setImageModalUrl('');
  };

  const renderArticleContent = () => {
    if (!article) return null;
    if (article.content && (viewMode === 'full' || viewMode === 'original')) {
      return (
        <div 
          ref={contentRef}
          className={styles.articleContent}
          style={{
             fontSize: `${readingSettings.fontSize}px`,
             lineHeight: readingSettings.lineHeight,
             fontFamily: readingSettings.fontFamily,
          }}
          dangerouslySetInnerHTML={{ __html: processedContent || '' }}
        />
      );
    }
    return null;
  };

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

  const articleStyle = {
    '--article-bg-color': readingSettings.backgroundColor,
    '--article-text-color': readingSettings.textColor,
    '--article-title-color': readingSettings.titleColor,
    '--article-title-font-size': `${readingSettings.titleFontSize}px`,
  } as React.CSSProperties;

  if (loading) {
    return (
      <div className={styles.articleDetailContainer} style={articleStyle}>
        <Skeleton active paragraph={{ rows: 15 }} />
      </div>
    );
  }

  if (!article) {
    return <div className={styles.articleDetailContainer} style={articleStyle}>
      <Empty description="文章不存在或已被删除" className={styles.emptyState} />
    </div>;
  }

  return (
    <div ref={articleDetailContainerRef} className={styles.articleDetailContainer} style={articleStyle}>
      <div className={`${styles.fixedControlsBar} ${isScrolled ? styles.scrolled : ''}`}>
        <Tooltip title="关闭">
          <Button
            type="text"
            shape="circle"
            icon={<CloseOutlined />}
            onClick={onClose}
            className={styles.toolbarButton}
          />
        </Tooltip>
        
        <div className={styles.headerControls}>
          <Tooltip title={article.isRead === 'true' ? "标记为未读" : "标记为已读"}>
            <Button 
              type="text" 
              icon={article.isRead === 'true' ? <CheckCircleOutlined /> : <MinusCircleOutlined />}
              onClick={handleToggleReadStatus}
              className={styles.toolbarButton}
            />
          </Tooltip>

          <Tooltip title={article.isStarred === 'true' ? '取消收藏' : '添加收藏'}>
            <Button
              type="text"
              shape="circle"
              icon={article.isStarred === 'true' ? <StarFilled /> : <StarOutlined />}
              onClick={handleToggleStar}
              className={styles.toolbarButton}
            />
          </Tooltip>

          <Tooltip title={article.isReadLater === 'true' ? '从"稍后读"移除' : '添加到"稍后读"'}>
            <Button
              type="text"
              shape="circle"
              icon={article.isReadLater === 'true' ? <ClockCircleFilled /> : <ClockCircleOutlined />}
              onClick={handleToggleReadLater}
              className={styles.toolbarButton}
            />
          </Tooltip>

          <div className={styles.controlSeparator}></div>

          <Tooltip title="笔记和高亮">
            <Button type="text" shape="circle" icon={<HighlightOutlined />} onClick={handleToggleSidebar} className={styles.toolbarButton}/>
          </Tooltip>

          {/* <Tooltip title="访问原址">
            <Button 
              type="text" 
              icon={<GlobalOutlined />} 
              onClick={() => handleViewModeChange('web')}
              className={styles.toolbarButton}
            />
          </Tooltip> */}

          {article && !article.isFullText && (
            <Tooltip title="获取全文">
              <Button 
                type="text"
                shape="circle"
                icon={<ReadOutlined />} 
                onClick={() => handleFetchAndUpgradeArticle(article)}
                loading={fetchingFullText}
                className={styles.toolbarButton}
              />
            </Tooltip>
          )}
          
          <div className={styles.controlSeparator}></div>

          <Tooltip title="浏览器打开">
            <Button 
              type="text" 
              icon={<ExportOutlined />} 
              onClick={handleOpenInBrowser} 
              className={styles.toolbarButton}
            />
          </Tooltip>

          <Tooltip title="分享">
            <Button
              type="text"
              shape="circle"
              icon={<ShareAltOutlined />}
              onClick={handleShare}
              className={styles.toolbarButton}
            />
          </Tooltip>
        </div>
      </div>

      <div ref={mainContentAreaRef} className={styles.mainContentArea} onMouseUp={handleSelection}>
        <div ref={scrollableContentRef} className={styles.scrollableContent}>
          {loading ? (
            <div className={styles.loadingContainer}>
              <Spin size="large" />
            </div>
          ) : (
            <>
              {selectionPopup.visible && (
                <div
                  ref={popupRef}
                  className={styles.selectionPopup}
                  style={{ top: `${selectionPopup.top}px`, left: `${selectionPopup.left}px` }}
                >
                  <div
                    className={styles.popupActions}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div className={styles.popupAction} onMouseDown={(e) => { e.preventDefault(); handleHighlightClick(); }}>
                      <HighlightOutlined className={styles.popupIcon} />
                      <span className={styles.popupLabel}>高亮</span>
                    </div>
                    <div className={styles.popupAction} onMouseDown={(e) => { e.preventDefault(); handleNoteClick(); }}>
                      <ReadOutlined className={styles.popupIcon} />
                      <span className={styles.popupLabel}>笔记</span>
                    </div>
                  </div>
                </div>
              )}
              
              <article className={styles.article}>
                <header className={styles.header}>
                  {article.publishDate && (
                    <p className={styles.publishDate}>
                      {format(new Date(article.publishDate), "EEEE, MMMM d, yyyy 'at' HH:mm", { locale: zhCN })}
                    </p>
                  )}
                  <h1 className={styles.title}>{article.title}</h1>
                  {sourceTitle && <p className={styles.sourceName}>{sourceTitle}</p>}
                </header>
                
                {renderArticleContent()}
              </article>
            </>
          )}
        </div>

        {isSidebarVisible && (
          <AnnotationSidebar
            isVisible={isSidebarVisible}
            annotations={annotations}
            pendingAnnotation={pendingAnnotation}
            onClose={handleToggleSidebar}
            onSaveNote={handleSaveNote}
            onDelete={handleDeleteAnnotation}
            onItemClick={handleScrollToAnnotation}
            autoEditNoteId={autoEditNoteId}
            onAutoEditApplied={handleAutoEditApplied}
          />
        )}
      </div>

      <Modal
        open={imageModalVisible}
        onCancel={handleCloseImageModal}
        footer={null}
        width="90vw"
        style={{ top: 20 }}
        styles={{ body: { padding: 0, overflow: 'hidden' } }}
        destroyOnClose
        closeIcon={
          <div style={iconButtonStyle}>
            <CloseOutlined style={iconStyle} />
          </div>
        }
      >
        <TransformWrapper
          initialScale={1}
          minScale={0.5}
          maxScale={10}
          doubleClick={{ mode: 'reset' }}
          wheel={{ step: 0.2 }}
          pinch={{ step: 1 }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <React.Fragment>
              <div
                style={{
                  position: 'absolute',
                  top: 15,
                  right: 50,
                  zIndex: 10,
                  display: 'flex',
                  gap: '12px',
                }}
              >
                <Tooltip title="放大">
                  <div 
                    style={iconButtonStyle} 
                    onClick={() => zoomIn()}
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)')}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.5)')}
                  >
                    <ZoomInOutlined style={iconStyle} />
                  </div>
                </Tooltip>
                <Tooltip title="缩小">
                  <div 
                    style={iconButtonStyle} 
                    onClick={() => zoomOut()}
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)')}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.5)')}
                  >
                    <ZoomOutOutlined style={iconStyle} />
                  </div>
                </Tooltip>
                <Tooltip title="重置">
                  <div 
                    style={iconButtonStyle} 
                    onClick={() => resetTransform()}
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)')}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.5)')}
                  >
                    <ReloadOutlined style={iconStyle} />
                  </div>
                </Tooltip>
              </div>
              <TransformComponent
                wrapperStyle={{ 
                  width: '100%', 
                  height: 'calc(100vh - 40px)',
                }}
                contentStyle={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                }}
              >
                <img 
                  src={imageModalUrl} 
                  alt="Enlarged" 
                  style={{ 
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
              </TransformComponent>
            </React.Fragment>
          )}
        </TransformWrapper>
      </Modal>
    </div>
  );
};

export default ArticleDetail;
