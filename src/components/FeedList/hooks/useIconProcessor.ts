import { useState, useEffect, useCallback, useRef } from 'react';
import { FeedSource } from '../../../db/database';

export const useIconProcessor = (feeds: FeedSource[]) => {
  const [processedFeeds, setProcessedFeeds] = useState<FeedSource[]>([]);
  // 记录已经处理过的图标URL，防止重复处理
  const processedIconUrls = useRef<Map<string, string | undefined>>(new Map());
  
  // 处理单个图标URL的函数
  const processSingleIconUrl = useCallback(async (iconUrl: string | undefined): Promise<string | undefined> => {
    if (!iconUrl) return undefined;
    
    // 检查缓存中是否已有处理结果
    if (processedIconUrls.current.has(iconUrl)) {
      return processedIconUrls.current.get(iconUrl);
    }
    
    try {
      // 处理不同类型的URL
      let result: string | undefined = iconUrl;
      
      // 如果是 file:// 协议，使用electron API处理
      if (iconUrl.startsWith('file://') && window.electron?.getLocalIconBase64) {
        const response = await window.electron.getLocalIconBase64(iconUrl);
        if (response.success && response.data) {
          result = response.data;
        } else {
          console.warn('处理本地图标失败:', response.error);
          result = undefined;
        }
      }
      
      // 将结果存入缓存
      processedIconUrls.current.set(iconUrl, result);
      return result;
    } catch (error) {
      console.error('处理图标URL出错:', error);
      processedIconUrls.current.set(iconUrl, undefined);
      return undefined;
    }
  }, []);
  
  // 批量处理订阅源图标
  const processAllFeedIcons = useCallback(async (feeds: FeedSource[]): Promise<FeedSource[]> => {
    return Promise.all(feeds.map(async (feed) => {
      if (!feed.iconUrl) return feed;
      
      const processedUrl = await processSingleIconUrl(feed.iconUrl);
      return { ...feed, iconUrl: processedUrl };
    }));
  }, [processSingleIconUrl]);

  // 处理图标
  useEffect(() => {
    const processIcons = async () => {
      if (feeds.length > 0) {
        try {
          // 使用自定义函数处理图标
          const processed = await processAllFeedIcons(feeds);
          setProcessedFeeds(processed);
        } catch (error) {
          console.error('处理订阅源图标出错:', error);
          setProcessedFeeds(feeds);
        }
      } else {
        setProcessedFeeds([]);
      }
    };

    processIcons();
  }, [feeds, processAllFeedIcons]);

  return processedFeeds;
}; 