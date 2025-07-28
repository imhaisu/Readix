import { format, isToday, isYesterday, isThisWeek, isThisYear } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { EnhancedLogger } from '../../utils/logConfig';

// 高级日期格式化，根据日期与当前时间的关系显示不同格式
export const formatArticleDate = (dateValue: number | string | undefined): string => {
  if (!dateValue) return '日期未知';
  
  try {
    const date = new Date(dateValue);
    
    // 检查日期是否有效
    if (isNaN(date.getTime())) return '日期无效';
    
    // 根据日期与当前时间的关系显示不同格式
    if (isToday(date)) {
      // 今天: 显示时间 "今天 15:30"
      return `今天 ${format(date, 'HH:mm')}`;
    } else if (isYesterday(date)) {
      // 昨天: 显示 "昨天 15:30"
      return `昨天 ${format(date, 'HH:mm')}`;
    } else if (isThisWeek(date)) {
      // 本周: 显示星期和时间 "周一 15:30"
      return format(date, 'EEE HH:mm', { locale: zhCN });
    } else if (isThisYear(date)) {
      // 本年: 显示月日 "3月15日"
      return format(date, 'M月d日', { locale: zhCN });
    } else {
      // 更早: 显示完整日期 "2022年3月15日"
      return format(date, 'yyyy年M月d日', { locale: zhCN });
    }
  } catch (e) {
    EnhancedLogger.error('ARTICLES', `日期格式化错误: ${e}`);
    return '日期未知';
  }
}; 