interface Debounced<Args extends readonly unknown[]> {
  (...args: Args): void;
  cancel: () => void;
}

export const debounce = <Args extends readonly unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): Debounced<Args> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: Args): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };
  debounced.cancel = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
};
