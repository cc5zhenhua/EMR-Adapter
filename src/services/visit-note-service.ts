// VisitNoteService - 业务逻辑编排层

import { AdapterFactory } from '../adapters/adapter-factory.js';
import { BaseAdapter } from '../adapters/base-adapter.js';
import {
  EMRType,
  type PostResult,
  EMRAdapterError,
  ErrorType,
} from '../types/index.js';
import type { VisitNote } from '../models/canonical.js';

export class VisitNoteService {
  private adapter: BaseAdapter;

  private emrType: EMRType;

  constructor(emrType: EMRType) {
    this.emrType = emrType;
    this.adapter = AdapterFactory.create(emrType);
  }

  async postVisitNote(note: VisitNote): Promise<PostResult> {
    // 1. 验证输入
    this.validateVisitNote(note);

    try {
      // 2. 调用 adapter
      const result = await this.adapter.postVisitNote(note);

      // 3. 统一错误处理已在 adapter 中完成
      // 4. 日志记录（可以在这里添加）
      this.logResult(result);

      return result;
    } catch (error: any) {
      if (error instanceof EMRAdapterError) {
        throw error;
      }
      throw new EMRAdapterError(
        `Failed to post visit note: ${error.message}`,
        (error as any).type || ErrorType.EMRSpecific,
        this.emrType,
        error
      );
    }
  }

  private validateVisitNote(note: VisitNote): void {
    if (!note.visitId) {
      throw new Error('visitId is required');
    }
    if (!note.patientId) {
      throw new Error('patientId is required');
    }
    if (!note.caregiverId) {
      throw new Error('caregiverId is required');
    }
    if (!note.note) {
      throw new Error('note content is required');
    }
    if (!note.visitDate) {
      throw new Error('visitDate is required');
    }
  }

  private logResult(result: PostResult): void {
    // 简单的控制台日志，可以替换为更完善的日志系统
    console.log(`Visit note posted: ${result.visitId} at ${result.timestamp}`);
    if (!result.success) {
      console.error(`Error: ${result.error}`);
    }
  }

  getAdapter(): BaseAdapter {
    return this.adapter;
  }
}

