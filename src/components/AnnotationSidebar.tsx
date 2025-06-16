import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, Tooltip } from 'antd';
import { CloseOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import styles from './AnnotationSidebar.module.css';
import { Annotation } from '../contexts/DatabaseContext';

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
}

const AnnotationSidebar: React.FC<AnnotationSidebarProps> = ({
  isVisible,
  annotations,
  pendingAnnotation,
  onClose,
  onSaveNote,
  onDelete,
  onItemClick,
  autoEditNoteId,
  onAutoEditApplied,
}) => {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  
  // Ref 用于自动滚动到视图
  const editingItemRef = useRef<HTMLDivElement>(null);

  // 合并持久化和临时的笔记
  const allAnnotations = pendingAnnotation
    ? [pendingAnnotation, ...annotations]
    : annotations;

  // 效果：处理从外部触发的自动编辑
  useEffect(() => {
    if (autoEditNoteId) {
      const annotationToEdit = allAnnotations.find(a => a.id === autoEditNoteId);
      if (annotationToEdit) {
        setEditingNoteId(autoEditNoteId);
        setEditContent(annotationToEdit.noteContent || '');
      }
      // 通知父组件，自动编辑已处理
      onAutoEditApplied();
    }
  }, [autoEditNoteId, allAnnotations, onAutoEditApplied]);

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

  // 处理"取消"编辑
  const handleCancel = () => {
    // 如果取消的是一个还未保存的新笔记，则直接关闭侧边栏
    if (editingNoteId && editingNoteId.startsWith('pending-')) {
      onClose(); 
    }
    setEditingNoteId(null);
    setEditContent('');
  };

  // 处理"保存"笔记
  const handleSave = () => {
    if (editingNoteId) {
      onSaveNote(editingNoteId, editContent);
      setEditingNoteId(null);
      setEditContent('');
    }
  };

  // 渲染笔记的编辑界面
  const renderNoteEditor = () => (
    <div className={styles.noteEditor}>
      <TextArea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
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

  return (
    <div className={`${styles.sidebar} ${isVisible ? styles.visible : ''}`}>
      <header className={styles.header}>
        <h3 className={styles.title}>笔记和高亮</h3>
        <Button type="text" shape="circle" icon={<CloseOutlined />} onClick={onClose} />
      </header>
      <div className={styles.annotationList}>
        {allAnnotations.length > 0 ? (
          allAnnotations.map(renderAnnotationItem)
        ) : (
          <div className={styles.emptyState}>
            <p>还没有笔记或高亮。</p>
            <p>在文章中选择一段文本来开始。</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnotationSidebar; 