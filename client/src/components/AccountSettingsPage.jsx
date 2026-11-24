import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  CircleAlert,
  LockKeyhole,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { useAuth } from "../context/AuthContext.jsx";

function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLabel(value) {
  if (!value) return "Not available";

  return String(value)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function InfoCard({ icon: Icon, label, value, description }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#101725] p-5">
      <div className="flex items-start gap-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.04] p-3 text-blue-400">
          <Icon size={20} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {label}
          </p>

          <p className="mt-2 break-words text-sm font-semibold text-white">
            {value}
          </p>

          {description && (
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AccountSettingsPage() {
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setName(user?.name || "");
  }, [user?.name]);

  const originalName = user?.name || "";
  const trimmedName = name.trim();

  const hasChanges = trimmedName !== originalName;
  const isValidName = trimmedName.length >= 2 && trimmedName.length <= 100;

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!trimmedName) {
      setError("Display name is required.");
      return;
    }

    if (trimmedName.length < 2) {
      setError("Display name must contain at least 2 characters.");
      return;
    }

    if (trimmedName.length > 100) {
      setError("Display name cannot exceed 100 characters.");
      return;
    }

    if (!hasChanges) {
      setError("There are no changes to save.");
      return;
    }

    setSaving(true);

    try {
      await updateProfile({
        name: trimmedName,
      });

      setName(trimmedName);
      setSuccess("Your profile has been updated successfully.");
    } catch (err) {
      setError(
        err?.message || "Unable to update your profile. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const emailVerified = Boolean(user?.emailVerifiedAt);
  const accountActive = String(user?.status || "").toUpperCase() === "ACTIVE";

  return (
    <section>
      <div className="mb-8">
        <p className="text-sm font-medium text-blue-400">PERSONAL WORKSPACE</p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          Account settings
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Manage your profile information and review your account details.
        </p>
      </div>

      <div className="mb-8 overflow-hidden rounded-2xl border border-blue-400/15 bg-gradient-to-br from-blue-500/10 to-[#101725] p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/15 text-2xl font-bold text-blue-300">
            {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0">
            <h2 className="break-words text-xl font-bold text-white">
              {user?.name || "LinkForge User"}
            </h2>

            <p className="mt-1 break-all text-sm text-zinc-400">
              {user?.email || "Email unavailable"}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  accountActive
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                    : "border-amber-400/20 bg-amber-400/10 text-amber-300"
                }`}
              >
                <ShieldCheck size={13} />
                {formatLabel(user?.status)}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  emailVerified
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                    : "border-amber-400/20 bg-amber-400/10 text-amber-300"
                }`}
              >
                {emailVerified ? (
                  <BadgeCheck size={13} />
                ) : (
                  <CircleAlert size={13} />
                )}
                {emailVerified ? "Email verified" : "Email not verified"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          <CircleAlert size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
        >
          <Check size={18} className="mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-white/[0.07] bg-[#101725] p-6 sm:p-8"
          >
            <div className="mb-7">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-500/10 p-3 text-blue-400">
                  <UserRound size={20} />
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Personal information
                  </h2>

                  <p className="mt-1 text-xs text-zinc-500">
                    Update your public display name.
                  </p>
                </div>
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-zinc-300">
                Display name
              </span>

              <input
                type="text"
                name="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError("");
                  setSuccess("");
                }}
                minLength={2}
                maxLength={100}
                autoComplete="name"
                required
                placeholder="Enter your display name"
                className="mt-3 w-full rounded-xl border border-white/10 bg-[#090e19] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/10"
              />

              <span className="mt-2 flex justify-between text-xs text-zinc-500">
                <span>Between 2 and 100 characters.</span>
                <span>{name.length}/100</span>
              </span>
            </label>

            <div className="mt-7">
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">
                  Email address
                </span>

                <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#090e19] px-4 py-3.5">
                  <Mail size={17} className="shrink-0 text-zinc-500" />

                  <span className="min-w-0 flex-1 break-all text-sm text-zinc-400">
                    {user?.email || "Not available"}
                  </span>

                  <LockKeyhole size={16} className="shrink-0 text-zinc-600" />
                </div>

                <span className="mt-2 block text-xs text-zinc-600">
                  Email address cannot be changed from this page.
                </span>
              </label>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => {
                  setName(originalName);
                  setError("");
                  setSuccess("");
                }}
                disabled={!hasChanges || saving}
                className="rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Discard changes
              </button>

              <button
                type="submit"
                disabled={saving || !hasChanges || !isValidName}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? (
                  <>
                    <RefreshCw size={17} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={17} />
                    Save changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-5">
          <InfoCard
            icon={ShieldCheck}
            label="Account role"
            value={formatLabel(user?.role)}
            description="Your assigned LinkForge permissions. This cannot be changed here."
          />

          <InfoCard
            icon={BadgeCheck}
            label="Account status"
            value={formatLabel(user?.status)}
            description="Your current account access status."
          />

          <InfoCard
            icon={CalendarDays}
            label="Member since"
            value={formatDate(user?.createdAt)}
            description="Date your LinkForge account was created."
          />
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-white/[0.07] bg-[#101725] p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-violet-500/10 p-3 text-violet-400">
            <LockKeyhole size={20} />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white">
              Account security
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Your email address, account role, account status, and email
              verification state are protected account attributes. They cannot
              be modified through profile editing.
            </p>

            <p className="mt-3 text-xs leading-5 text-zinc-500">
              If you need to reset your password, use the Forgot password
              workflow available on the sign-in screen.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
