<<<<<<< HEAD
import { beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { sanitizeSvg } from './sanitizeSvg';

beforeAll(() => {
  const browser = new Window();
  globalThis.DOMParser = browser.DOMParser as unknown as typeof DOMParser;
  globalThis.XMLSerializer = browser.XMLSerializer as unknown as typeof XMLSerializer;
});
describe('MarkdownSvg sanitizeSvg strict allowlist', () => {
  const prefix = 'test-prefix';

  test('blocks <script> tags and executes no javascript', () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
      <script>alert("xss")</script>
      <rect width="10" height="10" fill="red"/>
    </svg>`;
    const result = sanitizeSvg(malicious, prefix);
    expect(result.svg).not.toBeNull();
    expect(result.svg).not.toContain('<script');
    expect(result.svg).not.toContain('alert');
    expect(result.svg).toContain('<rect');
  });

  test('blocks <foreignObject> tags and embedded HTML', () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
      <foreignObject width="100" height="100">
        <body xmlns="http://www.w3.org/1999/xhtml">
          <iframe src="https://evil.com"></iframe>
        </body>
      </foreignObject>
      <circle cx="5" cy="5" r="5"/>
    </svg>`;
    const result = sanitizeSvg(malicious, prefix);
    expect(result.svg).not.toBeNull();
    expect(result.svg).not.toContain('foreignObject');
    expect(result.svg).not.toContain('iframe');
    expect(result.svg).toContain('<circle');
  });

  test('blocks <style> tags preventing global CSS escape', () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
      <style>body { background: red; } @import url("https://evil.com/style.css");</style>
      <line x1="0" y1="0" x2="10" y2="10"/>
    </svg>`;
    const result = sanitizeSvg(malicious, prefix);
    expect(result.svg).not.toBeNull();
    expect(result.svg).not.toContain('<style');
    expect(result.svg).not.toContain('evil.com');
  });

  test('blocks animation tags mutating attributes', () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect width="10" height="10">
        <animate attributeName="href" values="javascript:alert(1)"/>
        <set attributeName="xlink:href" to="https://evil.com"/>
      </rect>
    </svg>`;
    const result = sanitizeSvg(malicious, prefix);
    expect(result.svg).not.toBeNull();
    expect(result.svg).not.toContain('<animate');
    expect(result.svg).not.toContain('<set');
  });

  test('strips inline on* event handlers', () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
      <circle cx="5" cy="5" r="5" onclick="alert(2)" onerror="alert(3)"/>
    </svg>`;
    const result = sanitizeSvg(malicious, prefix);
    expect(result.svg).not.toBeNull();
    expect(result.svg).not.toContain('onload');
    expect(result.svg).not.toContain('onclick');
    expect(result.svg).not.toContain('onerror');
    expect(result.svg).not.toContain('alert');
  });

  test('strips external, data, blob, and javascript URLs from href and xlink:href', () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
      <use href="https://evil.com/icon.svg#test"/>
      <use xlink:href="javascript:alert(1)"/>
      <use href="data:image/svg+xml;base64,PHN2Zz4="/>
      <use href="blob:https://example.com/uuid"/>
    </svg>`;
    const result = sanitizeSvg(malicious, prefix);
    expect(result.svg).not.toBeNull();
    expect(result.svg).not.toContain('evil.com');
    expect(result.svg).not.toContain('javascript');
    expect(result.svg).not.toContain('data:');
    expect(result.svg).not.toContain('blob:');
  });

  test('strips presentation attributes pointing to external url(...) or undefined fragments', () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect width="10" height="10" fill="url(https://evil.com/grad)" stroke="url(#outside)"/>
    </svg>`;
    const result = sanitizeSvg(malicious, prefix);
    expect(result.svg).not.toBeNull();
    expect(result.svg).not.toContain('evil.com');
    expect(result.svg).not.toContain('url(https://');
    expect(result.svg).not.toContain('url(#outside)');
  });

  test('scopes local defined IDs and allows local url(#id) and use href="#id"', () => {
    const valid = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad1">
          <stop offset="0%" stop-color="red"/>
          <stop offset="100%" stop-color="blue"/>
        </linearGradient>
        <rect id="my-rect" width="20" height="20"/>
      </defs>
      <rect width="100" height="100" fill="url(#grad1)"/>
      <use href="#my-rect" x="10" y="10"/>
    </svg>`;
    const result = sanitizeSvg(valid, prefix);
    expect(result.svg).not.toBeNull();
    expect(result.svg).toContain(`id="${prefix}-grad1"`);
    expect(result.svg).toContain(`id="${prefix}-my-rect"`);
    expect(result.svg).toContain(`fill="url(#${prefix}-grad1)"`);
    expect(result.svg).toContain(`href="#${prefix}-my-rect"`);
  });
  test('blocks backslash escapes and comments in URL-capable presentation attributes', () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect width="10" height="10" fill="u\\72l(https://evil.com)" stroke="\\75rl(https://evil.com)" filter="url(/* comment */ https://evil.com)"/>
    </svg>`;
    const result = sanitizeSvg(malicious, prefix);
    expect(result.svg).not.toBeNull();
    expect(result.svg).not.toContain('evil.com');
    expect(result.svg).not.toContain('fill=');
    expect(result.svg).not.toContain('stroke=');
    expect(result.svg).not.toContain('filter=');
  });

  test('rejects non-SVG root namespaces like XHTML', () => {
    const malicious = `<svg xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></svg>`;
    const result = sanitizeSvg(malicious, prefix);
    expect(result.svg).toBeNull();
    expect(result.error).toContain('SVG namespace');
  });

  test('strips descendant elements in non-SVG namespaces', () => {
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
      <html:div xmlns:html="http://www.w3.org/1999/xhtml"><script>alert(1)</script></html:div>
      <rect width="10" height="10"/>
    </svg>`;
    const result = sanitizeSvg(malicious, prefix);
    expect(result.svg).not.toBeNull();
    expect(result.svg).not.toContain('html:div');
    expect(result.svg).not.toContain('script');
    expect(result.svg).toContain('<rect');
  });

  test('rejects malformed XML without crashing', () => {
    const broken = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10"`;
    const result = sanitizeSvg(broken, prefix);
    expect(result.svg).toBeNull();
    expect(result.error).toBeDefined();
  });
});
||||||| bc50ba56aa
=======
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { MarkdownSvg } from './MarkdownSvg';

let root: Root;
let host: HTMLElement;
let dom: Window;

beforeEach(() => {
  dom = new Window({ url: 'https://app.test' });
  Object.assign(globalThis, { window: dom, document: dom.document, HTMLElement: dom.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); });

const draw = (code: string) => act(() => { root.render(<MarkdownSvg code={code} language="svg" isIncomplete={false} />); });

describe('MarkdownSvg', () => {
  test('draws the source as a data image', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><text>a&b</text></svg>';
    draw(source);
    const img = host.querySelector('img');
    expect(img).not.toBeNull();
    const src = img?.getAttribute('src') ?? '';
    expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(src.slice(src.indexOf(',') + 1))).toBe(source);
    expect(host.querySelector('svg')).toBeNull();
  });

  test('keeps the source on the wrapper for selection copy', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><text>a&b</text></svg>';
    draw(source);
    expect(host.querySelector('[data-streamdown="svg-block"]')?.getAttribute('data-oc-svg-source')).toBe(source);
  });
});
>>>>>>> upstream/main
