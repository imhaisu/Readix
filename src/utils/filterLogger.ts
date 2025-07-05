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

// 控制台日志开关（默认关闭）
let CONSOLE_LOGGING_ENABLED = false;

/**
 * 设置控制台日志开关
 * @param enabled 是否启用控制台日志
 */
export const setConsoleLogging = (enabled: boolean): void => {
  CONSOLE_LOGGING_ENABLED = enabled;
  LogConfig.setModuleEnabled('FILTER', enabled);
  console.log(`[FilterLog] 控制台日志已${enabled ? '启用' : '禁用'}`);
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

// 初始化时加载日志并设置默认配置
loadLogs();
// 默认禁用过滤日志的控制台输出
setConsoleLogging(false); 