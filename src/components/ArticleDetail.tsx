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
import { useNavigate } from 'react-router-dom';
import { LogConfig, LogLevel } from '../utils/logConfig';

// 添加日志函数，使用LogConfig控制输出
const log = (message: string, ...args: any[]) => {
  LogConfig.debug('ARTICLE_DETAIL', message, ...args);
};

// 添加一个控制日志级别的辅助函数
const setArticleDetailLogLevel = (enable: boolean) => {
  LogConfig.setModuleEnabled('ARTICLE_DETAIL', enable);
  console.log(`[ArticleDetail] 日志${enable ? '启用' : '禁用'}`);
};

// 添加处理图片加载错误的函数
const handleImageError = async (event: React.SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  const src = img.src;
  
  // 防止重复处理同一图片
  if (img.dataset.tried === 'true') {
    LogConfig.debug('IMAGE_PROXY', `已尝试修复，但仍然失败: ${src}`);
    img.style.display = 'none';
    return;
  }
  
  LogConfig.info('IMAGE_PROXY', `图片加载失败，尝试代理请求: ${src}`);
  img.dataset.tried = 'true';
  
  try {
    // 对少数派图片进行特殊处理
    if (src.includes('cdnfile.sspai.com')) {
      // 尝试移除缩放参数
      const cleanSrc = src.replace(/\?imageView2.*$/, '');
      LogConfig.debug('IMAGE_PROXY', `尝试清理URL参数: ${cleanSrc}`);
      img.src = cleanSrc;
      return;
    }
    
    // 使用Electron的图片代理服务
    if (window.electron && window.electron.ipcRenderer) {
      const dataUrl = await window.electron.ipcRenderer.invoke('proxy-image', src);
      if (dataUrl) {
        LogConfig.debug('IMAGE_PROXY', `成功获取代理图片`);
        img.src = dataUrl;
        return;
      }
    }
    
    // 如果代理失败，隐藏图片
    LogConfig.info('IMAGE_PROXY', `代理请求失败，隐藏图片`);
    img.style.display = 'none';
  } catch (error) {
    LogConfig.error('IMAGE_PROXY', `处理图片错误:`, error);
    img.style.display = 'none';
  }
};

interface ArticleDetailProps {
  articleId: string | null;
  onClose?: () => void;
  viewMode: 'full' | 'web' | 'original';
  onChangeViewMode: (mode: 'full' | 'web' | 'original') => void;
  onArticleModified: (articleId: string, changes: Partial<Article>) => void;
  onNavigate?: (direction: 'next' | 'prev') => void;
}

const useContentCache = (articleId: string | null, content: string | undefined) => {
  // 用于缓存已渲染的内容，防止内容切换时闪烁
  const contentCacheRef = useRef<Map<string, string>>(new Map());
  const [cachedContent, setCachedContent] = useState<string>('');
  
  // 当文章ID和内容变化时，更新缓存
  useEffect(() => {
    if (!articleId || !content) {
      setCachedContent('');
      return;
    }
    
    // 更新缓存
    contentCacheRef.current.set(articleId, content);
    setCachedContent(content);
    
    // 如果缓存太大，清理旧的缓存项
    if (contentCacheRef.current.size > 10) {
      // 保留最近访问的10个文章内容
      const keys = Array.from(contentCacheRef.current.keys());
      const oldestKey = keys[0]; // 删除最早加入的项
      contentCacheRef.current.delete(oldestKey);
    }
  }, [articleId, content]);
  
  return { cachedContent };
};

const ArticleDetail: React.FC<ArticleDetailProps> = ({ articleId, onClose, viewMode, onChangeViewMode, onArticleModified, onNavigate }) => {
  console.log('ArticleDetail render with articleId:', articleId);
  
  const { db } = useDatabase();
  const { settings } = useSettings();
  const [article, setArticle] = useState<Article | null | undefined>(undefined);
  console.log('ArticleDetail article state:', article ? article.title : 'none');
  const [sourceTitle, setSourceTitle] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [fetchingFullText, setFetchingFullText] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollableContentRef = useRef<HTMLDivElement | null>(null);
  const mainContentAreaRef = useRef<HTMLDivElement | null>(null);
  const articleDetailContainerRef = useRef<HTMLDivElement | null>(null);
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

  // 添加导航钩子
  const navigate = useNavigate();
  
  // 记录是否是从笔记中心跳转过来的
  const [isFromNotesPage, setIsFromNotesPage] = useState(false);
  
  // 添加一个ref来跟踪滚动位置是否已经恢复
  const scrollPositionRestored = useRef(false);
  // 添加一个ref来追踪组件是否已挂载
  const isMountedRef = useRef(true);
  // 添加一个ref来追踪当前文章ID，用于解决竞态问题
  const currentArticleIdRef = useRef<string | null>(null);
  // 添加一个引用来跟踪正在加载的文章ID，防止重复加载
  const loadingArticleRef = useRef<string | null>(null);
  // 重新添加 loadArticleRef，但类型更精确
  const loadArticleRef = useRef<((forceReload?: boolean) => Promise<void>) | null>(null);

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

  // 使用useCallback包装处理函数，避免不必要的重新创建
  const handleNextArticle = useCallback(() => {
    if (onNavigate) {
      onNavigate('next');
    }
  }, [onNavigate]);
  
  const handleCloseDetail = useCallback(() => {
    if (onClose) {
      // 检查是否需要返回笔记中心
      if (isFromNotesPage) {
        log('[ArticleDetail] 从笔记中心跳转过来的，返回笔记中心');
        // 清除标记，防止后续误用
        sessionStorage.removeItem('fromNotesPage');
        
        // 直接导航到笔记页面，不经过首页
        log('[ArticleDetail] 直接导航到笔记页面');
        navigate('/notes');
      } else {
        onClose();
      }
    }
  }, [onClose, isFromNotesPage, navigate]);

  const isAiDisabled = !settings.advanced.doubaoApiKey;

  // 保存AI摘要到数据库
  const saveAiSummary = async (summary: string) => {
    if (!db || !articleId || !isMountedRef.current || articleId !== currentArticleIdRef.current) return;
    try {
      await db.articles.update(articleId, { aiSummary: summary });
      // 检查组件是否仍然挂载以及文章是否仍然相同
      if (isMountedRef.current && articleId === currentArticleIdRef.current) {
        setArticle(prev => (prev ? { ...prev, aiSummary: summary } : null));
      }
    } catch (error) {
      console.error('保存AI摘要失败:', error);
      if (isMountedRef.current) {
        message.error('保存摘要失败');
      }
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
    // 保存当前处理的文章ID，用于竞态检查
    const processingArticleId = articleId;

    const unsubscribe = window.electron.onAiSummaryUpdate((type, data) => {
      // 检查组件是否仍然挂载以及当前文章是否仍然是开始处理的那篇
      if (!isMountedRef.current || processingArticleId !== currentArticleIdRef.current) return;
      
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
    if (article.aiSummary && article.aiSummary.trim().length > 0) {
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
        .then(() => message.success('价值分析已复制到剪贴板'))
        .catch(() => message.error('复制失败'));
    }
  };

  // 添加处理Markdown风格加粗文本的函数
  const convertMarkdownBoldToHtml = (text: string) => {
    // 将 **text** 格式转换为 <strong>text</strong>
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  };

  // 修改saveAiMindMap函数
  const saveAiMindMap = async (markdown: string) => {
    if (!db || !articleId || !isMountedRef.current || articleId !== currentArticleIdRef.current) return;
    try {
      await db.articles.update(articleId, { aiMindMap: markdown });
      // 检查组件是否仍然挂载以及文章是否仍然相同
      if (isMountedRef.current && articleId === currentArticleIdRef.current) {
        setArticle(prev => prev ? { ...prev, aiMindMap: markdown } : null);
        setMindMapMarkdown(markdown);
      }
    } catch (error) {
      console.error('保存AI导图失败:', error);
      if (isMountedRef.current) {
        message.error('保存导图失败');
      }
    }
  };

  // 修改handleToggleMindmap函数
  const handleToggleMindmap = async () => {
    if (!article || isMindmapLoading) return;

    // 如果已有导图数据，直接显示
    if (article.aiMindMap && article.aiMindMap.trim().length > 0) {
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
    // 保存当前处理的文章ID
    const processingArticleId = article.id;

    try {
      const result = await window.electron.invokeAI('mindmap', article.content, contentText);
      // 检查组件是否仍然挂载以及文章是否仍然相同
      if (!isMountedRef.current || processingArticleId !== currentArticleIdRef.current) {
        console.log('文章已切换或组件已卸载，放弃AI导图结果');
        return;
      }
      
      if (result && result.success) {
        await saveAiMindMap(result.data);
        setIsMindmapModalVisible(true);
      } else {
        const errorMsg = result?.error || '调用AI服务失败。';
        message.error({ content: errorMsg });
      }
    } catch (e: any) {
      if (isMountedRef.current) {
        message.error({ content: `发生未知错误: ${e.message}`});
      }
    } finally {
      if (isMountedRef.current) {
        setIsMindmapLoading(false);
      }
    }
  };

  // 修改saveAiHighlightedContent函数
  const saveAiHighlightedContent = async (newContent: string) => {
    if (!db || !articleId || !isMountedRef.current || articleId !== currentArticleIdRef.current) return;
    try {
      await db.articles.update(articleId, { aiHighlightedContent: newContent });
      // 检查组件是否仍然挂载以及文章是否仍然相同
      if (isMountedRef.current && articleId === currentArticleIdRef.current) {
        setArticle(prev => prev ? { ...prev, aiHighlightedContent: newContent } : null);
        const contentWithAllHighlights = applyHighlights(newContent, annotations);
        setProcessedContent(contentWithAllHighlights);
      }
    } catch (error) {
      console.error('保存AI高亮失败:', error);
      if (isMountedRef.current) {
        message.error('保存高亮失败');
      }
    }
  };

  // 修改handleToggleAiHighlight函数
  const handleToggleAiHighlight = async () => {
    if (!article || isHighlightLoading) return;

    // 如果AI高亮内容已存在，直接切换可见性
    if (article.aiHighlightedContent && article.aiHighlightedContent.trim().length > 0) {
      setIsAiHighlightsVisible(!isAiHighlightsVisible);
      return;
    }
    
    // 否则，生成高亮
    if (!article.content) return;

    setIsHighlightLoading(true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = article.content;
    const contentText = tempDiv.textContent || tempDiv.innerText || '';
    // 保存当前处理的文章ID
    const processingArticleId = article.id;

    try {
      const result = await window.electron.invokeAI('highlight', article.content, contentText);
      // 检查组件是否仍然挂载以及文章是否仍然相同
      if (!isMountedRef.current || processingArticleId !== currentArticleIdRef.current) {
        console.log('文章已切换或组件已卸载，放弃AI高亮结果');
        return;
      }
      
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
        if (isMountedRef.current) {
          message.error({ content: errorMsg });
        }
      }
    } catch (e: any) {
      if (isMountedRef.current) {
        message.error({ content: `发生未知错误: ${e.message}` });
      }
    } finally {
      if (isMountedRef.current) {
        setIsHighlightLoading(false);
      }
    }
  };

  // 修改handleAiAction函数
  const handleAiAction = async (type: 'mindmap' | 'highlight') => {
    if (!article || !article.content) return;

    // 从文章内容中提取纯文本
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = article.content;
    const contentText = tempDiv.textContent || tempDiv.innerText || '';
    // 保存当前处理的文章ID
    const processingArticleId = article.id;

    if (type === 'mindmap') setIsMindmapLoading(true);
    if (type === 'highlight') setIsHighlightLoading(true);

    try {
      // 对于非摘要类，继续使用旧的 invokeAI
      const result = await window.electron.invokeAI(type, article.content, contentText);
      
      // 检查组件是否仍然挂载以及文章是否仍然相同
      if (!isMountedRef.current || processingArticleId !== currentArticleIdRef.current) {
        console.log(`文章已切换或组件已卸载，放弃AI ${type}结果`);
        return;
      }
      
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
        if (isMountedRef.current) {
          message.error({ content: errorMsg, key: 'ai-action' });
        }
      }
    } catch (e: any) {
      console.error(`AI ${type} uncaught error:`, e.message);
      if (isMountedRef.current) {
        message.error({ content: `发生未知错误: ${e.message}`, key: 'ai-action' });
      }
    } finally {
      if (isMountedRef.current) {
        if (type === 'mindmap') setIsMindmapLoading(false);
        if (type === 'highlight') setIsHighlightLoading(false);
      }
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
      // 移除本地状态更新，仅保存到数据库
      // 不再更新article状态，避免触发循环渲染
      await db.articles.update(articleIdToSave, { scrollPosition: position });
    } catch (error) {
      console.error("保存阅读进度失败:", error);
    }
  }, [db]); // 只依赖db，移除article依赖

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 组件挂载/卸载时更新isMountedRef
  useEffect(() => {
    isMountedRef.current = true;
    
    // 只在组件挂载时执行一次会话存储检查
    const shouldOpenSidebar = sessionStorage.getItem('openAnnotationSidebar') === 'true';
    const highlightAnnotationId = sessionStorage.getItem('highlightAnnotationId');
    const shouldEditAnnotation = sessionStorage.getItem('editAnnotation') === 'true';
    const annotationObjectStr = sessionStorage.getItem('annotationObject');
    const fromNotesPage = sessionStorage.getItem('fromNotesPage') === 'true';

    log(`检查会话存储: shouldOpenSidebar=${shouldOpenSidebar}, highlightAnnotationId=${highlightAnnotationId}, shouldEditAnnotation=${shouldEditAnnotation}, hasAnnotationObject=${!!annotationObjectStr}, fromNotesPage=${fromNotesPage}`);

    // 设置是否从笔记中心跳转过来的标志
    if (fromNotesPage) {
      setIsFromNotesPage(true);
      // 不要在这里清除fromNotesPage标记，而是在组件卸载时清除
    }

    // 立即清除会话存储中的跳转标记，防止其他组件实例读取到
    if (shouldOpenSidebar || highlightAnnotationId || shouldEditAnnotation || annotationObjectStr) {
      log('[ArticleDetail] 立即清除会话存储中的跳转标记，防止其他组件实例读取');
      sessionStorage.removeItem('openAnnotationSidebar');
      sessionStorage.removeItem('highlightAnnotationId');
      sessionStorage.removeItem('editAnnotation');
      sessionStorage.removeItem('annotationObject');
      // 注意：不要在这里清除fromNotesPage，因为我们需要它来判断返回逻辑
    }

    // 只有当明确设置了这些值时才执行后续操作
    if ((shouldOpenSidebar && highlightAnnotationId) || fromNotesPage) {
      log(`检测到从笔记中心跳转，将立即打开侧边栏${highlightAnnotationId ? `并高亮: ${highlightAnnotationId}` : ''}`);
      
      // 注意：在useEffect第一次运行时isSidebarVisible和handleToggleSidebar可能还没有从useAnnotations中获取
      // 所以将相关逻辑延迟到下一个事件循环执行
      setTimeout(() => {
        // 立即打开侧边栏
        if (isSidebarVisible === false) {
          log('[ArticleDetail] 正在立即打开侧边栏');
          handleToggleSidebar();
        } else {
          log('[ArticleDetail] 侧边栏已经打开，无需再次打开');
        }

        // 如果有高亮ID，则处理高亮和编辑
        if (highlightAnnotationId) {
          // 修复：确保使用正确的元素ID格式
          const cleanAnnotationId = highlightAnnotationId.replace(/^annotation-/, '');
          log(`处理后的注释ID: ${cleanAnnotationId}`);

          // 滚动到对应的高亮
          log(`正在滚动到高亮: ${cleanAnnotationId}`);
          handleScrollToAnnotation(cleanAnnotationId);

          // 如果需要编辑，通过设置自动编辑ID来触发编辑模式
          if (shouldEditAnnotation) {
            log(`正在触发编辑模式: ${cleanAnnotationId}`);
            
            // 增加延迟，确保笔记数据已经加载完成
            setTimeout(() => {
              // 触发编辑笔记事件
              document.dispatchEvent(new CustomEvent('edit-annotation', {
                detail: { annotationId: cleanAnnotationId }
              }));
            }, 300);
          }
        }
      }, 0);
    }
    
    return () => {
      isMountedRef.current = false;
      
      // 组件卸载时清除fromNotesPage标记
      if (isFromNotesPage) {
        log('[ArticleDetail] 组件卸载，清除fromNotesPage标记');
        sessionStorage.removeItem('fromNotesPage');
      }
    };
  }, []);

  // 更新currentArticleId Ref
  useEffect(() => {
    currentArticleIdRef.current = articleId;
    
    // 移除尝试设置isSidebarVisible的代码，因为它是从useAnnotations钩子中获取的
    // 在useAnnotations中已经处理了侧边栏可见性的变化
  }, [articleId]);
  
  // 添加缓存清理函数
  const cleanupOldCache = useCallback(() => {
    try {
      const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7天
      const now = Date.now();
      
      // 遍历本地存储，删除过期的文章缓存
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('article_cache_')) {
          try {
            const cachedData = JSON.parse(localStorage.getItem(key) || '{}');
            if (cachedData.timestamp && (now - cachedData.timestamp > MAX_CACHE_AGE)) {
              localStorage.removeItem(key);
              log(`清理过期缓存: ${key}`);
            }
          } catch (e) {
            // 如果解析失败，直接删除
            localStorage.removeItem(key);
          }
        }
      }
    } catch (e) {
      console.error('清理缓存时出错:', e);
    }
  }, []);
  
  // 组件挂载时清理过期缓存
  useEffect(() => {
    cleanupOldCache();
  }, [cleanupOldCache]);
  
  // 删除之前的useEffect，将其合并到组件挂载效果中
  // 删除之前的componentWillUnmount效果，将其合并到主useEffect中

  const performUpgrade = useCallback(async (articleToUpgrade: Article) => {
    if (!articleToUpgrade || !articleToUpgrade.url || !db || !isMounted) return;

    // 注意：setFetchingFullText 现在在调用此函数前已设置为 true
    
    try {
      const result = await window.electron.fetchArticleContent(articleToUpgrade.url);
      if (result && result.content) {
        await db.articles.update(articleToUpgrade.id, {
          content: result.content,
          title: result.title,
          isFullText: true,
        });
        // 保存到本地缓存
        try {
          localStorage.setItem(`article_cache_${articleToUpgrade.id}`, JSON.stringify({
            content: result.content,
            title: result.title,
            timestamp: Date.now()
          }));
        } catch (e) {
          console.error('缓存文章失败:', e);
        }
        
        if (loadArticleRef.current) {
          await loadArticleRef.current(true);
        }
      } else {
        // 尝试从本地缓存加载
        try {
          const cachedArticle = localStorage.getItem(`article_cache_${articleToUpgrade.id}`);
          if (cachedArticle) {
            const parsed = JSON.parse(cachedArticle);
            await db.articles.update(articleToUpgrade.id, {
              content: parsed.content,
              title: parsed.title,
              isFullText: true,
            });
            if (loadArticleRef.current) {
              await loadArticleRef.current(true);
            }
            return;
          }
        } catch (e) {
          console.error('读取缓存文章失败:', e);
        }
        
        // 静默记录错误，但不显示任何提示
        console.warn('无法获取文章全文，目标网站可能不支持。');
        
        // 不显示提示，直接更新文章状态
        if (isMounted) {
          setFetchingFullText(false);
        }
      }
    } catch (error: any) {
      console.error("获取全文失败:", error);
      // 尝试从本地缓存加载
      try {
        const cachedArticle = localStorage.getItem(`article_cache_${articleToUpgrade.id}`);
        if (cachedArticle) {
          const parsed = JSON.parse(cachedArticle);
          await db.articles.update(articleToUpgrade.id, {
            content: parsed.content,
            title: parsed.title,
            isFullText: true,
          });
          if (loadArticleRef.current) {
            await loadArticleRef.current(true);
          }
          return;
        }
      } catch (e) {
        console.error('读取缓存文章失败:', e);
      }
      
      // 静默记录错误，但不显示任何提示
      console.error(`获取全文时发生错误: ${error.message}`);
      
      // 不显示提示，直接更新文章状态
      if (isMounted) {
        setFetchingFullText(false);
      }
    } finally {
      if (isMounted) {
        setFetchingFullText(false);
      }
    }
  }, [db, isMounted]);

  const loadArticle = useCallback(async (forceReload = false) => {
    console.log('loadArticle called, articleId:', articleId, 'db:', !!db, 'forceReload:', forceReload);
    
    // 防止重复加载：如果已经在加载此文章且非强制刷新，则跳过
    if (!forceReload && loadingArticleRef.current === articleId) {
      console.log('已经在加载此文章，跳过重复加载');
      return;
    }
    
    if (articleId && db) {
      // 设置加载标志
      loadingArticleRef.current = articleId;
      
      if (forceReload || !article || article.id !== articleId) {
        console.log('loadArticle - loading article data');
        // 首先设置加载状态，避免内容闪烁
        setLoading(true);
        
        // 在设置新文章前，保存当前文章的滚动位置（如果存在）
        if (article && scrollableContentRef.current) {
          const currentPosition = scrollableContentRef.current.scrollTop;
          saveScrollPosition(article.id, currentPosition).catch(e => 
            console.error('保存当前文章滚动位置失败:', e)
          );
        }
        
        // 在加载新内容前重置滚动位置，防止出现旧文章滚动位置问题
        if (scrollableContentRef.current) {
          scrollableContentRef.current.scrollTop = 0;
        }
        
        // 先重置状态，避免显示旧内容
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
          // 记录当前处理的文章ID，用于防止竞态条件
          currentArticleIdRef.current = articleId;
  
          // 预先获取文章和订阅源信息，确定默认模式
          const currentArticleData = await db.articles.get(articleId);
          console.log('loadArticle - fetched article:', currentArticleData ? currentArticleData.title : 'not found');
          if (!currentArticleData) {
            console.error('loadArticle - article not found:', articleId);
            setArticle(null);
            setLoading(false);
            return;
          }
  
          // 获取订阅源信息，确定默认模式
          const source = currentArticleData.sourceId ? 
            await db.feeds.get(currentArticleData.sourceId) : undefined;
            
          // 更新订阅源标题
          setSourceTitle(source?.title);

          // 判断是否需要自动获取全文
          // 如果文章未标记为全文，但订阅源设置为全文模式，或当前视图模式为full，则获取全文
          // 确保defaultViewMode存在且为'fulltext'，否则使用默认值'summary'
          const sourceDefaultViewMode = source?.defaultViewMode || 'summary';
          const needFullTextFetch = !currentArticleData.isFullText && 
            ((sourceDefaultViewMode === 'fulltext') || viewMode === 'full');
          
          // 记录日志，便于调试
          log(`文章: ${currentArticleData.title}`);
          log(`是否已有全文: ${currentArticleData.isFullText}`);
          log(`订阅源默认模式: ${sourceDefaultViewMode}`);
          log(`当前视图模式: ${viewMode}`);
          log(`是否需要获取全文: ${needFullTextFetch}`);
          
          // 创建一个临时变量来存储最终要显示的文章数据
          let finalArticleData = {...currentArticleData};
          
          // 如果需要自动获取全文，先获取全文再显示
          if (needFullTextFetch) {
            // 保持loading状态，但不设置fetchingFullText，避免额外的加载状态闪烁
            // 移除: setFetchingFullText(true);
            
            try {
              log(`尝试获取全文: ${currentArticleData.url}`);
              // 首先尝试从本地缓存获取
              const cachedArticle = localStorage.getItem(`article_cache_${articleId}`);
              let fullTextContent = null;
              let fullTextTitle = null;
              
              if (cachedArticle) {
                try {
                  const parsed = JSON.parse(cachedArticle);
                  if (parsed.content && parsed.timestamp) {
                    log(`从本地缓存加载全文内容, 缓存时间: ${new Date(parsed.timestamp).toLocaleString()}`);
                    fullTextContent = parsed.content;
                    fullTextTitle = parsed.title || currentArticleData.title;
                  }
                } catch (e) {
                  console.error('解析缓存文章失败:', e);
                }
              }
              
              // 如果没有缓存或缓存无效，尝试获取全文
              if (!fullTextContent) {
                log(`本地缓存未命中，正在从远程获取全文`);
                // 尝试获取全文
                const result = await window.electron.fetchArticleContent(currentArticleData.url);
                if (result && result.content) {
                  fullTextContent = result.content;
                  fullTextTitle = result.title || currentArticleData.title;
                  
                  // 保存到本地缓存
                  try {
                    localStorage.setItem(`article_cache_${articleId}`, JSON.stringify({
                      content: fullTextContent,
                      title: fullTextTitle,
                      timestamp: Date.now()
                    }));
                    log(`全文内容已保存到本地缓存`);
                  } catch (e) {
                    console.error('缓存文章失败:', e);
                  }
                }
              }
              
              // 如果成功获取全文，更新数据库和显示
              if (fullTextContent) {
                // 更新数据库
                await db.articles.update(articleId, {
                  content: fullTextContent,
                  title: fullTextTitle || currentArticleData.title,
                  isFullText: true,
                });
                
                // 检查文章ID是否发生变化（竞态问题检查）
                if (articleId !== currentArticleIdRef.current) {
                  console.log('[ArticleDetail] 文章ID已变化，停止加载当前文章');
                  return;
                }
                
                // 重新获取更新后的文章数据
                const updatedArticle = await db.articles.get(articleId);
                if (updatedArticle) {
                  finalArticleData = updatedArticle;
                  log(`全文获取成功并更新`);
                }
              } else {
                // 全文获取失败，使用原始内容
                log(`获取全文内容失败，使用原始内容显示`);
              }
            } catch (error) {
              // 全文获取失败，使用原始内容
              console.error('[ArticleDetail] 自动获取全文失败:', error);
            }
            // 移除: finally {
            //   setFetchingFullText(false);
            // }
          }
          
          // 如果需要标记为已读
          if (finalArticleData.isRead === 'false' && readingSettings.autoMarkAsRead) {
            await db.articles.update(articleId, { isRead: 'true' });
            log(`文章 ${articleId} 已自动标记为已读`);
            finalArticleData.isRead = 'true';
          }
          
          // 检查文章ID是否发生变化（竞态问题检查）
          if (articleId !== currentArticleIdRef.current) {
            console.log('[ArticleDetail] 文章ID已变化，停止加载当前文章');
            return;
          }
            
          // 应用高亮和其他处理
          const annos = await loadAnnotations();
            
          // 决定使用哪个内容版本
          const contentToShow = 
            finalArticleData.aiHighlightedContent && isAiHighlightsVisible
              ? finalArticleData.aiHighlightedContent
              : finalArticleData.content;

          const contentWithHighlights = applyHighlights(contentToShow, annos);
          setProcessedContent(contentWithHighlights);
          setArticle(finalArticleData);

          // 如果存在已保存的摘要，则加载它，但不立即显示
          if (finalArticleData.aiSummary) {
            setInlineSummaryContent(finalArticleData.aiSummary);
          }
          
          // 如果存在AI高亮内容，则将可见性设为true
          if (finalArticleData.aiHighlightedContent) {
            setIsAiHighlightsVisible(true);
          }
        } catch (error) {
          console.error('加载文章详情失败:', error);
          setArticle(null);
        } finally {
          // 所有加载完成后，一次性关闭loading状态
          if (isMounted) {
            setLoading(false);
            // 确保fetchingFullText也设置为false
            setFetchingFullText(false);
          }
        }
      }
    }
  }, [articleId, db, article, viewMode, readingSettings.autoMarkAsRead, isMounted, loadAnnotations, applyHighlights, isAiHighlightsVisible]);
  
  useEffect(() => {
    loadArticleRef.current = loadArticle;
  }, [loadArticle]);

  // Effect: 加载文章数据 - 优化后的版本
  useEffect(() => {
    // 保存 loadArticle 函数的引用，以便可以在其他地方调用
    loadArticleRef.current = loadArticle;
    
    console.log('ArticleDetail useEffect for articleId:', articleId);
    // 仅当 articleId 变化或组件首次加载时执行
    if (articleId) {
    // 每次文章ID变化时，重置滚动位置恢复标志
    scrollPositionRestored.current = false;
      
      // 使用一个延迟加载标志来防止多次加载
      const loadingId = articleId;
      const loadArticleData = async () => {
        // 确保当前加载的文章ID和请求的文章ID相同（防止竞态条件）
        if (loadingId !== articleId) return;
        
        // 如果 db 已初始化且当前没有加载这篇文章，则加载文章
        if (db && (!article || article.id !== articleId)) {
          await loadArticle(true);  // 强制重新加载
        }
      };
      
      loadArticleData();
    }
    // 只依赖 articleId 和 db，移除对 loadArticle 的依赖
  }, [articleId, db, article, loadArticle]);

  const handleFetchAndUpgradeArticle = useCallback(async (articleToUpgrade: Article) => {
    if (annotations.length > 0) {
      Modal.confirm({
        title: '确认获取全文',
        content: '当前文章已有笔记或高亮。获取全文会替换内容，并可能导致笔记定位不准确。是否继续？',
        okText: '继续获取',
        cancelText: '取消',
        onOk: () => {
          // 先将当前内容备份到一个临时状态
          const originalContent = articleToUpgrade.content;
          
          // 在获取全文前先设置加载状态
          setFetchingFullText(true);
          
          // 执行获取全文操作
          performUpgrade(articleToUpgrade).catch(e => {
            console.error('获取全文失败:', e);
            // 发生错误时回滚到原始内容
            if (db && isMounted) {
              db.articles.update(articleToUpgrade.id, { content: originalContent })
                .catch(err => console.error('回滚内容失败:', err));
            }
          });
        }
      });
    } else {
      // 先将当前内容备份到一个临时状态
      const originalContent = articleToUpgrade.content;
      
      // 在获取全文前先设置加载状态
      setFetchingFullText(true);
      
      // 执行获取全文操作
      performUpgrade(articleToUpgrade).catch(e => {
        console.error('获取全文失败:', e);
        // 发生错误时回滚到原始内容
        if (db && isMounted) {
          db.articles.update(articleToUpgrade.id, { content: originalContent })
            .catch(err => console.error('回滚内容失败:', err));
        }
      });
    }
  }, [annotations, performUpgrade, db, isMounted]);

  // 创建一个滚动处理函数，在滚动时保存位置
  const handleScroll = useCallback(
    debounce(() => {
      if (!article || !scrollableContentRef.current) return;
      const currentPosition = scrollableContentRef.current.scrollTop;
      saveScrollPosition(article.id, currentPosition);
    }, 300),
    [article, saveScrollPosition]
  );

  // 添加滚动事件监听
  useEffect(() => {
    if (!scrollableContentRef.current || !article) return; // 确保article存在

    const scrollableContent = scrollableContentRef.current;
    scrollableContent.addEventListener('scroll', handleScroll);

    return () => {
      scrollableContent.removeEventListener('scroll', handleScroll);
      // 组件卸载时保存当前滚动位置
      if (article && scrollableContentRef.current) {
        saveScrollPosition(article.id, scrollableContentRef.current.scrollTop);
      }
    };
  }, [article?.id, handleScroll, saveScrollPosition]); // 只依赖article.id而不是整个article对象

  // 在浏览器窗口关闭前保存位置
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (article && scrollableContentRef.current) {
        // 同步方式保存，确保在关闭前能完成
        try {
          const position = scrollableContentRef.current.scrollTop;
          localStorage.setItem(`temp_scroll_${article.id}`, position.toString());
        } catch (e) {
          console.error("临时保存阅读进度失败:", e);
        }
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [article?.id]); // 只依赖article.id而不是整个article对象

  // 恢复滚动位置
  useEffect(() => {
    if (!article || !scrollableContentRef.current) return;
    
    // 使用组件级ref跟踪是否已恢复过滚动位置，避免多次恢复
    if (scrollPositionRestored.current) return;
    
    // 首先尝试从localStorage获取临时保存的位置
    const tempScroll = localStorage.getItem(`temp_scroll_${article.id}`);
    if (tempScroll) {
      localStorage.removeItem(`temp_scroll_${article.id}`); // 使用后删除
      
      // 延迟执行滚动恢复，确保DOM完全更新且内容已渲染
      const timer = setTimeout(() => {
        if (scrollableContentRef.current && isMountedRef.current) {
          // 立即滚动，不使用平滑效果
          scrollableContentRef.current.scrollTo({
            top: parseInt(tempScroll, 10),
            behavior: 'auto' // 使用即时滚动而非平滑滚动
          });
          scrollPositionRestored.current = true;
        }
      }, 150); // 增加延迟时间，确保内容已完全加载
      
      return () => clearTimeout(timer);
    }
    
    // 如果没有临时保存的位置，则使用数据库中的位置
    if (article.scrollPosition && article.scrollPosition > 0) {
      const timer = setTimeout(() => {
        if (scrollableContentRef.current && isMountedRef.current) {
          // 立即滚动，不使用平滑效果
          scrollableContentRef.current.scrollTo({
            top: article.scrollPosition || 0,
            behavior: 'auto' // 使用即时滚动而非平滑滚动
          });
          scrollPositionRestored.current = true;
        }
      }, 150);
      
      return () => clearTimeout(timer);
    }
  }, [article?.id]); // 只依赖article.id而不是整个article对象

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
          img.addEventListener('error', handleImageError as any);
          
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
    // 如果切换到全文模式且当前文章存在，但没有全文，则自动触发获取全文
    if (mode === 'full' && article && !article.isFullText) {
      // 先设置视图模式
      onChangeViewMode(mode);
      // 触发全文获取
      handleFetchAndUpgradeArticle(article);
    } else {
      // 其他情况直接切换视图模式
      onChangeViewMode(mode);
    }
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

  const { cachedContent } = useContentCache(articleId, processedContent);

  const renderArticleContent = () => {
    // 如果处于加载状态或没有文章或正在获取全文，则不渲染内容
    if (loading || !article || fetchingFullText) return null;
    
    // 只在全文模式或原始模式下渲染内容
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

  // 从会话存储中获取高亮和笔记的信息
  useEffect(() => {
    if (!articleId) return;
    
    const shouldOpenSidebar = sessionStorage.getItem('openAnnotationSidebar') === 'true';
    const highlightAnnotationId = sessionStorage.getItem('highlightAnnotationId');
    const shouldEditAnnotation = sessionStorage.getItem('editAnnotation') === 'true';
    const annotationObjectStr = sessionStorage.getItem('annotationObject');
    const fromNotesPage = sessionStorage.getItem('fromNotesPage') === 'true';

    log(`检查会话存储: shouldOpenSidebar=${shouldOpenSidebar}, highlightAnnotationId=${highlightAnnotationId}, shouldEditAnnotation=${shouldEditAnnotation}, hasAnnotationObject=${!!annotationObjectStr}, fromNotesPage=${fromNotesPage}`);

    // 设置是否从笔记中心跳转过来的标志
    if (fromNotesPage) {
      setIsFromNotesPage(true);
      // 不要在这里清除fromNotesPage标记，而是在组件卸载时清除
    }

    // 立即清除会话存储中的跳转标记，防止其他组件实例读取到
    if (shouldOpenSidebar || highlightAnnotationId || shouldEditAnnotation || annotationObjectStr) {
      log('[ArticleDetail] 立即清除会话存储中的跳转标记，防止其他组件实例读取');
      sessionStorage.removeItem('openAnnotationSidebar');
      sessionStorage.removeItem('highlightAnnotationId');
      sessionStorage.removeItem('editAnnotation');
      sessionStorage.removeItem('annotationObject');
      // 注意：不要在这里清除fromNotesPage，因为我们需要它来判断返回逻辑
    }

    // 只有当明确设置了这些值时才执行后续操作
    if ((shouldOpenSidebar && highlightAnnotationId) || fromNotesPage) {
      log(`检测到从笔记中心跳转，将立即打开侧边栏${highlightAnnotationId ? `并高亮: ${highlightAnnotationId}` : ''}`);
      
      // 立即打开侧边栏
      if (!isSidebarVisible) {
        log('[ArticleDetail] 正在立即打开侧边栏');
        handleToggleSidebar();
      } else {
        log('[ArticleDetail] 侧边栏已经打开，无需再次打开');
      }

      // 如果有高亮ID，则处理高亮和编辑
      if (highlightAnnotationId) {
        // 使用一个短延迟来确保高亮处理在侧边栏打开后进行
        const timer = setTimeout(() => {
          // 修复：确保使用正确的元素ID格式
          const cleanAnnotationId = highlightAnnotationId.replace(/^annotation-/, '');
          log(`处理后的注释ID: ${cleanAnnotationId}`);

          // 滚动到对应的高亮
          log(`正在滚动到高亮: ${cleanAnnotationId}`);
          handleScrollToAnnotation(cleanAnnotationId);

          // 如果需要编辑，通过设置自动编辑ID来触发编辑模式
          if (shouldEditAnnotation) {
            log(`正在触发编辑模式: ${cleanAnnotationId}`);
            
            // 增加延迟，确保笔记数据已经加载完成
            setTimeout(() => {
              // 触发编辑笔记事件
              document.dispatchEvent(new CustomEvent('edit-annotation', {
                detail: { annotationId: cleanAnnotationId }
              }));
            }, 500);
          }
        }, 300); // 使用更短的延迟，只是为了确保DOM已经更新
      }
    }
  }, [articleId, isSidebarVisible]);

  // 组件卸载时清除fromNotesPage标记
  useEffect(() => {
    return () => {
      if (isFromNotesPage) {
        log('[ArticleDetail] 组件卸载，清除fromNotesPage标记');
        sessionStorage.removeItem('fromNotesPage');
      }
    };
  }, [isFromNotesPage]);

  // 处理更新笔记
  const handleUpdateAnnotation = (annotationId: string, content: string) => {
    handleSaveNote(annotationId, content);
  };

  // 添加预获取文章全文的函数
  const prefetchArticleFullText = useCallback(async (articleId: string) => {
    if (!db) return;
    
    try {
      // 获取文章信息
      const article = await db.articles.get(articleId);
      if (!article || article.isFullText) return; // 如果文章不存在或已有全文，直接返回
      
      log(`开始后台预获取文章全文: ${article.title}`);
      
      // 首先尝试从本地缓存获取
      const cachedArticle = localStorage.getItem(`article_cache_${articleId}`);
      if (cachedArticle) {
        try {
          const parsed = JSON.parse(cachedArticle);
          if (parsed.content && parsed.timestamp) {
            log(`预获取：发现本地缓存，无需远程获取`);
            return; // 已有缓存，无需继续
          }
        } catch (e) {
          console.error('解析缓存文章失败:', e);
        }
      }
      
      // 没有缓存，尝试远程获取
      const result = await window.electron.fetchArticleContent(article.url);
      if (result && result.content) {
        // 保存到本地缓存
        localStorage.setItem(`article_cache_${articleId}`, JSON.stringify({
          content: result.content,
          title: result.title || article.title,
          timestamp: Date.now()
        }));
        log(`预获取成功并缓存到本地: ${article.title}`);
      }
    } catch (error) {
      console.error('预获取文章全文失败:', error);
    }
  }, [db]);

  // 添加一个简单的函数，用于获取当前文章的下一篇文章
  useEffect(() => {
    if (!articleId || !db) return;
    
    // 使用setTimeout将预加载任务放入宏任务队列，避免阻塞主要内容加载
    const timer = setTimeout(async () => {
      try {
        // 简单地获取一些最近的文章进行预加载
        const recentArticles = await db.articles
          .orderBy('publishDate')
          .reverse()
          .filter(article => article.id !== articleId && !article.isFullText)
          .limit(3)
          .toArray();
        
        if (recentArticles.length === 0) return;
        
        log(`预加载${recentArticles.length}篇最近文章`);
        
        // 逐个预加载，但增加延迟避免同时发起多个请求
        recentArticles.forEach((article, index) => {
          setTimeout(() => {
            prefetchArticleFullText(article.id);
          }, index * 3000); // 每个预加载间隔3秒
        });
      } catch (error) {
        console.error('获取预加载文章失败:', error);
      }
    }, 2000); // 当前文章加载2秒后开始预加载
    
    return () => clearTimeout(timer);
  }, [articleId, db, prefetchArticleFullText]);

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

  // 更新加载状态的显示，使用更友好的加载视图
  if (loading || (!article && articleId) || fetchingFullText) {
    return (
      <div className={styles.articleDetailContainer} style={articleStyle}>
        <div className={styles.loadingContainer}>
          <div className={styles.reederLoader}>
            <div className={styles.dot}></div>
            <div className={styles.dot}></div>
            <div className={styles.dot}></div>
          </div>
        </div>
      </div>
    );
  }

  // 只有当明确没有文章时才显示错误状态
  if (!articleId || article === null) {
    return (
      <div className={styles.articleDetailContainer} style={articleStyle}>
        <div className={styles.errorContainer}>
          <Empty description="选择文章开始阅读" className={styles.emptyState} />
          {onClose && (
          <Button 
            type="primary" 
            onClick={handleCloseDetail} 
            style={{ marginTop: 16 }}
          >
            返回列表
          </Button>
          )}
        </div>
      </div>
    );
  }
  
  // 在这里保证article不为undefined，解决类型错误
  if (!article) {
    return (
      <div className={styles.articleDetailContainer} style={articleStyle}>
        <div className={styles.loadingContainer}>
          <div className={styles.reederLoader}>
            <div className={styles.dot}></div>
            <div className={styles.dot}></div>
            <div className={styles.dot}></div>
          </div>
        </div>
      </div>
    );
  }

  const isAnyAiLoading = isSummaryLoading || isMindmapLoading || isHighlightLoading;
  const hasSummary = !!inlineSummaryContent;

  return (
    <div ref={articleDetailContainerRef} className={styles.articleDetailContainer} style={articleStyle}>
      <div className={`${styles.fixedControlsBar} ${isScrolled ? styles.scrolled : ''}`}>
        <div className={styles.closeButtonContainer}>
          {!isSidebarVisible && (
            <Tooltip title="关闭">
              <Button
                type="text"
                shape="circle"
                icon={<CloseOutlined />}
                onClick={handleCloseDetail}
                className={styles.toolbarButton}
              />
            </Tooltip>
          )}
          {isSidebarVisible && (
            <div className={styles.invisiblePlaceholder}></div>
          )}
        </div>
        
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
          
          <Tooltip title="读了有啥用">
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

          {/* 隐藏分享按钮
          <Tooltip title="分享">
            <Button
              type="text"
              shape="circle"
              icon={<ShareAltOutlined />}
              onClick={handleShare}
              className={styles.toolbarButton}
            />
          </Tooltip> */}
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
                        <span style={{ marginLeft: 8 }}>读了有啥用</span>
                      </h3>
                      {inlineSummaryContent && (
                        <Tooltip title="复制价值分析">
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
                        <span style={{ marginLeft: 8 }}>价值分析中...</span>
                      </div>
                    )}
                    {summaryError && <div className={styles.summaryError}>价值分析失败: {summaryError}</div>}
                    {inlineSummaryContent && !isSummaryLoading && (
                      <div className={styles.summaryContent}>
                        <p dangerouslySetInnerHTML={{ __html: convertMarkdownBoldToHtml(inlineSummaryContent) }}></p>
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
            onScrollToAnnotation={handleScrollToAnnotation}
            onUpdateAnnotation={handleUpdateAnnotation}
            onDeleteAnnotation={handleDeleteAnnotation}
            articleId={articleId || ''}
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
