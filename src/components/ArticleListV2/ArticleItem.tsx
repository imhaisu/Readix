import React, { memo } from 'react';
import { Dropdown } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { Article, FeedSource } from '../../db/database';
import { extractFirstParagraphText, extractFirstImage } from '../../utils/helpers';
import { formatArticleDate } from './utils';
import styles from './ArticleListV2.module.css';
import { MenuProps } from 'antd';

export interface ArticleItemProps {
  article: Article;
  isSelected: boolean;
  feedInfo?: FeedSource;
  onClick: (articleId: string) => void;
  isInTransition?: boolean;
  index: number;
  style: React.CSSProperties;
  createContextMenuItems: (article: Article) => MenuProps['items'];
}

const ArticleItem = memo(({ 
  article, 
  isSelected, 
  feedInfo, 
  onClick, 
  isInTransition, 
  index, 
  style,
  createContextMenuItems
}: ArticleItemProps) => {
  const isRead = article.isRead === 'true';
  const articleSummary = article.summary || extractFirstParagraphText(article.content) || article.contentText || '没有摘要';
  const articleImage = article.imageUrl || extractFirstImage(article.content);
  const articleSourceTitle = feedInfo?.title || '未知来源';
  const articleSourceIconUrl = feedInfo?.iconUrl;
  const formattedDate = formatArticleDate(article.publishDate);
  const contextMenuItems = createContextMenuItems(article);

  const handleClick = () => {
    console.log('ArticleItem click:', article.id, article.title);
    onClick(article.id);
  };

  // 渲染文章内容
  const content = (
    <>
      <div className={styles.articleMeta}>
        <div className={styles.feedInfo}>
          {articleSourceIconUrl ? (
            <img 
              src={articleSourceIconUrl} 
              className={styles.feedIcon} 
              alt=""
            />
          ) : (
            <div className={styles.feedIcon}>
              <GlobalOutlined className={styles.globalIcon} />
            </div>
          )}
          <span className={styles.feedName}>{articleSourceTitle}</span>
        </div>
        <span className={styles.articleDate}>{formattedDate}</span>
      </div>

      <div className={styles.bottomContent}>
        <div className={styles.textContent}>
          <h4 className={`${styles.articleTitle} ${isRead ? styles.readArticleTitle : styles.unreadArticleTitle} ${styles.titleLines2}`}>
            {article.title || '无标题'}
          </h4>
          {articleSummary !== '没有摘要' && (
            <p className={`${styles.articleSummary} ${styles.descLines2}`}>
              {articleSummary}
            </p>
          )}
        </div>
        {articleImage && (
          <div className={styles.imageContainer}>
            <img 
              src={articleImage} 
              alt={article.title || '文章图片'} 
              className={styles.image} 
              loading="lazy" 
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = 'none';
                // 当图片加载失败时，隐藏整个图片容器
                const container = img.parentElement;
                if (container) {
                  container.style.display = 'none';
                }
              }}
            />
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      style={{
        ...style,
        position: 'absolute',
        top: style.top,
        left: style.left,
        width: style.width,
        height: style.height,
      }}
    >
      <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
        <div
          className={`${styles.articleItem} ${isRead ? styles.readArticle : ''} ${isSelected ? styles.articleItemSelected : ''}`}
          onClick={handleClick}
          data-article-id={article.id}
        >
          {content}
        </div>
      </Dropdown>
    </div>
  );
});

export default ArticleItem; 