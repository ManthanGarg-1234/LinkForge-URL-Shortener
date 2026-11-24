import { useEffect, useState } from "react";
import { CalendarClock, Link2, Save, X } from "lucide-react";
import { urlApi } from "../services/api.js";

function getErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Unable to update this short link. Please try again."
  );
}

function toLocalDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toLocalDateTimeInputValue(date) {
  const offset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function EditShortUrlModal({ item, onClose, onUpdated }) {
  const [originalUrl, setOriginalUrl] = useState(item.originalUrl || "");
  const [expiresAt, setExpiresAt] = useState(toLocalDateTime(item.expiresAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const minimumExpiration = toLocalDateTimeInputValue(
    new Date(Date.now() + 60000),
  );

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, saving]);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");

    const destination = originalUrl.trim();

    if (!destination) {
      setError("Enter a destination URL.");
      return;
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(destination);
    } catch {
      setError("Enter a valid destination URL.");
      return;
    }

    if (
      !["http:", "https:"].includes(parsedUrl.protocol) ||
      !parsedUrl.hostname ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      setError(
        "Only valid HTTP and HTTPS URLs without embedded credentials are allowed.",
      );
      return;
    }

    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      setError("Expiration date must be in the future.");
      return;
    }

    const payload = {
      originalUrl: destination,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    };

    setSaving(true);

    try {
      await urlApi.updateShortUrl(item.id, payload);
      onUpdated();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-link-title"
        className="my-auto w-full max-w-xl rounded-2xl border border-white/10 bg-[#101725] p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex rounded-xl bg-blue-500/10 p-3 text-blue-400">
              <Link2 size={22} />
            </div>

            <h2 id="edit-link-title" className="text-xl font-bold text-white">
              Edit short link
            </h2>

            <p className="mt-2 text-sm text-zinc-400">
              Update the destination or expiration of this link.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close edit dialog"
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#0b101d] p-4">
          <p className="text-xs text-zinc-500">Short URL</p>

          <p className="mt-2 break-all text-sm font-semibold text-blue-300">
            {item.shortCode}
          </p>

          <p className="mt-2 text-xs text-zinc-500">
            Your existing short code and click history will remain unchanged.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6">
          <label className="block">
            <span className="text-sm font-medium text-zinc-300">
              Destination URL
            </span>

            <input
              type="url"
              required
              maxLength={2048}
              value={originalUrl}
              onChange={(event) => setOriginalUrl(event.target.value)}
              placeholder="https://example.com/destination"
              className="mt-3 w-full rounded-xl border border-white/10 bg-[#090e19] px-4 py-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/10"
            />

            <span className="mt-2 block text-xs text-zinc-500">
              Only HTTP and HTTPS destination URLs are accepted.
            </span>
          </label>

          <label className="mt-7 block">
            <span className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <CalendarClock size={16} />
              Expiration date
              <span className="text-xs text-zinc-600">Optional</span>
            </span>

            <input
              type="datetime-local"
              value={expiresAt}
              min={minimumExpiration}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="mt-3 w-full rounded-xl border border-white/10 bg-[#090e19] px-4 py-4 text-sm text-white outline-none focus:border-blue-400/60"
            />

            <span className="mt-2 block text-xs leading-5 text-zinc-500">
              Leave this field empty to remove the current expiration date.
            </span>
          </label>

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-xl border border-white/10 px-5 py-3.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={17} />
              {saving ? "Saving changes..." : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
