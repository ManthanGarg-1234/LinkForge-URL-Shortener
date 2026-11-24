import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Eye,
  Filter,
  Link2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import { adminApi } from "../services/adminApi.js";

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
    PENDING: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    DISMISSED: "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
    CONFIRMED: "border-red-400/20 bg-red-400/10 text-red-300",
    APPROVED: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    BLOCKED: "border-red-400/20 bg-red-400/10 text-red-300",
    ACTIVE: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    INACTIVE: "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
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

function DetailRow({ label, children }) {
  return (
    <div className="border-b border-white/[0.06] py-3 last:border-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <div className="mt-1.5 break-words text-sm leading-6 text-zinc-200">
        {children || "Not available"}
      </div>
    </div>
  );
}

function ReportDetailsModal({
  report,
  loading,
  onClose,
  onReview,
  onBlock,
  onRestore,
  actionLoading,
}) {
  if (!report && !loading) return null;

  const shortUrl = report?.shortUrl;
  const isPending = report?.status === "PENDING";
  const isBlocked = shortUrl?.moderationStatus === "BLOCKED";
  const hasUrl = Boolean(shortUrl?.shortCode);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !actionLoading) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="abuse-report-details-title"
        className="my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#101725] p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
              Abuse report investigation
            </p>
            <h2
              id="abuse-report-details-title"
              className="mt-2 text-xl font-bold text-white"
            >
              Report details
            </h2>
            {report && (
              <p className="mt-1 break-all text-xs text-zinc-500">
                Report ID: {report.id}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            disabled={actionLoading}
            aria-label="Close report details"
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            <X size={19} />
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-zinc-500">
            Loading report details...
          </div>
        ) : report ? (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <StatusBadge status={report.status} />
              <StatusBadge status={report.reason} />
              {shortUrl && (
                <StatusBadge
                  status={shortUrl.isActive ? "ACTIVE" : "INACTIVE"}
                />
              )}
              {shortUrl && <StatusBadge status={shortUrl.moderationStatus} />}
            </div>

            <div className="mt-5 rounded-xl border border-white/[0.07] bg-[#0b101d] px-4">
              <DetailRow label="Short code">
                <span className="font-mono text-blue-300">
                  {report.shortCode}
                </span>
              </DetailRow>

              <DetailRow label="Original destination">
                {shortUrl?.originalUrl ? (
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="min-w-0 flex-1 break-all">
                      {shortUrl.originalUrl}
                    </span>
                    <a
                      href={shortUrl.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open original destination in a new tab"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-blue-300 transition hover:bg-blue-400/10"
                    >
                      <ExternalLink size={13} />
                      Open
                    </a>
                  </div>
                ) : (
                  "The original URL record is no longer available."
                )}
              </DetailRow>

              <DetailRow label="Report reason">{report.reason}</DetailRow>

              <DetailRow label="Reporter description">
                <p className="whitespace-pre-wrap">
                  {report.description || "No additional description provided."}
                </p>
              </DetailRow>

              <DetailRow label="Reported by">
                {report.reporter?.name || "Unnamed user"}
                {report.reporter?.email && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {report.reporter.email}
                  </p>
                )}
              </DetailRow>

              <DetailRow label="Reported at">
                {formatDate(report.createdAt)}
              </DetailRow>

              <DetailRow label="URL owner activation state">
                {shortUrl?.isActive ? "Active" : "Inactive"}
              </DetailRow>

              <DetailRow label="URL moderation state">
                {shortUrl?.moderationStatus || "Not available"}
              </DetailRow>

              <DetailRow label="URL created">
                {formatDate(shortUrl?.createdAt)}
              </DetailRow>

              {report.reviewedAt && (
                <>
                  <DetailRow label="Reviewed at">
                    {formatDate(report.reviewedAt)}
                  </DetailRow>

                  <DetailRow label="Reviewed by">
                    {report.reviewedByAdmin?.name ||
                      report.reviewedByAdmin?.email ||
                      "Administrator"}
                  </DetailRow>

                  <DetailRow label="Resolution note">
                    {report.resolutionNote || "No resolution note recorded."}
                  </DetailRow>
                </>
              )}
            </div>

            <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={18}
                  className="mt-0.5 shrink-0 text-amber-300"
                />
                <div>
                  <p className="text-sm font-semibold text-amber-200">
                    Review carefully before taking action
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Confirming a report does not automatically block its URL.
                    Blocking and restoring are separate administrative actions.
                    Blocking preserves the URL owner's activation setting.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {isPending && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => onReview(report, "DISMISSED")}
                    disabled={actionLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
                  >
                    <X size={16} />
                    Dismiss report
                  </button>

                  <button
                    onClick={() => onReview(report, "CONFIRMED")}
                    disabled={actionLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:opacity-40"
                  >
                    <CheckCircle2 size={16} />
                    Confirm report
                  </button>
                </div>
              )}

              {hasUrl && !isBlocked && (
                <button
                  onClick={() => onBlock(shortUrl)}
                  disabled={actionLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                >
                  <Ban size={16} />
                  Block this short URL
                </button>
              )}

              {hasUrl && isBlocked && (
                <button
                  onClick={() => onRestore(shortUrl)}
                  disabled={actionLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  <ShieldCheck size={16} />
                  Restore this short URL
                </button>
              )}

              <button
                onClick={onClose}
                disabled={actionLoading}
                className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-400 transition hover:bg-white/5 disabled:opacity-40"
              >
                Close details
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function ReviewReportModal({
  report,
  status,
  resolutionNote,
  setResolutionNote,
  submitting,
  onClose,
  onConfirm,
}) {
  if (!report) return null;

  const isConfirming = status === "CONFIRMED";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-report-title"
        className="my-auto w-full max-w-lg rounded-2xl border border-white/10 bg-[#101725] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
              Administrative review
            </p>
            <h2
              id="review-report-title"
              className="mt-2 text-lg font-bold text-white"
            >
              {isConfirming ? "Confirm abuse report" : "Dismiss abuse report"}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Short code:{" "}
              <span className="font-mono text-zinc-300">
                {report.shortCode}
              </span>
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close review dialog"
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
          <p className="text-sm leading-6 text-zinc-300">
            {isConfirming
              ? "You are marking this report as confirmed. This decision will be recorded in the audit log. The URL will not be blocked automatically."
              : "You are dismissing this report. This decision will be recorded in the audit log."}
          </p>
        </div>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-zinc-300">
            Resolution note <span className="text-zinc-600">(optional)</span>
          </span>
          <textarea
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Explain the reason for this decision..."
            className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#0b101d] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-blue-400/40"
          />
          <span className="mt-1 block text-right text-xs text-zinc-600">
            {resolutionNote.length}/1000
          </span>
        </label>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            disabled={submitting || resolutionNote.trim().length > 1000}
            className={`rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 ${
              isConfirming
                ? "bg-amber-500 hover:bg-amber-400"
                : "bg-zinc-600 hover:bg-zinc-500"
            }`}
          >
            {submitting
              ? "Saving review..."
              : isConfirming
                ? "Confirm report"
                : "Dismiss report"}
          </button>
        </div>
      </section>
    </div>
  );
}

function BlockUrlModal({
  url,
  reason,
  setReason,
  submitting,
  onClose,
  onConfirm,
}) {
  if (!url) return null;

  const trimmedReason = reason.trim();
  const validReason = trimmedReason.length >= 10 && trimmedReason.length <= 500;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-url-title"
        className="my-auto w-full max-w-lg rounded-2xl border border-red-400/15 bg-[#101725] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-red-400/15 bg-red-400/10 p-3 text-red-300">
              <Ban size={21} />
            </div>
            <div>
              <h2 id="block-url-title" className="text-lg font-bold text-white">
                Block short URL
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Code:{" "}
                <span className="font-mono text-red-300">{url.shortCode}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close block dialog"
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-red-400/15 bg-red-400/[0.04] p-4">
          <p className="text-sm font-semibold text-red-200">
            This action will:
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-zinc-400">
            <li>• Prevent the short URL from redirecting.</li>
            <li>• Preserve the owner's active/inactive setting.</li>
            <li>• Invalidate its Redis redirect cache.</li>
            <li>• Record the action in the administrative audit log.</li>
          </ul>
        </div>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-zinc-300">
            Blocking reason
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Provide a clear reason (10–500 characters)."
            className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#0b101d] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-red-400/40"
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
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!validReason || submitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Ban size={16} />
            {submitting ? "Blocking..." : "Confirm block"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function AdminAbuseReports({ onRefresh }) {
  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [reasonFilter, setReasonFilter] = useState("");

  const [selectedReport, setSelectedReport] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewStatus, setReviewStatus] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  const [blockTarget, setBlockTarget] = useState(null);
  const [blockReason, setBlockReason] = useState("");

  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const reportListRequestId = useRef(0);
  const reportDetailsRequestId = useRef(0);

  const loadReports = useCallback(
    async (page = 1) => {
      const requestId = ++reportListRequestId.current;

      setLoading(true);
      setError("");

      try {
        const response = await adminApi.listAbuseReports({
          page,
          limit: 10,
          status: statusFilter,
          reason: reasonFilter,
          search: appliedSearch,
        });

        if (requestId !== reportListRequestId.current) return;

        const data = response?.data || {};

        setReports(Array.isArray(data.items) ? data.items : []);
        setPagination(
          data.pagination || {
            page,
            limit: 10,
            total: 0,
            totalPages: 1,
          },
        );
      } catch (err) {
        if (requestId === reportListRequestId.current) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (requestId === reportListRequestId.current) {
          setLoading(false);
        }
      }
    },
    [statusFilter, reasonFilter, appliedSearch],
  );

  const loadReportDetails = useCallback(async (id) => {
    const requestId = ++reportDetailsRequestId.current;

    setSelectedReport(null);
    setDetailsLoading(true);
    setError("");

    try {
      const response = await adminApi.getAbuseReport(id);

      if (requestId !== reportDetailsRequestId.current) return;

      const report = response?.data?.report || null;
      setSelectedReport(report);

      if (!report) {
        setError("The server did not return the requested report.");
      }
    } catch (err) {
      if (requestId === reportDetailsRequestId.current) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (requestId === reportDetailsRequestId.current) {
        setDetailsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadReports(1);

    return () => {
      reportListRequestId.current += 1;
    };
  }, [loadReports]);

  useEffect(() => {
    return () => {
      reportDetailsRequestId.current += 1;
    };
  }, []);

  function handleViewReport(id) {
    loadReportDetails(id);
  }

  function closeReportDetails() {
    reportDetailsRequestId.current += 1;
    setSelectedReport(null);
    setDetailsLoading(false);
  }

  function openReview(report, status) {
    setReviewTarget(report);
    setReviewStatus(status);
    setResolutionNote("");
  }

  async function handleReviewReport() {
    if (!reviewTarget || !reviewStatus || actionLoading) return;

    const reviewedReportId = reviewTarget.id;
    const reviewedShortCode = reviewTarget.shortCode;
    const selectedReportId = selectedReport?.id;

    setActionLoading(true);
    setError("");
    setSuccess("");

    try {
      await adminApi.reviewAbuseReport(reviewedReportId, {
        status: reviewStatus,
        resolutionNote,
      });

      setSuccess(
        reviewStatus === "CONFIRMED"
          ? `Report for ${reviewedShortCode} was confirmed. The URL has not been blocked automatically.`
          : `Report for ${reviewedShortCode} was dismissed.`,
      );

      setReviewTarget(null);
      setReviewStatus("");
      setResolutionNote("");

      await loadReports(pagination.page);

      if (selectedReportId === reviewedReportId) {
        await loadReportDetails(reviewedReportId);
      }

      onRefresh?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBlockUrl() {
    if (!blockTarget || actionLoading) return;

    const reason = blockReason.trim();

    if (reason.length < 10 || reason.length > 500) {
      setError("Blocking reason must contain 10–500 characters.");
      return;
    }

    const shortCode = blockTarget.shortCode;
    const selectedReportId =
      selectedReport?.shortCode === shortCode ? selectedReport.id : null;

    setActionLoading(true);
    setError("");
    setSuccess("");

    try {
      await adminApi.blockShortUrl(shortCode, reason);

      setSuccess(
        `Short URL ${shortCode} has been blocked. Its owner activation setting was preserved.`,
      );

      setBlockTarget(null);
      setBlockReason("");

      if (selectedReportId) {
        await loadReportDetails(selectedReportId);
      }

      await loadReports(pagination.page);
      onRefresh?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRestoreUrl(url) {
    if (!url?.shortCode || actionLoading) return;

    const confirmed = window.confirm(
      `Restore short URL ${url.shortCode}?\n\nThis changes moderation status to APPROVED. If the owner had disabled the URL, it will remain inactive.`,
    );

    if (!confirmed) return;

    const selectedReportId = selectedReport?.id;

    setActionLoading(true);
    setError("");
    setSuccess("");

    try {
      await adminApi.restoreShortUrl(url.shortCode);

      setSuccess(
        `Short URL ${url.shortCode} has been restored. The owner's activation setting was preserved.`,
      );

      if (selectedReportId) {
        await loadReportDetails(selectedReportId);
      }

      await loadReports(pagination.page);
      onRefresh?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  function handleSearch(event) {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
  }

  const pendingCount = reports.filter(
    (report) => report.status === "PENDING",
  ).length;

  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">
            Trust and safety
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Abuse reports
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Investigate reported short URLs, review evidence and take explicit
            moderation action.
          </p>
        </div>

        <button
          onClick={() => loadReports(pagination.page)}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-semibold text-zinc-300 transition hover:border-blue-400/30 hover:text-blue-300 disabled:opacity-40"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh reports
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
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
          className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300"
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

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-[#101725] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">Reports on this page</p>
            <Filter size={16} className="text-blue-300" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">
            {formatNumber(reports.length)}
          </p>
        </div>

        <div className="rounded-xl border border-amber-400/10 bg-[#101725] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">Pending on this page</p>
            <Clock3 size={16} className="text-amber-300" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-300">
            {formatNumber(pendingCount)}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#101725] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">Total matching reports</p>
            <ShieldAlert size={16} className="text-red-300" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">
            {formatNumber(pagination.total)}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101725]">
        <div className="border-b border-white/[0.07] p-5">
          <form
            onSubmit={handleSearch}
            className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_auto]"
          >
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b101d] px-4">
              <Search size={17} className="shrink-0 text-zinc-500" />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search short code or description..."
                className="w-full bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-zinc-600"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-[#0b101d] px-3 py-3 text-sm text-zinc-300 outline-none focus:border-blue-400/40"
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="DISMISSED">Dismissed</option>
            </select>

            <select
              value={reasonFilter}
              onChange={(event) => setReasonFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-[#0b101d] px-3 py-3 text-sm text-zinc-300 outline-none focus:border-blue-400/40"
            >
              <option value="">All reasons</option>
              <option value="PHISHING">Phishing</option>
              <option value="MALWARE">Malware</option>
              <option value="SPAM">Spam</option>
              <option value="SCAM">Scam</option>
              <option value="OTHER">Other</option>
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
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-white/[0.025]">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                <th className="px-5 py-4">Reported URL</th>
                <th className="px-5 py-4">Reason</th>
                <th className="px-5 py-4">Reporter</th>
                <th className="px-5 py-4">Report status</th>
                <th className="px-5 py-4">Reported</th>
                <th className="px-5 py-4 text-right">Details</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/[0.05]">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-16 text-center text-sm text-zinc-500"
                  >
                    Loading abuse reports...
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center">
                      <ShieldCheck size={30} className="text-emerald-400" />
                      <p className="mt-3 text-sm font-semibold text-zinc-300">
                        No matching abuse reports
                      </p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Change the filters or search terms to view other
                        reports.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr
                    key={report.id}
                    className="transition hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Link2 size={15} className="shrink-0 text-blue-300" />
                        <span className="font-mono text-sm font-semibold text-blue-300">
                          {report.shortCode}
                        </span>
                      </div>
                      <p className="mt-1 max-w-[230px] truncate text-xs text-zinc-500">
                        {report.shortUrl?.originalUrl ||
                          "URL record unavailable"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <span className="text-xs font-semibold text-zinc-300">
                        {report.reason}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <p className="max-w-[180px] truncate text-xs text-zinc-300">
                        {report.reporter?.name || "Unnamed user"}
                      </p>
                      <p className="mt-1 max-w-[180px] truncate text-[11px] text-zinc-500">
                        {report.reporter?.email || "Unknown reporter"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={report.status} />
                    </td>

                    <td className="px-5 py-4 text-xs text-zinc-400">
                      {formatDate(report.createdAt)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => handleViewReport(report.id)}
                        title="Inspect report"
                        aria-label={`Inspect report for ${report.shortCode}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-blue-400/30 hover:text-blue-300"
                      >
                        <Eye size={15} />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] px-5 py-4">
          <p className="text-xs text-zinc-500">
            Showing {reports.length} of {formatNumber(pagination.total)} reports
            <span className="mx-2 text-zinc-700">·</span>
            Page {pagination.page} of {Math.max(1, pagination.totalPages)}
          </p>

          <div className="flex gap-2">
            <button
              disabled={loading || pagination.page <= 1}
              onClick={() => loadReports(pagination.page - 1)}
              aria-label="Previous report page"
              className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:bg-white/5 disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>

            <button
              disabled={loading || pagination.page >= pagination.totalPages}
              onClick={() => loadReports(pagination.page + 1)}
              aria-label="Next report page"
              className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:bg-white/5 disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>

      <ReportDetailsModal
        report={selectedReport}
        loading={detailsLoading}
        actionLoading={actionLoading}
        onClose={() => {
          if (!actionLoading) {
            closeReportDetails();
          }
        }}
        onReview={openReview}
        onBlock={(url) => {
          setBlockTarget(url);
          setBlockReason("");
        }}
        onRestore={handleRestoreUrl}
      />

      <ReviewReportModal
        report={reviewTarget}
        status={reviewStatus}
        resolutionNote={resolutionNote}
        setResolutionNote={setResolutionNote}
        submitting={actionLoading}
        onClose={() => {
          if (!actionLoading) {
            setReviewTarget(null);
            setReviewStatus("");
            setResolutionNote("");
          }
        }}
        onConfirm={handleReviewReport}
      />

      <BlockUrlModal
        url={blockTarget}
        reason={blockReason}
        setReason={setBlockReason}
        submitting={actionLoading}
        onClose={() => {
          if (!actionLoading) {
            setBlockTarget(null);
            setBlockReason("");
          }
        }}
        onConfirm={handleBlockUrl}
      />
    </div>
  );
}
