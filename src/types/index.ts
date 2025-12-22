// EMR 类型枚举
export enum EMRType {
  WellSky = 'wellsky',
  AxisCare = 'axiscare',
  AlayaCare = 'alayacare',
}

// 错误类型
export enum ErrorType {
  Authentication = 'AUTHENTICATION',
  Network = 'NETWORK',
  Validation = 'VALIDATION',
  EMRSpecific = 'EMR_SPECIFIC',
}

// 认证相关
export interface Credentials {
  username: string;
  password: string;
  baseUrl?: string;
}

export interface Session {
  cookies: string[];
  tokens?: Record<string, string>;
  expiresAt?: Date;
}

// 重试配置
export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  retryableErrors: string[];
}

// 请求结果
export interface PostResult {
  success: boolean;
  visitId: string;
  timestamp: Date;
  request?: any;
  response?: any;
  error?: string;
}

// EMR 配置
export interface EMRConfig {
  baseUrl: string;
  timeout: number;
  retry: RetryConfig;
  [key: string]: any;
}

// 自定义错误类
export class EMRAdapterError extends Error {
  constructor(
    message: string,
    public type: ErrorType,
    public emrType: EMRType,
    public originalError?: any
  ) {
    super(message);
    this.name = 'EMRAdapterError';
  }
}

