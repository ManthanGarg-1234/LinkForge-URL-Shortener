
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1"
).replace(/\/+$/, "");

const AUTH_REFRESH_LOCK_NAME = "linkforge-auth-session-refresh";

let sessionRestorePromise = null;

async function request(endpoint, options = {}) {
  const {
    method = "GET",
    body,
    headers = {},
    ...customOptions
  } = options;

  const requestHeaders = {
    Accept: "application/json",
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      credentials: "include",
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...customOptions,
    });
  } catch {
    throw new Error(
      "Unable to connect to LinkForge. Check whether the backend server is running.",
    );
  }

  let result;

  try {
    result = await response.json();
  } catch {
    result = null;
  }

  if (!response.ok) {
    const error = new Error(
      result?.message ||
        result?.error?.message ||
        `Request failed with status ${response.status}.`,
    );

    error.status = response.status;
    error.code = result?.code || result?.error?.code || null;
    error.data = result?.data || null;

    throw error;
  }

  return result;
}

async function restoreSessionWithLock() {
  const restoreOperation = async () => {
    try {
      return await authApi.getCurrentUser();
    } catch (error) {
      if (error.status !== 401) {
        throw error;
      }
    }

    await authApi.refresh();

    return authApi.getCurrentUser();
  };

  if (
    typeof navigator !== "undefined" &&
    navigator.locks &&
    typeof navigator.locks.request === "function"
  ) {
    return navigator.locks.request(
      AUTH_REFRESH_LOCK_NAME,
      { mode: "exclusive" },
      restoreOperation,
    );
  }

  return restoreOperation();
}

export const api = {
  get(endpoint, options = {}) {
    return request(endpoint, {
      ...options,
      method: "GET",
    });
  },

  post(endpoint, body, options = {}) {
    return request(endpoint, {
      ...options,
      method: "POST",
      body,
    });
  },

  put(endpoint, body, options = {}) {
    return request(endpoint, {
      ...options,
      method: "PUT",
      body,
    });
  },

  patch(endpoint, body, options = {}) {
    return request(endpoint, {
      ...options,
      method: "PATCH",
      body,
    });
  },

  delete(endpoint, options = {}) {
    return request(endpoint, {
      ...options,
      method: "DELETE",
    });
  },
};

export const authApi = {
  register(payload) {
    return api.post("/auth/register", payload);
  },

  verifyEmail(token) {
    return api.post("/auth/verify-email", { token });
  },

  login(payload) {
    return api.post("/auth/login", payload);
  },

  googleLogin(idToken) {
    return api.post("/auth/google", { idToken });
  },

  refresh() {
    return api.post("/auth/refresh", {});
  },

  restoreSession() {
    if (sessionRestorePromise) {
      return sessionRestorePromise;
    }

    sessionRestorePromise = restoreSessionWithLock().finally(() => {
      sessionRestorePromise = null;
    });

    return sessionRestorePromise;
  },

  logout() {
    return api.post("/auth/logout", {});
  },

  getCurrentUser() {
    return api.get("/auth/me");
  },

  forgotPassword(email) {
    return api.post("/auth/forgot-password", { email });
  },

  resetPassword(token, newPassword) {
    return api.post("/auth/reset-password", {
      token,
      newPassword,
    });
  },
};

export const urlApi = {
  createShortUrl(payload) {
    return api.post("/urls", payload);
  },

  listShortUrls({ page = 1, limit = 10 } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    return api.get(`/urls?${params.toString()}`);
  },

  updateShortUrlStatus(id, isActive) {
    return api.patch(`/urls/${encodeURIComponent(id)}/status`, {
      isActive,
    });
  },

  deleteShortUrl(id) {
    return api.delete(`/urls/${encodeURIComponent(id)}`);
  },
};

export const analyticsApi = {
  getOverview() {
    return api.get("/analytics/overview");
  },

  getLinkAnalytics(id) {
    return api.get(`/analytics/links/${encodeURIComponent(id)}`);
  },
};
