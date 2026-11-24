
import { useState } from "react";
import { Flag, X } from "lucide-react";
import { urlApi } from "../services/api.js";

const REPORT_REASONS = [
  { value: "PHISHING", label: "Phishing" },
  { value: "MALWARE", label: "Malware" },
  { value: "SPAM", label: "Spam" },
  { value: "SCAM", label: "Scam or fraud" },
  { value: "OTHER", label: "Other" },
];

export default function ReportAbuseModal({ item, onClose }) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!item?.shortCode) {
      setError("The short-link code is unavailable.");
      return;
    }

    if (!reason) {
      setError("Select a reason for this report.");
      return;
    }

    if (description.length > 2000) {
      setError("Description cannot exceed 2000 characters.");
      return;
    }

    setSubmitting(true);

    try {
      await urlApi.submitAbuseReport({
        shortCode: item.shortCode,
        reason,
        ...(description.trim()
          ? { description: description.trim() }
          : {}),
      });

      setSubmitted(true);
    } catch (err) {
      if (err.code === "DUPLICATE_PENDING_REPORT") {
        setError(
          "You already have a pending report for this short link.",
        );
      } else if (err.code === "SHORT_URL_NOT_FOUND") {
        setError("This short link could not be found.");
      } else if (err.status === 401) {
        setError("Your session has expired. Sign in again and retry.");
      } else if (err.status === 429) {
        setError("Too many reports submitted. Please try again later.");
      } else if (err.status === 400) {
        setError(
          err.message || "The report details are invalid. Check your input.",
        );
      } else {
        setError(
          err.message || "Unable to submit the report. Please try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

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
        aria-labelledby="report-abuse-title"
        className="my-auto w-full max-w-lg rounded-2xl border border-white/10 bg-[#101725] p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex rounded-xl bg-red-500/10 p-3 text-red-400">
              <Flag size={22} />
            </div>

            <h2
              id="report-abuse-title"
              className="text-xl font-bold text-white"
            >
              Report abuse
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Report this short link if it directs users to harmful,
              deceptive, or unwanted content.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close report form"
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        {submitted ? (
          <div className="mt-7">
            <div
              role="status"
              className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-300"
            >
              Your abuse report was submitted successfully. Our moderation
              team can now review it.
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-7">
            <div className="rounded-xl border border-white/[0.07] bg-[#0b101d] p-4">
              <p className="text-xs font-medium text-zinc-500">
                Reported short link
              </p>
              <p className="mt-2 break-all font-mono text-sm text-blue-300">
                {item?.shortCode}
              </p>
              <p className="mt-2 break-all text-xs text-zinc-500">
                {item?.originalUrl}
              </p>
            </div>

            <label className="mt-6 block">
              <span className="text-sm font-medium text-zinc-300">
                Reason for reporting
              </span>

              <select
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={submitting}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#090e19] px-4 py-3 text-sm text-white outline-none focus:border-blue-400/60"
              >
                <option value="" disabled>
                  Select a reason
                </option>

                {REPORT_REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-zinc-300">
                Additional details
                <span className="ml-2 text-xs text-zinc-500">
                  Optional
                </span>
              </span>

              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                rows={4}
                disabled={submitting}
                placeholder="Describe why you believe this link is abusive..."
                className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#090e19] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-400/60 disabled:opacity-50"
              />

              <span className="mt-1 block text-right text-xs text-zinc-500">
                {description.length}/2000
              </span>
            </label>

            {error && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-5 text-red-300"
              >
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting || !reason}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Flag size={16} />
                {submitting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
