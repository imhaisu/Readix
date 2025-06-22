import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import { useDatabase, Annotation } from '../contexts/DatabaseContext';

// a helper function that might be moved to utils later
const applyHighlights = (content: string, annotationsToApply: Annotation[]): string => {
  let newContent = content;
  annotationsToApply.forEach(anno => {
    // Make sure the highlight tag has a unique ID
    const markTag = `<mark id="annotation-${anno.id}" class="customHighlight">`;
    
    // This is a naive replacement. A more robust solution might be needed
    // if the prefix/suffix context is not unique enough.
    const searchString = `${anno.prefix}${anno.text}${anno.suffix}`;
    const replacementString = `${anno.prefix}${markTag}${anno.text}</mark>${anno.suffix}`;
    
    if (newContent.includes(searchString)) {
      newContent = newContent.replace(searchString, replacementString);
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

    const tempAnnotation: Annotation = {
      id: `pending-${Date.now()}`,
      articleId,
      type: 'note',
      text,
      prefix,
      suffix,
      noteContent: '',
      createdAt: Date.now()
    };

    setPendingAnnotation(tempAnnotation);
    if (!isSidebarVisible) {
      handleToggleSidebar();
    }
    setAutoEditNoteId(tempAnnotation.id);

    window.getSelection()?.removeAllRanges();
    setSelectionPopup({ visible: false, top: 0, left: 0, range: null });
  };

  const handleSaveNote = async (annotationId: string, content: string) => {
    if (!db || !articleId) return;
    try {
      if (annotationId.startsWith('pending-')) {
        const newAnnotationData = { ...pendingAnnotation!, noteContent: content, id: `annotation-${Date.now()}` };
        await db.annotations.add(newAnnotationData);
        setPendingAnnotation(null);
        setProcessedContent(prev => applyHighlights(prev, [newAnnotationData]));
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
      const highlightElement = document.getElementById(`annotation-${annotationId}`);
      if (highlightElement) {
        const fragment = document.createDocumentFragment();
        while (highlightElement.firstChild) {
          fragment.appendChild(highlightElement.firstChild);
        }
        highlightElement.parentNode?.replaceChild(fragment, highlightElement);
      }
      message.success("删除成功");
      await loadAnnotations();
    } catch (error) {
      console.error("删除失败:", error);
      message.error("删除失败！");
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
    handleAutoEditApplied,
  };
}; 