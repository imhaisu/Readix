import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, Tooltip, message } from 'antd';
import { CloseOutlined, EditOutlined, DeleteOutlined, FileTextOutlined } from '@ant-design/icons';
import styles from './AnnotationSidebar.module.css';
import { Annotation } from '../db/database';
import { useNavigate, useLocation } from 'react-router-dom';

const { TextArea } = Input;

// 组件的 Props 定义
interface AnnotationSidebarProps {
  isVisible: boolean;
  annotations: Annotation[];
  pendingAnnotation: Annotation | null;
  onClose: () => void;
  onSaveNote: (annotationId: string, content: string) => void;
  onDelete: (annotationId: string) => void;
  onItemClick: (annotationId: string) => void;
  autoEditNoteId: string | null;
  onAutoEditApplied: () => void;
  onCancelPendingAnnotation: () => void;
  onScrollToAnnotation: (annotationId: string) => void;
  onUpdateAnnotation: (annotationId: string, content: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  articleId: string;
}

const AnnotationSidebar: React.FC<AnnotationSidebarProps> = ({
  isVisible,
  annotations,
  pendingAnnotation,
  onClose,
  onSaveNote,
  onDelete,
  onItemClick,
  autoEditNoteId: propAutoEditNoteId,
  onAutoEditApplied,
  onCancelPendingAnnotation,
  onScrollToAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  articleId
}) => {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  
  // 添加导航钩子
  const navigate = useNavigate();
  const location = useLocation();
  
  // Ref 用于自动滚动到视图
  const editingItemRef = useRef<HTMLDivElement>(null);

  // 合并持久化和临时的笔记
  const allAnnotations = pendingAnnotation
    ? [pendingAnnotation, ...annotations]
    : annotations;

  // 添加一个状态来跟踪是否已经自动进入过编辑模式
  const [hasAutoEdited, setHasAutoEdited] = useState(false);

  // 处理关闭侧边栏
  const handleClose = () => {
    // 检查是否从笔记中心跳转过来
    const fromNotesPage = sessionStorage.getItem('fromNotesPage') === 'true';
    
    if (fromNotesPage) {
      console.log('[AnnotationSidebar] 从笔记中心跳转过来的，返回笔记中心');
      console.log('[AnnotationSidebar] 当前路径:', location.pathname);
      
      // 清除标记，防止后续误用
      sessionStorage.removeItem('fromNotesPage');
      
      // 先关闭侧边栏
      onClose();
      
      // 重置自动编辑状态，以便下次打开时能正常工作
      setHasAutoEdited(false);
      
      // 直接导航到笔记页面，而不经过首页
      console.log('[AnnotationSidebar] 直接导航到笔记页面');
      navigate('/notes');
    } else {
      // 正常关闭侧边栏
      console.log('[AnnotationSidebar] 普通关闭侧边栏');
      onClose();
      
      // 重置自动编辑状态，以便下次打开时能正常工作
      setHasAutoEdited(false);
    }
  };

  // 监听编辑笔记事件
  useEffect(() => {
    const handleEditAnnotation = (event: Event) => {
      const customEvent = event as CustomEvent<{ annotationId: string }>;
      if (!customEvent.detail) return;
      
      const { annotationId } = customEvent.detail;
      console.log(`[AnnotationSidebar] 收到编辑笔记事件: ${annotationId}`);
      
      // 查找并编辑笔记
      handleAutoEdit(annotationId);
    };
    
    document.addEventListener('edit-annotation', handleEditAnnotation);
    
    return () => {
      document.removeEventListener('edit-annotation', handleEditAnnotation);
    };
  }, [annotations]);

  // 处理自动编辑笔记
  const handleAutoEdit = (annotationId: string) => {
    console.log(`[AnnotationSidebar] 准备自动编辑笔记: ${annotationId}`);
    
    // 先检查是否是pendingAnnotation
    if (pendingAnnotation && (pendingAnnotation.id === annotationId || `annotation-${pendingAnnotation.id}` === annotationId)) {
      console.log(`[AnnotationSidebar] 找到临时笔记，开始编辑: ${pendingAnnotation.id}`);
      setEditingNoteId(pendingAnnotation.id);
      setEditContent(pendingAnnotation.noteContent || '');
      
      // 延迟聚焦到编辑框
      setTimeout(() => {
        const editTextarea = document.getElementById(`note-edit-${pendingAnnotation.id}`);
        if (editTextarea) {
          console.log(`[AnnotationSidebar] 聚焦到编辑框: note-edit-${pendingAnnotation.id}`);
          (editTextarea as HTMLTextAreaElement).focus();
        }
      }, 100);
      return;
    }
    
    // 如果不是pendingAnnotation，则在annotations中查找
    const annotation = annotations.find(a => 
      a.id === annotationId || 
      a.id === `annotation-${annotationId}`
    );
    
    if (annotation && annotation.type === 'note') {
      console.log(`[AnnotationSidebar] 找到笔记，开始编辑: ${annotation.id}`);
      setEditingNoteId(annotation.id);
      setEditContent(annotation.noteContent || '');
      
      // 延迟聚焦到编辑框
      setTimeout(() => {
        const editTextarea = document.getElementById(`note-edit-${annotation.id}`);
        if (editTextarea) {
          console.log(`[AnnotationSidebar] 聚焦到编辑框: note-edit-${annotation.id}`);
          (editTextarea as HTMLTextAreaElement).focus();
        }
      }, 100);
    } else {
      console.log(`[AnnotationSidebar] 未找到笔记或不是笔记类型: ${annotationId}`);
    }
  };
  
  // 处理从props传入的autoEditNoteId
  useEffect(() => {
    if (propAutoEditNoteId) {
      handleAutoEdit(propAutoEditNoteId);
      onAutoEditApplied(); // 通知父组件已处理
    }
  }, [propAutoEditNoteId]);

  // 效果：当进入编辑模式时，滚动到该条目
  useEffect(() => {
    if (editingNoteId && editingItemRef.current) {
      editingItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editingNoteId]);
  
  // 处理"编辑"按钮点击
  const handleEdit = (annotation: Annotation) => {
    setEditingNoteId(annotation.id);
    setEditContent(annotation.noteContent || '');
  };

  // 处理删除笔记
  const handleDelete = () => {
    if (editingNoteId) {
      // 对于临时笔记，需要特殊处理
      if (editingNoteId.startsWith('pending-')) {
        // 对于临时笔记，调用取消创建方法
        onCancelPendingAnnotation();
        setEditingNoteId(null);
        setEditContent('');
      } else {
        // 对于已保存的笔记，调用删除方法
        onDelete(editingNoteId);
        setEditingNoteId(null);
        setEditContent('');
      }
    }
  };

  // 处理取消编辑
  const handleCancel = () => {
    if (editingNoteId) {
      // 如果是临时笔记，需要取消创建
      if (editingNoteId.startsWith('pending-')) {
        onCancelPendingAnnotation();
      }
      // 退出编辑模式
      setEditingNoteId(null);
      setEditContent('');
      
      // 防止自动再次进入编辑模式
      setHasAutoEdited(true);
    }
  };

  // 处理"保存"笔记
  const handleSave = () => {
    if (editingNoteId) {
      // 调用保存方法
      onSaveNote(editingNoteId, editContent);
      
      // 显示保存成功提示
      // 注意：保存方法内部已经有消息提示，这里不需要再次显示
      
      // 退出编辑模式
      setEditingNoteId(null);
      setEditContent('');
      
      // 防止自动再次进入编辑模式
      setHasAutoEdited(true);
    }
  };

  // 处理键盘事件，实现回车保存
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing 用于防止在输入法组合字符过程中触发
    if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent as any).isComposing) {
      event.preventDefault(); // 阻止默认的回车换行行为
      handleSave();
    } else if (event.key === 'Escape') {
      // 按ESC键取消编辑
      handleCancel();
    }
  };

  // 渲染笔记的编辑界面
  const renderNoteEditor = () => (
    <div className={styles.noteEditor}>
      <TextArea
        id={`note-edit-${editingNoteId}`}
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        onKeyDown={handleKeyDown}
        autoSize={{ minRows: 4 }}
        autoFocus
      />
      <div className={styles.editorActions}>
        <Button onClick={handleCancel}>取消</Button>
        <Button type="primary" onClick={handleSave}>保存</Button>
      </div>
    </div>
  );

  // 渲染单个笔记或高亮条目
  const renderAnnotationItem = (annotation: Annotation) => {
    const isEditing = editingNoteId === annotation.id;
    
    return (
      <div
        key={annotation.id}
        className={styles.annotationItem}
        // 当此项处于编辑模式时，附加 ref
        ref={isEditing ? editingItemRef : null}
      >
        <blockquote className={styles.quote} onClick={() => !isEditing && onItemClick(annotation.id)}>
          {annotation.text}
        </blockquote>

        {/* 如果是笔记类型 */}
        {annotation.type === 'note' && (
          isEditing ? (
            renderNoteEditor()
          ) : (
            <>
              {annotation.noteContent && (
                <p className={styles.noteContent}>{annotation.noteContent}</p>
              )}
              <div className={styles.actions}>
                <Tooltip title="编辑笔记">
                  <EditOutlined className={styles.editButton} onClick={() => handleEdit(annotation)} />
                </Tooltip>
                <Tooltip title="删除笔记和高亮">
                  <DeleteOutlined className={styles.deleteButton} onClick={() => onDelete(annotation.id)} />
                </Tooltip>
              </div>
            </>
          )
        )}
        
        {/* 如果只是高亮类型 */}
        {annotation.type === 'highlight' && (
            <div className={styles.actions}>
                <Tooltip title="删除高亮">
                    <DeleteOutlined className={styles.deleteButton} onClick={() => onDelete(annotation.id)} />
                </Tooltip>
            </div>
        )}
      </div>
    );
  };

  // 添加一个新的useEffect，当侧边栏变为可见状态且有笔记时，自动检查是否需要编辑的笔记
  useEffect(() => {
    // 当侧边栏可见且有笔记时，检查是否有从笔记页面跳转过来的笔记需要编辑
    if (isVisible && annotations.length > 0 && sessionStorage.getItem('fromNotesPage') === 'true' && !hasAutoEdited) {
      console.log('[AnnotationSidebar] 侧边栏可见，检查是否有需要自动编辑的笔记');
      
      // 查找笔记类型的注释
      const noteAnnotations = annotations.filter(a => a.type === 'note');
      if (noteAnnotations.length > 0) {
        console.log(`[AnnotationSidebar] 找到 ${noteAnnotations.length} 条笔记，自动编辑第一条`);
        
        // 自动编辑第一条笔记
        const firstNote = noteAnnotations[0];
        setEditingNoteId(firstNote.id);
        setEditContent(firstNote.noteContent || '');
        
        // 设置标志位，避免重复进入编辑模式
        setHasAutoEdited(true);
        
        // 延迟聚焦到编辑框
        setTimeout(() => {
          const editTextarea = document.getElementById(`note-edit-${firstNote.id}`);
          if (editTextarea) {
            console.log(`[AnnotationSidebar] 聚焦到编辑框: note-edit-${firstNote.id}`);
            (editTextarea as HTMLTextAreaElement).focus();
          }
        }, 100);
      }
    }
  }, [isVisible, annotations, hasAutoEdited]);

  return (
    <div className={`${styles.sidebar} ${isVisible ? styles.visible : ''}`}>
      <header className={styles.header}>
        <h3 className={styles.title}>笔记高亮</h3>
        <Button type="text" shape="circle" icon={<CloseOutlined />} onClick={handleClose} />
      </header>
      <div className={styles.annotationList}>
        {allAnnotations.length > 0 ? (
          allAnnotations.map(renderAnnotationItem)
        ) : (
          <div className={styles.emptyState}>
            <FileTextOutlined className={styles.emptyIcon} />
            <p>思考源自记录</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnotationSidebar; 