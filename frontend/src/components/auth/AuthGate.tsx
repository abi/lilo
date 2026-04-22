import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { fetchSessionStatus, loginWithPassword, onAuthRequired } from "../../lib/auth";

interface AuthGateProps {
  children: ReactNode;
}

type AuthState = "checking" | "authenticated" | "unauthenticated";

export function AuthGate({ children }: AuthGateProps) {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authEnabled, setAuthEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await fetchSessionStatus();
        setAuthEnabled(session.enabled);
        setAuthState(
          !session.enabled || session.authenticated ? "authenticated" : "unauthenticated",
        );
      } catch (sessionError) {
        setAuthEnabled(true);
        setAuthState("unauthenticated");
        setError(
          sessionError instanceof Error ? sessionError.message : "Failed to check session",
        );
      }
    };

    void loadSession();
    return onAuthRequired(() => {
      setAuthEnabled(true);
      setAuthState("unauthenticated");
      setPassword("");
    });
  }, []);

  if (authState === "checking") {
    return (
      <div className="flex h-dvh items-center justify-center bg-neutral-50 text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
        <p className="text-sm">Checking session...</p>
      </div>
    );
  }

  if (!authEnabled || authState === "authenticated") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#f5f5f5,white_55%)] px-4 dark:bg-[radial-gradient(circle_at_top,#171717,#0a0a0a_55%)]">
      <form
        className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.08)] dark:border-neutral-800 dark:bg-neutral-900"
        onSubmit={(event) => {
          event.preventDefault();
          if (submitting) {
            return;
          }

          setSubmitting(true);
          setError(null);
          void loginWithPassword(password)
            .then(() => {
              setAuthState("authenticated");
              setPassword("");
            })
            .catch((loginError) => {
              setError(
                loginError instanceof Error ? loginError.message : "Login failed",
              );
            })
            .finally(() => setSubmitting(false));
        }}
      >
        <div className="mb-6">
          <p className="font-heading text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Lilo
          </p>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Enter your password to open this instance.
          </p>
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-neutral-400">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-base text-neutral-900 outline-none transition focus:border-neutral-400 focus:bg-white dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500"
            autoFocus
          />
        </label>

        {error ? (
          <p className="mt-3 text-sm text-red-500">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || password.trim().length === 0}
          className="mt-5 flex w-full items-center justify-center rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {submitting ? "Signing in..." : "Unlock"}
        </button>
      </form>
    </div>
  );
}

