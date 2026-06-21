import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LogOut, Globe } from "lucide-react";

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
        setLoginError("Too many failed attempts. Please wait a few minutes.");
      } else {
        setLoginError("Invalid credentials.");
        if (passwordRef.current) passwordRef.current.value = "";
      }
    } catch {
      setLoginError("Network error. Please try again.");
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
      <div className="h-screen bg-[#08080f] flex items-center justify-center">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="size-2.5 rounded-full bg-blue-500/40"
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
      <div className="h-screen bg-[#08080f] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center border border-white/10">
              <Globe className="size-6 text-blue-400" />
            </div>
            <h1 className="text-white text-xl font-semibold">Host Access</h1>
            <p className="text-slate-500 text-sm text-center">
              Sign in to manage your conference room
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              ref={usernameRef}
              type="text"
              autoComplete="username"
              placeholder="Username"
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                placeholder-slate-600 text-sm outline-none focus:border-blue-500/50 transition-colors"
            />
            <input
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                placeholder-slate-600 text-sm outline-none focus:border-blue-500/50 transition-colors"
            />

            {loginError && (
              <p className="text-red-400 text-xs px-1">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="mt-1 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900
                text-white font-medium rounded-xl py-3 text-sm transition-colors"
            >
              {loggingIn ? "Signing in…" : "Log in"}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      {children}
      {/* Floating logout — unobtrusive, fixed top-right */}
      <div className="fixed top-3 right-3 z-50">
        <button
          onClick={handleLogout}
          title="Log out"
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full
            bg-white/5 border border-white/10 text-slate-500
            hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-colors"
        >
          <LogOut className="size-3" />
          <span>Log out</span>
        </button>
      </div>
    </>
  );
}
