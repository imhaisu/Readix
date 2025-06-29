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
        favicon: 'https://www.google.com/s2/favicons?domain=huxiu.com&sz=128',
      },
      {
        name: '36氪',
        url: 'https://36kr.com/feed',
        favicon: 'https://www.google.com/s2/favicons?domain=36kr.com&sz=128',
      },
      {
        name: 'IT之家',
        url: 'https://www.ithome.com/rss/',
        favicon: 'https://www.google.com/s2/favicons?domain=ithome.com&sz=128',
      },
      {
        name: '极客公园',
        url: 'https://www.geekpark.net/rss',
        favicon: 'https://www.google.com/s2/favicons?domain=geekpark.net&sz=128',
      },
      {
        name: '少数派',
        url: 'https://sspai.com/feed',
        favicon: 'https://www.google.com/s2/favicons?domain=sspai.com&sz=128',
      },
    ],
  },
  {
    title: '编程技术',
    feeds: [
      {
        name: '阮一峰的网络日志',
        url: 'https://www.ruanyifeng.com/blog/atom.xml',
        favicon: 'https://www.google.com/s2/favicons?domain=ruanyifeng.com&sz=128',
      },
      {
        name: '美团技术团队',
        url: 'https://tech.meituan.com/feed/',
        favicon: 'https://www.google.com/s2/favicons?domain=meituan.com&sz=128',
      },
      {
        name: '酷壳',
        url: 'https://coolshell.cn/feed',
        favicon: 'https://www.google.com/s2/favicons?domain=coolshell.cn&sz=128',
      },
    ],
  },
  {
    title: '设计与创意',
    feeds: [
      {
        name: '优设-UISDC',
        url: 'https://www.uisdc.com/feed',
        favicon: 'https://www.google.com/s2/favicons?domain=uisdc.com&sz=128',
      },
      {
        name: '人人都是产品经理',
        url: 'http://www.woshipm.com/feed',
        favicon: 'https://www.google.com/s2/favicons?domain=woshipm.com&sz=128',
      },
    ],
  },
]; 