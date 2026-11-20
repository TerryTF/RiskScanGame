import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Renders `children` in a separate React root inside this element. The preview needs its own router, query cache and
 * API client, and a router cannot be nested inside the app's router.
 */
export function IsolatedRoot({ children, className }: { children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<Root | null>(null);

  useLayoutEffect(() => {
    const container = document.createElement('div');
    host.current?.appendChild(container);
    const created = createRoot(container);
    root.current = created;
    return () => {
      root.current = null;
      // Unmounting synchronously while the outer root is committing is not allowed.
      setTimeout(() => {
        created.unmount();
        container.remove();
      });
    };
  }, []);

  useLayoutEffect(() => {
    root.current?.render(children);
  });

  return <div ref={host} className={className} />;
}
