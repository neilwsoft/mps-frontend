"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { fetchMe, loginRequest, registerRequest, type User } from "@/lib/api";

type AuthState = {
  user: User | null;
  token: string | null;
  status: "loading" | "ready";
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, name: string, password: string) => Promise<User>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "mps_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    status: "loading",
  });

  // Hydrate from localStorage. If the stored token is still valid the
  // server returns the user, otherwise we drop it on the floor.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!stored) {
      setState({ user: null, token: null, status: "ready" });
      return;
    }
    fetchMe(stored)
      .then((user) =>
        setState({ user, token: stored, status: "ready" }),
      )
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setState({ user: null, token: null, status: "ready" });
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginRequest(email, password);
    localStorage.setItem(TOKEN_KEY, res.token);
    setState({ user: res.user, token: res.token, status: "ready" });
    return res.user;
  }, []);

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      const res = await registerRequest(email, name, password);
      localStorage.setItem(TOKEN_KEY, res.token);
      setState({ user: res.user, token: res.token, status: "ready" });
      return res.user;
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ user: null, token: null, status: "ready" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout }),
    [state, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
