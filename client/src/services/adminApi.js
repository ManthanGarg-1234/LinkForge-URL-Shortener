
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
};
