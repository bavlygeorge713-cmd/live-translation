import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { LogoMark, RButton, RField } from "@/components/ui/redesign";
import { AuthContext } from "@/contexts/AuthContext";

type AuthState = "checking" | "authenticated" | "unauthenticated";

interface Props {
  children: React.ReactNode;
}

export function HostAuthGate({ children }: Props) {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/verify-session")
      .then((r) => {
        if (r.ok) setAuthState("authenticated");
        else setAuthState("unauthenticated");
      })
      .catch(() => setAuthState("unauthenticated"));
  }, []);

  const clearError = () => {
    if (loginError) setLoginError("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameRef.current?.value ?? "",
          password: passwordRef.current?.value ?? "",
        }),
      });
      if (res.ok) {
        setAuthState("authenticated");
      } else if (res.status === 429) {
        setLoginError(
          "Too many failed attempts. Please wait a few minutes and try again.",
        );
      } else if (res.status === 401) {
        setLoginError("Wrong username or password. Please try again.");
        if (passwordRef.current) {
          passwordRef.current.value = "";
          passwordRef.current.focus();
        }
      } else {
        setLoginError("Something went wrong. Please try again.");
      }
    } catch {
      setLoginError("Something went wrong. Please try again.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    setAuthState("unauthenticated");
    setLoginError("");
  };

  if (authState === "checking") {
    return (
      <div className="rd-page flex h-screen items-center justify-center bg-[#F4F7FB]">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="size-2.5 rounded-full bg-brand-500/50"
              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <div className="rd-page relative min-h-screen overflow-hidden bg-[#F4F7FB] px-5 py-8 text-slate-900">
        <div className="pointer-events-none absolute left-1/2 top-[-220px] size-[520px] -translate-x-1/2 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="relative mx-auto flex min-h-[calc(100vh-64px)] max-w-[1120px] items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-[420px] rounded-[22px] border border-slate-200 bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,.08)] sm:p-8"
          >
            <div className="mb-8 flex justify-center">
              <LogoMark />
            </div>
            <div className="mb-7 text-center">
              <h1 className="text-[25px] font-semibold tracking-[-0.035em] text-slate-950">
                Welcome back
              </h1>
              <p className="mt-2 text-[13px] leading-5 text-slate-500">
                Sign in to the host console to manage your live conference
                translation.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <RField
                ref={usernameRef}
                label="Username"
                type="text"
                autoComplete="username"
                placeholder="Enter your username"
                required
                onChange={clearError}
              />
              <RField
                ref={passwordRef}
                label="Password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                onChange={clearError}
              />

              {loginError && (
                <motion.p
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] leading-5 text-rose-700"
                >
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  {loginError}
                </motion.p>
              )}

              <RButton
                type="submit"
                variant="primary"
                size="lg"
                disabled={loggingIn}
                className="mt-2 w-full"
              >
                {loggingIn ? (
                  "Signing in…"
                ) : (
                  <>
                    Sign in <ArrowRight className="size-4" />
                  </>
                )}
              </RButton>
            </form>

            <div className="mt-7 flex items-center justify-center gap-2 text-[11px] font-medium text-slate-400">
              <ShieldCheck className="size-3.5" /> Secure conference translation
              platform
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Authenticated: provide logout via context so Header can render the button
  // in its own layout without any fixed/absolute positioning overlap.
  return (
    <AuthContext.Provider value={{ onLogout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}
