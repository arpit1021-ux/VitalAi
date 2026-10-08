import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A preview URL for a picked file that cleans up after itself.
 *
 * `URL.createObjectURL` pins the file in memory until the URL is revoked, and
 * nothing revokes it for you. The scanner screens called it on every pick, so
 * photographing five labels in a row held five images — some of them several
 * megabytes — for as long as the tab was open. Replacing a file or leaving the
 * screen releases the previous one here.
 */
export function useObjectUrl(): [string | null, (file: File | null) => void] {
  const [url, setUrl] = useState<string | null>(null);
  const current = useRef<string | null>(null);

  const setFile = useCallback((file: File | null) => {
    if (current.current) URL.revokeObjectURL(current.current);
    const next = file ? URL.createObjectURL(file) : null;
    current.current = next;
    setUrl(next);
  }, []);

  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current);
      current.current = null;
    },
    [],
  );

  return [url, setFile];
}
