import { describe, expect, test } from 'bun:test';
import { UI_BLOCK_EXAMPLES, buildUiBlocksGuidance } from './guidance';
import { UI_BLOCKS_GUIDANCE_PATH, renderUiBlocksGuidanceModule } from './guidanceModule';
import { parseUiBlock } from './catalog';

describe('UI block guidance', () => {
  test('the native tool guidance matches the catalog (run ui-blocks:generate after a catalog change)', async () => {
    const { UI_BLOCKS_GUIDANCE } = await import(UI_BLOCKS_GUIDANCE_PATH);
    expect(UI_BLOCKS_GUIDANCE).toBe(buildUiBlocksGuidance());
  });

  test.each(['', 'A "quoted" line\nwith another line', '`${notCode}`\nexport const other = true;'])('generated guidance is a string literal: %j', async (text) => {
    const source = renderUiBlocksGuidanceModule(text);
    const generated = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    expect(generated.UI_BLOCKS_GUIDANCE).toBe(text);
    expect(Object.keys(generated)).toEqual(['UI_BLOCKS_GUIDANCE']);
  });

  test('every example the agent reads is a valid block', () => {
    for (const example of UI_BLOCK_EXAMPLES) {
      expect(buildUiBlocksGuidance()).toContain(example);
      expect(parseUiBlock(example, true).kind).toBe('ready');
    }
  });
});
