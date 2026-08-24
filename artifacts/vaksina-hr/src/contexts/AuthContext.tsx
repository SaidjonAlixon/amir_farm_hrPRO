import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, useGetMe, type User } from '@workspace/api-client-react';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  /** Face ID / akkaunt almashtirish — eski cache tozalanadi, yangi profil ochiladi */
  switchToUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  setUser: () => {},
  switchToUser: () => {},
});

const AUTH_LOAD_TIMEOUT_MS = 8_000;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  /** Login/logout dan kelgan darhol holat; undefined = server javobiga tayanish */
  const [overrideUser, setOverrideUser] = useState<User | null | undefined>(undefined);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  const { data, isPending, isFetching, isError, isSuccess, status } = useGetMe({
    query: {
      retry: (count, err) => {
        const statusCode = (err as { status?: number } | undefined)?.status;
        if (statusCode === 401 || statusCode === 403 || statusCode === 204) return false;
        return count < 1;
      },
      retryDelay: 400,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });

  // /auth/me osilib qolsa — doimiy "Yuklanmoqda" emas
  useEffect(() => {
    if (overrideUser !== undefined || isSuccess || isError) return;
    const t = window.setTimeout(() => setLoadTimedOut(true), AUTH_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [overrideUser, isSuccess, isError]);

  // Serverdan kelgan user bilan sync (F5 / yangilash)
  useEffect(() => {
    if (isSuccess && data) {
      setOverrideUser(undefined);
    }
  }, [isSuccess, data]);

  const setUser = useCallback(
    (next: User | null) => {
      setOverrideUser(next);
      setLoadTimedOut(false);
      if (next) {
        queryClient.setQueryData(getGetMeQueryKey(), next);
      } else {
        queryClient.setQueryData(getGetMeQueryKey(), undefined);
      }
    },
    [queryClient],
  );

  const switchToUser = useCallback(
    (next: User) => {
      setLoadTimedOut(false);
      // Eski foydalanuvchi ma’lumotlari (dashboard, chat, …) qolmasin
      queryClient.clear();
      queryClient.setQueryData(getGetMeQueryKey(), next);
      setOverrideUser(next);
    },
    [queryClient],
  );

  const user = useMemo(() => {
    if (overrideUser !== undefined) return overrideUser;
    if (isSuccess && data) return data;
    if (isError || loadTimedOut) return null;
    return null;
  }, [overrideUser, isSuccess, data, isError, loadTimedOut]);

  const isLoading =
    overrideUser === undefined &&
    !loadTimedOut &&
    (isPending || status === 'pending' || (isFetching && !data && !isError));

  const isAuthenticated = !!user;

  const value = useMemo(
    () => ({ user, isLoading, isAuthenticated, setUser, switchToUser }),
    [user, isLoading, isAuthenticated, setUser, switchToUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
