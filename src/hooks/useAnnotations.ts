import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import { useDatabase } from '../contexts/DatabaseContext';
import { Annotation } from '../db/database';

// a helper function that might be moved to utils later
const applyHighlights = (content: string, annotationsToApply: Annotation[]): string => {
  let newContent = content;
  
  // 按照创建时间排序，确保高亮按顺序应用
  const sortedAnnotations = [...annotationsToApply].sort((a, b) => a.createdAt - b.createdAt);
  
  sortedAnnotations.forEach(anno => {
    // 为高亮和笔记使用不同的样式类
    const cssClass = anno.type === 'note' ? 'customHighlight customHighlightWithNote' : 'customHighlight';
    
    // 添加独特的ID和类名
    const markTag = `<mark id="annotation-${anno.id}" class="${cssClass}">`;
    
    // 使用前缀和后缀上下文来定位
    const searchString = `${anno.prefix}${anno.text}${anno.suffix}`;
    const replacementString = `${anno.prefix}${markTag}${anno.text}</mark>${anno.suffix}`;
    
    // 如果找到精确匹配，则应用高亮
    if (newContent.includes(searchString)) {
      newContent = newContent.replace(searchString, replacementString);
    } 
    // 如果没有精确匹配，尝试只使用文本进行匹配
    else if (newContent.includes(anno.text)) {
      // 这是一个简化的模糊匹配方法，可以根据需要进一步改进
      // 只替换第一个出现的匹配，避免多处替换造成问题
      const textIndex = newContent.indexOf(anno.text);
      if (textIndex >= 0) {
        const beforeText = newContent.substring(0, textIndex);
        const afterText = newContent.substring(textIndex + anno.text.length);
        newContent = `${beforeText}${markTag}${anno.text}</mark>${afterText}`;
      }
    }
  });
  
  return newContent;
};

export interface UseAnnotationsParams {
  articleId: string | null;
  scrollableContentRef: React.RefObject<HTMLDivElement>;
}

export const useAnnotations = ({ articleId, scrollableContentRef }: UseAnnotationsParams) => {
  const { db } = useDatabase();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [processedContent, setProcessedContent] = useState<string>('');
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
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
  const popupRef = useRef<HTMLDivElement>(null);

  const loadAnnotations = useCallback(async () => {
    if (!db || !articleId) {
      setAnnotations([]);
      return [];
    }
    const annos = await db.annotations.where({ articleId }).sortBy('createdAt');
    setAnnotations(annos);
    return annos;
  }, [db, articleId]);
  
  const handleToggleSidebar = () => {
    const newVisibility = !isSidebarVisible;
    setIsSidebarVisible(newVisibility);
    document.dispatchEvent(new CustomEvent('annotationSidebarToggled', {
      detail: { isVisible: newVisibility }
    }));
  };

  const handleScrollToAnnotation = (annotationId: string) => {
    const element = document.getElementById(`annotation-${annotationId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.transition = 'background-color 0.3s ease';
      element.style.backgroundColor = '#fadd87';
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 1200);
    }
  };

  const handleSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      if (scrollableContentRef.current && scrollableContentRef.current.contains(container)) {
        if (!selection.isCollapsed && selection.toString().trim().length > 0) {
          const rect = range.getBoundingClientRect();
          const containerRect = scrollableContentRef.current?.getBoundingClientRect();
          if (!containerRect) return;

          const top = rect.top - containerRect.top + scrollableContentRef.current!.scrollTop;
          const left = rect.left - containerRect.left + scrollableContentRef.current!.scrollLeft + (rect.width / 2);

          setSelectionPopup({ visible: true, top, left, range });
        } else {
          setSelectionPopup({ visible: false, top: 0, left: 0, range: null });
        }
        return;
      }
    }
    setSelectionPopup({ visible: false, top: 0, left: 0, range: null });
  };

  const handleHighlightClick = async () => {
    if (!selectionPopup.range || !articleId || !db) return;
    const { range } = selectionPopup;
    const text = range.toString().trim();
    if (!text) return;

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
      articleId,
      type: 'highlight',
      text,
      prefix,
      suffix,
      createdAt: Date.now()
    };

    try {
      await db.annotations.add(newAnnotation);
      const newAnnos = await loadAnnotations();
      setProcessedContent(prev => applyHighlights(prev, newAnnos));
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
    const { range } = selectionPopup;
    const text = range.toString().trim();
    if (!text) return;

    const prefixRange = document.createRange();
    prefixRange.setStart(range.startContainer, Math.max(0, range.startOffset - 20));
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const prefix = prefixRange.toString();

    const suffixRange = document.createRange();
    suffixRange.setStart(range.endContainer, range.endOffset);
    suffixRange.setEnd(range.endContainer, Math.min(range.endContainer.textContent?.length || 0, range.endOffset + 20));
    const suffix = suffixRange.toString();

    const tempId = `pending-${Date.now()}`;
    const tempAnnotation: Annotation = {
      id: tempId,
      articleId,
      type: 'note',
      text,
      prefix,
      suffix,
      noteContent: '',
      createdAt: Date.now()
    };

    // 先应用高亮到内容中，立即提供视觉反馈
    setProcessedContent(prev => applyHighlights(prev, [tempAnnotation]));
    
    // 然后设置pendingAnnotation状态
    setPendingAnnotation(tempAnnotation);
    
    if (!isSidebarVisible) {
      handleToggleSidebar();
    }
    setAutoEditNoteId(tempId);

    window.getSelection()?.removeAllRanges();
    setSelectionPopup({ visible: false, top: 0, left: 0, range: null });
  };

  const handleSaveNote = async (annotationId: string, content: string) => {
    if (!db || !articleId) return;
    try {
      if (annotationId.startsWith('pending-')) {
        // 创建新的annotation对象，保持与临时ID相同的前缀/后缀
        const newId = `annotation-${Date.now()}`;
        const newAnnotationData: Annotation = { 
          ...pendingAnnotation!, 
          noteContent: content, 
          id: newId,
          type: 'note' as 'note' // 明确指定类型为 'note'
        };
        
        // 保存到数据库
        await db.annotations.add(newAnnotationData);
        
        // 查找并更新临时高亮元素
        const tempHighlight = document.getElementById(`annotation-${pendingAnnotation!.id}`);
        if (tempHighlight) {
          // 更新ID和样式
          tempHighlight.id = `annotation-${newId}`;
          // 确保这是带笔记的高亮
          tempHighlight.classList.add('customHighlightWithNote');
        } else {
          // 如果找不到临时高亮元素，重新应用高亮
          setProcessedContent(prev => applyHighlights(prev, [newAnnotationData]));
        }
        
        setPendingAnnotation(null);
        message.success("笔记已创建");
      } else {
        // 更新现有笔记
        await db.annotations.update(annotationId, { noteContent: content });
        
        // 确保高亮元素有正确的样式
        const highlightElement = document.getElementById(`annotation-${annotationId}`);
        if (highlightElement) {
          highlightElement.classList.add('customHighlightWithNote');
        }
        
        message.success("笔记已保存");
      }
      
      // 重新加载所有注释数据
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
      const highlightElement = document.getElementById(`annotation-${annotationId}`);
      if (highlightElement) {
        const fragment = document.createDocumentFragment();
        while (highlightElement.firstChild) {
          fragment.appendChild(highlightElement.firstChild);
        }
        highlightElement.parentNode?.replaceChild(fragment, highlightElement);
      }
      await loadAnnotations();
    } catch (error) {
      console.error("删除失败:", error);
      message.error("删除失败！");
    }
  };

  // 新增：处理取消临时笔记
  const handleCancelPendingAnnotation = () => {
    if (pendingAnnotation) {
      // 移除临时高亮
      const tempHighlight = document.getElementById(`annotation-${pendingAnnotation.id}`);
      if (tempHighlight) {
        const fragment = document.createDocumentFragment();
        while (tempHighlight.firstChild) {
          fragment.appendChild(tempHighlight.firstChild);
        }
        tempHighlight.parentNode?.replaceChild(fragment, tempHighlight);
      }
      
      // 清除临时注释状态
      setPendingAnnotation(null);
    }
  };

  const handleAutoEditApplied = () => {
    setAutoEditNoteId(null);
  };

  // Effect to handle clicking on a highlight
  useEffect(() => {
    const contentElement = scrollableContentRef.current;
    if (!contentElement) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'MARK' && target.classList.contains('customHighlight')) {
        const annotationId = target.id.replace('annotation-', '');
        setIsSidebarVisible(true);
        setAutoEditNoteId(annotationId);
        if (!isSidebarVisible) {
          document.dispatchEvent(new CustomEvent('annotationSidebarToggled', {
            detail: { isVisible: true, articleId }
          }));
        }
      }
    };

    contentElement.addEventListener('click', handleClick);
    return () => contentElement.removeEventListener('click', handleClick);
  }, [articleId, isSidebarVisible, scrollableContentRef]);

  // Effect to handle clicking outside the selection popup
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        if (selectionPopup.visible) {
          setTimeout(() => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) {
              setSelectionPopup({ visible: false, top: 0, left: 0, range: null });
            }
          }, 100);
        }
      }
    };

    if (selectionPopup.visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectionPopup.visible]);


  return {
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
  };
}; 