import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '../src/index.js';

describe('core package', () => {
  it('exports its version', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });
});
