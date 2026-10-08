import { useEffect, useState } from 'react';

/**
 * A value that settles before anything acts on it.
 *
 * Search boxes here are query keys, so without this every keystroke is a
 * request: typing "paneer" fired six, five of which were obsolete before they
 * returned. The delay is long enough to cover ordinary typing and short enough
 * that it does not read as lag.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
