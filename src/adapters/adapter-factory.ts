// AdapterFactory - 工厂模式创建适配器

import { BaseAdapter } from './base-adapter.js';
import { WellSkyAdapter } from './wellsky-adapter.js';
import { EMRType } from '../types/index.js';

export class AdapterFactory {
  static create(emrType: EMRType): BaseAdapter {
    switch (emrType) {
      case EMRType.WellSky:
        return new WellSkyAdapter();
      // 未来可以添加其他 EMR
      // case EMRType.AxisCare:
      //   return new AxisCareAdapter();
      // case EMRType.AlayaCare:
      //   return new AlayaCareAdapter();
      default:
        throw new Error(`Unsupported EMR type: ${emrType}`);
    }
  }
}

