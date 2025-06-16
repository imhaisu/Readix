import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Skeleton, Typography, Tag, Tooltip, Spin, Empty, message, Modal } from 'antd';
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
  LeftOutlined,
  HighlightOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useDatabase, Article, FeedSource, Annotation } from '../contexts/DatabaseContext';
import { useSettings } from '../contexts/SettingsContext';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { debounce } from '../utils/helpers';
import styles from './ArticleDetail.module.css';
import { useNavigate } from 'react-router-dom';
import AnnotationSidebar from './AnnotationSidebar';
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
  const [processedContent, setProcessedContent] = useState<string>('');
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollableContentRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const navigate = useNavigate();

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [autoEditNoteId, setAutoEditNoteId] = useState<string | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<Annotation | null>(null);
  const [selectionPopup, setSelectionPopup] = useState<{
    visible: boolean;
    top: number;
    left: number;
    range: Range | null;
  }>({
    visible: false,
    top: 0,
    left: 0,
    range: null,
  });

  const readingSettings = settings.reading;

  const handleShare = () => {
    if (article) {
      const shareUrl = article.url;
      navigator.clipboard.writeText(shareUrl)
        .then(() => message.success('文章链接已复制到剪贴板'))
        .catch(() => message.error('复制链接失败'));
    }
  };

  const handleDeleteArticle = () => {
    if (!db || !articleId) return;
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这篇文章吗？此操作不可撤销。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await db.articles.delete(articleId);
          message.success('文章已删除');
          onClose?.(); 
          onArticleModified(articleId, { isHidden: true }); 
          triggerRefresh();
        } catch (error) {
          console.error('删除文章失败:', error);
          message.error('删除文章失败！');
        }
      },
    });
  };

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

  const applyHighlights = useCallback((content: string, annotationsToApply: Annotation[]): string => {
    let newContent = content;
    annotationsToApply.forEach(anno => {
      // 创建一个唯一的 ID，方便后续交互 (滚动、删除等)
      // 使用全局类名 'customHighlight'，因为它在 CSS 中是 :global 定义的
      const markTag = `<mark id="annotation-${anno.id}" class="customHighlight">`;
      
      // 使用前缀和后缀来精确定位，避免错误替换
      const searchString = `${anno.prefix}${anno.text}${anno.suffix}`;
      const replacementString = `${anno.prefix}${markTag}${anno.text}</mark>${anno.suffix}`;

      // 必须在原始的、未被处理过的内容上查找和替换，防止因 <mark> 标签导致 innerText 变化而找不到位置
      // 这里我们简化处理，直接在 newContent 上替换。在更复杂的场景下，可能需要更鲁棒的定位策略。
      if (newContent.includes(searchString)) {
        newContent = newContent.replace(searchString, replacementString);
      }
    });
    return newContent;
  }, []);

  useEffect(() => {
    const loadArticle = async () => {
      if (articleId) {
        if (db) {
          if (!db) return;
  
          // 仅当文章ID变化或从网页视图切换回来时才完全重新加载
          if (viewMode !== 'web' || !article || article.id !== articleId) {
            setLoading(true);
            setArticle(undefined);
            setSourceTitle(undefined);
            setProcessedContent('');
  
            try {
              const currentArticleData = await db.articles.get(articleId);
  
              if (currentArticleData) {
                // 先加载笔记和高亮
                const annos = await db.annotations.where({ articleId }).sortBy('createdAt');
                setAnnotations(annos); 
                
                // 再应用高亮到内容
                const contentWithHighlights = applyHighlights(currentArticleData.content, annos);
                setProcessedContent(contentWithHighlights);

                setArticle(currentArticleData);
  
                const source = await db.feeds.get(currentArticleData.sourceId);
                if (source) {
                  setSourceTitle(source.title);
                }

                // 自动标记为已读
                if (currentArticleData.isRead === 'false' && settings.reading.autoMarkAsRead) {
                  await db.articles.update(articleId, { isRead: 'true' });
                  console.log(`文章 ${articleId} 已自动标记为已读。`);
                }
              } else {
                setArticle(null);
              }
            } catch (error) {
              console.error('加载文章详情或高亮失败:', error);
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
        }
      } else {
        setArticle(null);
        setLoading(false);
      }
    };

    loadArticle();

    // 当组件卸载或 articleId 改变时，保存当前滚动位置
    return () => {
      if (articleId && scrollableContentRef.current) {
        saveScrollPosition(articleId, scrollableContentRef.current.scrollTop);
      }
    };
  }, [db, articleId, viewMode, settings.reading.autoMarkAsRead, saveScrollPosition, applyHighlights]);

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

  const loadAnnotations = useCallback(async () => {
    if (!db || !articleId) return;
    const annos = await db.annotations.where({ articleId }).sortBy('createdAt');
    setAnnotations(annos);
    return annos;
  }, [db, articleId]);

  const handleSelection = () => {
    // 如果侧边栏是打开的，并且用户可能是在侧边栏里选择文本，则不显示弹窗
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      // 检查选区是否在文章内容之内
      if (scrollableContentRef.current && scrollableContentRef.current.contains(container)) {
        if (!selection.isCollapsed && selection.toString().trim().length > 0) {
          const rect = range.getBoundingClientRect();
          const containerRect = scrollableContentRef.current?.getBoundingClientRect();
          if (!containerRect) return;
    
          // 计算弹窗位置
          const top = rect.top - containerRect.top + scrollableContentRef.current!.scrollTop - 40;
          const left = rect.left - containerRect.left + rect.width / 2;
    
          setSelectionPopup({ visible: true, top, left, range });
        } else {
          setSelectionPopup({ visible: false, top: 0, left: 0, range: null });
        }
        return;
      }
    }
    // 如果选区不在文章内部，或者没有选区，则隐藏弹窗
    setSelectionPopup({ visible: false, top: 0, left: 0, range: null });
  };

  const handleHighlightClick = async () => {
    if (!selectionPopup.range || !articleId || !db) return;

    const range = selectionPopup.range;
    const text = range.toString().trim();
    if (!text) return;

    // 提取上下文
    const prefixRange = document.createRange();
    prefixRange.setStart(range.startContainer, Math.max(0, range.startOffset - 20));
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const prefix = prefixRange.toString();

    const suffixRange = document.createRange();
    suffixRange.setStart(range.endContainer, range.endOffset);
    suffixRange.setEnd(range.endContainer, Math.min(range.endContainer.textContent?.length || 0, range.endOffset + 20));
    const suffix = suffixRange.toString();

    const newAnnotation: Annotation = {
      id: `annotation-${Date.now()}`,
      articleId: articleId,
      type: 'highlight',
      text,
      prefix,
      suffix,
      createdAt: Date.now()
    };

    try {
      await db.annotations.add(newAnnotation);
      await loadAnnotations();
      setProcessedContent(prevContent => applyHighlights(prevContent, [newAnnotation]));
      message.success("高亮已保存");
    } catch (error) {
      console.error("保存高亮失败:", error);
      message.error("保存高亮失败！");
    } finally {
      window.getSelection()?.removeAllRanges();
      setSelectionPopup({ visible: false, top: 0, left: 0, range: null });
    }
  };
  
  const handleNoteClick = async () => {
    if (!selectionPopup.range || !articleId || !db) return;

    const range = selectionPopup.range;
    const text = range.toString().trim();
    if (!text) return;

    // 提取上下文
    const prefixRange = document.createRange();
    prefixRange.setStart(range.startContainer, Math.max(0, range.startOffset - 20));
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const prefix = prefixRange.toString();

    const suffixRange = document.createRange();
    suffixRange.setStart(range.endContainer, range.endOffset);
    suffixRange.setEnd(range.endContainer, Math.min(range.endContainer.textContent?.length || 0, range.endOffset + 20));
    const suffix = suffixRange.toString();

    const tempAnnotation: Annotation = {
      id: `pending-${Date.now()}`,
      articleId: articleId,
      type: 'note',
      text,
      prefix,
      suffix,
      noteContent: '',
      createdAt: Date.now()
    };

    setPendingAnnotation(tempAnnotation);
    
    // 打开侧边栏并自动进入编辑模式
    if (!isSidebarVisible) {
      handleToggleSidebar();
    }
    setAutoEditNoteId(tempAnnotation.id);

    window.getSelection()?.removeAllRanges();
    setSelectionPopup({ visible: false, top: 0, left: 0, range: null });
  };
  
  const handleToggleSidebar = () => {
    const newVisibility = !isSidebarVisible;
    setIsSidebarVisible(newVisibility);
    // 派发全局事件，通知 HomePage 调整布局
    document.dispatchEvent(new CustomEvent('annotationSidebarToggled', {
      detail: { isVisible: newVisibility }
    }));
  };

  const handleSaveNote = async (annotationId: string, content: string) => {
    if (!db || !articleId) return;
    try {
      if (annotationId.startsWith('pending-')) {
        const newAnnotationData = { ...pendingAnnotation!, noteContent: content, id: `annotation-${Date.now()}` };
        
        await db.annotations.add(newAnnotationData);
        setPendingAnnotation(null);
        
        setProcessedContent(prevContent => applyHighlights(prevContent, [newAnnotationData]));
        message.success("笔记已创建");
      } else {
        await db.annotations.update(annotationId, { noteContent: content });
        message.success("笔记已保存");
      }
      await loadAnnotations();
    } catch (error) {
      console.error("保存笔记失败:", error);
      message.error("保存笔记失败！");
    }
  };

  const handleDeleteAnnotation = async (annotationId: string) => {
    if (!db || !articleId) return;
    try {
      await db.annotations.delete(annotationId);
      
      // 从 DOM 中移除高亮
      const highlightElement = document.getElementById(`annotation-${annotationId}`);
      if (highlightElement) {
        const fragment = document.createDocumentFragment();
        while (highlightElement.firstChild) {
          fragment.appendChild(highlightElement.firstChild);
        }
        highlightElement.parentNode?.replaceChild(fragment, highlightElement);
      }
      
      message.success("删除成功");
      await loadAnnotations(); // 重新加载以更新侧边栏
    } catch (error) {
      console.error("删除失败:", error);
      message.error("删除失败！");
    }
  };

  const handleScrollToAnnotation = (annotationId: string) => {
    const element = document.getElementById(annotationId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleAutoEditApplied = () => {
    setAutoEditNoteId(null);
  };

  const renderArticleContent = () => {
    const contentToRender = processedContent || article?.content;
    if (article) {
      return (
        <div
          ref={contentRef}
          className={styles.articleContent}
          style={{
            fontSize: `${readingSettings.fontSize}px`,
            lineHeight: readingSettings.lineHeight,
            fontFamily: readingSettings.fontFamily,
          }}
          dangerouslySetInnerHTML={{ __html: contentToRender || '' }}
        />
      );
    }
    return null;
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

  return (
    <div className={styles.articleDetailContainer} style={articleStyle}>
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
              icon={
                article.isStarred === 'true' ? (
                  <StarFilled />
                ) : (
                  <StarOutlined />
                )
              }
              onClick={handleToggleStar}
              className={styles.toolbarButton}
            />
          </Tooltip>

          <Tooltip title={article.isReadLater === 'true' ? '从"稍后读"移除' : '添加到"稍后读"'}>
            <Button
              type="text"
              icon={article.isReadLater === 'true' ? <ClockCircleFilled /> : <ClockCircleOutlined />}
              onClick={handleToggleReadLater}
              className={styles.toolbarButton}
            />
          </Tooltip>

          <div className={styles.controlSeparator}></div>

          <Tooltip title="笔记和高亮">
            <Button type="text" shape="circle" icon={<HighlightOutlined />} onClick={handleToggleSidebar} className={styles.toolbarButton}/>
          </Tooltip>

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

      <div className={`${styles.mainContentArea} ${isSidebarVisible ? styles.isSidebarVisible : ''}`} onMouseUp={handleSelection}>
        <div ref={scrollableContentRef} className={styles.scrollableContent}>
          {selectionPopup.visible && (
            <div
              className={styles.selectionPopup}
              style={{ top: `${selectionPopup.top}px`, left: `${selectionPopup.left}px` }}
            >
              <Button size="small" onMouseDown={(e) => { e.preventDefault(); handleHighlightClick(); }}>高亮</Button>
              <Button size="small" style={{ marginLeft: 8 }} onMouseDown={(e) => { e.preventDefault(); handleNoteClick(); }}>笔记</Button>
            </div>
          )}
          
          <article className={styles.article}>
            <header className={styles.header}>
              {article.publishDate && (
                <p className={styles.publishDate}>
                  {format(new Date(article.publishDate), 'EEEE, MMMM d, yyyy \'at\' HH:mm')}
                </p>
              )}
              <h1 className={styles.title}>{article.title}</h1>
              {sourceTitle && <p className={styles.sourceName}>{sourceTitle}</p>}
            </header>
            
            {renderArticleContent()}
          </article>
        </div>

        {isSidebarVisible && (
          <AnnotationSidebar
            isVisible={isSidebarVisible}
            annotations={annotations}
            pendingAnnotation={pendingAnnotation}
            onClose={() => {
              handleToggleSidebar();
              setPendingAnnotation(null);
            }}
            onSaveNote={handleSaveNote}
            onDelete={handleDeleteAnnotation}
            onItemClick={handleScrollToAnnotation}
            autoEditNoteId={autoEditNoteId}
            onAutoEditApplied={handleAutoEditApplied}
          />
        )}
      </div>
    </div>
  );
};

export default ArticleDetail; 