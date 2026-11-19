
import { useCallback, useEffect, useState } from "react";

import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  UserCheck,
  UserX,
  X,
  MousePointerClick,
} from "lucide-react";

import { useAuth } from "../context/AuthContext.jsx";
import { adminApi } from "../services/adminApi.js";
import AdminAbuseReports from "./AdminAbuseReports.jsx";

function getErrorMessage(error) {
  return error?.message || "Something went wrong. Please try again.";
}

function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(value || 0);
}

function StatusBadge({ status }) {
  const styles = {
    ACTIVE: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    SUSPENDED: "border-red-400/20 bg-red-400/10 text-red-300",
    ADMIN: "border-violet-400/20 bg-violet-400/10 text-violet-300",
    USER: "border-blue-400/20 bg-blue-400/10 text-blue-300",
    PENDING: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    DISMISSED: "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
    CONFIRMED: "border-red-400/20 bg-red-400/10 text-red-300",
    OPEN: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    REVIEWED: "border-blue-400/20 bg-blue-400/10 text-blue-300",
    RESOLVED: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        styles[status] || "border-white/10 bg-white/5 text-zinc-400"
      }`}
    >
      {status || "UNKNOWN"}
    </span>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  accent = "blue",
}) {
  const accents = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-400/15",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-400/15",
    violet: "bg-violet-500/10 text-violet-400 border-violet-400/15",
    amber: "bg-amber-500/10 text-amber-400 border-amber-400/15",
    red: "bg-red-500/10 text-red-400 border-red-400/15",
  };

  return (
    <article className="rounded-2xl border border-white/[0.07] bg-[#101725] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-zinc-500">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-white">
            {formatNumber(value)}
          </p>
        </div>

        <div className={`rounded-xl border p-3 ${accents[accent]}`}>
          <Icon size={20} />
        </div>
      </div>

      <p className="mt-4 text-xs text-zinc-500">{description}</p>
    </article>
  );
}

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">
          {eyebrow}
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {title}
        </h1>

        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            {description}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

function UserDetailsModal({ user, loading, onClose }) {
  if (!user && !loading) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-details-title"
        className="my-auto w-full max-w-xl rounded-2xl border border-white/10 bg-[#101725] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-400">
              Account information
            </p>

            <h2
              id="user-details-title"
              className="mt-2 text-xl font-bold text-white"
            >
              User details
            </h2>
          </div>

          <button
            onClick={onClose}
            aria-label="Close user details"
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            <X size={19} />
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-zinc-500">
            Loading account details...
          </div>
        ) : user ? (
          <>
            <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#0b101d] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-lg font-semibold text-white">
                    {user.name || "Unnamed user"}
                  </h3>

                  <p className="mt-1 break-all text-sm text-zinc-400">
                    {user.email}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={user.role} />
                  <StatusBadge status={user.status} />
                </div>
              </div>

              <div className="mt-5 grid gap-4 border-t border-white/[0.07] pt-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-zinc-500">User ID</p>
                  <p className="mt-1 break-all text-xs text-zinc-300">
                    {user.id}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-zinc-500">Email verification</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {user.emailVerifiedAt ? "Verified" : "Not verified"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-zinc-500">Registered</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {formatDate(user.createdAt)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-zinc-500">Last updated</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {formatDate(user.updatedAt)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-zinc-500">Total sessions</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {formatNumber(user._count?.sessions)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-zinc-500">Short URLs created</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {formatNumber(user._count?.shortUrls)}
                  </p>
                </div>
              </div>
            </div>

            {user.status === "SUSPENDED" && (
              <div className="mt-4 rounded-xl border border-red-400/15 bg-red-400/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-300">
                  Suspension information
                </p>

                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  {user.suspensionReason || "No reason recorded."}
                </p>

                <p className="mt-2 text-xs text-zinc-500">
                  Suspended: {formatDate(user.suspendedAt)}
                </p>
              </div>
            )}
          </>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5"
          >
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

function SuspendUserModal({
  user,
  reason,
  setReason,
  submitting,
  onClose,
  onConfirm,
}) {
  if (!user) return null;

  const trimmedReason = reason.trim();
  const validReason =
    trimmedReason.length >= 10 && trimmedReason.length <= 500;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="suspend-user-title"
        className="my-auto w-full max-w-lg rounded-2xl border border-red-400/15 bg-[#101725] p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <div className="rounded-xl border border-red-400/15 bg-red-400/10 p-3 text-red-300">
            <Ban size={22} />
          </div>

          <div className="flex-1">
            <h2
              id="suspend-user-title"
              className="text-lg font-bold text-white"
            >
              Suspend account
            </h2>

            <p className="mt-1 break-all text-sm text-zinc-400">
              {user.email}
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close suspension dialog"
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            <X size={19} />
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-amber-400/15 bg-amber-400/5 p-4">
          <p className="text-sm font-semibold text-amber-200">
            This action will:
          </p>

          <ul className="mt-2 space-y-1 text-xs leading-5 text-zinc-400">
            <li>• Change the account status to SUSPENDED.</li>
            <li>• Revoke all active sessions and refresh tokens.</li>
            <li>• Require the user to sign in again after reactivation.</li>
            <li>• Record the action in the administrative audit log.</li>
          </ul>
        </div>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-zinc-300">
            Reason for suspension
          </span>

          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Provide a clear reason (10–500 characters)."
            className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#0b101d] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/40"
          />

          <span className="mt-1 flex justify-between text-xs text-zinc-600">
            <span>
              {trimmedReason.length < 10
                ? "Minimum 10 characters."
                : "Reason length is valid."}
            </span>

            <span>{reason.length}/500</span>
          </span>
        </label>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            disabled={!validReason || submitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Ban size={16} />
            {submitting ? "Suspending..." : "Confirm suspension"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function AdminApp() {
  const { user, logout } = useAuth();

  const [activePage, setActivePage] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selectedUser, setSelectedUser] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [suspensionTarget, setSuspensionTarget] = useState(null);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [suspending, setSuspending] = useState(false);
  const [actioningUserId, setActioningUserId] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);

    try {
      const response = await adminApi.getDashboardOverview();
      setDashboard(response?.data || null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const loadUsers = useCallback(
    async (page = 1) => {
      setUsersLoading(true);
      setError("");

      try {
        const response = await adminApi.listUsers({
          page,
          limit: 10,
          role: roleFilter,
          status: statusFilter,
          search: appliedSearch,
        });

        const data = response?.data || {};

        setUsers(Array.isArray(data.users) ? data.users : []);

        setPagination(
          data.pagination || {
            page,
            limit: 10,
            total: 0,
            totalPages: 1,
          },
        );
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setUsersLoading(false);
      }
    },
    [roleFilter, statusFilter, appliedSearch],
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (activePage === "users") {
      loadUsers(1);
    }
  }, [activePage, loadUsers]);

  function navigate(page) {
    setActivePage(page);
    setMobileMenuOpen(false);
    setError("");
    setSuccess("");
  }

  async function handleSearch(event) {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
  }

  async function handleViewUser(id) {
    setSelectedUser(null);
    setDetailsLoading(true);

    try {
      const response = await adminApi.getUser(id);
      setSelectedUser(response?.data?.user || null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleSuspendUser() {
    if (!suspensionTarget) return;

    const reason = suspensionReason.trim();

    if (reason.length < 10 || reason.length > 500) {
      setError("Suspension reason must contain 10–500 characters.");
      return;
    }

    setSuspending(true);
    setError("");
    setSuccess("");

    try {
      await adminApi.suspendUser(suspensionTarget.id, reason);

      setSuccess(
        `Account ${suspensionTarget.email} has been suspended. All active sessions and refresh tokens were revoked.`,
      );

      setSuspensionTarget(null);
      setSuspensionReason("");

      await Promise.all([
        loadUsers(pagination.page),
        loadDashboard(),
      ]);

      if (selectedUser?.id === suspensionTarget.id) {
        const response = await adminApi.getUser(suspensionTarget.id);
        setSelectedUser(response?.data?.user || null);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSuspending(false);
    }
  }

  async function handleReactivateUser(target) {
    const confirmed = window.confirm(
      `Reactivate this account?\n\n${target.email}\n\nThe user will need to sign in again. Previously revoked sessions will not be restored.`,
    );

    if (!confirmed) return;

    setActioningUserId(target.id);
    setError("");
    setSuccess("");

    try {
      await adminApi.reactivateUser(target.id);

      setSuccess(
        `Account ${target.email} has been reactivated. The user must sign in again.`,
      );

      await Promise.all([
        loadUsers(pagination.page),
        loadDashboard(),
      ]);

      if (selectedUser?.id === target.id) {
        const response = await adminApi.getUser(target.id);
        setSelectedUser(response?.data?.user || null);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActioningUserId("");
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setError("");

    try {
      await logout();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoggingOut(false);
    }
  }

  const pendingReports = Number(
    dashboard?.summary?.moderation?.pendingReports || 0,
  );

  const navigation = [
    {
      id: "overview",
      label: "Overview",
      icon: LayoutDashboard,
    },
    {
      id: "users",
      label: "User management",
      icon: Users,
    },
    {
      id: "reports",
      label: "Abuse reports",
      icon: ShieldAlert,
      badge: pendingReports,
    },
  ];

  const summary = dashboard?.summary;

  return (
    <div className="min-h-screen bg-[#080c16] text-white">
      {mobileMenuOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/[0.07] bg-[#0b101d] transition-transform duration-300 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-white/[0.07] px-7">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/15 text-blue-400">
            <Link2 size={22} />
          </div>

          <div>
            <p className="text-xl font-bold tracking-tight">
              Link<span className="text-blue-400">Forge</span>
            </p>

            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">
              Administration
            </p>
          </div>
        </div>

        <div className="px-5 pt-8">
          <p className="mb-4 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
            Platform control
          </p>

          <nav className="space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const selected = activePage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                    selected
                      ? "border border-blue-400/15 bg-blue-500/10 text-blue-300"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <Icon size={19} />
                  <span className="flex-1">{item.label}</span>

                  {item.badge > 0 && (
                    <span className="min-w-6 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-center text-[10px] font-bold tabular-nums text-amber-300">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-white/[0.07] p-5">
          <div className="mb-4 rounded-xl border border-violet-400/10 bg-violet-400/[0.04] p-4">
            <div className="flex items-center gap-2 text-violet-300">
              <ShieldCheck size={16} />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Administrator
              </span>
            </div>

            <p className="mt-3 truncate text-sm font-semibold text-white">
              {user?.name || "LinkForge Admin"}
            </p>

            <p className="mt-1 truncate text-xs text-zinc-500">
              {user?.email}
            </p>
          </div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-zinc-400 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
          >
            <LogOut size={18} />
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-white/[0.07] bg-[#080c16]/90 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="text-zinc-400 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={23} />
            </button>

            <div>
              <p className="text-sm font-semibold text-white">
                Admin workspace
              </p>

              <p className="mt-0.5 text-xs text-zinc-500">
                Platform monitoring and account administration
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setError("");
              setSuccess("");
              loadDashboard();

              if (activePage === "users") {
                loadUsers(pagination.page);
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-zinc-300 transition hover:border-blue-400/30 hover:text-blue-300"
          >
            <RefreshCw size={15} />
            <span className="hidden sm:inline">Refresh data</span>
          </button>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          {error && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
            >
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>

              <button
                onClick={() => setError("")}
                aria-label="Dismiss error"
                className="text-red-300/70 hover:text-red-200"
              >
                <X size={17} />
              </button>
            </div>
          )}

          {success && (
            <div
              role="status"
              className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300"
            >
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <span className="flex-1">{success}</span>

              <button
                onClick={() => setSuccess("")}
                aria-label="Dismiss success message"
                className="text-emerald-300/70 hover:text-emerald-200"
              >
                <X size={17} />
              </button>
            </div>
          )}

          {activePage === "overview" && (
            <>
              <SectionHeading
                eyebrow="Platform overview"
                title="Administration dashboard"
                description="Monitor platform activity, account health, URL usage and moderation workload."
                action={
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Admin access active
                  </div>
                }
              />

              {dashboardLoading && !dashboard ? (
                <div className="rounded-2xl border border-white/[0.07] bg-[#101725] p-12 text-center text-sm text-zinc-500">
                  Loading platform metrics...
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label="Total users"
                      value={summary?.users?.total}
                      description={`${formatNumber(summary?.users?.newLast7Days)} registered in the last 7 days`}
                      icon={Users}
                      accent="blue"
                    />

                    <MetricCard
                      label="Active users"
                      value={summary?.users?.active}
                      description={`${formatNumber(summary?.users?.verified)} verified email addresses`}
                      icon={UserCheck}
                      accent="emerald"
                    />

                    <MetricCard
                      label="Suspended users"
                      value={summary?.users?.suspended}
                      description="Accounts currently restricted"
                      icon={UserX}
                      accent="red"
                    />

                    <MetricCard
                      label="Total short URLs"
                      value={summary?.urls?.total}
                      description={`${formatNumber(summary?.urls?.active)} active and approved URLs`}
                      icon={Link2}
                      accent="violet"
                    />

                    <MetricCard
                      label="Total clicks"
                      value={summary?.clicks?.total}
                      description="Recorded click events"
                      icon={MousePointerClick}
                      accent="blue"
                    />

                    <MetricCard
                      label="Blocked URLs"
                      value={summary?.urls?.blocked}
                      description="URLs blocked by moderation"
                      icon={ShieldAlert}
                      accent="red"
                    />

                    <MetricCard
                      label="Pending reports"
                      value={summary?.moderation?.pendingReports}
                      description="Abuse reports awaiting review"
                      icon={AlertTriangle}
                      accent="amber"
                    />

                    <MetricCard
                      label="Open security events"
                      value={summary?.security?.openEvents}
                      description="Security events not yet resolved"
                      icon={Activity}
                      accent="amber"
                    />
                  </div>

                  <div className="mt-8 grid gap-6 xl:grid-cols-2">
                    <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101725]">
                      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-5">
                        <div>
                          <h2 className="font-semibold text-white">
                            Recently registered users
                          </h2>

                          <p className="mt-1 text-xs text-zinc-500">
                            Latest accounts created on the platform
                          </p>
                        </div>

                        <button
                          onClick={() => navigate("users")}
                          className="text-xs font-semibold text-blue-400 hover:text-blue-300"
                        >
                          View all
                        </button>
                      </div>

                      {dashboard?.recentUsers?.length ? (
                        <div className="divide-y divide-white/[0.05]">
                          {dashboard.recentUsers.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-3 px-5 py-4"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-zinc-200">
                                  {item.name || "Unnamed user"}
                                </p>

                                <p className="mt-1 truncate text-xs text-zinc-500">
                                  {item.email}
                                </p>

                                <p className="mt-1 text-[10px] text-zinc-600">
                                  {formatDate(item.createdAt)}
                                </p>
                              </div>

                              <div className="flex shrink-0 flex-col items-end gap-2">
                                <StatusBadge status={item.role} />
                                <StatusBadge status={item.status} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="p-8 text-center text-sm text-zinc-500">
                          No user registrations found.
                        </p>
                      )}
                    </section>

                    <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101725]">
                      <div className="border-b border-white/[0.07] px-5 py-5">
                        <h2 className="font-semibold text-white">
                          Moderation and security queue
                        </h2>

                        <p className="mt-1 text-xs text-zinc-500">
                          Abuse reports and security events requiring attention
                        </p>
                      </div>

                      <div className="p-5">
                        <div className="flex items-center justify-between rounded-xl border border-amber-400/10 bg-amber-400/[0.04] p-4">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-amber-400/10 p-2 text-amber-300">
                              <AlertTriangle size={19} />
                            </div>

                            <div>
                              <p className="text-sm font-semibold text-zinc-200">
                                Pending abuse reports
                              </p>

                              <p className="mt-1 text-xs text-zinc-500">
                                Awaiting administrative review
                              </p>
                            </div>
                          </div>

                          <span className="text-xl font-bold text-amber-300">
                            {formatNumber(summary?.moderation?.pendingReports)}
                          </span>
                        </div>

                        <button
                          onClick={() => navigate("reports")}
                          className="mt-3 flex w-full items-center justify-between rounded-xl border border-blue-400/15 bg-blue-500/[0.06] p-4 text-left transition hover:border-blue-400/30 hover:bg-blue-500/[0.10]"
                        >
                          <span className="flex items-center gap-3">
                            <span className="rounded-lg bg-blue-400/10 p-2 text-blue-300">
                              <ShieldAlert size={19} />
                            </span>

                            <span>
                              <span className="block text-sm font-semibold text-zinc-200">
                                Open abuse report manager
                              </span>
                              <span className="mt-1 block text-xs text-zinc-500">
                                Inspect, review and moderate reported URLs
                              </span>
                            </span>
                          </span>

                          <span className="text-xs font-bold text-blue-300">
                            Review →
                          </span>
                        </button>

                        <div className="mt-3 flex items-center justify-between rounded-xl border border-red-400/10 bg-red-400/[0.04] p-4">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-red-400/10 p-2 text-red-300">
                              <ShieldAlert size={19} />
                            </div>

                            <div>
                              <p className="text-sm font-semibold text-zinc-200">
                                Open security events
                              </p>

                              <p className="mt-1 text-xs text-zinc-500">
                                Events requiring investigation
                              </p>
                            </div>
                          </div>

                          <span className="text-xl font-bold text-red-300">
                            {formatNumber(summary?.security?.openEvents)}
                          </span>
                        </div>

                        <p className="mt-4 text-xs leading-5 text-zinc-600">
                          Security-event investigation is not yet available in
                          this interface. The displayed count is informational.
                        </p>
                      </div>
                    </section>
                  </div>

                  <p className="mt-6 text-right text-[11px] text-zinc-600">
                    Metrics generated: {formatDate(dashboard?.generatedAt)}
                  </p>
                </>
              )}
            </>
          )}

          {activePage === "users" && (
            <>
              <SectionHeading
                eyebrow="Account administration"
                title="User management"
                description="Search accounts, inspect account details and manage suspension status."
              />

              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/[0.07] bg-[#101725] p-4">
                  <p className="text-xs text-zinc-500">Total accounts</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {formatNumber(summary?.users?.total)}
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-[#101725] p-4">
                  <p className="text-xs text-zinc-500">Active accounts</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-300">
                    {formatNumber(summary?.users?.active)}
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-[#101725] p-4">
                  <p className="text-xs text-zinc-500">Suspended accounts</p>
                  <p className="mt-2 text-2xl font-bold text-red-300">
                    {formatNumber(summary?.users?.suspended)}
                  </p>
                </div>
              </div>

              <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101725]">
                <div className="border-b border-white/[0.07] p-5">
                  <form
                    onSubmit={handleSearch}
                    className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_170px_170px_auto]"
                  >
                    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b101d] px-4">
                      <Search size={17} className="shrink-0 text-zinc-500" />

                      <input
                        type="search"
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        placeholder="Search by name or email..."
                        className="w-full bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-zinc-600"
                      />
                    </div>

                    <select
                      value={roleFilter}
                      onChange={(event) => setRoleFilter(event.target.value)}
                      className="rounded-xl border border-white/10 bg-[#0b101d] px-3 py-3 text-sm text-zinc-300 outline-none focus:border-blue-400/40"
                    >
                      <option value="">All roles</option>
                      <option value="USER">User</option>
                      <option value="ADMIN">Admin</option>
                    </select>

                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      className="rounded-xl border border-white/10 bg-[#0b101d] px-3 py-3 text-sm text-zinc-300 outline-none focus:border-blue-400/40"
                    >
                      <option value="">All statuses</option>
                      <option value="ACTIVE">Active</option>
                      <option value="SUSPENDED">Suspended</option>
                    </select>

                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400"
                    >
                      <Search size={16} />
                      Apply filters
                    </button>
                  </form>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left">
                    <thead className="bg-white/[0.025]">
                      <tr className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        <th className="px-5 py-4">Account</th>
                        <th className="px-5 py-4">Role</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4">Email verification</th>
                        <th className="px-5 py-4">Registered</th>
                        <th className="px-5 py-4 text-right">Actions</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-white/[0.05]">
                      {usersLoading ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-5 py-16 text-center text-sm text-zinc-500"
                          >
                            Loading user accounts...
                          </td>
                        </tr>
                      ) : users.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-5 py-16 text-center text-sm text-zinc-500"
                          >
                            No accounts match the selected filters.
                          </td>
                        </tr>
                      ) : (
                        users.map((item) => (
                          <tr
                            key={item.id}
                            className="transition hover:bg-white/[0.02]"
                          >
                            <td className="px-5 py-4">
                              <p className="max-w-[230px] truncate text-sm font-semibold text-zinc-200">
                                {item.name || "Unnamed user"}
                              </p>

                              <p className="mt-1 max-w-[230px] truncate text-xs text-zinc-500">
                                {item.email}
                              </p>
                            </td>

                            <td className="px-5 py-4">
                              <StatusBadge status={item.role} />
                            </td>

                            <td className="px-5 py-4">
                              <StatusBadge status={item.status} />
                            </td>

                            <td className="px-5 py-4">
                              {item.emailVerifiedAt ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                                  <CheckCircle2 size={14} />
                                  Verified
                                </span>
                              ) : (
                                <span className="text-xs text-amber-300">
                                  Not verified
                                </span>
                              )}
                            </td>

                            <td className="px-5 py-4 text-xs text-zinc-400">
                              {formatDate(item.createdAt)}
                            </td>

                            <td className="px-5 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleViewUser(item.id)}
                                  title="View account details"
                                  aria-label={`View ${item.email}`}
                                  className="rounded-lg border border-white/10 p-2 text-zinc-400 transition hover:border-blue-400/30 hover:text-blue-300"
                                >
                                  <Eye size={16} />
                                </button>

                                {item.role === "USER" &&
                                  item.status === "ACTIVE" && (
                                    <button
                                      onClick={() => setSuspensionTarget(item)}
                                      title="Suspend account"
                                      aria-label={`Suspend ${item.email}`}
                                      disabled={actioningUserId === item.id}
                                      className="rounded-lg border border-red-400/15 p-2 text-red-300 transition hover:bg-red-400/10 disabled:opacity-40"
                                    >
                                      <Ban size={16} />
                                    </button>
                                  )}

                                {item.role === "USER" &&
                                  item.status === "SUSPENDED" && (
                                    <button
                                      onClick={() => handleReactivateUser(item)}
                                      title="Reactivate account"
                                      aria-label={`Reactivate ${item.email}`}
                                      disabled={actioningUserId === item.id}
                                      className="rounded-lg border border-emerald-400/15 p-2 text-emerald-300 transition hover:bg-emerald-400/10 disabled:opacity-40"
                                    >
                                      <UserCheck size={16} />
                                    </button>
                                  )}

                                {item.role === "ADMIN" && (
                                  <span className="px-2 text-[10px] text-zinc-600">
                                    Protected
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] px-5 py-4">
                  <p className="text-xs text-zinc-500">
                    Showing {users.length} of {formatNumber(pagination.total)} accounts
                    <span className="mx-2 text-zinc-700">·</span>
                    Page {pagination.page} of{" "}
                    {Math.max(1, pagination.totalPages)}
                  </p>

                  <div className="flex gap-2">
                    <button
                      disabled={usersLoading || pagination.page <= 1}
                      onClick={() => loadUsers(pagination.page - 1)}
                      aria-label="Previous page"
                      className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:bg-white/5 disabled:opacity-30"
                    >
                      <ChevronLeft size={18} />
                    </button>

                    <button
                      disabled={
                        usersLoading ||
                        pagination.page >= pagination.totalPages
                      }
                      onClick={() => loadUsers(pagination.page + 1)}
                      aria-label="Next page"
                      className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:bg-white/5 disabled:opacity-30"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {activePage === "reports" && (
            <AdminAbuseReports onRefresh={loadDashboard} />
          )}
        </div>
      </main>

      <UserDetailsModal
        user={selectedUser}
        loading={detailsLoading}
        onClose={() => {
          setSelectedUser(null);
          setDetailsLoading(false);
        }}
      />

      <SuspendUserModal
        user={suspensionTarget}
        reason={suspensionReason}
        setReason={setSuspensionReason}
        submitting={suspending}
        onClose={() => {
          if (!suspending) {
            setSuspensionTarget(null);
            setSuspensionReason("");
          }
        }}
        onConfirm={handleSuspendUser}
      />
    </div>
  );
}
