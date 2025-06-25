/**
 * 生成唯一ID
 * 结合时间戳和随机字符串生成一个唯一ID
 * @returns 唯一ID字符串
 */
export const generateUniqueId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomStr}`;
};

/**
 * 格式化相对时间
 * 将日期转换为"几分钟前"、"几小时前"等格式
 * @param date 日期对象
 * @returns 格式化后的相对时间字符串
 */
export const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // 小于1分钟
  if (diff < 60 * 1000) {
    return '刚刚';
  }
  
  // 小于1小时
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}分钟前`;
  }
  
  // 小于1天
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}小时前`;
  }
  
  // 小于30天
  if (diff < 30 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days}天前`;
  }
  
  // 小于12个月
  if (diff < 12 * 30 * 24 * 60 * 60 * 1000) {
    const months = Math.floor(diff / (30 * 24 * 60 * 60 * 1000));
    return `${months}个月前`;
  }
  
  // 大于等于12个月
  const years = Math.floor(diff / (12 * 30 * 24 * 60 * 60 * 1000));
  return `${years}年前`;
};

/**
 * 防抖函数
 * 延迟执行函数，避免频繁调用
 * @param fn 要执行的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖处理后的函数
 */
export const debounce = <T extends (...args: any[]) => any>(fn: T, delay: number): ((...args: Parameters<T>) => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>) {
    if (timer) {
      clearTimeout(timer);
    }
    
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };
};

/**
 * 深度合并对象
 * 将两个对象进行深度合并
 * @param target 目标对象
 * @param source 源对象
 * @returns 合并后的对象
 */
export const deepMerge = <T extends object, U extends object>(target: T, source: U): T & U => {
  const output = { ...target } as T & U;
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key as keyof U])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key as keyof U] });
        } else {
          output[key as keyof (T & U)] = deepMerge(
            target[key as keyof T] as object,
            source[key as keyof U] as object
          ) as any;
        }
      } else {
        Object.assign(output, { [key]: source[key as keyof U] });
      }
    });
  }
  
  return output;
};

/**
 * 判断是否为对象
 * @param item 要判断的值
 * @returns 是否为对象
 */
export const isObject = (item: any): item is object => {
  return item && typeof item === 'object' && !Array.isArray(item);
};

/**
 * 优化的未读计数更新工具
 * 避免重复计算，提高性能
 */
export const updateUnreadCountOptimized = async (
  db: any,
  feedId: string | number,
  currentCount?: number
): Promise<number> => {
  try {
    const actualCount = await db.articles.where({ sourceId: feedId, isRead: 'false' }).count();
    
    // 只有当计数真的发生变化时才更新数据库
    if (currentCount === undefined || currentCount !== actualCount) {
      await db.feeds.update(feedId, { unreadCount: actualCount });
      console.log(`[Helpers] Feed ${feedId} unread count updated: ${currentCount} -> ${actualCount}`);
    }
    
    return actualCount;
  } catch (error) {
    console.error(`[Helpers] Error updating unread count for feed ${feedId}:`, error);
    return currentCount || 0;
  }
};

/**
 * 创建今日时间范围（本地时区）
 * 确保与UI显示保持一致
 */
export const getTodayRange = () => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  return {
    start: todayStart.getTime(),
    end: todayEnd.getTime()
  };
};

/**
 * 防抖函数，用于优化频繁的数据更新操作
 */
export const debounceDataUpdate = <T extends any[]>(
  func: (...args: T) => Promise<void>,
  delay: number = 300
) => {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: T): Promise<void> => {
    return new Promise((resolve) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        await func(...args);
        resolve();
      }, delay);
    });
  };
}; 

/**
 * 从 HTML 内容中提取第一张有效图片的 URL
 * @param htmlContent HTML 字符串
 * @returns 图片的 URL，如果找不到则返回 null
 */
export const extractFirstImage = (htmlContent: string): string | null => {
  if (!htmlContent) return null;
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // 查找所有图片元素
    const imgElements = doc.querySelectorAll('img');
    
    for (let i = 0; i < imgElements.length; i++) {
      const img = imgElements[i];
      const src = img.getAttribute('src');
      
      if (src) {
        // 排除常见的小图标、头像等
        const width = parseInt(img.getAttribute('width') || '0');
        const height = parseInt(img.getAttribute('height') || '0');
        
        // 检查是否在style属性中设置了宽高
        let styleWidth = 0;
        let styleHeight = 0;
        
        if (img.hasAttribute('style')) {
          const style = img.getAttribute('style') || '';
          
          const widthMatch = style.match(/width\s*:\s*(\d+)px/);
          if (widthMatch) styleWidth = parseInt(widthMatch[1]);
          
          const heightMatch = style.match(/height\s*:\s*(\d+)px/);
          if (heightMatch) styleHeight = parseInt(heightMatch[1]);
        }
        
        const effectiveWidth = width || styleWidth;
        const effectiveHeight = height || styleHeight;
        
        // 忽略小图片和1x1像素的追踪图像
        if ((effectiveWidth > 0 && effectiveWidth < 30) || 
            (effectiveHeight > 0 && effectiveHeight < 30) || 
            (effectiveWidth === 1 && effectiveHeight === 1)) {
          continue;
        }
        
        // 忽略常见的图标和追踪图像的URL模式
        if (src.includes('icon') || src.includes('logo') || 
            src.includes('pixel') || src.includes('tracker') || 
            src.includes('avatar') || src.includes('blank.gif') ||
            src.includes('spacer.gif') || src.includes('transparent.gif')) {
          continue;
        }
        
        // 检查背景图片的父元素，这可能是文章的主图
        if (!src.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
          // 如果不是直接的图片URL，检查下一个
          continue; 
        }
        
        return src;
      }
    }
    
    // 检查背景图片
    const elementsWithBgImage = doc.querySelectorAll('[style*="background-image"]');
    for (let i = 0; i < elementsWithBgImage.length; i++) {
      const el = elementsWithBgImage[i];
      const style = window.getComputedStyle(el).backgroundImage;
      
      if (style && style !== 'none') {
        const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (match && match[1]) {
          return match[1];
        }
      }
    }
  } catch (e) {
    console.error("提取图片时出错:", e);
  }
  
  // 如果上面的方法都失败了，尝试基本的正则表达式方法
  const imgRegex = /<img[^>]+src="([^">]+)"/;
  const match = htmlContent.match(imgRegex);
  return match ? match[1] : null;
};

/**
 * 从 HTML 内容中提取第一段的纯文本作为摘要
 * @param htmlContent HTML 字符串
 * @returns 提取的文本摘要，如果找不到则返回 null
 */
export const extractFirstParagraphText = (htmlContent: string): string | null => {
  if (!htmlContent) return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    const firstParagraph = doc.querySelector('p');
    if (firstParagraph && firstParagraph.textContent) {
      return firstParagraph.textContent.trim();
    }
    
    if (doc.body && doc.body.textContent) {
        const text = doc.body.textContent.trim().replace(/\s+/g, ' ');
        const sentenceEnd = text.indexOf('.');
        if (sentenceEnd > 0 && sentenceEnd < 150) {
            return text.substring(0, sentenceEnd + 1);
        }
        return text.substring(0, 120) + (text.length > 120 ? '...' : '');
    }
  } catch (e) {
    console.error("Error parsing HTML for summary extraction:", e);
  }
  return null;
}; 