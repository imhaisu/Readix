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
    title: '产品与设计',
    feeds: [
      {
        name: '人人都是产品经理',
        url: 'http://www.woshipm.com/feed',
        favicon: 'https://www.google.com/s2/favicons?domain=woshipm.com&sz=128',
      },
      {
        name: '少数派',
        url: 'https://sspai.com/feed',
        favicon: 'https://www.google.com/s2/favicons?domain=sspai.com&sz=128',
      },
    ],
  },
  {
    title: '科技资讯',
    feeds: [
      {
        name: '36氪',
        url: 'https://36kr.com/feed',
        favicon: 'https://www.google.com/s2/favicons?domain=36kr.com&sz=128',
      },
      {
        name: '极客公园',
        url: 'https://www.geekpark.net/rss',
        favicon: 'https://www.google.com/s2/favicons?domain=geekpark.net&sz=128',
      },
      {
        name: '雷峰网',
        url: 'https://www.leiphone.com/feed',
        favicon: 'https://www.google.com/s2/favicons?domain=leiphone.com&sz=128',
      },
      {
        name: '钛媒体',
        url: 'https://www.tmtpost.com/feed',
        favicon: 'https://www.google.com/s2/favicons?domain=tmtpost.com&sz=128',
      },
    ],
  },
  {
    title: '人工智能',
    feeds: [
      {
        name: '机器之心',
        url: 'https://www.jiqizhixin.com/rss',
        favicon: 'https://www.google.com/s2/favicons?domain=jiqizhixin.com&sz=128',
      },
    ],
  },
  {
    title: '教育',
    feeds: [
      {
        name: '芥末堆',
        url: 'https://jiemodui.com/rss.xml',
        favicon: 'https://www.google.com/s2/favicons?domain=jemodui.com&sz=128',
      },
    ],
  },
]; 