import { useCallback, useEffect, useRef, useState } from "react";

// Loads data with a loading and error state; refresh() reloads, pollMs reloads on a timer while the tab is visible.
// A reload keeps showing the previous data (no flash back to the skeleton).
export function useResource(load, { pollMs = 0, enabled = true, deps = [] } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const loadRef = useRef(load);
  loadRef.current = load;
  const alive = useRef(true);
  const runId = useRef(0);

  const run = useCallback(async () => {
    const id = ++runId.current;
    setState(s => ({ ...s, loading: true }));
    try {
      const data = await loadRef.current();
      if (alive.current && id === runId.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (alive.current && id === runId.current) setState(s => ({ data: s.data, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (enabled) run();
    return () => { alive.current = false; };
    // deps lets a caller reload when its inputs change (a filter, a tab): their length never changes between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  useEffect(() => {
    if (!pollMs || !enabled) return undefined;
    const timer = setInterval(() => { if (document.visibilityState !== "hidden") run(); }, pollMs);
    return () => clearInterval(timer);
  }, [pollMs, enabled, run]);

  return { ...state, refresh: run };
}
