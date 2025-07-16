/**
 * 全局日志控制模块
 * 用于统一管理应用中的日志输出
 */

// 日志级别定义
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
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
  | 'PERFORMANCE'; // 性能相关日志

// 日志配置
class LogConfigManager {
  // 当前全局日志级别，默认为INFO
  private _currentLevel: LogLevel = LogLevel.INFO;
  
  // 各模块的日志开关
  private _moduleEnabled: Record<LogModule, boolean> = {
    GENERAL: true,
    FEED: false,
    FILTER: true, // 启用过滤器日志
    DATABASE: false,
    NETWORK: false,
    LAYOUT: false,
    HOMEPAGE: false,
    ARTICLE_DETAIL: false, // 默认禁用文章详情日志
    IMAGE_PROXY: false,    // 默认禁用图片代理日志
    PERFORMANCE: false
  };
  
  // 获取当前日志级别
  get currentLevel(): LogLevel {
    return this._currentLevel;
  }
  
  // 设置全局日志级别
  setLevel(level: LogLevel): void {
    this._currentLevel = level;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[LogConfig] 日志级别已设置为: ${LogLevel[level]}`);
    }
  }
  
  // 检查模块是否启用
  isModuleEnabled(module: LogModule): boolean {
    return this._moduleEnabled[module] === true;
  }
  
  // 设置模块日志开关
  setModuleEnabled(module: LogModule, enabled: boolean): void {
    this._moduleEnabled[module] = enabled;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[LogConfig] ${module} 模块日志已${enabled ? '启用' : '禁用'}`);
    }
  }
  
  // 启用所有模块
  enableAllModules(): void {
    Object.keys(this._moduleEnabled).forEach(module => {
      this._moduleEnabled[module as LogModule] = true;
    });
    if (process.env.NODE_ENV === 'development') {
      console.log('[LogConfig] 已启用所有模块的日志');
    }
  }
  
  // 禁用所有模块
  disableAllModules(): void {
    Object.keys(this._moduleEnabled).forEach(module => {
      this._moduleEnabled[module as LogModule] = false;
    });
    if (process.env.NODE_ENV === 'development') {
      console.log('[LogConfig] 已禁用所有模块的日志');
    }
  }
  
  // 日志输出函数
  debug(module: LogModule, message: string, ...args: any[]): void {
    if (this._currentLevel <= LogLevel.DEBUG && this._moduleEnabled[module]) {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[${module}] ${message}`, ...args);
      }
    }
  }
  
  info(module: LogModule, message: string, ...args: any[]): void {
    if (this._currentLevel <= LogLevel.INFO && this._moduleEnabled[module]) {
      if (process.env.NODE_ENV === 'development') {
        console.info(`[${module}] ${message}`, ...args);
      }
    }
  }
  
  warn(module: LogModule, message: string, ...args: any[]): void {
    if (this._currentLevel <= LogLevel.WARN && this._moduleEnabled[module]) {
      console.warn(`[${module}] ${message}`, ...args);
    }
  }
  
  error(module: LogModule, message: string, ...args: any[]): void {
    if (this._currentLevel <= LogLevel.ERROR && this._moduleEnabled[module]) {
      console.error(`[${module}] ${message}`, ...args);
    }
  }
}

// 导出单例实例
export const LogConfig = new LogConfigManager(); 