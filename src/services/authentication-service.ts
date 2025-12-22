// AuthenticationService - 统一认证接口

import { AdapterFactory } from '../adapters/adapter-factory.js';
import { BaseAdapter } from '../adapters/base-adapter.js';
import {
  EMRType,
  type Credentials,
  type Session,
  EMRAdapterError,
  ErrorType,
} from '../types/index.js';

export class AuthenticationService {
  private adapter: BaseAdapter;

  constructor(emrType: EMRType) {
    this.adapter = AdapterFactory.create(emrType);
  }

  async authenticate(credentials: Credentials): Promise<Session> {
    try {
      const session = await this.adapter.authenticate(credentials);
      return session;
    } catch (error: any) {
      if (error instanceof EMRAdapterError) {
        throw error;
      }
      throw new EMRAdapterError(
        `Authentication failed: ${error.message}`,
        ErrorType.Authentication,
        this.adapter.getEMRType(),
        error
      );
    }
  }

  getAdapter(): BaseAdapter {
    return this.adapter;
  }
}

