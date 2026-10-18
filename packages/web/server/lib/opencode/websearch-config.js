import {
  AGENT_SCOPE,
  getJsonWriteTarget,
  readConfigLayers,
  writeConfig,
} from './shared.js';
import { writeWarmingEnabled } from './config-v2.js';

/**
 * Turns session warming on or off in the watched OpenCode user config.
 */
export function setWarmingEnabled(enabled) {
  const layers = readConfigLayers(null);
  const target = getJsonWriteTarget(layers, AGENT_SCOPE.USER);
  const changed = writeWarmingEnabled(target.config, enabled);
  if (changed) writeConfig(target.config, target.path);
  return { path: target.path, changed };
}

