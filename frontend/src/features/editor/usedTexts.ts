export type UsedText = readonly [key: string, fallback: string];

/**
 * Collects the texts a preview screen renders, in the order they first appear. Screens report texts while rendering,
 * so listeners are told in a microtask rather than during the render.
 */
export class UsedTexts {
  private readonly seen = new Map<string, string>();
  private snapshot: readonly UsedText[] = [];
  private readonly listeners = new Set<() => void>();
  private scheduled = false;

  readonly use = (key: string, fallback: string) => {
    if (this.seen.has(key)) return;
    this.seen.set(key, fallback);
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.snapshot = [...this.seen];
      this.listeners.forEach((listener) => listener());
    });
  };

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = () => this.snapshot;
}
