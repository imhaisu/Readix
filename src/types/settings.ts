export interface Settings {
    general: GeneralSettings;
    appearance: AppearanceSettings;
    advanced: AdvancedSettings;
    layout: LayoutSettings;
    features: {
        // 已移除useNewFeedList设置项，因为现在只使用新版组件
    };
}

export interface GeneralSettings {
    syncOnStartup: boolean;
    defaultViewMode: 'list' | 'card' | 'magazine' | 'compact';
    updateFrequency: number; // in minutes
    retentionDays: number; // 0 for indefinite
    layoutMode: 'two-column' | 'three-column';
    sidebarWidth?: number;
    // 新增清理相关设置
    autoCleanup: boolean; // 是否启用自动清理
    cleanupUnreadDays: number; // 未读文章保留天数，0表示不清理
    cleanupReadDays: number; // 已读文章保留天数，0表示不清理
}

export interface AppearanceSettings {
    reading: {
        fontFamily: string;
        fontSize: number;
        lineHeight: number;
        backgroundColor: string;
        textColor: string;
        titleColor: string;
        titleFontSize: number;
        autoMarkAsRead: boolean;
    };
}

export interface AdvancedSettings {
    maxArticlesPerFeed: number; // 0 for indefinite
    enableNotifications: boolean;
    startMinimized: boolean;
    keyboardShortcuts: Record<string, string>;
    gestures: {
        swipeLeft: string;
        swipeRight: string;
        pullToRefresh: boolean;
    };
    doubaoApiKey?: string;
}

export interface LayoutSettings {
    windowSize: {
        width: number;
        height: number;
    };
    sidebarLayout: number[];
    mainLayout: number[];
    articleListWidth: number; // 新增：文章列表的像素宽度
}

// 默认设置
export const defaultSettings: Settings = {
    general: {
        syncOnStartup: true,
        defaultViewMode: 'list',
        updateFrequency: 30,
        retentionDays: 0,
        layoutMode: 'three-column',
        // 新增清理相关设置的默认值
        autoCleanup: false,
        cleanupUnreadDays: 0,
        cleanupReadDays: 30,
    },
    appearance: {
        reading: {
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            fontSize: 16,
            lineHeight: 1.6,
            backgroundColor: '#ffffff',
            textColor: '#757574',
            titleColor: '#333333',
            titleFontSize: 24,
            autoMarkAsRead: true,
        },
    },
    advanced: {
        maxArticlesPerFeed: 100, // 0 for indefinite
        enableNotifications: true,
        startMinimized: false,
        keyboardShortcuts: {
            'nextArticle': 'j',
            'previousArticle': 'k',
            'markRead': 'm',
            'markAllRead': 'shift+a',
            'star': 's',
            'refresh': 'r',
            'openBrowser': 'o',
        },
        gestures: {
            swipeLeft: 'nextArticle',
            swipeRight: 'previousArticle',
            pullToRefresh: true,
        },
        doubaoApiKey: '',
    },
    layout: {
        windowSize: {
            width: 1280,
            height: 720,
        },
        sidebarLayout: [20, 80],
        mainLayout: [30, 70],
        articleListWidth: 350, // 新增默认值
    },
    features: {
        // 已移除useNewFeedList设置项
    },
};
