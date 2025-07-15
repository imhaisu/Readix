/**
 * 过滤规则日志记录工具
 * 用于跟踪过滤规则的应用情况，帮助排查问题
 */
import { LogConfig, LogLevel } from './logConfig';

// 日志级别
type LoggerLevel = 'debug' | 'info' | 'warn' | 'error';

// 日志项结构
interface LogEntry {
  timestamp: string;
  level: LoggerLevel;
  message: string;
  data?: any;
}

// 最大日志条目数
const MAX_LOG_ENTRIES = 100;

// 日志存储
let logEntries: LogEntry[] = [];

// 本地存储键
const FILTER_LOG_KEY = 'filter_rules_log';

// 控制台日志开关（默认开启）
let CONSOLE_LOGGING_ENABLED = true;

/**
 * 设置控制台日志开关
 * @param enabled 是否启用控制台日志
 */
export const setConsoleLogging = (enabled: boolean): void => {
  CONSOLE_LOGGING_ENABLED = enabled;
  LogConfig.setModuleEnabled('FILTER', enabled);
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[FilterLog] 控制台日志已${enabled ? '启用' : '禁用'}`);
  }
};

/**
 * 添加日志
 * @param level 日志级别
 * @param message 日志消息
 * @param data 相关数据（可选）
 */
export const addLog = (level: LoggerLevel, message: string, data?: any): void => {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data
  };
  
  // 添加到内存日志
  logEntries = [entry, ...logEntries].slice(0, MAX_LOG_ENTRIES);
  
  // 输出到控制台（如果启用）
  if (CONSOLE_LOGGING_ENABLED) {
    switch (level) {
      case 'debug':
        LogConfig.debug('FILTER', message, data);
        break;
      case 'info':
        LogConfig.info('FILTER', message, data);
        break;
      case 'warn':
        LogConfig.warn('FILTER', message, data);
        break;
      case 'error':
        LogConfig.error('FILTER', message, data);
        break;
    }
  }
  
  // 保存到本地存储
  try {
    localStorage.setItem(FILTER_LOG_KEY, JSON.stringify(logEntries));
  } catch (error) {
    console.error('保存日志到本地存储失败:', error);
  }
};

/**
 * 获取所有日志
 * @returns 日志条目数组
 */
export const getLogs = (): LogEntry[] => {
  return [...logEntries];
};

/**
 * 加载日志
 */
export const loadLogs = (): void => {
  try {
    const savedLogs = localStorage.getItem(FILTER_LOG_KEY);
    if (savedLogs) {
      logEntries = JSON.parse(savedLogs);
    }
  } catch (error) {
    console.error('从本地存储加载日志失败:', error);
  }
};

/**
 * 清除日志
 */
export const clearLogs = (): void => {
  logEntries = [];
  try {
    localStorage.removeItem(FILTER_LOG_KEY);
  } catch (error) {
    console.error('清除日志失败:', error);
  }
};

// 便捷日志函数
export const logDebug = (message: string, data?: any): void => addLog('debug', message, data);
export const logInfo = (message: string, data?: any): void => addLog('info', message, data);
export const logWarn = (message: string, data?: any): void => addLog('warn', message, data);
export const logError = (message: string, data?: any): void => addLog('error', message, data);

/**
 * 记录主题过滤规则应用日志
 * 专门用于记录主题过滤规则的应用情况
 * @param topicId 主题ID
 * @param topicTitle 主题标题
 * @param article 文章对象
 * @param rules 应用的规则
 * @param passed 是否通过规则
 */
export const logTopicFilterApplied = (
  topicId: string, 
  topicTitle: string, 
  articleId: string,
  articleTitle: string,
  rules: any[], 
  passed: boolean
): void => {
  addLog(
    'debug', 
    `主题 "${topicTitle}" (ID: ${topicId}) 过滤规则应用于文章 "${articleTitle.substring(0, 30)}..." 结果: ${passed ? '通过' : '未通过'}`,
    { 
      topicId, 
      topicTitle,
      articleId,
      articleTitle,
      rulesCount: rules.length, 
      activeRulesCount: rules.filter((r: any) => r.isActive).length,
      passed 
    }
  );
};

// 初始化时加载日志并设置默认配置
loadLogs();
// 默认启用过滤日志的控制台输出
setConsoleLogging(true); 