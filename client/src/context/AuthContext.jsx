import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  signInWithPopup,
  signOut,
} from "firebase/auth";

import {
  firebaseAuth,
  googleProvider,
  isFirebaseConfigured,
} from "../config/firebase.js";

import { authApi } from "../services/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const restoreSession = useCallback(async () => {
    try {
      let response;

      try {
        response = await authApi.getCurrentUser();
      } catch (error) {
        if (error.status !== 401) {
          throw error;
        }

        await authApi.refresh();
        response = await authApi.getCurrentUser();
      }

      setUser(response?.data?.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const register = useCallback(async (payload) => {
    setAuthError(null);

    try {
      return await authApi.register(payload);
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  }, []);

  const login = useCallback(async (payload) => {
    setAuthError(null);

    try {
      const response = await authApi.login(payload);
      setUser(response?.data?.user || null);
      return response;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  }, []);

  const googleLogin = useCallback(async () => {
    setAuthError(null);

    if (!isFirebaseConfigured || !firebaseAuth) {
      const error = new Error(
        "Google authentication is not configured. Check your Firebase environment variables.",
      );

      setAuthError(error.message);
      throw error;
    }

    let firebaseUser = null;

    try {
      const credential = await signInWithPopup(
        firebaseAuth,
        googleProvider,
      );

      firebaseUser = credential.user;

      const idToken = await firebaseUser.getIdToken();
      const response = await authApi.googleLogin(idToken);

      setUser(response?.data?.user || null);
      return response;
    } catch (error) {
      let message = error.message;

      if (error.code === "auth/popup-closed-by-user") {
        message = "Google sign-in was cancelled.";
      } else if (error.code === "auth/popup-blocked") {
        message = "Your browser blocked the Google sign-in popup.";
      } else if (error.code === "auth/unauthorized-domain") {
        message = "This domain is not authorized in Firebase Authentication.";
      } else if (error.status === 409) {
        message =
          "An account with this email already exists. Sign in using your existing method before linking Google.";
      }

      setAuthError(message);
      throw new Error(message);
    } finally {
      if (firebaseUser && firebaseAuth) {
        await signOut(firebaseAuth).catch(() => {});
      }
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);

    try {
      await authApi.logout();
    } finally {
      setUser(null);

      if (firebaseAuth) {
        await signOut(firebaseAuth).catch(() => {});
      }
    }
  }, []);

  const verifyEmail = useCallback(async (token) => {
    setAuthError(null);

    try {
      return await authApi.verifyEmail(token);
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    setAuthError(null);

    try {
      return await authApi.forgotPassword(email);
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  }, []);

  const resetPassword = useCallback(async (token, newPassword) => {
  setAuthError(null);

  try {
    const result = await authApi.resetPassword(token, newPassword);
    setUser(null);
    return result;
  } catch (error) {
    setAuthError(error.message);
    throw error;
  }
}, []);

  const refreshCurrentUser = useCallback(async () => {
    try {
      const response = await authApi.getCurrentUser();
      setUser(response?.data?.user || null);
      return response?.data?.user || null;
    } catch (error) {
      setUser(null);
      throw error;
    }
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      authError,
      register,
      login,
      googleLogin,
      logout,
      verifyEmail,
      requestPasswordReset,
      resetPassword,
      refreshCurrentUser,
      clearAuthError,
    }),
    [
      user,
      loading,
      authError,
      register,
      login,
      googleLogin,
      logout,
      verifyEmail,
      requestPasswordReset,
      resetPassword,
      refreshCurrentUser,
      clearAuthError,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider.");
  }

  return context;
}