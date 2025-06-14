import 'react';

// 声明 HTMLWebViewElement 接口，如果它在全局作用域中尚不存在
// Electron 通常会提供这个，但以防万一
interface HTMLWebViewElement extends HTMLElement {
  src: string;
  // 这里可以根据需要添加更多 webview 的方法和属性，例如：
  //บุรีรัมย์  loadURL(url: string, options?: Electron.LoadURLOptions): Promise<void>;
  //บุรีรัมย์  getURL(): string;
  //บุรีรัมย์  getTitle(): string;
  //บุรีรัมย์  isLoading(): boolean;
  //บุรีรัMย์  isWaitingForResponse(): boolean;
  //บุรีรัมย์  stop(): void;
  //บุรีรัมย์  reload(): void;
  //บุรีรัมย์  reloadIgnoringCache(): void;
  //บุรีรัมย์  canGoBack(): boolean;
  //บุรีรัมย์  canGoForward(): boolean;
  //บุรีรัมย์  canGoToOffset(offset: number): boolean;
  //บุรีรัมย์  clearHistory(): void;
  //บุรีรัมย์  goBack(): void;
  //บุรีรัมย์  goForward(): void;
  //บุรีรัมย์  goToIndex(index: number): void;
  //บุรีรัมย์  goToOffset(offset: number): void;
  // isCrashed(): boolean;
  // setUserAgent(userAgent: string): void;
  // getUserAgent(): string;
  // insertCSS(css: string): Promise<string>;
  // executeJavaScript(code: string, userGesture?: boolean): Promise<any>;
  // openDevTools(): void;
  // closeDevTools(): void;
  // isDevToolsOpened(): boolean;
  // isDevToolsFocused(): boolean;
  // enableDeviceEmulation(parameters: Electron.EnableDeviceEmulationParameters): void;
  // disableDeviceEmulation(): void;
  // send(channel: string, ...args: any[]): void;
  // getWebContentsId(): number;
  // 其他常用属性
  allowpopups?: boolean;
  nodeintegration?: boolean;
  plugins?: boolean;
  preload?: string;
  useragent?: string;
  partition?: string;
  autosize?: boolean;
  httpreferrer?: string;
  blinkfeatures?: string;
  disableblinkfeatures?: string;
  webpreferences?: string;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLWebViewElement> & {
          src: string;
          allowpopups?: boolean; // 明确允许的属性
          nodeintegration?: boolean;
          plugins?: boolean;
          preload?: string;
          useragent?: string;
          partition?: string;
          autosize?: boolean;
          httpreferrer?: string;
          blinkfeatures?: string;
          disableblinkfeatures?: string;
          webpreferences?: string; // 注意：此属性通常接受一个逗号分隔的字符串
          // 如果还有其他特定于 webview 的 HTML 属性，请在此处添加
        },
        HTMLWebViewElement
      >;
    }
  }
} 