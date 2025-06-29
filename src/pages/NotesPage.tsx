import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Empty, Select, Button, Tooltip, Spin, message } from 'antd';
import { FileTextOutlined, HighlightOutlined, DeleteOutlined, EditOutlined, ExportOutlined } from '@ant-design/icons';
import { useDatabase } from '../contexts/DatabaseContext';
import { Annotation, Article } from '../db/database';
import { useNavigate } from 'react-router-dom';
import styles from './NotesPage.module.css';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useLocation } from 'react-router-dom';

const { TabPane } = Tabs;
const { Option } = Select;

// 定义笔记类型的过滤选项
type FilterType = 'all' | 'highlights' | 'notes';
// 定义排序方式
type SortType = 'newest' | 'oldest';

const NotesPage: React.FC = () => {
  const { db } = useDatabase();
  const navigate = useNavigate();
  const location = useLocation();
  const [annotations, setAnnotations] = useState<(Annotation & { articleTitle?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortType, setSortType] = useState<SortType>('newest');

  // 加载所有笔记和高亮
  const loadAnnotations = useCallback(async () => {
    if (!db) return;
    
    setLoading(true);
    try {
      console.log('[NotesPage] 开始加载笔记和高亮');
      // 获取所有笔记和高亮
      const allAnnotations = await db.annotations.toArray();
      console.log(`[NotesPage] 从数据库加载了 ${allAnnotations.length} 条笔记/高亮`);
      
      // 获取所有文章以便获取标题
      const articles = await db.articles.toArray();
      const articlesMap = new Map(articles.map(article => [article.id, article]));
      console.log(`[NotesPage] 从数据库加载了 ${articles.length} 篇文章用于匹配标题`);
      
      // 为每个笔记添加对应的文章标题
      const annotationsWithTitle = allAnnotations.map(annotation => {
        const article = articlesMap.get(annotation.articleId);
        return {
          ...annotation,
          articleTitle: article?.title || '未知文章'
        };
      });
      
      setAnnotations(annotationsWithTitle);
      console.log('[NotesPage] 笔记和高亮加载完成');
    } catch (error) {
      console.error('[NotesPage] 加载笔记失败:', error);
    } finally {
      setLoading(false);
    }
  }, [db]);

  // 组件挂载时加载数据
  useEffect(() => {
    loadAnnotations();
    
    // 监听笔记变化事件，以便刷新列表
    const handleAnnotationChange = () => {
      console.log('[NotesPage] 检测到笔记变化事件，刷新笔记列表');
      loadAnnotations();
    };
    
    document.addEventListener('annotation-changed', handleAnnotationChange);
    
    return () => {
      document.removeEventListener('annotation-changed', handleAnnotationChange);
    };
  }, [loadAnnotations]);

  // 监听路由变化，当导航到笔记页面时刷新数据
  useEffect(() => {
    console.log('[NotesPage] 路由变化或组件重新渲染，刷新笔记列表');
    loadAnnotations();
  }, [location.pathname, loadAnnotations]);

  // 触发笔记变化事件，通知其他组件更新
  const triggerAnnotationChange = useCallback(() => {
    console.log('[NotesPage] 触发笔记变化事件');
    document.dispatchEvent(new CustomEvent('annotation-changed'));
  }, []);

  // 处理删除笔记
  const handleDelete = async (annotationId: string) => {
    if (!db) return;
    
    try {
      console.log(`[NotesPage] 正在删除笔记/高亮: ${annotationId}`);
      await db.annotations.delete(annotationId);
      console.log(`[NotesPage] 笔记/高亮已删除: ${annotationId}`);
      message.success('删除成功');
      
      // 触发笔记变化事件
      triggerAnnotationChange();
      
      // 重新加载数据
      loadAnnotations();
    } catch (error) {
      console.error('[NotesPage] 删除笔记失败:', error);
      message.error('删除失败');
    }
  };

  // 处理跳转到原文
  const handleViewOriginal = async (annotation: Annotation) => {
    if (!db) return;
    
    try {
      console.log(`[NotesPage] 正在准备跳转到原文，笔记ID: ${annotation.id}, 文章ID: ${annotation.articleId}`);
      
      // 获取文章信息
      const article = await db.articles.get(annotation.articleId);
      if (!article) {
        console.error(`[NotesPage] 找不到对应的文章: ${annotation.articleId}`);
        message.error('找不到对应的文章');
        return;
      }
      
      console.log(`[NotesPage] 找到文章: ${article.title}, 源ID: ${article.sourceId}, 文章ID: ${article.id}`);
      
      // 将跳转信息保存到 sessionStorage
      // 确保使用正确的ID格式，移除可能的前缀
      const cleanAnnotationId = annotation.id.replace(/^annotation-/, '');
      
      // 直接将笔记添加到 sessionStorage，以便在文章页面可以直接使用
      sessionStorage.setItem('openAnnotationSidebar', 'true');
      sessionStorage.setItem('highlightAnnotationId', cleanAnnotationId);
      
      // 如果是笔记类型，自动进入编辑模式
      if (annotation.type === 'note') {
        sessionStorage.setItem('editAnnotation', 'true');
      }
      
      // 存储完整的笔记对象，用于后续在文章页面直接使用
      sessionStorage.setItem('annotationObject', JSON.stringify(annotation));
      
      // 标记是从笔记中心跳转过来的
      sessionStorage.setItem('fromNotesPage', 'true');
      
      console.log(`[NotesPage] 已设置会话存储，准备跳转到: /feed/${article.sourceId}?articleId=${article.id}`);
      console.log(`[NotesPage] 存储了完整的笔记对象并标记来源`);
      
      // 跳转到文章详情页
      navigate(`/feed/${article.sourceId}?articleId=${article.id}`);
    } catch (error) {
      console.error('[NotesPage] 跳转到原文失败:', error);
      message.error('跳转失败');
    }
  };

  // 处理编辑笔记
  const handleEdit = async (annotation: Annotation) => {
    if (!db) return;
    
    try {
      console.log(`[NotesPage] 正在准备跳转到编辑笔记，笔记ID: ${annotation.id}, 文章ID: ${annotation.articleId}`);
      
      // 获取文章信息
      const article = await db.articles.get(annotation.articleId);
      if (!article) {
        console.error(`[NotesPage] 找不到对应的文章: ${annotation.articleId}`);
        message.error('找不到对应的文章');
        return;
      }
      
      console.log(`[NotesPage] 找到文章: ${article.title}, 源ID: ${article.sourceId}, 文章ID: ${article.id}`);
      
      // 将跳转信息保存到 sessionStorage，并标记为编辑模式
      // 确保使用正确的ID格式，移除可能的前缀
      const cleanAnnotationId = annotation.id.replace(/^annotation-/, '');
      
      sessionStorage.setItem('openAnnotationSidebar', 'true');
      sessionStorage.setItem('highlightAnnotationId', cleanAnnotationId);
      sessionStorage.setItem('editAnnotation', 'true');
      
      // 存储完整的笔记对象，用于后续在文章页面直接使用
      sessionStorage.setItem('annotationObject', JSON.stringify(annotation));
      
      // 标记是从笔记中心跳转过来的
      sessionStorage.setItem('fromNotesPage', 'true');
      
      console.log(`[NotesPage] 已设置会话存储（包括编辑模式），准备跳转到: /feed/${article.sourceId}?articleId=${article.id}`);
      console.log(`[NotesPage] 存储了完整的笔记对象并标记来源`);
      
      // 跳转到文章详情页
      navigate(`/feed/${article.sourceId}?articleId=${article.id}`);
    } catch (error) {
      console.error('[NotesPage] 跳转到编辑失败:', error);
      message.error('跳转失败');
    }
  };

  // 根据过滤条件筛选笔记
  const filteredAnnotations = annotations.filter(annotation => {
    if (filterType === 'all') return true;
    if (filterType === 'highlights') return annotation.type === 'highlight';
    if (filterType === 'notes') return annotation.type === 'note';
    return true;
  });

  // 根据排序条件排序笔记
  const sortedAnnotations = [...filteredAnnotations].sort((a, b) => {
    if (sortType === 'newest') {
      return b.createdAt - a.createdAt;
    } else {
      return a.createdAt - b.createdAt;
    }
  });

  return (
    <div className={styles.notesPage}>
      <div className={styles.header}>
        <h1>
          笔记
          {!loading && (
            <span className={styles.notesCount}>
              共 {annotations.length} 条
            </span>
          )}
        </h1>
        <div className={styles.controls}>
          <Select 
            value={filterType} 
            onChange={value => setFilterType(value)} 
            className={styles.filterSelect}
          >
            <Option value="all">全部</Option>
            <Option value="highlights">仅高亮</Option>
            <Option value="notes">仅笔记</Option>
          </Select>
          <Select 
            value={sortType} 
            onChange={value => setSortType(value)} 
            className={styles.sortSelect}
          >
            <Option value="newest">最新创建</Option>
            <Option value="oldest">最早创建</Option>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingContainer}>
          <Spin size="large" />
        </div>
      ) : sortedAnnotations.length > 0 ? (
        <div className={styles.annotationsList}>
          {sortedAnnotations.map(annotation => (
            <div key={annotation.id} className={styles.annotationItem}>
              <div className={styles.annotationHeader}>
                <div className={styles.annotationType}>
                  {annotation.type === 'highlight' ? (
                    <>
                      <HighlightOutlined className={styles.highlightIcon} />
                      <span>高亮</span>
                    </>
                  ) : (
                    <>
                      <FileTextOutlined className={styles.noteIcon} />
                      <span>笔记</span>
                    </>
                  )}
                </div>
                <div className={styles.annotationDate}>
                  {format(new Date(annotation.createdAt), 'yyyy年MM月dd日 HH:mm', { locale: zhCN })}
                </div>
              </div>
              
              <div className={styles.annotationContent}>
                <blockquote className={styles.highlightedText}>
                  {annotation.text}
                </blockquote>
                {annotation.type === 'note' && annotation.noteContent && (
                  <div className={styles.noteContent}>{annotation.noteContent}</div>
                )}
              </div>
              
              <div className={styles.annotationSource}>
                <span>来源: {annotation.articleTitle}</span>
              </div>
              
              <div className={styles.annotationActions}>
                <Tooltip title="查看原文">
                  <Button 
                    type="text" 
                    icon={<ExportOutlined />} 
                    onClick={() => handleViewOriginal(annotation)}
                  />
                </Tooltip>
                
                {annotation.type === 'note' && (
                  <Tooltip title="编辑笔记">
                    <Button 
                      type="text" 
                      icon={<EditOutlined />} 
                      onClick={() => handleEdit(annotation)}
                    />
                  </Tooltip>
                )}
                
                <Tooltip title="删除">
                  <Button 
                    type="text" 
                    danger 
                    icon={<DeleteOutlined />} 
                    onClick={() => handleDelete(annotation.id)}
                  />
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty description="暂无笔记和高亮" className={styles.emptyState} />
      )}
    </div>
  );
};

export default NotesPage; 