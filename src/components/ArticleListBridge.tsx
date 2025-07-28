import React, { forwardRef, useImperativeHandle } from 'react';
import ArticleListV2, { ArticleListHandle as ArticleListV2Handle } from './ArticleListV2';

// 统一类型
export type ArticleListHandle = ArticleListV2Handle;

// 保持与原组件相同的props
export interface ArticleListBridgeProps {
  filter: any;
  searchTerm?: string;
  onSelectArticle: (articleId: string | null) => void;
  selectedArticleId: string | null;
  isTodayView?: boolean; 
  currentFeedId?: string;
  currentGroupId?: string;
  currentTopicId?: string;
  lastUpdatedArticleInfo?: any;
  listRefreshKey?: number;
  onLastUpdatedArticleInfoChange: (info: any) => void;
  isPullingDown?: boolean;
}

// 简化后的桥接组件，仅使用V2版本
const ArticleListBridge = forwardRef<ArticleListHandle, ArticleListBridgeProps>((props, ref) => {
  // 只使用V2的引用
  const articleListV2Ref = React.useRef<ArticleListV2Handle>(null);
  
  // 导出引用方法
  useImperativeHandle(ref, () => {
    if (!articleListV2Ref.current) {
      // 如果引用不存在，返回一个空实现
      return {
        scrollToTop: () => {},
        getScrollableElement: () => null,
        getArticles: () => [],
        getArticleCount: () => 0,
        scrollToArticle: () => {},
        getScrollPosition: () => 0,
        setScrollPosition: () => {},
        markArticlesAsRead: () => Promise.resolve(0),
        markAsRead: () => {},
      };
    }
    
    return articleListV2Ref.current;
  }, []);
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>      
      {/* 直接渲染V2组件 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <ArticleListV2 {...props} ref={articleListV2Ref} />
      </div>
    </div>
  );
});

export default ArticleListBridge; 