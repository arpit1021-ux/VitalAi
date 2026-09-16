import { useEffect, useState, type ReactNode } from 'react';

interface DelayedLoadProps {
  children: ReactNode;
  /**
   * How long to wait before showing anything. The blueprint's first band says
   * a request that resolves under a second gets no loader at all: a spinner
   * that appears and vanishes in 200 ms reads as a glitch, not as progress.
   */
  delayMs?: number;
}

/** Renders nothing until `delayMs` has passed, then renders its children. */
export function DelayedLoad({ children, delayMs = 600 }: DelayedLoadProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return visible ? <>{children}</> : null;
}
