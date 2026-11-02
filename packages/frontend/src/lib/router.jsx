// A small client side router over the History API: the backend answers every page path with the app shell.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const RouterContext = createContext({ path: "/", navigate: () => {} });

export function RouterProvider({ children }) {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    if (to === window.location.pathname) return;
    window.history[replace ? "replaceState" : "pushState"](null, "", to);
    setPath(to);
    window.scrollTo?.(0, 0);
  }, []);
  const value = useMemo(() => ({ path, navigate }), [path, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export const useRouter = () => useContext(RouterContext);

export function Link({ to, children, onClick, ...rest }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={event => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
