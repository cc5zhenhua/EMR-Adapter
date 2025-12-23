// WellSkyAdapter - Adapter implementation for WellSky EMR

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

// WellSky specific request model (form fields)
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
      // 1. GET login page to get initial cookies and CSRF token
      const loginPageResponse = await this.httpClient.get(`${loginUrl}/?next=${nextUrl}`);
      this.sessionManager.updateCookies(loginPageResponse.cookies || []);

      // Extract CSRF token
      const csrfToken = this.extractCSRFToken(loginPageResponse.body);
      if (!csrfToken) {
        throw new EMRAdapterError(
          'Failed to extract CSRF token from login page',
          ErrorType.Authentication,
          EMRType.WellSky
        );
      }

      // 2. POST to /multilogin/ (AJAX request)
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

      // Validate multilogin response
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

      // 3. POST to /login/ to complete login (with timestamp parameter)
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

      // 4. Verify login status (302 redirect to dashboard)
      if (loginResponse.status === 302) {
        const location = loginResponse.headers['location'] || '';
        if (location.includes('/dashboard') || location.includes('/live')) {
          // Login successful, access dashboard to get complete session
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

      // Login failed
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
    // Format date as MM/DD/YYYY
    const formatDate = (date: Date): string => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    };

    // Prioritize shift from metadata, otherwise use visitId
    const shift = (note.metadata as any)?.shift || note.visitId;

    const request: WellSkyVisitNoteRequest = {
      carelog: '',
      shift: String(shift),
      unavailability: '',
      date: formatDate(note.visitDate),
      tags: note.metadata?.tags || '38060', // Default tag, can be overridden from metadata
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

      // 1. Always get the latest CSRF token from scheduling page (form submission requires latest token)
      // First try to get from session, if failed then get from page
      let csrfToken = this.sessionManager.getTokens().csrf;
      
      // Get the latest CSRF token from scheduling page
      const schedulingResponse = await this.httpClient.get(`${baseUrl}/scheduling/`, {
        cookies: this.sessionManager.getCookies(),
        headers: {
          'Referer': `${baseUrl}/dashboard/live/`,
        },
      });
      this.sessionManager.updateCookies(schedulingResponse.cookies || []);

      // Check if session is valid
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

      // 4. If still no token, throw error
      if (!csrfToken) {
        throw new EMRAdapterError(
          'Failed to obtain CSRF token. Please try logging in again.',
          ErrorType.Authentication,
          EMRType.WellSky
        );
      }

      // 2. Build form data
      const formData = this.transform(note);
      formData.csrfmiddlewaretoken = csrfToken;

      const formParams = new URLSearchParams();
      Object.entries(formData).forEach(([key, value]) => {
        formParams.append(key, value);
      });

      // 5. POST submit form (direct submission without accessing form page)
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

      // 6. Validate response (form submission usually returns page navigation)
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

      // 403 error, provide more detailed information
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
    
    // Extract CSRF token from HTML
    // WellSky uses csrfmiddlewaretoken field name
    const csrfMatch = html.match(
      /<input[^>]*name=["']csrfmiddlewaretoken["'][^>]*value=["']([^"']+)["']/i
    );
    if (csrfMatch && csrfMatch[1]) {
      return csrfMatch[1];
    }

    // Also support generic csrf_token pattern
    const genericMatch = html.match(
      /<input[^>]*name=["']csrf[_-]?token["'][^>]*value=["']([^"']+)["']/i
    );
    if (genericMatch && genericMatch[1]) {
      return genericMatch[1];
    }

    // Or extract from meta tag
    const metaMatch = html.match(
      /<meta[^>]*name=["']csrf[_-]?token["'][^>]*content=["']([^"']+)["']/i
    );
    if (metaMatch && metaMatch[1]) {
      return metaMatch[1];
    }

    return null;
  }
}

