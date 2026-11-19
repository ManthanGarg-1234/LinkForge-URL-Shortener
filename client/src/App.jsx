
import { useEffect, useState } from "react";

import { useAuth } from "./context/AuthContext.jsx";
import AuthenticatedApp from "./components/AuthenticatedApp.jsx";
import AdminApp from "./components/AdminApp.jsx";

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="brand-mark">
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path
            d="M15 25L25 15M13 16L10 19C7.5 21.5 7.5 25.5 10 28C12.5 30.5 16.5 30.5 19 28L22 25"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M27 24L30 21C32.5 18.5 32.5 14.5 30 12C27.5 9.5 23.5 9.5 21 12L18 15"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <span className="text-xl font-bold tracking-tight">
        Link<span className="text-blue-400">Forge</span>
      </span>
    </div>
  );
}

function InputField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  maxLength,
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-zinc-300">{label}</span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        className="auth-input"
      />
    </label>
  );
}

function AuthScreen() {
  const {
    login,
    register,
    googleLogin,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    authError,
    clearAuthError,
  } = useAuth();

  const [mode, setMode] = useState(() => {
    if (window.location.pathname === "/reset-password") {
      return "reset";
    }

    if (window.location.pathname === "/forgot-password") {
      return "forgot";
    }

    return "login";
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [verificationToken, setVerificationToken] = useState("");
  const [resetToken, setResetToken] = useState(
    () => new URLSearchParams(window.location.search).get("token") || "",
  );

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [localError, setLocalError] = useState("");

  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isVerify = mode === "verify";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";

  function changeMode(nextMode) {
    setMode(nextMode);
    setSuccessMessage("");
    setLocalError("");
    clearAuthError();

    if (nextMode === "forgot") {
      window.history.pushState({}, "", "/forgot-password");
    } else if (nextMode === "reset") {
      const query = resetToken
        ? `?token=${encodeURIComponent(resetToken)}`
        : "";

      window.history.pushState({}, "", `/reset-password${query}`);
    } else {
      window.history.pushState({}, "", "/");
    }
  }

  useEffect(() => {
    function handlePopState() {
      const pathname = window.location.pathname;

      if (pathname === "/reset-password") {
        setMode("reset");
        setResetToken(
          new URLSearchParams(window.location.search).get("token") || "",
        );
      } else if (pathname === "/forgot-password") {
        setMode("forgot");
      } else {
        setMode("login");
      }

      setLocalError("");
      setSuccessMessage("");
      clearAuthError();
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [clearAuthError]);

  function validateForm() {
    const normalizedEmail = email.trim();

    if (
      (isLogin || isRegister || isForgot) &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return "Enter a valid email address.";
    }

    if (isRegister) {
      if (name.trim().length < 2) {
        return "Name must contain at least 2 characters.";
      }

      if (name.trim().length > 100) {
        return "Name must not exceed 100 characters.";
      }
    }

    if (isLogin || isRegister) {
      if (password.length < 12) {
        return "Password must contain at least 12 characters.";
      }

      if (password.length > 128) {
        return "Password must not exceed 128 characters.";
      }
    }

    if (isReset) {
      if (!resetToken || resetToken.trim().length < 20) {
        return "The password reset link is invalid or incomplete.";
      }

      if (password.length < 12 || password.length > 128) {
        return "Password must contain between 12 and 128 characters.";
      }

      if (password !== confirmPassword) {
        return "Passwords do not match.";
      }
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setLocalError("");
    setSuccessMessage("");
    clearAuthError();

    if (isVerify) {
      if (verificationToken.trim().length < 20) {
        setLocalError("Enter a valid email verification token.");
        return;
      }
    } else {
      const validationError = validateForm();

      if (validationError) {
        setLocalError(validationError);
        return;
      }
    }

    setSubmitting(true);

    try {
      if (isLogin) {
        await login({
          email: email.trim(),
          password,
        });
      } else if (isRegister) {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
        });

        setSuccessMessage(
          "Registration received. Check your email for the verification link before signing in.",
        );

        setPassword("");
      } else if (isVerify) {
        await verifyEmail(verificationToken.trim());

        setVerificationToken("");
        changeMode("login");

        setSuccessMessage(
          "Your email has been verified. You can now sign in.",
        );
      } else if (isForgot) {
        await requestPasswordReset(email.trim());

        setSuccessMessage(
          "If an eligible account exists for this email, password reset instructions will be sent.",
        );

        setEmail("");
      } else if (isReset) {
        await resetPassword(resetToken.trim(), password);

        setPassword("");
        setConfirmPassword("");
        setResetToken("");

        changeMode("login");

        setSuccessMessage(
          "Your password has been reset successfully. Sign in using your new password.",
        );
      }
    } catch (error) {
      setLocalError(
        error.message || "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setLocalError("");
    setSuccessMessage("");
    clearAuthError();
    setSubmitting(true);

    try {
      await googleLogin();
    } catch (error) {
      setLocalError(error.message || "Google sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderPasswordField(label, value, setter, autoComplete) {
    return (
      <label className="block space-y-2">
        <span className="text-sm font-medium text-zinc-300">{label}</span>

        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={value}
            onChange={(event) => setter(event.target.value)}
            placeholder={label}
            autoComplete={autoComplete}
            maxLength={128}
            required
            className="auth-input pr-20"
          />

          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400 hover:text-white"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        {isRegister && label === "Password" && (
          <p className="text-xs text-zinc-500">
            Use at least 12 characters.
          </p>
        )}
      </label>
    );
  }

  const heading = isLogin
    ? "Welcome back"
    : isRegister
      ? "Create your account"
      : isVerify
        ? "Verify your email"
        : isForgot
          ? "Forgot your password?"
          : "Reset your password";

  const description = isLogin
    ? "Sign in to continue to your LinkForge workspace."
    : isRegister
      ? "Start managing your links with LinkForge."
      : isVerify
        ? "Enter the verification token from your email."
        : isForgot
          ? "Enter your registered email address to request a password reset."
          : "Choose a new password for your LinkForge account.";

  const submitLabel = isLogin
    ? "Sign in"
    : isRegister
      ? "Create account"
      : isVerify
        ? "Verify email"
        : isForgot
          ? "Send reset instructions"
          : "Reset password";

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />

      <header className="auth-header">
        <Brand />
        <span className="hidden text-sm text-zinc-500 sm:block">
          Smart links. Powerful analytics.
        </span>
      </header>

      <section className="auth-layout">
        <div className="auth-presentation">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-xs font-medium text-blue-300">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            YOUR LINKS, YOUR CONTROL
          </div>

          <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            One link can
            <br />
            <span className="gradient-text">go further.</span>
          </h1>

          <p className="mt-6 max-w-lg text-base leading-7 text-zinc-400 sm:text-lg">
            Create smarter short links, understand your audience, and manage
            every destination from one powerful workspace.
          </p>

          <div className="mt-12 grid max-w-lg grid-cols-2 gap-4">
            <div className="feature-card">
              <div className="feature-icon">↗</div>
              <h3>Smart links</h3>
              <p>Create short, memorable URLs.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">⌁</div>
              <h3>Link insights</h3>
              <p>Understand engagement and traffic.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">◈</div>
              <h3>One workspace</h3>
              <p>Keep your links organized.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">⌘</div>
              <h3>Built for scale</h3>
              <p>Reliable link management.</p>
            </div>
          </div>

          <p className="mt-10 text-xs text-zinc-600">
            LINKFORGE · SMART LINKS. POWERFUL ANALYTICS. COMPLETE CONTROL.
          </p>
        </div>

        <div className="auth-card">
          <div className="mb-7">
            <Brand />

            <h2 className="mt-8 text-2xl font-bold tracking-tight text-white">
              {heading}
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {description}
            </p>
          </div>

          {(localError || authError) && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              {localError || authError}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-300"
            >
              {successMessage}
            </div>
          )}

          {isLogin && (
            <>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={submitting}
                className="google-button"
              >
                <svg
                  viewBox="0 0 48 48"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.8 17.7 9.5 24 9.5Z"
                    transform="translate(0 5)"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.1 24.5c0-1.5-.1-3-.4-4.5H24v9h12.4c-.6 3-2.3 5.5-4.8 7.2l7.8 6C44 37.9 46.1 31.8 46.1 24.5Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.2 0 20 0 24s.9 7.8 2.6 10.8l7.8-6.1Z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.2 0 11.4-2 15.3-5.8l-7.8-6c-2.1 1.4-4.6 2.2-7.5 2.2-6.3 0-11.7-4.3-13.6-10.1l-7.8 6.1C6.5 42.6 14.6 48 24 48Z"
                  />
                </svg>

                Continue with Google
              </button>

              <div className="auth-divider">
                <span>OR CONTINUE WITH EMAIL</span>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {isRegister && (
              <InputField
                label="Full name"
                value={name}
                onChange={setName}
                placeholder="Enter your full name"
                autoComplete="name"
                maxLength={100}
              />
            )}

            {isLogin || isRegister || isForgot ? (
              <InputField
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete="email"
                maxLength={255}
              />
            ) : null}

            {isLogin || isRegister ? (
              renderPasswordField(
                "Password",
                password,
                setPassword,
                isRegister ? "new-password" : "current-password",
              )
            ) : null}

            {isVerify && (
              <InputField
                label="Verification token"
                value={verificationToken}
                onChange={setVerificationToken}
                placeholder="Paste your email verification token"
                autoComplete="off"
                maxLength={200}
              />
            )}

            {isReset && (
              <>
                {!resetToken && (
                  <div
                    role="alert"
                    className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-300"
                  >
                    The reset token is missing. Open the complete password
                    reset link from your email.
                  </div>
                )}

                {renderPasswordField(
                  "New password",
                  password,
                  setPassword,
                  "new-password",
                )}

                {renderPasswordField(
                  "Confirm new password",
                  confirmPassword,
                  setConfirmPassword,
                  "new-password",
                )}
              </>
            )}

            <button
              type="submit"
              disabled={submitting || (isReset && !resetToken)}
              className="primary-button"
            >
              {submitting ? "Please wait..." : submitLabel}

              {!submitting && <span aria-hidden="true">→</span>}
            </button>
          </form>

          {isLogin && (
            <div className="mt-5 text-right">
              <button
                type="button"
                onClick={() => changeMode("forgot")}
                className="text-sm font-medium text-blue-400 transition hover:text-blue-300"
              >
                Forgot password?
              </button>
            </div>
          )}

          {(isLogin || isRegister) && (
            <p className="mt-7 text-center text-sm text-zinc-400">
              {isLogin
                ? "Don't have an account?"
                : "Already have an account?"}

              <button
                type="button"
                onClick={() => changeMode(isLogin ? "register" : "login")}
                className="ml-2 font-semibold text-blue-400 hover:text-blue-300"
              >
                {isLogin ? "Create account" : "Sign in"}
              </button>
            </p>
          )}

          {(isVerify || isForgot || isReset) && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => changeMode("login")}
                className="text-sm font-medium text-blue-400 transition hover:text-blue-300"
              >
                Back to sign in
              </button>
            </div>
          )}

          {(isLogin || isRegister) && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => changeMode("verify")}
                className="text-xs text-zinc-500 transition hover:text-blue-400"
              >
                Have an email verification token?
              </button>
            </div>
          )}

          <div className="mt-8 border-t border-white/5 pt-5 text-center text-xs leading-5 text-zinc-600">
            By continuing, you agree to use LinkForge responsibly.
            <br />
            Your account credentials are securely handled by our authentication
            service.
          </div>
        </div>
      </section>

      <footer className="auth-footer">
        <span>© {new Date().getFullYear()} LinkForge</span>
        <span>Built for smarter link management.</span>
      </footer>
    </main>
  );
}

function App() {
  const { loading, isAuthenticated, user } = useAuth();

  const isPasswordRecoveryRoute =
    window.location.pathname === "/reset-password" ||
    window.location.pathname === "/forgot-password";

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090d18] text-white">
        <div className="text-center">
          <div className="loading-spinner mx-auto" />
          <p className="mt-4 text-sm text-zinc-400">
            Restoring your LinkForge session...
          </p>
        </div>
      </main>
    );
  }

  if (isAuthenticated && !isPasswordRecoveryRoute) {
    if (user?.role === "ADMIN") {
      return <AdminApp />;
    }

    return <AuthenticatedApp />;
  }

  return <AuthScreen />;
}

export default App;
