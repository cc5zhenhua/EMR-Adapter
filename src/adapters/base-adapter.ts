// BaseAdapter - 抽象基类，定义所有 EMR Adapter 的通用接口

import {
  type Credentials,
  type Session,
  type PostResult,
  type EMRType,
  EMRAdapterError,
  ErrorType,
} from '../types/index.js';
import type { VisitNote } from '../models/canonical.js';
import { HTTPClient } from '../transport/http-client.js';
import { SessionManager } from '../transport/session-manager.js';
import { RetryHandler } from '../transport/retry-handler.js';

export abstract class BaseAdapter {
  protected httpClient: HTTPClient;
  protected sessionManager: SessionManager;
  protected retryHandler: RetryHandler;

  constructor() {
    this.httpClient = new HTTPClient();
    this.sessionManager = new SessionManager();
    this.retryHandler = new RetryHandler({
      maxAttempts: 3,
      backoffMs: 1000,
      retryableErrors: ['timeout', 'network', 'ECONNREFUSED'],
    });
  }

  // 抽象方法 - 必须由子类实现
  abstract authenticate(credentials: Credentials): Promise<Session>;
  abstract postVisitNote(note: VisitNote): Promise<PostResult>;
  abstract transform(note: VisitNote): any;

  // 通用方法 - 可在基类中实现
  protected async handleRetry<T>(fn: () => Promise<T>): Promise<T> {
    return this.retryHandler.execute(fn, (error: any) => {
      // 默认重试策略：网络错误和 5xx 错误可重试
      if (RetryHandler.isNetworkError(error)) {
        return true;
      }
      if (error?.status && RetryHandler.isServerError(error.status)) {
        return true;
      }
      return false;
    });
  }

  protected validateResponse(response: any): void {
    if (!response) {
      throw new EMRAdapterError(
        'Empty response from EMR',
        ErrorType.Network,
        this.getEMRType()
      );
    }

    if (response.status >= 400) {
      const errorType = RetryHandler.isAuthError(response.status)
        ? ErrorType.Authentication
        : ErrorType.EMRSpecific;

      throw new EMRAdapterError(
        `EMR request failed: ${response.status} ${response.statusText}`,
        errorType,
        this.getEMRType(),
        response
      );
    }
  }

  abstract getEMRType(): EMRType;

  protected getSession(): Session | null {
    return this.sessionManager.getSession();
  }

  isAuthenticated(): boolean {
    const session = this.getSession();
    return session !== null && !this.sessionManager.isExpired();
  }
}

