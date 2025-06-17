/**
 * 图标处理工具函数
 */

/**
 * 处理图标URL，将file://协议的本地路径转换为base64数据URL
 * @param iconUrl 原始图标URL
 * @returns 处理后的图标URL或base64数据URL
 */
export const processIconUrl = async (iconUrl: string | undefined): Promise<string | undefined> => {
  if (!iconUrl) {
    return undefined;
  }

  // 如果是preset图标，直接返回（这些会在组件中特殊处理）
  if (iconUrl.startsWith('preset:')) {
    return iconUrl;
  }

  // 如果是file://协议的本地路径，需要转换为base64
  if (iconUrl.startsWith('file://')) {
    // 检查是否在Electron环境中
    if (typeof window !== 'undefined' && window.electron && window.electron.getLocalIconBase64) {
      try {
        const result = await window.electron.getLocalIconBase64(iconUrl);
        if (result.success && result.data) {
          return result.data;
        } else {
          console.warn('Failed to convert local icon to base64:', result.error);
          return undefined;
        }
      } catch (error) {
        console.error('Error processing local icon:', error);
        return undefined;
      }
    } else {
      // 如果不在Electron环境中或API不可用，返回undefined
      console.warn('electron.getLocalIconBase64 not available, skipping file:// icon processing');
      return undefined;
    }
  }

  // 如果是普通的HTTP/HTTPS URL或base64数据URL，直接返回
  return iconUrl;
};

/**
 * 批量处理图标URL
 * @param iconUrls 图标URL数组
 * @returns 处理后的图标URL数组
 */
export const processIconUrls = async (iconUrls: (string | undefined)[]): Promise<(string | undefined)[]> => {
  const promises = iconUrls.map(url => processIconUrl(url));
  return Promise.all(promises);
};

/**
 * 为订阅源对象处理图标URL
 * @param feed 订阅源对象
 * @returns 处理后的订阅源对象
 */
export const processFeedIcon = async <T extends { iconUrl?: string }>(feed: T): Promise<T> => {
  if (!feed.iconUrl) {
    return feed;
  }

  const processedIconUrl = await processIconUrl(feed.iconUrl);
  return {
    ...feed,
    iconUrl: processedIconUrl
  };
};

/**
 * 批量处理订阅源图标
 * @param feeds 订阅源数组
 * @returns 处理后的订阅源数组
 */
export const processFeedIcons = async <T extends { iconUrl?: string }>(feeds: T[]): Promise<T[]> => {
  const promises = feeds.map(feed => processFeedIcon(feed));
  return Promise.all(promises);
}; 