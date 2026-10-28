import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, configProblem, normalizeConfig } from '../src/config.js';

describe('embedded config', () => {
  it('does not require an external daemon token in embedded mode', () => {
    const config = normalizeConfig({ embedded: true, worker: false });
    expect(config.embedded).toBe(true);
    expect(config.uiBase).toBe('/code-review');
    expect(configProblem(config)).toBeUndefined();
  });

  it('still requires a token in external mode', () => {
    const config = normalizeConfig({ embedded: false, token: '' });
    expect(configProblem(config)).toBe('token must be at least 32 characters');
  });

  it('ignores external daemon URL and token rules in embedded mode', () => {
    const config = normalizeConfig({ embedded: true, daemonUrl: 'not-a-url', token: '' });
    expect(config.embedded).toBe(true);
    expect(configProblem(config)).toBeUndefined();
  });

  it('defaults to external mode and normalizes the embedded fields', () => {
    expect(DEFAULT_CONFIG.embedded).toBe(false);
    expect(DEFAULT_CONFIG.uiBase).toBe('/code-review');

    const config = normalizeConfig({
      embedded: false,
      uiBase: ' /code-review/ ',
      storeDir: '  /tmp/reviews  ',
    });
    expect(config.embedded).toBe(false);
    expect(config.uiBase).toBe('/code-review');
    expect(config.storeDir).toBe('/tmp/reviews');
  });

  it('omits an empty storeDir so the embedded controller can default it', () => {
    expect(normalizeConfig({ embedded: true, storeDir: '   ' }).storeDir).toBeUndefined();
  });
});
