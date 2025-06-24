import { useRef, useEffect } from 'react';

/**
 * Custom hook for getting the previous value of a prop or state.
 * @param value The value to track.
 * @returns The value from the previous render.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
} 