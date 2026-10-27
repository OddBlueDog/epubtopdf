import { useCallback, useEffect, useState } from "react";

const read = <T>(key: string, parse: (value: unknown) => T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return parse(raw === null ? undefined : JSON.parse(raw));
  } catch {
    return parse(undefined);
  }
};

/**
 * `useState` persisted to localStorage. Stored values are untrusted, so every read goes
 * through `parse`, which must return a valid value (falling back to a default).
 */
export const useLocalStorageState = <T>(
  key: string,
  parse: (value: unknown) => T,
): readonly [T, (next: T | ((previous: T) => T)) => void] => {
  const [value, setValue] = useState(() => read(key, parse));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage may be full or disabled (private mode); persistence is best-effort.
    }
  }, [key, value]);

  const update = useCallback((next: T | ((previous: T) => T)) => {
    setValue(next);
  }, []);

  return [value, update] as const;
};
