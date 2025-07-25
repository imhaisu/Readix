/**
 * 增强版全局日志控制模块
 * 提供日志级别控制、分组、重复日志抑制和性能分析功能
 */

// 日志级别定义
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

// 导出日志事件类型定义
export interface LogEvent {
  timestamp: number;
  module: string;
  level: string;
  message: string;
  data?: any;
}

// 模块类型定义
export type LogModule = 
  | 'GENERAL'    // 通用日志
  | 'FEED'       // 订阅源相关日志
  | 'FILTER'     // 过滤规则日志
  | 'DATABASE'   // 数据库操作日志
  | 'NETWORK'    // 网络请求日志
  | 'LAYOUT'     // 布局相关日志
  | 'HOMEPAGE'   // 首页相关日志
  | 'ARTICLE_DETAIL' // 文章详情组件日志
  | 'IMAGE_PROXY'    // 图片代理相关日志
  | 'PERFORMANCE'    // 性能相关日志
  | 'ARTICLES'       // 文章列表相关日志
  | 'SYNC';          // 同步相关日志

// 增强版日志配置管理器
class EnhancedLogManager {
  // 当前全局日志级别，默认为INFO
  private _currentLevel: LogLevel = LogLevel.INFO;
  
  // 各模块的日志开关
  private _moduleEnabled: Record<LogModule, boolean> = {
    GENERAL: true,
    FEED: false,
    FILTER: true,
    DATABASE: false,
    NETWORK: false,
    LAYOUT: false,
    HOMEPAGE: false,
    ARTICLE_DETAIL: false,
    IMAGE_PROXY: false,
    PERFORMANCE: false,
    ARTICLES: true,
    SYNC: false
  };
  
  // 日志缓存，用于重复日志抑制
  private _logHistory: Map<string, { count: number, lastTime: number }> = new Map();
  
  // 性能标记缓存
  private _perfMarkers: Map<string, number> = new Map();
  
  // 重复日志抑制的时间间隔 (毫秒)
  private readonly REPEAT_SUPPRESS_INTERVAL = 5000;
  
  // 是否在组中
  private _inGroup = false;
  
  // 获取当前日志级别
  get currentLevel(): LogLevel {
    return this._currentLevel;
  }
  
  // 设置全局日志级别
  setLevel(level: LogLevel): void {
    this._currentLevel = level;
    // 只在非生产环境输出设置信息
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[日志] 设置日志级别: ${LogLevel[level]}`);
    }
  }
  
  // 检查模块是否启用
  isModuleEnabled(module: LogModule): boolean {
    return this._moduleEnabled[module] === true;
  }
  
  // 设置模块日志开关
  setModuleEnabled(module: LogModule, enabled: boolean): void {
    this._moduleEnabled[module] = enabled;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[LogConfig] ${module} 模块日志已${enabled ? '启用' : '禁用'}`);
    }
  }
  
  // 启用指定的模块
  enableModule(module: LogModule): void {
    this._moduleEnabled[module] = true;
  }
  
  // 禁用指定的模块
  disableModule(module: LogModule): void {
    this._moduleEnabled[module] = false;
  }
  
  // 启用所有模块
  enableAllModules(): void {
    Object.keys(this._moduleEnabled).forEach(module => {
      this._moduleEnabled[module as LogModule] = true;
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[LogConfig] 已启用所有模块的日志');
    }
  }
  
  // 禁用所有模块
  disableAllModules(): void {
    Object.keys(this._moduleEnabled).forEach(module => {
      this._moduleEnabled[module as LogModule] = false;
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[LogConfig] 已禁用所有模块的日志');
    }
  }
  
  // 检查是否应该输出日志
  private shouldLog(module: LogModule, level: LogLevel): boolean {
    return level >= this._currentLevel && this._moduleEnabled[module];
  }
  
  // 检查是否是重复日志
  private isRepeatedLog(module: LogModule, level: LogLevel, message: string): boolean {
    const now = Date.now();
    const key = `${module}:${level}:${message}`;
    const history = this._logHistory.get(key);
    
    if (history && now - history.lastTime < this.REPEAT_SUPPRESS_INTERVAL) {
      // 更新计数并跳过输出
      this._logHistory.set(key, {
        count: history.count + 1,
        lastTime: now
      });
      return true;
    }
    
    // 首次记录或超出抑制间隔
    this._logHistory.set(key, {
      count: 1,
      lastTime: now
    });
    return false;
  }
  
  // 创建日志组
  group(module: LogModule, title: string): void {
    if (!this.shouldLog(module, LogLevel.DEBUG)) return;
    console.group(`[${module}] ${title}`);
    this._inGroup = true;
  }
  
  // 结束日志组
  groupEnd(): void {
    if (this._inGroup) {
      console.groupEnd();
      this._inGroup = false;
    }
  }
  
  // 输出调试级别日志
  debug(module: LogModule, message: string, ...args: any[]): void {
    if (!this.shouldLog(module, LogLevel.DEBUG)) return;
    
    // 检查是否是重复日志
    if (this.isRepeatedLog(module, LogLevel.DEBUG, message)) return;
    
        console.debug(`[${module}] ${message}`, ...args);
    
    // 发送日志事件
    this.dispatchLogEvent(module, 'DEBUG', message, args.length > 0 ? args[0] : undefined);
  }
  
  // 输出信息级别日志
  info(module: LogModule, message: string, ...args: any[]): void {
    if (!this.shouldLog(module, LogLevel.INFO)) return;
    
    // 检查是否是重复日志
    if (this.isRepeatedLog(module, LogLevel.INFO, message)) return;
    
    console.info(`[${module}] ${message}`, ...args);
    
    // 发送日志事件
    this.dispatchLogEvent(module, 'INFO', message, args.length > 0 ? args[0] : undefined);
  }
  
  // 输出警告级别日志
  warn(module: LogModule, message: string, ...args: any[]): void {
    if (!this.shouldLog(module, LogLevel.WARN)) return;
    
    // 警告日志不进行重复抑制
    console.warn(`[${module}] ${message}`, ...args);
    
    // 发送日志事件
    this.dispatchLogEvent(module, 'WARN', message, args.length > 0 ? args[0] : undefined);
  }
  
  // 输出错误级别日志
  error(module: LogModule, message: string, ...args: any[]): void {
    if (!this.shouldLog(module, LogLevel.ERROR)) return;
    
    // 错误日志不进行重复抑制
    console.error(`[${module}] ${message}`, ...args);
    
    // 发送日志事件
    this.dispatchLogEvent(module, 'ERROR', message, args.length > 0 ? args[0] : undefined);
  }
  
  // 开始性能测量
  startPerf(markerId: string): void {
    this._perfMarkers.set(markerId, performance.now());
  }
  
  // 结束性能测量并记录
  endPerf(markerId: string, module: LogModule): void {
    const startTime = this._perfMarkers.get(markerId);
    if (!startTime) {
      this.warn(module, `无效的性能标记: ${markerId}`);
      return;
    }
    
    const duration = performance.now() - startTime;
    this._perfMarkers.delete(markerId);
    
    if (duration > 1000) {
      this.warn(module, `性能警告: ${markerId} 耗时 ${duration.toFixed(2)}ms`);
    } else {
      this.debug(module, `性能测量: ${markerId} 耗时 ${duration.toFixed(2)}ms`);
    }
    
    // 记录到 Performance Timeline
    if (typeof performance.mark === 'function') {
      const markName = `${module}-${markerId}`;
      performance.mark(`${markName}-end`);
      performance.measure(markName, `${markName}-start`, `${markName}-end`);
    }
  }
  
  // 打印重复日志的汇总信息
  flushRepeatedLogs(): void {
    for (const [key, data] of this._logHistory.entries()) {
      if (data.count > 1) {
        const [module, level, message] = key.split(':', 3);
        console.log(`[${module}] ${message} (重复 ${data.count - 1} 次)`);
      }
    }
    this._logHistory.clear();
  }
  
  // 重置所有日志缓存
  resetLogCache(): void {
    this._logHistory.clear();
  }
  
  // 发送日志事件
  private dispatchLogEvent(module: LogModule, level: string, message: string, data?: any): void {
    // 创建并分发日志事件，可用于日志面板等功能
    const logEvent: LogEvent = {
      timestamp: Date.now(),
      module,
      level,
      message,
      data
    };
    
    const event = new CustomEvent('app-log', {
      detail: logEvent
    });
    
    document.dispatchEvent(event);
  }
}

// 导出增强版日志管理器实例
export const EnhancedLogger = new EnhancedLogManager();

// 为了向后兼容，保留原来的 LogConfig
// 但内部使用增强版日志系统
class LogConfigManager {
  setLevel(level: LogLevel): void {
    EnhancedLogger.setLevel(level);
  }
  
  isModuleEnabled(module: LogModule): boolean {
    return EnhancedLogger.isModuleEnabled(module);
  }
  
  setModuleEnabled(module: LogModule, enabled: boolean): void {
    EnhancedLogger.setModuleEnabled(module, enabled);
  }
  
  enableAllModules(): void {
    EnhancedLogger.enableAllModules();
  }
  
  disableAllModules(): void {
    EnhancedLogger.disableAllModules();
  }
  
  debug(module: LogModule, message: string, ...args: any[]): void {
    EnhancedLogger.debug(module, message, ...args);
  }
  
  info(module: LogModule, message: string, ...args: any[]): void {
    EnhancedLogger.info(module, message, ...args);
  }
  
  warn(module: LogModule, message: string, ...args: any[]): void {
    EnhancedLogger.warn(module, message, ...args);
  }
  
  error(module: LogModule, message: string, ...args: any[]): void {
    EnhancedLogger.error(module, message, ...args);
    }
  
  get currentLevel(): LogLevel {
    return EnhancedLogger.currentLevel;
  }
}

// 导出单例实例
export const LogConfig = new LogConfigManager(); 

// 在应用退出前打印重复日志汇总
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    EnhancedLogger.flushRepeatedLogs();
  });
} 