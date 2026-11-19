
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { authApi } from "../services/api.js";

const AuthContext = createContext(null);

let firebaseRuntimePromise = null;

function loadFirebaseRuntime() {
  if (!firebaseRuntimePromise) {
    firebaseRuntimePromise = Promise.all([
      import("firebase/auth"),
      import("../config/firebase.js"),
    ])
      .then(([firebaseAuthModule, firebaseConfigModule]) => ({
        signInWithPopup: firebaseAuthModule.signInWithPopup,
        signOut: firebaseAuthModule.signOut,
        firebaseAuth: firebaseConfigModule.firebaseAuth,
        googleProvider: firebaseConfigModule.googleProvider,
        isFirebaseConfigured: firebaseConfigModule.isFirebaseConfigured,
      }))
      .catch((error) => {
        firebaseRuntimePromise = null;
        throw error;
      });
  }

  return firebaseRuntimePromise;
}

async function signOutFirebaseIfLoaded() {
  if (!firebaseRuntimePromise) return;

  try {
    const { firebaseAuth, signOut } = await firebaseRuntimePromise;

    if (firebaseAuth) {
      await signOut(firebaseAuth);
    }
  } catch {
    // Firebase sign-out must not prevent application logout.
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const restoreSession = useCallback(async () => {
    try {
      const response = await authApi.restoreSession();
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

    let firebaseUser = null;
    let firebaseAuth = null;
    let signOut = null;

    try {
      const firebaseRuntime = await loadFirebaseRuntime();

      firebaseAuth = firebaseRuntime.firebaseAuth;
      signOut = firebaseRuntime.signOut;

      if (
        !firebaseRuntime.isFirebaseConfigured ||
        !firebaseAuth
      ) {
        throw new Error(
          "Google authentication is not configured. Check your Firebase environment variables.",
        );
      }

      const credential = await firebaseRuntime.signInWithPopup(
        firebaseAuth,
        firebaseRuntime.googleProvider,
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
      if (firebaseUser && firebaseAuth && signOut) {
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
      await signOutFirebaseIfLoaded();
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
      const response = await authApi.restoreSession();
      const currentUser = response?.data?.user || null;

      setUser(currentUser);
      return currentUser;
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
