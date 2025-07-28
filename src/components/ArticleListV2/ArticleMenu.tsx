import { useCallback } from 'react';
import { Article } from '../../db/database';
import { 
  StarOutlined, 
  StarFilled, 
  CheckSquareOutlined, 
  CheckSquareFilled, 
  ArrowUpOutlined, 
  ArrowDownOutlined 
} from '@ant-design/icons';
import { MenuProps } from 'antd';

// 定义菜单处理程序接口
export interface ArticleMenuHandlers {
  toggleArticleReadStatus: (articleId: string, currentStatus: 'true' | 'false', sourceId?: string) => Promise<void> | void;
  toggleStar: (articleId: string) => Promise<void> | void;
  markAboveAsRead: (articleId: string) => Promise<void> | void;
  markBelowAsRead: (articleId: string) => Promise<void> | void;
}

// 定义Hook参数
interface UseArticleMenuOptions {
  handlers: ArticleMenuHandlers;
}

// 文章菜单Hook
const useArticleMenu = ({ handlers }: UseArticleMenuOptions) => {
  const { toggleArticleReadStatus, toggleStar, markAboveAsRead, markBelowAsRead } = handlers;

  // 创建上下文菜单项
  const createContextMenuItems = useCallback((article: Article): MenuProps['items'] => {
    const isRead = article.isRead === 'true';
    const isStarred = article.isStarred === 'true';
    
    return [
      {
        key: 'toggle-read',
        icon: isRead ? <CheckSquareFilled /> : <CheckSquareOutlined />,
        label: isRead ? '标记为未读' : '标记为已读',
          onClick: () => toggleArticleReadStatus(article.id, article.isRead as 'true' | 'false', article.sourceId),
      },
      {
        key: 'toggle-star',
        icon: isStarred ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />,
        label: isStarred ? '取消星标' : '设为星标',
        onClick: () => toggleStar(article.id),
      },
      {
        type: 'divider',
      },
      {
        key: 'mark-above',
        icon: <ArrowUpOutlined />,
        label: '标记上方为已读',
        onClick: () => markAboveAsRead(article.id),
      },
      {
        key: 'mark-below',
        icon: <ArrowDownOutlined />,
        label: '标记下方为已读',
        onClick: () => markBelowAsRead(article.id),
      },
    ];
  }, [toggleArticleReadStatus, toggleStar, markAboveAsRead, markBelowAsRead]);

  return {
    createContextMenuItems,
  };
};

export default useArticleMenu; 