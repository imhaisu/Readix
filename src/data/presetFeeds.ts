export interface PresetFeed {
  name: string;
  url: string;
  favicon: string;
}

export interface PresetFeedCategory {
  title: string;
  feeds: PresetFeed[];
}

export const presetFeeds: PresetFeedCategory[] = [
  {
    title: '科技资讯',
    feeds: [
      {
        name: '虎嗅',
        url: 'https://www.huxiu.com/rss/0.xml',
        favicon: 'https://api.faviconkit.com/huxiu.com/144',
      },
      {
        name: '36氪',
        url: 'https://36kr.com/feed',
        favicon: 'https://api.faviconkit.com/36kr.com/144',
      },
      {
        name: 'IT之家',
        url: 'https://www.ithome.com/rss/',
        favicon: 'https://api.faviconkit.com/ithome.com/144',
      },
      {
        name: '极客公园',
        url: 'https://www.geekpark.net/rss',
        favicon: 'https://api.faviconkit.com/geekpark.net/144',
      },
      {
        name: '少数派',
        url: 'https://sspai.com/feed',
        favicon: 'https://api.faviconkit.com/sspai.com/144',
      },
    ],
  },
  {
    title: '编程技术',
    feeds: [
      {
        name: '阮一峰的网络日志',
        url: 'https://www.ruanyifeng.com/blog/atom.xml',
        favicon: 'https://api.faviconkit.com/ruanyifeng.com/144',
      },
      {
        name: '美团技术团队',
        url: 'https://tech.meituan.com/feed/',
        favicon: 'https://api.faviconkit.com/meituan.com/144',
      },
      {
        name: '酷壳',
        url: 'https://coolshell.cn/feed',
        favicon: 'https://api.faviconkit.com/coolshell.cn/144',
      },
    ],
  },
  {
    title: '设计与创意',
    feeds: [
      {
        name: '优设-UISDC',
        url: 'https://www.uisdc.com/feed',
        favicon: 'https://api.faviconkit.com/uisdc.com/144',
      },
      {
        name: '人人都是产品经理',
        url: 'http://www.woshipm.com/feed',
        favicon: 'https://api.faviconkit.com/woshipm.com/144',
      },
    ],
  },
]; 