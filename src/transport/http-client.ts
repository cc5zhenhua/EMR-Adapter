// HTTPClient - 封装 HTTP 请求

export interface HTTPRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  cookies?: string[];
  timeout?: number;
  followRedirects?: boolean;
}

export interface HTTPResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  cookies?: string[];
}

export class HTTPClient {
  private defaultTimeout: number;

  constructor(defaultTimeout: number = 30000) {
    this.defaultTimeout = defaultTimeout;
  }

  async request(url: string, options: HTTPRequestOptions = {}): Promise<HTTPResponse> {
    const {
      method = 'GET',
      headers = {},
      body,
      cookies = [],
      timeout = this.defaultTimeout,
      followRedirects = true,
    } = options;

    // 构建请求头
    const requestHeaders: Record<string, string> = {
      ...headers,
    };

    // 添加 cookies
    if (cookies.length > 0) {
      requestHeaders['Cookie'] = cookies.join('; ');
    }

    // 处理 body
    let requestBody: string | undefined;
    if (body) {
      if (typeof body === 'string') {
        requestBody = body;
      } else if (body instanceof FormData) {
        requestBody = body as any;
        // FormData 会自动设置 Content-Type，删除手动设置的
        delete requestHeaders['Content-Type'];
      } else {
        requestBody = JSON.stringify(body);
        requestHeaders['Content-Type'] = 'application/json';
      }
    }

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody === undefined ? null : requestBody,
        signal: controller.signal,
        redirect: followRedirects ? 'follow' : 'manual',
      });

      clearTimeout(timeoutId);

      // 提取 cookies
      const setCookieHeaders = response.headers.getSetCookie?.() || [];
      const responseCookies = setCookieHeaders.map((cookie: string) => {
        // 提取 cookie 的 name=value 部分
        return cookie.split(';')[0];
      });

      // 解析响应体
      const contentType = response.headers.get('content-type') || '';
      let responseBody: any;
      
      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      // Build response headers object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        cookies: responseCookies.filter((cookie): cookie is string => typeof cookie === 'string'),
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      
      throw error;
    }
  }

  async get(url: string, options: Omit<HTTPRequestOptions, 'method'> = {}): Promise<HTTPResponse> {
    return this.request(url, { ...options, method: 'GET' });
  }

  async post(url: string, options: Omit<HTTPRequestOptions, 'method'> = {}): Promise<HTTPResponse> {
    return this.request(url, { ...options, method: 'POST' });
  }
}