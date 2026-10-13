import { useEffect, useState } from "react";

export function scheduleDebounce<T>(value: T, delay: number, commit: (value: T) => void) {
  const timer = setTimeout(() => commit(value), delay);
  return () => clearTimeout(timer);
}

export function useDebouncedValue(value: string, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => scheduleDebounce(value, delay, setSettled), [value, delay]);
  // Clearing the search should restore the list immediately.
  return value === "" ? value : settled;
}
