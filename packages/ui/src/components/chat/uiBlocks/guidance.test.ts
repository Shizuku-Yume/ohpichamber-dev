import { describe, expect, test } from 'bun:test';
import { UI_BLOCK_EXAMPLES, buildUiBlocksGuidance } from './guidance';
<<<<<<< HEAD
||||||| bc50ba56aa
import { UI_BLOCKS_GUIDANCE_PATH, renderUiBlocksGuidanceModule } from './guidanceModule';
=======
import { UI_BLOCKS_GUIDANCE_PATH } from './guidanceModule';
>>>>>>> upstream/main
import { parseUiBlock } from './catalog';

describe('UI block guidance', () => {
<<<<<<< HEAD
||||||| bc50ba56aa
  test('the server copy matches the catalog (run ui-blocks:generate after a catalog change)', () => {
    expect(readFileSync(UI_BLOCKS_GUIDANCE_PATH, 'utf8')).toBe(renderUiBlocksGuidanceModule(buildUiBlocksGuidance()));
  });

=======
  test('the server copy matches the catalog (run ui-blocks:generate after a catalog change)', async () => {
    const { UI_BLOCKS_GUIDANCE } = await import(UI_BLOCKS_GUIDANCE_PATH);
    expect(UI_BLOCKS_GUIDANCE).toBe(buildUiBlocksGuidance());
  });

>>>>>>> upstream/main
  test('every example the agent reads is a valid block', () => {
    for (const example of UI_BLOCK_EXAMPLES) {
      expect(buildUiBlocksGuidance()).toContain(example);
      expect(parseUiBlock(example, true).kind).toBe('ready');
    }
  });
});
