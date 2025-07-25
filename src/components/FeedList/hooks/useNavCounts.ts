import { useState, useEffect } from 'react';
import { useDatabase } from '../../../contexts/DatabaseContext';
import { getTodayRange } from '../../../utils/helpers';

interface NavCounts {
  todayCount: number;
  allCount: number;
  notesCount: number;
  readLaterCount: number;
}

export const useNavCounts = () => {
  const { db, triggerArticleListRefresh, feedCountRefreshTrigger } = useDatabase();
  const [counts, setCounts] = useState<NavCounts>({
    todayCount: 0,
    allCount: 0,
    notesCount: 0,
    readLaterCount: 0
  });

  useEffect(() => {
    const fetchNavCounts = async () => {
      if (!db) return;

      try {
        // 获取今日时间范围
        const todayRange = getTodayRange();
        
        // 获取今日文章数量 - 确保排除隐藏的文章
        const todayArticles = await db.articles
          .where('publishDate').between(todayRange.start, todayRange.end, true, true)
          .filter(article => article.isHidden !== true)
          .count();
        
        // 获取所有文章数量 - 确保排除隐藏的文章
        const allArticles = await db.articles
          .filter(article => article.isHidden !== true)
          .count();
          
        // 获取笔记数量
        const notes = await db.annotations.count();
        
        // 获取稍后读文章数量
        let readLater = 0;
        try {
          // 先尝试查询savedLinks表
          readLater = await db.savedLinks.count();
        } catch (error) {
          // 如果出错，尝试使用articles表的isReadLater字段
          readLater = await db.articles
            .where('isReadLater').equals('true')
            .filter(article => article.isHidden !== true)
            .count();
        }
          
        setCounts({
          todayCount: todayArticles,
          allCount: allArticles,
          notesCount: notes,
          readLaterCount: readLater
        });
        
      } catch (error) {
        console.error("Error fetching nav counts:", error);
      }
    };

    fetchNavCounts();
  }, [db, triggerArticleListRefresh, feedCountRefreshTrigger]);

  return counts;
}; 