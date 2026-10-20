import { spyOn } from 'bun:test';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });

/**
 * Other settings suites install their own happy-dom Window on `globalThis`.
 * Re-installing this suite's realm before a test, and before dispatching DOM
 * events, keeps the rendered nodes and the global constructors (`HTMLElement`
 * in the shared autosave target check) in the same realm.
 */
export const installTestDomGlobals = (): void => {
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    localStorage: browser.localStorage,
    sessionStorage: browser.sessionStorage,
    Node: browser.Node,
    Element: browser.Element,
    HTMLElement: browser.HTMLElement,
    HTMLInputElement: browser.HTMLInputElement,
    HTMLTextAreaElement: browser.HTMLTextAreaElement,
    Event: browser.Event,
    FocusEvent: browser.FocusEvent,
    CustomEvent: browser.CustomEvent,
    MutationObserver: browser.MutationObserver,
    ResizeObserver: browser.ResizeObserver,
    getComputedStyle: browser.getComputedStyle.bind(browser),
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
};

installTestDomGlobals();

export const testBrowser = browser;
export const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ home: '/test' }));
