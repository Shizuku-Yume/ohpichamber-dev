import { describe, expect, it } from 'vitest';
import { parseServeCliOptions } from '../server-frame/cli-options.js';

describe('parseServeCliOptions UI password environment', () => {
  it('uses the OpenChamber environment variable', () => {
    const options = parseServeCliOptions({ env: { OPENCHAMBER_UI_PASSWORD: 'current-secret' } });

    expect(options.uiPassword).toBe('current-secret');
  });

  it('does not accept the retired OpenCode environment variable', () => {
    const options = parseServeCliOptions({ env: { OPENCODE_UI_PASSWORD: 'legacy-secret' } });

    expect(options.uiPassword).toBeNull();
  });
});
