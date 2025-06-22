import Dexie from 'dexie';

// 定义数据库类
export class RssDatabase extends Dexie {
  feeds!: Dexie.Table<FeedSource, string>;
  articles!: Dexie.Table<Article, string>;
  groups!: Dexie.Table<Group, string>;
  savedLinks!: Dexie.Table<SavedLink, string>;
  annotations!: Dexie.Table<Annotation, string>;

  constructor() {
    super('RssDatabase');
    
    // 定义数据库结构
    this.version(9).stores({
      feeds: 'id, groupId, title, url, lastUpdated, unreadCount, active, order, viewMode, bionicReading, defaultViewMode',
      articles: 'id, sourceId, publishDate, fetchDate, isRead, isStarred, url, title, scrollPosition, isReadLater, isFullText, [sourceId+isRead]',
      groups: 'id, name, order, collapsed',
      savedLinks: 'id, url, title, addedDate, isRead',
      annotations: 'id, articleId, createdAt'
    }).upgrade(async (tx) => {
      console.log("数据库从旧版本升级到版本 9。");
      // 对于版本 9，我们为 feeds 表增加了 defaultViewMode，为 articles 表增加了 isFullText。
      // Dexie 会自动处理新字段的添加，但我们可以为现有数据设置默认值。
      await tx.table('feeds').toCollection().modify(feed => {
        if (feed.defaultViewMode === undefined) {
          feed.defaultViewMode = 'summary'; // 默认为摘要模式
        }
      });
      await tx.table('articles').toCollection().modify(article => {
        if (article.isFullText === undefined) {
          article.isFullText = false; // 默认都不是全文
        }
      });
    });

    this.version(10).stores({
      articles: 'id, sourceId, publishDate, fetchDate, isRead, isStarred, url, title, scrollPosition, isReadLater, isFullText, [sourceId+isRead], [sourceId+isStarred]'
    });
    
    // 定义类型
    this.feeds = this.table('feeds');
    this.articles = this.table('articles');
    this.groups = this.table('groups');
    this.savedLinks = this.table('savedLinks');
    this.annotations = this.table('annotations');
  }
}

// 数据类型定义
export interface FeedSource {
  id?: string;
  title: string;
  url: string;
  iconUrl?: string;
  groupId?: string;
  updateFrequency: number;
  lastUpdated: Date;
  viewMode: 'full' | 'web' | 'original';
  unreadCount: number;
  active: boolean;
  bionicReading: boolean;
  order?: number;
  defaultViewMode?: 'summary' | 'fulltext';
}

export interface Article {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  author?: string;
  publishDate: number;
  fetchDate: number;
  content: string;
  contentText?: string;
  summary?: string;
  imageUrl?: string;
  isRead: string;
  isStarred: string;
  isReadLater?: string;
  isHidden?: boolean;
  tags?: string[];
  guid?: string;
  scrollPosition?: number;
  isFullText?: boolean;
}

export interface Group {
  id?: string;
  name: string;
  order: number;
  collapsed: boolean;
}

export interface SavedLink {
  id: string;
  url: string;
  title: string;
  addedDate: Date;
  content?: string;
  isRead: boolean;
  readPosition?: number;
}

// 新增 Annotation 接口
export interface Annotation {
  id: string;
  articleId: string;
  type: 'highlight' | 'note';
  text: string; // 高亮的文本内容
  prefix: string; // 高亮内容的前20个字符上下文
  suffix: string; // 高亮内容的后20个字符上下文
  noteContent?: string; // 笔记内容 (如果是笔记类型)
  createdAt: number; // 创建时间戳，用于排序
}

// --- 单例模式实现 ---
export let dbInstance: RssDatabase | null = null;
export let isDbInitialized = false;
let initializationPromise: Promise<RssDatabase | null> | null = null;

export const initializeDatabaseSingleton = async (): Promise<RssDatabase | null> => {
  // 如果已经有一个正在进行的初始化，则返回该 promise
  if (initializationPromise) {
    return initializationPromise;
  }
  // 如果已经初始化完成，直接返回实例
  if (isDbInitialized && dbInstance) {
    return dbInstance;
  }

  // 开始初始化
  initializationPromise = (async () => {
    try {
      console.log('[DatabaseSingleton] 开始初始化数据库...');
      const database = new RssDatabase();
      await database.open();
      await database.articles.limit(1).toArray(); // 测试连接
      
      dbInstance = database;
      isDbInitialized = true;
      (window as any).dbInstanceForDebug = database;
      console.log('[DatabaseSingleton] 数据库初始化成功。');
      return dbInstance;
    } catch (error) {
      console.error('数据库初始化失败:', error);
       if (error && typeof error === 'object' && 'name' in error) {
        if ((error as any).name === 'VersionError' || (error as any).name === 'DatabaseError') {
          console.log('检测到数据库版本或结构问题，尝试重置数据库...');
          try {
            await Dexie.delete('RssDatabase');
            console.log('旧数据库已删除，重新初始化...');
            const newDatabase = new RssDatabase();
            await newDatabase.open();
            await newDatabase.articles.limit(1).toArray();
            dbInstance = newDatabase;
            isDbInitialized = true;
            (window as any).dbInstanceForDebug = newDatabase;
            console.log('数据库重置并初始化成功');
            return dbInstance;
          } catch (resetError) {
            console.error('数据库重置失败:', resetError);
          }
        }
      }
      // 如果发生任何错误，重置状态
      dbInstance = null;
      isDbInitialized = false;
      return null;
    } finally {
      // 初始化结束后，重置 promise 以允许重试
      initializationPromise = null;
    }
  })();
  
  return initializationPromise;
}; 