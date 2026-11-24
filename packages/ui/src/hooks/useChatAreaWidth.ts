import React from 'react';

export const useChatAreaWidth = <T>(
  pick: (width: number) => T,
  isEqual: (a: T, b: T) => boolean,
  remeasureKey?: boolean,
) => {
  const [rowNode, setRowNode] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<T | null>(null);
  const rowRef = React.useCallback((node: HTMLDivElement | null) => { setRowNode(node); }, []);
  const measuredRef = React.useRef<number | null>(null);
  const pickRef = React.useRef(pick);
  pickRef.current = pick;

  const applyWidth = React.useCallback((measured: number) => {
    measuredRef.current = measured;
    const next = pickRef.current(measured);
    setWidth((previous) => (previous !== null && isEqual(previous, next) ? previous : next));
  }, [isEqual]);

  React.useEffect(() => {
    const ResizeObserverConstructor = globalThis.ResizeObserver;
    if (!rowNode || !ResizeObserverConstructor) return undefined;

    const element = rowNode.closest<HTMLElement>('[data-chat-area]') ?? rowNode;
    applyWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserverConstructor((entries) => {
      const entry = entries[0];
      if (!entry) return;
      applyWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [applyWidth, rowNode]);

  React.useLayoutEffect(() => {
    if (measuredRef.current !== null) applyWidth(measuredRef.current);
  }, [applyWidth, pick, remeasureKey]);

  return { rowRef, width };
};
