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
    
    try {
    // 使用前缀和后缀上下文来定位
    const searchString = `${anno.prefix}${anno.text}${anno.suffix}`;
    const replacementString = `${anno.prefix}${markTag}${anno.text}</mark>${anno.suffix}`;
    
    // 如果找到精确匹配，则应用高亮
    if (newContent.includes(searchString)) {
      newContent = newContent.replace(searchString, replacementString);
        console.log(`[applyHighlights] 使用精确匹配成功应用高亮: ${anno.id}`);
        return; // 成功应用高亮后，跳过后续尝试
    } 
      
    // 如果没有精确匹配，尝试只使用文本进行匹配
      if (newContent.includes(anno.text)) {
      // 这是一个简化的模糊匹配方法，可以根据需要进一步改进
      // 只替换第一个出现的匹配，避免多处替换造成问题
      const textIndex = newContent.indexOf(anno.text);
      if (textIndex >= 0) {
        const beforeText = newContent.substring(0, textIndex);
        const afterText = newContent.substring(textIndex + anno.text.length);
        newContent = `${beforeText}${markTag}${anno.text}</mark>${afterText}`;
          console.log(`[applyHighlights] 使用简单文本匹配成功应用高亮: ${anno.id}`);
          return; // 成功应用高亮后，跳过后续尝试
        }
      }
      
      // 如果上述方法都失败，尝试更复杂的匹配方法
      // 创建一个临时的DOM元素来解析HTML内容
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newContent;
      
      // 使用TextQuoteAnchor方式查找文本
      // 这种方法可以处理跨HTML元素的文本
      const textNodes: Node[] = [];
      const walk = document.createTreeWalker(
        tempDiv, 
        NodeFilter.SHOW_TEXT, 
        null
      );
      
      let node;
      while (node = walk.nextNode()) {
        textNodes.push(node);
      }
      
      // 构建完整的文本内容以进行搜索
      let fullText = '';
      const nodeStartPositions: number[] = [];
      
      textNodes.forEach(node => {
        nodeStartPositions.push(fullText.length);
        fullText += node.textContent || '';
      });
      
      // 在完整文本中查找目标文本
      const targetIndex = fullText.indexOf(anno.text);
      if (targetIndex === -1) {
        console.log(`[applyHighlights] 在文档中未找到文本: "${anno.text.substring(0, 20)}..."`);
        return; // 如果找不到文本，跳过此注释
      }
      
      const targetEndIndex = targetIndex + anno.text.length;
      
      // 确定起始节点和结束节点
      let startNodeIndex = -1;
      let endNodeIndex = -1;
      let startOffset = 0;
      let endOffset = 0;
      
      for (let i = 0; i < nodeStartPositions.length; i++) {
        if (startNodeIndex === -1 && 
            (i === nodeStartPositions.length - 1 || nodeStartPositions[i + 1] > targetIndex)) {
          startNodeIndex = i;
          startOffset = targetIndex - nodeStartPositions[i];
        }
        
        if (endNodeIndex === -1 && 
            (i === nodeStartPositions.length - 1 || nodeStartPositions[i + 1] > targetEndIndex)) {
          endNodeIndex = i;
          endOffset = targetEndIndex - nodeStartPositions[i];
          break;
        }
      }
      
      if (startNodeIndex === -1 || endNodeIndex === -1) {
        console.error(`[applyHighlights] 无法确定节点范围: ${anno.id}`);
        return;
      }
      
      // 检查是否跨越多个节点
      const isCrossingNodes = startNodeIndex !== endNodeIndex;
      
      if (!isCrossingNodes) {
        // 如果在同一个节点内，尝试使用surroundContents
        try {
          const range = document.createRange();
          range.setStart(textNodes[startNodeIndex], startOffset);
          range.setEnd(textNodes[startNodeIndex], endOffset);
          
          const mark = document.createElement('mark');
          mark.id = `annotation-${anno.id}`;
          mark.className = cssClass;
          
          range.surroundContents(mark);
          newContent = tempDiv.innerHTML;
          console.log(`[applyHighlights] 使用DOM Range成功应用单节点高亮: ${anno.id}`);
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          console.error(`[applyHighlights] 应用单节点高亮失败: ${errorMessage}`);
        }
      } else {
        // 处理跨越多个节点的情况 - 使用分段高亮
        console.log(`[applyHighlights] 检测到跨节点高亮，使用分段高亮: ${anno.id}`);
        
        try {
          // 创建一个新的高亮ID前缀，用于关联分段高亮
          const segmentIdPrefix = `annotation-segment-${anno.id}`;
          
          // 预处理：检查是否有纯文本节点被换行符分隔
          // 这有助于减少不必要的分段，让高亮更连贯
          let nodeTexts: string[] = [];
          let nodeTypes: string[] = [];
          let parentElements: (Element | null)[] = [];
          
          for (let i = startNodeIndex; i <= endNodeIndex; i++) {
            const node = textNodes[i];
            nodeTexts.push(node.textContent || '');
            nodeTypes.push(node.nodeType === Node.TEXT_NODE ? 'text' : 'element');
            parentElements.push(node.parentElement);
          }
          
          // 检查是否所有节点都属于同一个父元素且父元素不为null
          const hasValidParents = parentElements.every(parent => parent !== null);
          const allSameParent = hasValidParents && parentElements.every((parent, i, arr) => 
            i === 0 || parent === arr[0]
          );
          
          // 如果所有节点都属于同一个父元素，且都是文本节点，尝试合并处理
          if (allSameParent && nodeTypes.every(type => type === 'text') && parentElements[0] !== null) {
            console.log(`[applyHighlights] 检测到所有节点属于同一父元素，尝试整体处理`);
            
            try {
              // 获取共同父元素 (已确认不为null)
              const commonParent = parentElements[0]!;
              // 创建一个范围包含所有节点
              const fullRange = document.createRange();
              fullRange.setStart(textNodes[startNodeIndex], startOffset);
              fullRange.setEnd(textNodes[endNodeIndex], endOffset);
              
              // 创建一个单一的mark元素
              const singleMark = document.createElement('mark');
              singleMark.id = `annotation-${anno.id}`;
              singleMark.className = cssClass;
              
              // 尝试整体包装
              try {
                fullRange.surroundContents(singleMark);
                newContent = tempDiv.innerHTML;
                console.log(`[applyHighlights] 成功使用整体高亮方式: ${anno.id}`);
                return; // 成功后直接返回
              } catch (e: unknown) {
                // 如果整体包装失败，回退到分段处理
                console.log(`[applyHighlights] 整体高亮失败，回退到分段处理: ${e instanceof Error ? e.message : String(e)}`);
              }
            } catch (e: unknown) {
              console.log(`[applyHighlights] 尝试整体处理时出错: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          
          // 处理第一个节点
          const firstRange = document.createRange();
          firstRange.setStart(textNodes[startNodeIndex], startOffset);
          firstRange.setEnd(textNodes[startNodeIndex], (textNodes[startNodeIndex].textContent || '').length);
          
          const firstMark = document.createElement('mark');
          firstMark.id = `${segmentIdPrefix}-start`;
          firstMark.className = `${cssClass} segment-start`;
          firstMark.dataset.annotationId = anno.id;
          
          try {
            firstRange.surroundContents(firstMark);
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error(`[applyHighlights] 应用起始节点高亮失败: ${errorMessage}`);
            
            // 如果失败，尝试替换节点内容
            const node = textNodes[startNodeIndex];
            const text = node.textContent || '';
            const parent = node.parentNode;
            
            if (parent) {
              const beforeText = text.substring(0, startOffset);
              const highlightText = text.substring(startOffset);
              
              // 保留原始节点的空白特性
              const beforeSpan = document.createTextNode(beforeText);
              firstMark.textContent = highlightText;
              
              // 使用replaceChild而不是appendChild来保持节点的原始位置
              parent.replaceChild(firstMark, node);
              if (beforeText) {
                parent.insertBefore(beforeSpan, firstMark);
              }
            }
          }
          
          // 处理中间节点 - 仅处理非空节点
          for (let i = startNodeIndex + 1; i < endNodeIndex; i++) {
            // 跳过空文本节点，减少不必要的DOM操作
            if (!textNodes[i].textContent || textNodes[i].textContent.trim() === '') {
              continue;
            }
            
            const midRange = document.createRange();
            midRange.selectNodeContents(textNodes[i]);
            
            const midMark = document.createElement('mark');
            midMark.id = `${segmentIdPrefix}-mid-${i}`;
            midMark.className = `${cssClass} segment-middle`;
            midMark.dataset.annotationId = anno.id;
            
            try {
              midRange.surroundContents(midMark);
            } catch (e: unknown) {
              const errorMessage = e instanceof Error ? e.message : String(e);
              console.error(`[applyHighlights] 应用中间节点高亮失败: ${errorMessage}`);
              
              // 如果失败，尝试替换整个节点
              const node = textNodes[i];
              const parent = node.parentNode;
              
              if (parent) {
                midMark.textContent = node.textContent;
                parent.replaceChild(midMark, node);
              }
            }
          }
          
          // 处理最后一个节点
          const lastRange = document.createRange();
          lastRange.setStart(textNodes[endNodeIndex], 0);
          lastRange.setEnd(textNodes[endNodeIndex], endOffset);
          
          const lastMark = document.createElement('mark');
          lastMark.id = `${segmentIdPrefix}-end`;
          lastMark.className = `${cssClass} segment-end`;
          lastMark.dataset.annotationId = anno.id;
          
          try {
            lastRange.surroundContents(lastMark);
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error(`[applyHighlights] 应用结束节点高亮失败: ${errorMessage}`);
            
            // 如果失败，尝试替换节点内容
            const node = textNodes[endNodeIndex];
            const text = node.textContent || '';
            const parent = node.parentNode;
            
            if (parent) {
              const highlightText = text.substring(0, endOffset);
              const afterText = text.substring(endOffset);
              
              // 保留原始节点的空白特性
              const afterSpan = document.createTextNode(afterText);
              lastMark.textContent = highlightText;
              
              parent.replaceChild(lastMark, node);
              if (afterText) {
                parent.insertBefore(afterSpan, lastMark.nextSibling);
              }
            }
          }
          
          // 更新内容
          newContent = tempDiv.innerHTML;
          console.log(`[applyHighlights] 成功应用分段高亮: ${anno.id}`);
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          console.error(`[applyHighlights] 应用分段高亮失败: ${errorMessage}`);
          
          // 最后的降级方案：尝试使用简单的文本替换
          try {
            // 获取目标文本的前后一些字符作为上下文
            const contextBefore = fullText.substring(Math.max(0, targetIndex - 20), targetIndex);
            const contextAfter = fullText.substring(targetEndIndex, Math.min(fullText.length, targetEndIndex + 20));
            
            // 构建一个更精确的搜索模式
            const searchPattern = `${contextBefore}${anno.text}${contextAfter}`;
            const replacePattern = `${contextBefore}${markTag}${anno.text}</mark>${contextAfter}`;
            
            if (newContent.includes(searchPattern)) {
              newContent = newContent.replace(searchPattern, replacePattern);
              console.log(`[applyHighlights] 使用降级方案成功应用高亮: ${anno.id}`);
            } else {
              console.error(`[applyHighlights] 所有高亮方法都失败: ${anno.id}`);
            }
          } catch (finalError: unknown) {
            const finalErrorMessage = finalError instanceof Error ? finalError.message : String(finalError);
            console.error(`[applyHighlights] 降级方案也失败了: ${finalErrorMessage}`);
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[applyHighlights] 处理高亮时出错: ${errorMessage}`, error);
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
    
    // 尝试不同格式的ID - 包括普通高亮和分段高亮
    const possibleIds = [
      `annotation-${cleanId}`,
      cleanId
    ];
    
    // 先尝试查找普通高亮元素
    let foundElement = null;
    for (const id of possibleIds) {
      const element = document.getElementById(id);
      if (element) {
        console.log(`[useAnnotations] 找到普通高亮元素，使用ID: ${id}`);
        foundElement = element;
        break;
      } else {
        console.log(`[useAnnotations] 未找到普通高亮元素: ${id}`);
      }
    }
    
    // 如果没找到普通高亮，尝试查找分段高亮
    if (!foundElement) {
      console.log(`[useAnnotations] 尝试查找分段高亮元素`);
      
      // 首先通过data-annotation-id属性查找
      const segmentElements = document.querySelectorAll(`[data-annotation-id="${cleanId}"]`);
      if (segmentElements.length > 0) {
        console.log(`[useAnnotations] 找到 ${segmentElements.length} 个分段高亮元素，使用第一个`);
        foundElement = segmentElements[0] as HTMLElement;
      } else {
        // 如果通过data-annotation-id找不到，尝试通过ID前缀查找
        const segmentPrefix = `annotation-segment-${cleanId}`;
        const startSegment = document.getElementById(`${segmentPrefix}-start`);
        
        if (startSegment) {
          console.log(`[useAnnotations] 找到分段高亮起始元素: ${segmentPrefix}-start`);
          foundElement = startSegment;
        } else {
          // 如果连起始段都找不到，尝试查找任何中间段
          let i = 0;
          let midSegment;
          while (!foundElement && i < 10 && (midSegment = document.getElementById(`${segmentPrefix}-mid-${i}`))) {
            console.log(`[useAnnotations] 找到分段高亮中间元素: ${segmentPrefix}-mid-${i}`);
            foundElement = midSegment;
            i++;
          }
          
          // 如果中间段也找不到，尝试查找结束段
          if (!foundElement) {
            const endSegment = document.getElementById(`${segmentPrefix}-end`);
            if (endSegment) {
              console.log(`[useAnnotations] 找到分段高亮结束元素: ${segmentPrefix}-end`);
              foundElement = endSegment;
            }
          }
        }
      }
    }
    
    if (foundElement) {
      console.log(`[useAnnotations] 找到元素，正在滚动到笔记`);
      foundElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // 高亮显示找到的元素
      const originalBgColor = foundElement.style.backgroundColor;
      foundElement.style.transition = 'background-color 0.3s ease';
      foundElement.style.backgroundColor = '#fadd87';
      
      // 如果是分段高亮，尝试高亮所有相关段落
      const annotationId = cleanId;
      const relatedSegments = document.querySelectorAll(`[data-annotation-id="${annotationId}"]`);
      if (relatedSegments.length > 1) {
        relatedSegments.forEach(segment => {
          if (segment !== foundElement) {
            (segment as HTMLElement).style.transition = 'background-color 0.3s ease';
            (segment as HTMLElement).style.backgroundColor = '#fadd87';
          }
        });
      }
      
      // 恢复原始背景色
      setTimeout(() => {
        foundElement!.style.backgroundColor = originalBgColor;
        
        // 如果是分段高亮，恢复所有相关段落的背景色
        if (relatedSegments.length > 1) {
          relatedSegments.forEach(segment => {
            if (segment !== foundElement) {
              (segment as HTMLElement).style.backgroundColor = '';
            }
          });
        }
      }, 1200);
    } else {
      console.log(`[useAnnotations] 所有尝试都失败，未找到笔记元素`);
      
      // 如果找不到元素，可能是因为DOM还没有完全加载，尝试延迟再次查找
      setTimeout(() => {
        // 重新尝试查找所有可能的元素
        const delayedSearch = () => {
          // 先尝试普通高亮
          for (const id of possibleIds) {
            const element = document.getElementById(id);
            if (element) {
              console.log(`[useAnnotations] 延迟查找成功，找到普通高亮元素: ${id}`);
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              element.style.transition = 'background-color 0.3s ease';
              element.style.backgroundColor = '#fadd87';
              setTimeout(() => {
                element.style.backgroundColor = '';
              }, 1200);
              return true;
            }
          }
          
          // 尝试查找分段高亮
          const segmentElements = document.querySelectorAll(`[data-annotation-id="${cleanId}"]`);
          if (segmentElements.length > 0) {
            console.log(`[useAnnotations] 延迟查找成功，找到 ${segmentElements.length} 个分段高亮元素`);
            const firstSegment = segmentElements[0] as HTMLElement;
            firstSegment.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 高亮所有相关段落
            segmentElements.forEach(segment => {
              (segment as HTMLElement).style.transition = 'background-color 0.3s ease';
              (segment as HTMLElement).style.backgroundColor = '#fadd87';
            });
            
            setTimeout(() => {
              segmentElements.forEach(segment => {
                (segment as HTMLElement).style.backgroundColor = '';
              });
            }, 1200);
            return true;
          }
          
          // 最后尝试通过ID前缀查找
          const segmentPrefix = `annotation-segment-${cleanId}`;
          const startSegment = document.getElementById(`${segmentPrefix}-start`);
          const endSegment = document.getElementById(`${segmentPrefix}-end`);
          
          if (startSegment) {
            console.log(`[useAnnotations] 延迟查找成功，找到分段起始元素`);
            startSegment.scrollIntoView({ behavior: 'smooth', block: 'center' });
            startSegment.style.transition = 'background-color 0.3s ease';
            startSegment.style.backgroundColor = '#fadd87';
            setTimeout(() => {
              startSegment.style.backgroundColor = '';
            }, 1200);
            return true;
          } else if (endSegment) {
            console.log(`[useAnnotations] 延迟查找成功，找到分段结束元素`);
            endSegment.scrollIntoView({ behavior: 'smooth', block: 'center' });
            endSegment.style.transition = 'background-color 0.3s ease';
            endSegment.style.backgroundColor = '#fadd87';
            setTimeout(() => {
              endSegment.style.backgroundColor = '';
            }, 1200);
            return true;
          }
          
          return false;
        };
        
        if (!delayedSearch()) {
          console.log(`[useAnnotations] 延迟查找也失败了，无法找到笔记元素`);
        }
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

    // 获取更多的上下文，以便更好地定位高亮
    const prefixRange = document.createRange();
    prefixRange.setStart(range.startContainer, Math.max(0, range.startOffset - 40));
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const prefix = prefixRange.toString();

    const suffixRange = document.createRange();
    suffixRange.setStart(range.endContainer, range.endOffset);
    suffixRange.setEnd(range.endContainer, Math.min(range.endContainer.textContent?.length || 0, range.endOffset + 40));
    const suffix = suffixRange.toString();

    // 检查是否跨越多个HTML元素
    const isCrossingElements = !range.collapsed && 
      (range.startContainer !== range.endContainer || 
       range.startContainer.nodeType !== Node.TEXT_NODE ||
       range.commonAncestorContainer.nodeType !== Node.TEXT_NODE);

    // 如果跨越多个元素，获取更多的上下文信息
    let extendedPrefix = prefix;
    let extendedSuffix = suffix;

    if (isCrossingElements) {
      console.log('[handleHighlightClick] 检测到跨元素选择');
      
      // 尝试获取更广泛的上下文
      try {
        // 获取共同祖先元素中的所有文本内容
        const fullText = range.commonAncestorContainer.textContent || '';
        const selectedText = text;
        
        // 在完整文本中查找选中文本的位置
        const textIndex = fullText.indexOf(selectedText);
        if (textIndex >= 0) {
          // 获取更大范围的前缀和后缀
          const prefixStart = Math.max(0, textIndex - 60);
          extendedPrefix = fullText.substring(prefixStart, textIndex);
          
          const suffixEnd = Math.min(fullText.length, textIndex + selectedText.length + 60);
          extendedSuffix = fullText.substring(textIndex + selectedText.length, suffixEnd);
          
          console.log('[handleHighlightClick] 已获取扩展上下文');
        }
      } catch (error: unknown) {
        console.error('[handleHighlightClick] 获取扩展上下文失败:', error);
        // 如果获取扩展上下文失败，继续使用原始的前缀和后缀
      }
    }

    const newAnnotation: Annotation = {
      id: `annotation-${Date.now()}`,
      articleId,
      type: 'highlight',
      text,
      prefix: isCrossingElements ? extendedPrefix : prefix,
      suffix: isCrossingElements ? extendedSuffix : suffix,
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

    // 获取更多的上下文，以便更好地定位高亮
    const prefixRange = document.createRange();
    prefixRange.setStart(range.startContainer, Math.max(0, range.startOffset - 40));
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const prefix = prefixRange.toString();

    const suffixRange = document.createRange();
    suffixRange.setStart(range.endContainer, range.endOffset);
    suffixRange.setEnd(range.endContainer, Math.min(range.endContainer.textContent?.length || 0, range.endOffset + 40));
    const suffix = suffixRange.toString();

    // 检查是否跨越多个HTML元素
    const isCrossingElements = !range.collapsed && 
      (range.startContainer !== range.endContainer || 
       range.startContainer.nodeType !== Node.TEXT_NODE ||
       range.commonAncestorContainer.nodeType !== Node.TEXT_NODE);

    // 如果跨越多个元素，获取更多的上下文信息
    let extendedPrefix = prefix;
    let extendedSuffix = suffix;

    if (isCrossingElements) {
      console.log('[handleNoteClick] 检测到跨元素选择');
      
      // 尝试获取更广泛的上下文
      try {
        // 获取共同祖先元素中的所有文本内容
        const fullText = range.commonAncestorContainer.textContent || '';
        const selectedText = text;
        
        // 在完整文本中查找选中文本的位置
        const textIndex = fullText.indexOf(selectedText);
        if (textIndex >= 0) {
          // 获取更大范围的前缀和后缀
          const prefixStart = Math.max(0, textIndex - 60);
          extendedPrefix = fullText.substring(prefixStart, textIndex);
          
          const suffixEnd = Math.min(fullText.length, textIndex + selectedText.length + 60);
          extendedSuffix = fullText.substring(textIndex + selectedText.length, suffixEnd);
          
          console.log('[handleNoteClick] 已获取扩展上下文');
        }
      } catch (error: unknown) {
        console.error('[handleNoteClick] 获取扩展上下文失败:', error);
        // 如果获取扩展上下文失败，继续使用原始的前缀和后缀
      }
    }

    const tempId = `pending-${Date.now()}`;
    const tempAnnotation: Annotation = {
      id: tempId,
      articleId,
      type: 'note',
      text,
      prefix: isCrossingElements ? extendedPrefix : prefix,
      suffix: isCrossingElements ? extendedSuffix : suffix,
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
      
      // 处理普通高亮
      const highlightElement = document.getElementById(`annotation-${annotationId}`);
      if (highlightElement) {
        console.log(`[useAnnotations] 找到高亮元素，正在移除: annotation-${annotationId}`);
        const fragment = document.createDocumentFragment();
        while (highlightElement.firstChild) {
          fragment.appendChild(highlightElement.firstChild);
        }
        highlightElement.parentNode?.replaceChild(fragment, highlightElement);
      } else {
        console.log(`[useAnnotations] 未找到普通高亮元素，尝试查找分段高亮: ${annotationId}`);
        
        // 处理分段高亮
        const segmentPrefix = `annotation-segment-${annotationId}`;
        
        // 查找所有相关的分段高亮元素
        const segmentElements = document.querySelectorAll(`[data-annotation-id="${annotationId}"]`);
        
        if (segmentElements.length > 0) {
          console.log(`[useAnnotations] 找到 ${segmentElements.length} 个分段高亮元素`);
          
          // 移除每个分段高亮元素
          segmentElements.forEach(element => {
            const fragment = document.createDocumentFragment();
            while (element.firstChild) {
              fragment.appendChild(element.firstChild);
            }
            element.parentNode?.replaceChild(fragment, element);
          });
        } else {
          // 尝试通过ID前缀查找
          const startSegment = document.getElementById(`${segmentPrefix}-start`);
          const endSegment = document.getElementById(`${segmentPrefix}-end`);
          
          // 查找所有中间段
          const midSegments = [];
          let i = 0;
          let midSegment;
          while (midSegment = document.getElementById(`${segmentPrefix}-mid-${i}`)) {
            midSegments.push(midSegment);
            i++;
          }
          
          // 处理起始段
          if (startSegment) {
            const startFragment = document.createDocumentFragment();
            while (startSegment.firstChild) {
              startFragment.appendChild(startSegment.firstChild);
            }
            startSegment.parentNode?.replaceChild(startFragment, startSegment);
          }
          
          // 处理中间段
          midSegments.forEach(segment => {
            const midFragment = document.createDocumentFragment();
            while (segment.firstChild) {
              midFragment.appendChild(segment.firstChild);
            }
            segment.parentNode?.replaceChild(midFragment, segment);
          });
          
          // 处理结束段
          if (endSegment) {
            const endFragment = document.createDocumentFragment();
            while (endSegment.firstChild) {
              endFragment.appendChild(endSegment.firstChild);
            }
            endSegment.parentNode?.replaceChild(endFragment, endSegment);
          }
          
          if (startSegment || midSegments.length > 0 || endSegment) {
            console.log(`[useAnnotations] 已移除分段高亮元素: 起始=${!!startSegment}, 中间=${midSegments.length}, 结束=${!!endSegment}`);
          } else {
            console.log(`[useAnnotations] 未找到任何高亮元素: annotation-${annotationId}`);
          }
        }
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
      
      // 检查是否点击了高亮元素
      const isHighlight = target.tagName === 'MARK' && 
        (target.classList.contains('customHighlight') || 
         target.classList.contains('segment-start') || 
         target.classList.contains('segment-middle') || 
         target.classList.contains('segment-end'));
      
      if (isHighlight) {
        let annotationId = '';
        
        // 处理普通高亮
        if (target.id.startsWith('annotation-')) {
          annotationId = target.id.replace('annotation-', '');
        } 
        // 处理分段高亮 - 通过data-annotation-id属性
        else if (target.dataset.annotationId) {
          annotationId = target.dataset.annotationId;
        } 
        // 处理分段高亮 - 通过ID前缀
        else if (target.id.includes('annotation-segment-')) {
          // 从ID中提取注释ID
          // 格式: annotation-segment-{id}-start/mid-{index}/end
          const match = target.id.match(/annotation-segment-([^-]+)/);
          if (match && match[1]) {
            annotationId = match[1];
          }
        }
        
        if (annotationId && articleId !== null) {
          console.log(`[useAnnotations] 点击了高亮元素，注释ID: ${annotationId}`);
          
          // 查找点击的注释是否存在
          const annotation = annotations.find(a => 
            a.id === annotationId || 
            a.id === `annotation-${annotationId}`
          );
          
          if (annotation) {
            console.log(`[useAnnotations] 找到对应的注释: ${annotation.id}`);
            
            // 如果侧边栏未打开，先打开侧边栏
            if (!isSidebarVisible) {
              console.log(`[useAnnotations] 侧边栏未打开，正在打开`);
              setIsSidebarVisible(true);
              
              // 触发侧边栏切换事件
              document.dispatchEvent(new CustomEvent('annotationSidebarToggled', {
                detail: { isVisible: true, articleId }
              }));
            }
            
            // 设置自动编辑的笔记ID
            console.log(`[useAnnotations] 设置自动编辑笔记ID: ${annotationId}`);
            setAutoEditNoteId(annotationId);
            
            // 触发编辑笔记事件
            document.dispatchEvent(new CustomEvent('edit-annotation', {
              detail: { annotationId }
            }));
          } else {
            console.log(`[useAnnotations] 未找到对应的注释: ${annotationId}`);
          }
        }
      }
    };

    contentElement.addEventListener('click', handleClick);
    return () => contentElement.removeEventListener('click', handleClick);
  }, [articleId, isSidebarVisible, annotations, scrollableContentRef]);

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