// AdapterFactory - Factory pattern for creating adapters

import { BaseAdapter } from './base-adapter.js';
import { WellSkyAdapter } from './wellsky-adapter.js';
import { EMRType } from '../types/index.js';

export class AdapterFactory {
  static create(emrType: EMRType): BaseAdapter {
    switch (emrType) {
      case EMRType.WellSky:
        return new WellSkyAdapter();
      // Future EMR adapters can be added here
      // case EMRType.AxisCare:
      //   return new AxisCareAdapter();
      // case EMRType.AlayaCare:
      //   return new AlayaCareAdapter();
      default:
        throw new Error(`Unsupported EMR type: ${emrType}`);
    }
  }
}

