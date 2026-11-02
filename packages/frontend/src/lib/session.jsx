// Who is signed in and how far they got. status: loading | anon | pending (password done, next step in `next`) | full.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

const ANON = { status: "anon", next: null, user: null };

function toState(payload) {
  if (!payload?.user) return ANON;
  const full = payload.stage === "full" && !payload.next;
  return { status: full ? "full" : "pending", next: full ? null : payload.next ?? null, user: payload.user };
}

export function SessionProvider({ api, children, registerUnauthenticated }) {
  const [state, setState] = useState({ status: "loading", next: null, user: null });
  const [expired, setExpired] = useState(false);
  // Shown right after enrollment and kept until the owner confirms they saved the codes, even though the session is already complete.
  const [recoveryCodes, setRecoveryCodes] = useState(null);

  const refresh = useCallback(async () => {
    const payload = await api.get("/api/auth/session");
    setState(toState(payload));
    return payload;
  }, [api]);

  useEffect(() => { refresh().catch(() => setState(ANON)); }, [refresh]);
  useEffect(() => registerUnauthenticated?.(() => { setExpired(true); setState(ANON); }), [registerUnauthenticated]);

  const actions = useMemo(() => ({
    refresh,
    async login(email, password) { const payload = await api.post("/api/auth/login", { email, password }); setExpired(false); setState(toState(payload)); return payload; },
    async verifyCode(code) { const payload = await api.post("/api/auth/totp/verify", { code }); setState(toState(payload)); return payload; },
    async useRecoveryCode(code) { const payload = await api.post("/api/auth/recovery", { code }); setState(toState(payload)); return payload; },
    async changePassword(currentPassword, newPassword) { const payload = await api.post("/api/auth/change-password", { currentPassword, newPassword }); await refresh(); return payload; },
    enrollStart: () => api.post("/api/auth/totp/enroll/start"),
    async enrollConfirm(code) { const payload = await api.post("/api/auth/totp/enroll/confirm", { code }); setRecoveryCodes(payload.recoveryCodes); await refresh(); return payload; },
    finishRecovery() { setRecoveryCodes(null); },
    async logout() { try { await api.post("/api/auth/logout"); } finally { setState(ANON); setRecoveryCodes(null); await refresh().catch(() => {}); } },
  }), [api, refresh]);

  const value = useMemo(() => ({ ...state, expired, recoveryCodes, ...actions }), [state, expired, recoveryCodes, actions]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
