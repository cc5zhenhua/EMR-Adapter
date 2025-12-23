// SessionManager - 管理 cookies 和会话

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Session } from '../types/index.js';

export class SessionManager {
  private session: Session | null = null;
  private sessionFilePath: string | null = null;

  setSession(session: Session): void {
    this.session = session;
  }

  getSession(): Session | null {
    return this.session;
  }

  getCookies(): string[] {
    return this.session?.cookies || [];
  }

  getTokens(): Record<string, string> {
    return this.session?.tokens || {};
  }

  updateCookies(cookies: string[]): void {
    if (this.session) {
      // 合并新 cookies，避免重复
      const existingCookies = new Map<string, string>();
      
      // 解析现有 cookies
      this.session.cookies.forEach(cookie => {
        const [name] = cookie.split('=');
        if (name) {
          existingCookies.set(name, cookie);
        }
      });

      // 添加/更新新 cookies
      cookies.forEach(cookie => {
        const [name] = cookie.split('=');
        if (name) {
          existingCookies.set(name, cookie);
        }
      });

      this.session.cookies = Array.from(existingCookies.values());
    } else {
      this.session = {
        cookies,
        tokens: {},
      };
    }
  }

  updateTokens(tokens: Record<string, string>): void {
    if (this.session) {
      this.session.tokens = {
        ...this.session.tokens,
        ...tokens,
      };
    } else {
      this.session = {
        cookies: [],
        tokens,
      };
    }
  }

  clearSession(): void {
    this.session = null;
  }

  isExpired(): boolean {
    if (!this.session?.expiresAt) {
      return false;
    }
    return new Date() >= this.session.expiresAt;
  }

  setSessionFilePath(path: string): void {
    this.sessionFilePath = path;
  }

  saveSession(): void {
    if (!this.session || !this.sessionFilePath) {
      return;
    }

    try {
      const data = {
        ...this.session,
        expiresAt: this.session.expiresAt?.toISOString(),
      };
      writeFileSync(this.sessionFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      // 静默失败，不影响主流程
      console.warn(`Failed to save session: ${error}`);
    }
  }

  loadSession(): Session | null {
    if (!this.sessionFilePath || !existsSync(this.sessionFilePath)) {
      return null;
    }

    try {
      const data = JSON.parse(readFileSync(this.sessionFilePath, 'utf-8'));
      const session: Session = {
        cookies: data.cookies || [],
        tokens: data.tokens || {},
        ...(data.expiresAt && { expiresAt: new Date(data.expiresAt) }),
      };

      // 检查是否过期
      if (this.isExpiredForSession(session)) {
        return null;
      }

      this.session = session;
      return session;
    } catch (error) {
      // 文件损坏或格式错误，返回 null
      return null;
    }
  }

  private isExpiredForSession(session: Session): boolean {
    if (!session.expiresAt) {
      return false;
    }
    return new Date() >= session.expiresAt;
  }

  clearSessionFile(): void {
    if (this.sessionFilePath && existsSync(this.sessionFilePath)) {
      try {
        writeFileSync(this.sessionFilePath, '', 'utf-8');
      } catch (error) {
        // 静默失败
      }
    }
    this.session = null;
  }
}

// 辅助函数：获取 session 文件路径
export function getSessionFilePath(emrType: string, baseDir: string = process.cwd()): string {
  return join(baseDir, `.session-${emrType}.json`);
}

