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

  // 处理从笔记中心跳转过来的情况，直接添加高亮
  useEffect(() => {
    if (!articleId || !db) return;
    
    // 检查是否有从笔记中心跳转过来的笔记对象
    const annotationObjectStr = sessionStorage.getItem('annotationObject');
    if (annotationObjectStr) {
      try {
        const annotation = JSON.parse(annotationObjectStr);
        console.log(`[useAnnotations] 找到存储的笔记对象: ${annotation.id}`);
        
        // 确保笔记ID格式正确
        if (!annotation.id.startsWith('annotation-')) {
          annotation.id = `annotation-${annotation.id}`;
          console.log(`[useAnnotations] 修正笔记ID格式: ${annotation.id}`);
        }
        
        // 将笔记对象添加到当前文章的高亮中
        setAnnotations(prev => {
          // 检查是否已经存在相同ID的笔记
          const exists = prev.some(a => a.id === annotation.id);
          if (exists) {
            console.log(`[useAnnotations] 笔记 ${annotation.id} 已存在，不重复添加`);
            return prev;
          }
          
          console.log(`[useAnnotations] 添加笔记 ${annotation.id} 到当前文章`);
          return [...prev, annotation];
        });
        
        // 应用高亮到内容中
        setProcessedContent(prev => {
          if (!prev) return prev;
          console.log(`[useAnnotations] 应用高亮到内容中: ${annotation.id}`);
          return applyHighlights(prev, [annotation]);
        });
        
        // 清除存储的笔记对象，防止后续误用
        console.log(`[useAnnotations] 清除存储的笔记对象`);
        sessionStorage.removeItem('annotationObject');
      } catch (error) {
        console.error('[useAnnotations] 解析存储的笔记对象失败:', error);
      }
    }
  }, [articleId, db, applyHighlights]);

  const loadAnnotations = useCallback(async () => {
    if (!db || !articleId) {
      setAnnotations([]);
      return [];
    }
    
    console.log(`[useAnnotations] 开始加载文章 ${articleId} 的笔记和高亮`);
    
    // 加载当前文章的笔记和高亮
    const annos = await db.annotations.where({ articleId }).sortBy('createdAt');
    console.log(`[useAnnotations] 加载了 ${annos.length} 条笔记和高亮`);
    setAnnotations(annos);
    return annos;
  }, [db, articleId]);
  
  const handleToggleSidebar = () => {
    const newVisibility = !isSidebarVisible;
    console.log(`[useAnnotations] 切换侧边栏可见性: ${newVisibility}`);
    setIsSidebarVisible(newVisibility);
    
    // 触发侧边栏切换事件
    document.dispatchEvent(new CustomEvent('annotationSidebarToggled', {
      detail: { isVisible: newVisibility }
    }));
    
    // 如果侧边栏打开且是从笔记页面跳转过来的，自动触发编辑笔记
    // 注意：只有在侧边栏从关闭状态变为打开状态时才执行此逻辑
    if (newVisibility && !isSidebarVisible && sessionStorage.getItem('fromNotesPage') === 'true') {
      console.log('[useAnnotations] 检测到从笔记页面跳转且侧边栏打开，准备自动编辑笔记');
      
      // 延迟一点时间，确保侧边栏完全打开且笔记数据已加载
      setTimeout(() => {
        // 如果有高亮ID，则触发编辑事件
        const highlightAnnotationId = sessionStorage.getItem('highlightAnnotationId');
        if (highlightAnnotationId) {
          console.log(`[useAnnotations] 自动触发编辑笔记: ${highlightAnnotationId}`);
          document.dispatchEvent(new CustomEvent('edit-annotation', {
            detail: { annotationId: highlightAnnotationId }
          }));
        } else if (annotations.length > 0) {
          // 如果没有指定高亮ID但有笔记，则编辑第一条笔记
          const noteAnnotations = annotations.filter(a => a.type === 'note');
          if (noteAnnotations.length > 0) {
            console.log(`[useAnnotations] 未指定高亮ID，自动编辑第一条笔记: ${noteAnnotations[0].id}`);
            document.dispatchEvent(new CustomEvent('edit-annotation', {
              detail: { annotationId: noteAnnotations[0].id }
            }));
          }
        }
      }, 300);
    }
  };

  const handleScrollToAnnotation = (annotationId: string) => {
    console.log(`[useAnnotations] 尝试滚动到笔记: ${annotationId}`);
    
    // 确保ID格式正确，移除可能的前缀
    const cleanId = annotationId.replace(/^annotation-/, '');
    console.log(`[useAnnotations] 处理后的ID: ${cleanId}`);
    
    // 尝试不同格式的ID
    const possibleIds = [
      `annotation-${cleanId}`,
      cleanId
    ];
    
    let foundElement = null;
    for (const id of possibleIds) {
      const element = document.getElementById(id);
      if (element) {
        console.log(`[useAnnotations] 找到元素，使用ID: ${id}`);
        foundElement = element;
        break;
      } else {
        console.log(`[useAnnotations] 未找到元素: ${id}`);
      }
    }
    
    if (foundElement) {
      console.log(`[useAnnotations] 找到元素，正在滚动到笔记`);
      foundElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      foundElement.style.transition = 'background-color 0.3s ease';
      foundElement.style.backgroundColor = '#fadd87';
      setTimeout(() => {
        foundElement!.style.backgroundColor = '';
      }, 1200);
    } else {
      console.log(`[useAnnotations] 所有尝试都失败，未找到笔记元素`);
      
      // 如果找不到元素，可能是因为DOM还没有完全加载，尝试延迟再次查找
      setTimeout(() => {
        for (const id of possibleIds) {
          const element = document.getElementById(id);
    if (element) {
            console.log(`[useAnnotations] 延迟查找成功，使用ID: ${id}`);
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.transition = 'background-color 0.3s ease';
      element.style.backgroundColor = '#fadd87';
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 1200);
            return;
          }
        }
        console.log(`[useAnnotations] 延迟查找也失败了，无法找到笔记元素`);
      }, 1000);
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

  // 触发笔记变化事件，通知其他组件更新
  const triggerAnnotationChange = useCallback(() => {
    console.log('[useAnnotations] 触发笔记变化事件');
    document.dispatchEvent(new CustomEvent('annotation-changed'));
  }, []);

  const handleSaveNote = async (annotationId: string, content: string) => {
    if (!db || !articleId) return;
    try {
      console.log(`[useAnnotations] 正在保存笔记: ${annotationId}, 内容长度: ${content.length}`);
      if (annotationId.startsWith('pending-')) {
        // 创建新的annotation对象，保持与临时ID相同的前缀/后缀
        const newId = `annotation-${Date.now()}`;
        console.log(`[useAnnotations] 这是一个临时笔记，将创建新的笔记ID: ${newId}`);
        const newAnnotationData: Annotation = { 
          ...pendingAnnotation!, 
          noteContent: content, 
          id: newId,
          type: 'note' as 'note' // 明确指定类型为 'note'
        };
        
        // 保存到数据库
        await db.annotations.add(newAnnotationData);
        console.log(`[useAnnotations] 新笔记已保存到数据库: ${newId}`);
        
        // 查找并更新临时高亮元素
        const tempHighlight = document.getElementById(`annotation-${pendingAnnotation!.id}`);
        if (tempHighlight) {
          // 更新ID和样式
          console.log(`[useAnnotations] 找到临时高亮元素，正在更新ID: ${pendingAnnotation!.id} -> ${newId}`);
          tempHighlight.id = `annotation-${newId}`;
          // 确保这是带笔记的高亮
          tempHighlight.classList.add('customHighlightWithNote');
        } else {
          console.log(`[useAnnotations] 未找到临时高亮元素，将重新应用高亮`);
          // 如果找不到临时高亮元素，重新应用高亮
          setProcessedContent(prev => applyHighlights(prev, [newAnnotationData]));
        }
        
        setPendingAnnotation(null);
        message.success("笔记已创建");
        
        // 触发笔记变化事件
        triggerAnnotationChange();
      } else {
        // 更新现有笔记
        console.log(`[useAnnotations] 正在更新现有笔记: ${annotationId}`);
        await db.annotations.update(annotationId, { noteContent: content });
        
        // 确保高亮元素有正确的样式
        const highlightElement = document.getElementById(`annotation-${annotationId}`);
        if (highlightElement) {
          console.log(`[useAnnotations] 找到高亮元素，确保它有正确的样式`);
          highlightElement.classList.add('customHighlightWithNote');
        } else {
          console.log(`[useAnnotations] 未找到高亮元素: annotation-${annotationId}`);
        }
        
        message.success("笔记已更新");
        
        // 触发笔记变化事件
        triggerAnnotationChange();
      }
      
      // 重新加载所有注释数据
      await loadAnnotations();
      return true; // 返回成功标志
    } catch (error) {
      console.error("[useAnnotations] 保存笔记失败:", error);
      message.error("保存笔记失败！");
      return false; // 返回失败标志
    }
  };

  const handleDeleteAnnotation = async (annotationId: string) => {
    if (!db || !articleId) return;
    try {
      console.log(`[useAnnotations] 正在删除笔记: ${annotationId}`);
      await db.annotations.delete(annotationId);
      const highlightElement = document.getElementById(`annotation-${annotationId}`);
      if (highlightElement) {
        console.log(`[useAnnotations] 找到高亮元素，正在移除: annotation-${annotationId}`);
        const fragment = document.createDocumentFragment();
        while (highlightElement.firstChild) {
          fragment.appendChild(highlightElement.firstChild);
        }
        highlightElement.parentNode?.replaceChild(fragment, highlightElement);
      } else {
        console.log(`[useAnnotations] 未找到高亮元素: annotation-${annotationId}`);
      }
      await loadAnnotations();
      
      // 触发笔记变化事件
      triggerAnnotationChange();
    } catch (error) {
      console.error("[useAnnotations] 删除失败:", error);
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

  // 添加监听自定义事件，用于从笔记中心跳转过来时触发编辑模式
  useEffect(() => {
    const handleEditAnnotation = (event: Event) => {
      const customEvent = event as CustomEvent<{ annotationId: string }>;
      if (customEvent.detail && customEvent.detail.annotationId) {
        const annotationId = customEvent.detail.annotationId;
        console.log(`[useAnnotations] 收到编辑笔记事件，笔记ID: ${annotationId}`);
        setAutoEditNoteId(annotationId);
      }
    };

    console.log('[useAnnotations] 添加编辑笔记事件监听器');
    document.addEventListener('edit-annotation', handleEditAnnotation);

    return () => {
      console.log('[useAnnotations] 移除编辑笔记事件监听器');
      document.removeEventListener('edit-annotation', handleEditAnnotation);
    };
  }, []);

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
    triggerAnnotationChange,
  };
}; 