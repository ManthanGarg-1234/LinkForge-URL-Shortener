const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 200;

export function getAuthRouteState(pathname, search = "") {
  const params = new URLSearchParams(search);

  if (pathname === "/verify-email") {
    const token = params.get("token") || "";

    let verificationError = "";

    if (!token) {
      verificationError =
        "The verification token is missing. Open the complete verification link from your email.";
    } else if (
      token.trim().length < MIN_TOKEN_LENGTH ||
      token.length > MAX_TOKEN_LENGTH
    ) {
      verificationError =
        "The email verification link is invalid or incomplete.";
    }

    return {
      mode: "verify",
      verificationToken: token,
      verificationError,
      resetToken: "",
    };
  }

  if (pathname === "/reset-password") {
    return {
      mode: "reset",
      verificationToken: "",
      verificationError: "",
      resetToken: params.get("token") || "",
    };
  }

  if (pathname === "/forgot-password") {
    return {
      mode: "forgot",
      verificationToken: "",
      verificationError: "",
      resetToken: "",
    };
  }

  return {
    mode: "login",
    verificationToken: "",
    verificationError: "",
    resetToken: "",
  };
}

export function getAuthRoutePath(mode, resetToken = "") {
  if (mode === "forgot") {
    return "/forgot-password";
  }

  if (mode === "reset") {
    const query = resetToken
      ? `?token=${encodeURIComponent(resetToken)}`
      : "";

    return `/reset-password${query}`;
  }

  return "/";
}
