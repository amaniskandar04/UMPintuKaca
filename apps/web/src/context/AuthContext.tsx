import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ConfigDto, UserDto } from "@um-reviews/shared";
import { api, getToken, setAuthRefreshHandler, setToken } from "../lib/api";
import { applyAppTheme } from "../lib/theme";
import { getTelegram, openExternal } from "../lib/telegram";

type AuthStatus = "loading" | "ready" | "unauthenticated" | "error";

interface AuthContextValue {
  status: AuthStatus;
  user: UserDto | null;
  config: ConfigDto | null;
  error: string | null;
  token: string | null;
  refresh: () => Promise<void>;
  devLogin: () => Promise<void>;
  verify: () => Promise<void>;
  devVerify: () => Promise<void>;
  devUnverify: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserDto | null>(null);
  const [config, setConfig] = useState<ConfigDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    applyAppTheme(user?.theme);
  }, [user?.theme]);

  const applyAuth = useCallback((nextToken: string, nextUser: UserDto) => {
    setToken(nextToken);
    setTokenState(nextToken);
    setUser(nextUser);
    setError(null);
    setStatus("ready");
  }, []);

  // Sessions last 2 hours. When one expires mid-use, re-run the Telegram
  // handshake and let api.ts replay the failed request instead of erroring out.
  useEffect(() => {
    setAuthRefreshHandler(async () => {
      const telegram = getTelegram();
      if (!telegram?.initData) return null;
      try {
        const result = await api.init(telegram.initData);
        applyAuth(result.token, result.user);
        return result.token;
      } catch {
        return null;
      }
    });
    return () => setAuthRefreshHandler(null);
  }, [applyAuth]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const boot = async () => {
      try {
        const loadedConfig = await api.config();
        setConfig(loadedConfig);

        const telegram = getTelegram();
        if (telegram?.initData) {
          try {
            const result = await api.init(telegram.initData);
            applyAuth(result.token, result.user);
            return;
          } catch (caught) {
            if (!loadedConfig.devBypass) throw caught;
          }
        }

        const existingToken = getToken();
        if (existingToken) {
          try {
            const result = await api.me();
            setUser(result.user);
            setTokenState(existingToken);
            setStatus("ready");
            return;
          } catch {
            setToken(null);
            setTokenState(null);
          }
        }

        if (loadedConfig.devBypass) {
          setStatus("unauthenticated");
          return;
        }

        setError("Open this app from inside Telegram to continue.");
        setStatus("error");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not reach the server.");
        setStatus("error");
      }
    };

    void boot();
  }, [applyAuth]);

  const refresh = useCallback(async () => {
    const result = await api.me();
    setUser(result.user);
    setStatus("ready");
  }, []);

  const devLogin = useCallback(async () => {
    const result = await api.devInit();
    applyAuth(result.token, result.user);
  }, [applyAuth]);

  const verify = useCallback(async () => {
    if (!config?.googleEnabled) {
      throw new Error("Google verification is not configured yet. Ask the operator to set it up or use dev verification.");
    }
    const result = await api.googleStart();
    openExternal(result.authUrl);
  }, [config]);

  const devVerify = useCallback(async () => {
    const result = await api.devVerify();
    setUser(result.user);
  }, []);

  const devUnverify = useCallback(async () => {
    const result = await api.devUnverify();
    setUser(result.user);
  }, []);

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    setToken(null);
    setTokenState(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      config,
      error,
      token,
      refresh,
      devLogin,
      verify,
      devVerify,
      devUnverify,
      deleteAccount,
      logout
    }),
    [status, user, config, error, token, refresh, devLogin, verify, devVerify, devUnverify, deleteAccount, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
