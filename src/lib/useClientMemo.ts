'use client'

import { useRef, useSyncExternalStore } from 'react'

// useSyncExternalStore never resubscribes for these values (they derive from
// browser-only state read on demand), so a no-op subscribe is correct.
const noopSubscribe = () => () => {}

/**
 * Hydration-safe, client-only memo.
 *
 * Returns `fallback` during SSR and the first client (hydration) render, then
 * `compute()` once mounted — recomputed whenever `key` changes. This replaces
 * the `useEffect(() => setState(compute()), …)` pattern for values derived from
 * browser-only state (localStorage, window), which the React hooks lint flags as
 * a synchronous setState in an effect and which can also cause a hydration
 * mismatch. `useSyncExternalStore` is the supported primitive for this: the
 * server snapshot (`fallback`) matches the HTML, then React swaps in the live
 * value after hydration.
 *
 * `compute` is read through a key-cached snapshot so its reference stays stable
 * across renders (a fresh object every call would make useSyncExternalStore loop).
 */
export function useClientMemo<T>(key: string, compute: () => T, fallback: T): T {
  const cache = useRef<{ key: string; value: T } | null>(null)
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      if (!cache.current || cache.current.key !== key) {
        cache.current = { key, value: compute() }
      }
      return cache.current.value
    },
    () => fallback,
  )
}
