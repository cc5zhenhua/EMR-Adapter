// RetryHandler - 处理重试逻辑

import type { RetryConfig, ErrorType } from '../types/index.js';

export class RetryHandler {
  private config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  async execute<T>(
    fn: () => Promise<T>,
    isRetryableError?: (error: any) => boolean
  ): Promise<T> {
    let lastError: any;
    let attempt = 0;

    while (attempt < this.config.maxAttempts) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        attempt++;

        // 检查是否应该重试
        if (attempt >= this.config.maxAttempts) {
          break;
        }

        // 检查错误是否可重试
        if (isRetryableError && !isRetryableError(error)) {
          throw error;
        }

        // 检查错误类型是否在可重试列表中
        const errorMessage = error?.message || String(error);
        const shouldRetry = this.config.retryableErrors.some(pattern =>
          errorMessage.includes(pattern)
        );

        if (!shouldRetry && !isRetryableError) {
          throw error;
        }

        // 等待后重试（指数退避）
        const delay = this.config.backoffMs * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static isNetworkError(error: any): boolean {
    return (
      error?.message?.includes('timeout') ||
      error?.message?.includes('network') ||
      error?.message?.includes('ECONNREFUSED') ||
      error?.message?.includes('ENOTFOUND')
    );
  }

  static isServerError(status: number): boolean {
    return status >= 500 && status < 600;
  }

  static isAuthError(status: number): boolean {
    return status === 401 || status === 403;
  }
}

