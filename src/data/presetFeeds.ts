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
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=huxiu.com',
      },
      {
        name: '36氪',
        url: 'https://36kr.com/feed',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=36kr.com',
      },
      {
        name: 'IT之家',
        url: 'https://www.ithome.com/rss/',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=ithome.com',
      },
      {
        name: '极客公园',
        url: 'https://www.geekpark.net/rss',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=geekpark.net',
      },
      {
        name: '少数派',
        url: 'https://sspai.com/feed',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=sspai.com',
      },
    ],
  },
  {
    title: '编程技术',
    feeds: [
      {
        name: '阮一峰的网络日志',
        url: 'https://www.ruanyifeng.com/blog/atom.xml',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=ruanyifeng.com',
      },
      {
        name: '美团技术团队',
        url: 'https://tech.meituan.com/feed/',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=meituan.com',
      },
      {
        name: '酷壳',
        url: 'https://coolshell.cn/feed',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=coolshell.cn',
      },
    ],
  },
  {
    title: '设计与创意',
    feeds: [
      {
        name: '优设-UISDC',
        url: 'https://www.uisdc.com/feed',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=uisdc.com',
      },
      {
        name: '人人都是产品经理',
        url: 'http://www.woshipm.com/feed',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=woshipm.com',
      },
    ],
  },
]; 