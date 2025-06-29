import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Skeleton, Tooltip, Spin, Empty, message, Modal, Dropdown, ConfigProvider } from 'antd';
import type { MenuProps } from 'antd';
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
  ArrowDownOutlined,
  ShareAltOutlined,
  HighlightOutlined,
  CloseOutlined,
  ReadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  CopyOutlined,
  FileTextOutlined,
  ApartmentOutlined,
  BgColorsOutlined,
  HighlightFilled,
  FileTextFilled,
} from '@ant-design/icons';
import { useDatabase } from '../contexts/DatabaseContext';
import { Article } from '../db/database';
import { useSettings } from '../contexts/SettingsContext';
import { format } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';
import { debounce, updateUnreadCountOptimized } from '../utils/helpers';
import styles from './ArticleDetail.module.css';
import AnnotationSidebar from './AnnotationSidebar';
import { useAnnotations } from '../hooks/useAnnotations';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import MindMapModal from './MindMapModal';
import { useArticleListManager } from '../hooks/useArticleListManager';

interface ArticleDetailProps {
  articleId: string | null;
  onClose?: () => void;
  viewMode: 'full' | 'web' | 'original';
  onChangeViewMode: (mode: 'full' | 'web' | 'original') => void;
  onArticleModified: (articleId: string, changes: Partial<Article>) => void;
  onNavigate?: (direction: 'next' | 'prev') => void;
}

const ArticleDetail: React.FC<ArticleDetailProps> = ({ articleId, onClose, viewMode, onChangeViewMode, onArticleModified, onNavigate }) => {
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
  const [isSummaryModalVisible, setIsSummaryModalVisible] = useState(false);
  const [summaryContent, setSummaryContent] = useState('');
  const [isMindmapModalVisible, setIsMindmapModalVisible] = useState(false);
  const [mindmapContent, setMindmapContent] = useState('');
  const [isMindmapLoading, setIsMindmapLoading] = useState(false);
  const [isHighlightLoading, setIsHighlightLoading] = useState(false);
  const [hasHighlight, setHasHighlight] = useState(false);
  const [mindMapMarkdown, setMindMapMarkdown] = useState('');
  
  // 新增：智能摘要的状态
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [inlineSummaryContent, setInlineSummaryContent] = useState('');

  // 新增：控制AI内容可见性的状态
  const [isSummaryVisible, setIsSummaryVisible] = useState(false);
  const [isAiHighlightsVisible, setIsAiHighlightsVisible] = useState(false);

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
    handleCancelPendingAnnotation,
    handleAutoEditApplied,
  } = useAnnotations({ articleId, scrollableContentRef });

  const handleNextArticle = () => {
    if (onNavigate) {
      onNavigate('next');
    }
  };

  const handleCloseDetail = () => {
    if (isSidebarVisible) {
      handleToggleSidebar();
    }
    if (onClose) {
      onClose();
    }
  };

  const isAiDisabled = !settings.advanced.doubaoApiKey;

  // 保存AI摘要到数据库
  const saveAiSummary = async (summary: string) => {
    if (!db || !articleId) return;
    try {
      await db.articles.update(articleId, { aiSummary: summary });
      setArticle(prev => (prev ? { ...prev, aiSummary: summary } : null));
    } catch (error) {
      console.error('保存AI摘要失败:', error);
      message.error('保存摘要失败');
    }
  };

  // 处理智能摘要的流式响应
  useEffect(() => {
    if (!articleId) return;

    // 清理上一个文章的摘要状态
    setInlineSummaryContent('');
    setSummaryError(null);
    setIsSummaryLoading(false);
    setIsSummaryVisible(false); // 新文章默认不显示摘要

    let summaryAccumulator = '';

    const unsubscribe = window.electron.onAiSummaryUpdate((type, data) => {
      if (type === 'chunk') {
        setIsSummaryLoading(false); // 收到第一个chunk后就停止loading动画
        const chunk = data.data;
        summaryAccumulator += chunk;
        setInlineSummaryContent(prev => prev + chunk);
      } else if (type === 'end') {
        setIsSummaryLoading(false);
        if (summaryAccumulator.trim().length > 0) {
          saveAiSummary(summaryAccumulator);
        }
      } else if (type === 'error') {
        setSummaryError(data || '生成摘要时发生未知错误');
        setIsSummaryLoading(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [articleId, db]);
  
  // 触发智能摘要
  const handleToggleSummary = () => {
    if (!article || isSummaryLoading) return;
  
    // 如果已有摘要，直接切换可见性
    if (article.aiSummary) {
      setIsSummaryVisible(!isSummaryVisible);
      return;
    }
  
    // 如果没有摘要，则开始生成流程
    if (!article.content) return;
  
    setIsSummaryVisible(true); // 打开摘要区域以显示加载状态
    setInlineSummaryContent('');
    setSummaryError(null);
    setIsSummaryLoading(true);
  
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = article.content;
    const contentText = tempDiv.textContent || tempDiv.innerText || '';
    
    window.electron.streamAiSummary(contentText);
  };

  const handleCopySummary = () => {
    if (inlineSummaryContent) {
      navigator.clipboard.writeText(inlineSummaryContent)
        .then(() => message.success('摘要已复制到剪贴板'))
        .catch(() => message.error('复制失败'));
    }
  };

  const saveAiMindMap = async (markdown: string) => {
    if (!db || !articleId) return;
    try {
      await db.articles.update(articleId, { aiMindMap: markdown });
      const updatedArticle = { ...article!, aiMindMap: markdown };
      setArticle(updatedArticle);
      setMindMapMarkdown(markdown);
    } catch (error) {
      console.error('保存AI导图失败:', error);
      message.error('保存导图失败');
    }
  };

  const handleToggleMindmap = async () => {
    if (!article || isMindmapLoading) return;

    // 如果已有导图数据，直接显示
    if (article.aiMindMap) {
      setMindMapMarkdown(article.aiMindMap);
      setIsMindmapModalVisible(true);
      return;
    }

    // 如果没有，则开始生成
    if (!article.content) return;
    
    setIsMindmapLoading(true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = article.content;
    const contentText = tempDiv.textContent || tempDiv.innerText || '';

    try {
      const result = await window.electron.invokeAI('mindmap', article.content, contentText);
      if (result && result.success) {
        await saveAiMindMap(result.data);
        setIsMindmapModalVisible(true);
      } else {
        const errorMsg = result?.error || '调用AI服务失败。';
        message.error({ content: errorMsg });
      }
    } catch (e: any) {
      message.error({ content: `发生未知错误: ${e.message}`});
    } finally {
      setIsMindmapLoading(false);
    }
  };

  const saveAiHighlightedContent = async (newContent: string) => {
    if (!db || !articleId) return;
    try {
      await db.articles.update(articleId, { aiHighlightedContent: newContent });
      const updatedArticle = { ...article!, aiHighlightedContent: newContent };
      setArticle(updatedArticle);
      
      const contentWithAllHighlights = applyHighlights(newContent, annotations);
      setProcessedContent(contentWithAllHighlights);

    } catch (error) {
      console.error('保存AI高亮失败:', error);
      message.error('保存高亮失败');
    }
  };

  const handleToggleAiHighlight = async () => {
    if (!article || isHighlightLoading) return;

    // 如果AI高亮内容已存在，直接切换可见性
    if (article.aiHighlightedContent) {
      setIsAiHighlightsVisible(!isAiHighlightsVisible);
      return;
    }
    
    // 否则，生成高亮
    if (!article.content) return;

    setIsHighlightLoading(true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = article.content;
    const contentText = tempDiv.textContent || tempDiv.innerText || '';

    try {
      const result = await window.electron.invokeAI('highlight', article.content, contentText);
      if (result && result.success) {
        const sentences = result.data as string[];
        // 在原文基础上进行高亮
        let newContent = article.content;
        sentences.forEach(sentence => {
          const trimmedSentence = sentence.trim();
          if (trimmedSentence) {
            const regex = new RegExp(
              trimmedSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              'gi'
            );
            newContent = newContent.replace(regex, (match) => `<mark class="aiHighlight">${match}</mark>`);
          }
        });
        await saveAiHighlightedContent(newContent);
        setIsAiHighlightsVisible(true); // 生成后自动显示
      } else {
        const errorMsg = result?.error || 'AI高亮失败';
        message.error({ content: errorMsg });
      }
    } catch (e: any) {
      message.error({ content: `发生未知错误: ${e.message}` });
    } finally {
      setIsHighlightLoading(false);
    }
  };

  const handleAiAction = async (type: 'mindmap' | 'highlight') => {
    if (!article || !article.content) return;

    // 从文章内容中提取纯文本
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = article.content;
    const contentText = tempDiv.textContent || tempDiv.innerText || '';

    if (type === 'mindmap') setIsMindmapLoading(true);
    if (type === 'highlight') setIsHighlightLoading(true);

    try {
      // 对于非摘要类，继续使用旧的 invokeAI
      const result = await window.electron.invokeAI(type, article.content, contentText);
      
      if (result && result.success) {
        if (type === 'highlight') {
          const sentences = result.data as string[];
          let highlightedContent = article.content;
          sentences.forEach(sentence => {
            const trimmedSentence = sentence.trim();
            if (trimmedSentence) {
              // 使用正则表达式进行不区分大小写和空格的替换
              const regex = new RegExp(
                trimmedSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
                'gi'
              );
              highlightedContent = highlightedContent.replace(regex, (match) => `<mark class="aiHighlight">${match}</mark>`);
            }
          });
          if (article.id) {
            onArticleModified(article.id, { content: highlightedContent });
            setProcessedContent(highlightedContent);
            setHasHighlight(true);
          }
        } else if (type === 'mindmap') {
          console.log('[ArticleDetail] AI-generated markdown for mind map:', result.data);
          setMindMapMarkdown(result.data);
          setIsMindmapModalVisible(true);
        } 
      } else {
        // 如果 result 不存在或 success 为 false
        const errorMsg = result?.error || '调用AI服务失败，请检查网络或API Key。';
        console.error(`AI ${type} error:`, errorMsg);
        message.error({ content: errorMsg, key: 'ai-action' });
      }
    } catch (e: any) {
      console.error(`AI ${type} uncaught error:`, e.message);
      message.error({ content: `发生未知错误: ${e.message}`, key: 'ai-action' });
    } finally {
      if (type === 'mindmap') setIsMindmapLoading(false);
      if (type === 'highlight') setIsHighlightLoading(false);
    }
  };

  const onAiMenuClick: MenuProps['onClick'] = (e) => {
    if (e.key === 'summary') {
      handleToggleSummary();
    } else {
      handleAiAction(e.key as 'mindmap' | 'highlight');
    }
  };

  const aiMenuItems: MenuProps['items'] = [
    { key: 'summary', label: '文章摘要' },
    { key: 'mindmap', label: '生成导图' },
    { key: 'highlight', label: '智能高亮' },
  ];

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
        setInlineSummaryContent(''); // 清理旧摘要
        setSummaryError(null);
        setMindMapMarkdown('');
        setIsMindmapLoading(false);
        setIsHighlightLoading(false);
        setIsSummaryVisible(false);
        setIsAiHighlightsVisible(false);
  
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
            
            // 决定使用哪个内容版本
            const contentToShow = 
              currentArticleData.aiHighlightedContent && isAiHighlightsVisible
                ? currentArticleData.aiHighlightedContent
                : currentArticleData.content;

            const contentWithHighlights = applyHighlights(contentToShow, annos);
            setProcessedContent(contentWithHighlights);

            setArticle(currentArticleData);
  
            if (source) {
              setSourceTitle(source.title);
            }

            if (currentArticleData.isRead === 'false' && readingSettings.autoMarkAsRead) {
              await db.articles.update(articleId, { isRead: 'true' });
              console.log(`文章 ${articleId} 已自动标记为已读。`);
            }

            // 如果存在已保存的摘要，则加载它，但不立即显示
            if (currentArticleData.aiSummary) {
              setInlineSummaryContent(currentArticleData.aiSummary);
            }
            // 如果存在AI高亮内容，则将可见性设为true
            if (currentArticleData.aiHighlightedContent) {
              setIsAiHighlightsVisible(true);
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
        // 当切换AI高亮可见性时，重新渲染内容
        const contentToShow = 
          article.aiHighlightedContent && isAiHighlightsVisible
            ? article.aiHighlightedContent
            : article.content;
        const contentWithHighlights = applyHighlights(contentToShow, annotations);
        setProcessedContent(contentWithHighlights);
        setLoading(false);
      }
    } else {
      setArticle(null);
      setLoading(false);
    }
  }, [articleId, db, article, isMounted, performUpgrade, loadAnnotations, applyHighlights, setProcessedContent, readingSettings, isAiHighlightsVisible, annotations]);
  
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

  const isAnyAiLoading = isSummaryLoading || isMindmapLoading || isHighlightLoading;
  const hasSummary = !!inlineSummaryContent;

  return (
    <div ref={articleDetailContainerRef} className={styles.articleDetailContainer} style={articleStyle}>
      <div className={`${styles.fixedControlsBar} ${isScrolled ? styles.scrolled : ''}`}>
        <Tooltip title="关闭">
          <Button
            type="text"
            shape="circle"
            icon={<CloseOutlined />}
            onClick={handleCloseDetail}
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

          <Tooltip title="高亮笔记">
            <Button type="text" shape="circle" icon={isSidebarVisible ? <HighlightFilled /> : <HighlightOutlined />} onClick={handleToggleSidebar} />
          </Tooltip>

          {article && !article.isFullText && (
            <Tooltip title="阅读模式">
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
          
          <Tooltip title="AI 摘要">
            <Button
              type="text"
              shape="circle"
              icon={isSummaryVisible ? <FileTextFilled /> : <FileTextOutlined />}
              onClick={handleToggleSummary}
              loading={isSummaryLoading}
              disabled={isAiDisabled}
              className={isSummaryVisible ? styles.aiButtonActive : ''}
            />
          </Tooltip>
          
          <Tooltip title="AI 导图">
            <Button
              type="text"
              shape="circle"
              icon={<ApartmentOutlined />}
              onClick={handleToggleMindmap}
              loading={isMindmapLoading}
              disabled={isAiDisabled}
              className={article?.aiMindMap ? styles.aiButtonActive : ''}
            />
          </Tooltip>

          <Tooltip title="AI 高亮">
            <Button
              type="text"
              shape="circle"
              icon={<BgColorsOutlined />}
              onClick={handleToggleAiHighlight}
              loading={isHighlightLoading}
              disabled={isAiDisabled}
              className={isAiHighlightsVisible ? styles.aiButtonActive : ''}
            />
          </Tooltip>

          {/* <Tooltip title="访问原址">
            <Button 
              type="text" 
              icon={<GlobalOutlined />} 
              onClick={() => handleViewModeChange('web')}
              className={styles.toolbarButton}
            />
          </Tooltip> */}

          
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
        <div ref={scrollableContentRef} className={`${styles.scrollableContent} ${!isAiHighlightsVisible ? styles.hideAiHighlights : ''}`}>
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
                      {format(new Date(article.publishDate), "EEEE, MMMM d, yyyy 'at' HH:mm", { locale: enUS })}
                    </p>
                  )}
                  <h1 className={styles.title}>{article.title}</h1>
                  <div className={styles.meta}>
                    {article.author && <span className={styles.author}>{article.author}</span>}
                    <span className={styles.sourceName}>{sourceTitle}</span>
                  </div>
                </header>
                
                {/* 智能摘要区域 - 仅在有内容或在加载时显示 */}
                {(isSummaryVisible || isSummaryLoading) && (
                  <div className={styles.summaryContainer}>
                    <div className={styles.summaryTitleWrapper}>
                      <h3 className={styles.summaryTitle}>
                        <ExperimentOutlined />
                        <span style={{ marginLeft: 8 }}>AI 总结</span>
                      </h3>
                      {inlineSummaryContent && (
                        <Tooltip title="复制摘要">
                          <Button 
                            icon={<CopyOutlined />} 
                            type="text" 
                            onClick={handleCopySummary}
                            className={styles.copyButton}
                          />
                        </Tooltip>
                      )}
                    </div>
                    {isSummaryLoading && (
                      <div className={styles.summaryLoading}>
                        <Spin size="small" />
                        <span style={{ marginLeft: 8 }}>摘要生成中...</span>
                      </div>
                    )}
                    {summaryError && <div className={styles.summaryError}>摘要生成失败: {summaryError}</div>}
                    {inlineSummaryContent && !isSummaryLoading && (
                      <div className={styles.summaryContent}>
                        <p>{inlineSummaryContent}</p>
                      </div>
                    )}
                  </div>
                )}

                <div ref={contentRef} className={styles.content}>
                  {renderArticleContent()}
                </div>
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
            onCancelPendingAnnotation={handleCancelPendingAnnotation}
          />
        )}
      </div>

      <Modal
        title="图片预览"
        footer={null}
        onCancel={handleCloseImageModal}
        open={imageModalVisible}
        width="80vw"
        centered
      >
        <TransformWrapper>
          <TransformComponent>
            <img src={imageModalUrl} alt="Preview" style={{ width: '100%' }} />
          </TransformComponent>
        </TransformWrapper>
      </Modal>

      <MindMapModal
        open={isMindmapModalVisible}
        markdown={mindMapMarkdown}
        onCancel={() => setIsMindmapModalVisible(false)}
      />

      {onNavigate && !isSidebarVisible && (
        <ConfigProvider
          theme={{
            components: {
              Button: {
                colorPrimaryHover: '#181717',
                colorPrimaryActive: '#d9d9d9',
              },
            },
          }}
        >
          <Tooltip title="下一篇" color="rgba(0, 0, 0, 0.85)">
            <Button
              className={styles.nextArticleButton}
              shape="circle"
              icon={<ArrowDownOutlined />}
              onClick={handleNextArticle}
            />
          </Tooltip>
        </ConfigProvider>
      )}
    </div>
  );
};

export default ArticleDetail;
