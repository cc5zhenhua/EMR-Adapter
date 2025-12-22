// WellSkyAdapter - WellSky EMR 的适配器实现

import { BaseAdapter } from './base-adapter.js';
import {
  type Credentials,
  type Session,
  type PostResult,
  EMRType,
  EMRAdapterError,
  ErrorType,
} from '../types/index.js';
import type { VisitNote } from '../models/canonical.js';

// WellSky 特定的请求模型（表单字段）
export interface WellSkyVisitNoteRequest {
  carelog: string;
  shift: string;
  unavailability: string;
  date: string;
  tags: string;
  note: string;
  show_with_billing: string;
  show_with_payroll: string;
  csrfmiddlewaretoken?: string;
}

export class WellSkyAdapter extends BaseAdapter {
  private baseUrl: string = 'https://avasandbox.clearcareonline.com';

  getEMRType(): EMRType {
    return EMRType.WellSky;
  }

  async authenticate(credentials: Credentials): Promise<Session> {
    const baseUrl = credentials.baseUrl || this.baseUrl;
    const loginUrl = `${baseUrl}/login`;
    const nextUrl = '/dashboard/live/';

    try {
      // 1. GET 登录页面，获取初始 cookies 和 CSRF token
      const loginPageResponse = await this.httpClient.get(`${loginUrl}/?next=${nextUrl}`);
      this.sessionManager.updateCookies(loginPageResponse.cookies || []);

      // 提取 CSRF token
      const csrfToken = this.extractCSRFToken(loginPageResponse.body);
      if (!csrfToken) {
        throw new EMRAdapterError(
          'Failed to extract CSRF token from login page',
          ErrorType.Authentication,
          EMRType.WellSky
        );
      }

      // 2. POST 到 /multilogin/ (AJAX 请求)
      const multiloginFormData = new URLSearchParams();
      multiloginFormData.append('csrfmiddlewaretoken', csrfToken);
      multiloginFormData.append('username', credentials.username);
      multiloginFormData.append('password', credentials.password);
      multiloginFormData.append('next', nextUrl);

      const multiloginResponse = await this.httpClient.post(`${baseUrl}/multilogin/`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: multiloginFormData.toString(),
        cookies: this.sessionManager.getCookies(),
      });

      this.sessionManager.updateCookies(multiloginResponse.cookies || []);

      // 验证 multilogin 响应
      if (multiloginResponse.status === 200 && typeof multiloginResponse.body === 'object') {
        const result = multiloginResponse.body as { success?: boolean; errors?: any[] };
        if (!result.success || (result.errors && result.errors.length > 0)) {
          throw new EMRAdapterError(
            'WellSky multilogin failed',
            ErrorType.Authentication,
            EMRType.WellSky,
            multiloginResponse
          );
        }
      }

      // 3. POST 到 /login/ 完成登录（带时间戳参数）
      const timestamp = Date.now() / 1000;
      const loginFormData = new URLSearchParams();
      loginFormData.append('csrfmiddlewaretoken', csrfToken);
      loginFormData.append('username', credentials.username);
      loginFormData.append('password', credentials.password);
      loginFormData.append('next', nextUrl);

      const loginResponse = await this.httpClient.post(`${loginUrl}/?ts=${timestamp}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: loginFormData.toString(),
        cookies: this.sessionManager.getCookies(),
        followRedirects: false,
      });

      this.sessionManager.updateCookies(loginResponse.cookies || []);

      // 4. 验证登录状态（302 重定向到 dashboard）
      if (loginResponse.status === 302) {
        const location = loginResponse.headers['location'] || '';
        if (location.includes('/dashboard') || location.includes('/live')) {
          // 登录成功，访问 dashboard 获取完整 session
          const dashboardUrl = location.startsWith('http')
            ? location
            : `${baseUrl}${location}`;
          const dashboardResponse = await this.httpClient.get(dashboardUrl, {
            cookies: this.sessionManager.getCookies(),
          });
          this.sessionManager.updateCookies(dashboardResponse.cookies || []);

          const session: Session = {
            cookies: this.sessionManager.getCookies(),
            tokens: { csrf: csrfToken },
          };

          this.sessionManager.setSession(session);
          return session;
        }
      }

      // 登录失败
      throw new EMRAdapterError(
        'WellSky authentication failed',
        ErrorType.Authentication,
        EMRType.WellSky,
        loginResponse
      );
    } catch (error: any) {
      if (error instanceof EMRAdapterError) {
        throw error;
      }
      throw new EMRAdapterError(
        `WellSky authentication error: ${error.message}`,
        ErrorType.Authentication,
        EMRType.WellSky,
        error
      );
    }
  }

  transform(note: VisitNote): WellSkyVisitNoteRequest {
    // 格式化日期为 MM/DD/YYYY
    const formatDate = (date: Date): string => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    };

    // 优先使用 metadata 中的 shift，否则使用 visitId
    const shift = (note.metadata as any)?.shift || note.visitId;

    const request: WellSkyVisitNoteRequest = {
      carelog: '',
      shift: String(shift),
      unavailability: '',
      date: formatDate(note.visitDate),
      tags: note.metadata?.tags || '38060', // 默认 tag，可从 metadata 覆盖
      note: note.note,
      show_with_billing: 'on',
      show_with_payroll: 'on',
    };
    
    return request;
  }

  async postVisitNote(note: VisitNote): Promise<PostResult> {
    if (!this.isAuthenticated()) {
      throw new EMRAdapterError(
        'Not authenticated. Please call authenticate() first.',
        ErrorType.Authentication,
        EMRType.WellSky
      );
    }

    return this.handleRetry(async () => {
      const baseUrl = this.baseUrl;
      const endpoint = `${baseUrl}/scheduling/note/add/`;

      // 1. 总是从 scheduling 页面获取最新的 CSRF token（表单提交需要最新的 token）
      // 先尝试从 session 获取，如果失败再从页面获取
      let csrfToken = this.sessionManager.getTokens().csrf;
      
      // 从 scheduling 页面获取最新的 CSRF token
      const schedulingResponse = await this.httpClient.get(`${baseUrl}/scheduling/`, {
        cookies: this.sessionManager.getCookies(),
        headers: {
          'Referer': `${baseUrl}/dashboard/live/`,
        },
      });
      this.sessionManager.updateCookies(schedulingResponse.cookies || []);

      // 检查 session 是否有效
      if (schedulingResponse.status === 403 || schedulingResponse.status === 302) {
        // 尝试访问 dashboard 验证 session
        const dashboardResponse = await this.httpClient.get(`${baseUrl}/dashboard/live/`, {
          cookies: this.sessionManager.getCookies(),
        });
        
        if (dashboardResponse.status === 403 || dashboardResponse.status === 302) {
          throw new EMRAdapterError(
            'Session expired or invalid. Please login again.',
            ErrorType.Authentication,
            EMRType.WellSky,
            { 
              schedulingStatus: schedulingResponse.status,
              dashboardStatus: dashboardResponse.status 
            }
          );
        }
      }

      if (schedulingResponse.status === 200) {
        const htmlBody = typeof schedulingResponse.body === 'string' 
          ? schedulingResponse.body 
          : String(schedulingResponse.body || '');
        const newToken = this.extractCSRFToken(htmlBody);
        
        if (newToken) {
          csrfToken = newToken;
          this.sessionManager.updateTokens({ csrf: csrfToken });
        }
      }

      // 4. 如果仍然没有 token，抛出错误
      if (!csrfToken) {
        throw new EMRAdapterError(
          'Failed to obtain CSRF token. Please try logging in again.',
          ErrorType.Authentication,
          EMRType.WellSky
        );
      }

      // 2. 构建表单数据
      const formData = this.transform(note);
      formData.csrfmiddlewaretoken = csrfToken;

      const formParams = new URLSearchParams();
      Object.entries(formData).forEach(([key, value]) => {
        formParams.append(key, value);
      });

      // 5. POST 提交表单（不访问表单页面，直接提交）
      const response = await this.httpClient.post(endpoint, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${baseUrl}/dashboard/live/`,
          'Origin': baseUrl,
        },
        body: formParams.toString(),
        cookies: this.sessionManager.getCookies(),
        followRedirects: true,
      });

      this.sessionManager.updateCookies(response.cookies || []);

      // 6. 验证响应（表单提交通常返回页面导航）
      if (response.status >= 200 && response.status < 400) {
        const result: PostResult = {
          success: true,
          visitId: note.visitId,
          timestamp: new Date(),
          request: formData,
          response: response.body,
        };
        return result;
      }

      // 403 错误，提供更详细的信息
      if (response.status === 403) {
        const bodyPreview = typeof response.body === 'string'
          ? response.body.substring(0, 500)
          : JSON.stringify(response.body).substring(0, 500);
        
        throw new EMRAdapterError(
          `WellSky post visit note failed with 403 Forbidden. This may indicate:\n` +
          `1. CSRF token is invalid or expired\n` +
          `2. Session has expired\n` +
          `3. Missing required permissions\n` +
          `Response body: ${bodyPreview}\n` +
          `Request data: ${JSON.stringify(formData, null, 2)}`,
          ErrorType.Authentication,
          EMRType.WellSky,
          { 
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: bodyPreview,
            requestData: formData,
            csrfToken: csrfToken ? 'present' : 'missing'
          }
        );
      }

      throw new EMRAdapterError(
        `WellSky post visit note failed with status ${response.status} ${response.statusText}`,
        ErrorType.EMRSpecific,
        EMRType.WellSky,
        response
      );
    });
  }

  private extractCSRFToken(html: string | undefined): string | null {
    if (!html || typeof html !== 'string') {
      return null;
    }
    
    // 从 HTML 中提取 CSRF token
    // WellSky 使用 csrfmiddlewaretoken 字段名
    const csrfMatch = html.match(
      /<input[^>]*name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)["']/i
    );
    if (csrfMatch && csrfMatch[1]) {
      return csrfMatch[1];
    }

    // 也支持通用的 csrf_token 模式
    const genericMatch = html.match(
      /<input[^>]*name=["']csrf[_-]?token["'][^>]*value=["']([^"']+)["']/i
    );
    if (genericMatch && genericMatch[1]) {
      return genericMatch[1];
    }

    // 或者从 meta 标签提取
    const metaMatch = html.match(
      /<meta[^>]*name=["']csrf[_-]?token["'][^>]*content=["']([^"']+)["']/i
    );
    if (metaMatch && metaMatch[1]) {
      return metaMatch[1];
    }

    return null;
  }
}

