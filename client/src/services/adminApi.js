
import { api } from "./api.js";

export const adminApi = {
  getDashboardOverview() {
    return api.get("/admin/dashboard/overview");
  },

  listUsers({
    page = 1,
    limit = 10,
    role = "",
    status = "",
    search = "",
  } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    if (role) params.set("role", role);
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());

    return api.get(`/admin/users?${params.toString()}`);
  },

  getUser(id) {
    return api.get(`/admin/users/${encodeURIComponent(id)}`);
  },

  suspendUser(id, reason) {
    return api.post(
      `/admin/users/${encodeURIComponent(id)}/suspend`,
      { reason },
    );
  },

  reactivateUser(id) {
    return api.post(
      `/admin/users/${encodeURIComponent(id)}/reactivate`,
      {},
    );
  },

  listAbuseReports({
    page = 1,
    limit = 10,
    status = "",
    reason = "",
    search = "",
  } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    if (status) params.set("status", status);
    if (reason) params.set("reason", reason);
    if (search.trim()) params.set("search", search.trim());

    return api.get(`/admin/abuse-reports?${params.toString()}`);
  },

  getAbuseReport(id) {
    return api.get(
      `/admin/abuse-reports/${encodeURIComponent(id)}`,
    );
  },

  reviewAbuseReport(id, { status, resolutionNote = "" }) {
    return api.post(
      `/admin/abuse-reports/${encodeURIComponent(id)}/review`,
      {
        status,
        ...(resolutionNote.trim()
          ? { resolutionNote: resolutionNote.trim() }
          : {}),
      },
    );
  },

  blockShortUrl(shortCode, reason) {
    return api.post(
      `/admin/short-urls/${encodeURIComponent(shortCode)}/block`,
      { reason },
    );
  },

  restoreShortUrl(shortCode) {
    return api.post(
      `/admin/short-urls/${encodeURIComponent(shortCode)}/restore`,
      {},
    );
  },
};
