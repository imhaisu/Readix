export interface Settings {
    general: {
        syncOnStartup: boolean;
        defaultViewMode: 'list' | 'card' | 'magazine' | 'compact';
        updateFrequency: number; // in minutes
        retentionDays: number; // 0 for indefinite
        layoutMode: 'two-column' | 'three-column';
        sidebarWidth?: number;
    };
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
    advanced: {
        maxArticlesPerFeed: number; // 0 for indefinite
        enableNotifications: boolean;
        startMinimized: boolean;
        keyboardShortcuts: Record<string, string>;
        gestures: {
            swipeLeft: string;
            swipeRight: string;
            pullToRefresh: boolean;
        };
    };
    readLater: {
        enabled: boolean;
        autoDelete: boolean;
        deleteDays: number;
    };
}

export const defaultSettings: Settings = {
    general: {
        syncOnStartup: true,
        defaultViewMode: 'list',
        updateFrequency: 30,
        retentionDays: 0,
        layoutMode: 'three-column',
    },
    reading: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: 16,
        lineHeight: 1.6,
        backgroundColor: '#ffffff',
        textColor: '#333333',
        titleColor: '#333333',
        titleFontSize: 24,
        autoMarkAsRead: true,
    },
    advanced: {
        maxArticlesPerFeed: 0,
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
    },
    readLater: {
        enabled: true,
        autoDelete: true,
        deleteDays: 30,
    },
};
