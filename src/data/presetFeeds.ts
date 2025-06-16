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
        name: '少数派',
        url: 'https://sspai.com/feed',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=sspai.com',
      },
      {
        name: '36氪',
        url: 'https://36kr.com/feed',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=36kr.com',
      },
      {
        name: '爱范儿',
        url: 'https://www.ifanr.com/feed',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=ifanr.com',
      },
      {
        name: 'Engadget 中国版',
        url: 'https://cn.engadget.com/rss.xml',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=engadget.com',
      }
    ],
  },
  {
    title: '独立博客',
    feeds: [
      {
        name: '阮一峰的网络日志',
        url: 'http://www.ruanyifeng.com/blog/atom.xml',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=ruanyifeng.com',
      },
      {
        name: '月光博客',
        url: 'https://www.williamlong.info/rss.xml',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=williamlong.info',
      },
      {
        name: 'MacinTalk',
        url: 'https://www.macintosh.cn/feed',
        favicon: 'https://www.google.com/s2/favicons?sz=64&domain=macintosh.cn',
      }
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