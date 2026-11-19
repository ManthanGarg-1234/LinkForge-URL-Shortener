
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
} from "../validators/auth.schemas.js";

import {
  firebaseGoogleLoginSchema,
} from "../validators/firebase-auth.schemas.js";

import {
  registerUser,
  loginUser,
} from "../services/auth.service.js";

import {
  authenticateFirebaseGoogleUser,
} from "../services/firebase-auth.service.js";

import {
  verifyEmailAddress,
} from "../services/email-verification.service.js";

import {
  sendVerificationEmail,
} from "../services/email-delivery.service.js";

import {
  rotateRefreshToken,
  revokeSession,
} from "../services/session.service.js";

import {
  getFirebaseAuth,
  isFirebaseConfigured,
} from "../config/firebase-admin.js";

import {
  REFRESH_TOKEN_COOKIE,
} from "../config/auth.js";

import {
  setAuthCookies,
  clearAuthCookies,
} from "../utils/auth-cookie.utils.js";

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    },
  });
}

export async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const result = await registerUser(parsed.data);

  if (result.created) {
    await sendVerificationEmail({
      email: result.user.email,
      name: result.user.name,
      token: result.verificationToken,
    });
  }

  return res.status(202).json({
    success: true,
    message:
      "If registration is available for this email, a verification link will be sent.",
  });
}

export async function verifyEmail(req, res) {
  const parsed = verifyEmailSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const result = await verifyEmailAddress(parsed.data.token);

  if (!result.verified) {
    return res.status(400).json({
      success: false,
      error: {
        code: result.reason,
        message: "The verification link is invalid or has expired.",
      },
    });
  }

  return res.status(200).json({
    success: true,
    message:
      result.reason === "ALREADY_VERIFIED"
        ? "Email address is already verified."
        : "Email address verified successfully.",
  });
}

export async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const result = await loginUser(parsed.data, {
    userAgent: req.get("user-agent"),
    ipAddress: req.ip,
  });

  if (!result.authenticated) {
    return res.status(401).json({
      success: false,
      error: {
        code: "AUTHENTICATION_FAILED",
        message: "Unable to authenticate with the supplied credentials.",
      },
    });
  }

  setAuthCookies(res, {
    accessToken: result.session.accessToken,
    refreshToken: result.session.refreshToken,
  });

  return res.status(200).json({
    success: true,
    message: "Login successful.",
    data: {
      user: result.user,
    },
  });
}

/**
 * Google authentication through Firebase Authentication.
 *
 * The Firebase ID token is verified server-side.
 * LinkForge creates its own database-backed session.
 */
export async function googleLogin(req, res) {
  const parsed = firebaseGoogleLoginSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  if (!isFirebaseConfigured) {
    return res.status(503).json({
      success: false,
      error: {
        code: "GOOGLE_AUTH_UNAVAILABLE",
        message: "Google authentication is currently unavailable.",
      },
    });
  }

  let decodedToken;

  try {
    const firebaseAuth = await getFirebaseAuth();

    decodedToken = await firebaseAuth.verifyIdToken(
      parsed.data.idToken,
      true,
    );
  } catch (error) {
    const invalidTokenCodes = new Set([
      "auth/argument-error",
      "auth/id-token-expired",
      "auth/id-token-revoked",
      "auth/invalid-id-token",
      "auth/user-disabled",
      "auth/user-not-found",
    ]);

    if (invalidTokenCodes.has(error?.code)) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_GOOGLE_TOKEN",
          message: "Google authentication could not be verified.",
        },
      });
    }

    throw error;
  }

  const result = await authenticateFirebaseGoogleUser(
    decodedToken,
    {
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    },
  );

  if (!result.authenticated) {
    if (result.reason === "ACCOUNT_LINK_REQUIRED") {
      return res.status(409).json({
        success: false,
        error: {
          code: "ACCOUNT_LINK_REQUIRED",
          message:
            "An account with this email already exists. Sign in using your existing method before linking Google.",
        },
      });
    }

    if (result.reason === "ACCOUNT_UNAVAILABLE") {
      return res.status(403).json({
        success: false,
        error: {
          code: "ACCOUNT_UNAVAILABLE",
          message: "This account is currently unavailable.",
        },
      });
    }

    return res.status(401).json({
      success: false,
      error: {
        code: "GOOGLE_AUTHENTICATION_FAILED",
        message: "Google authentication could not be completed.",
      },
    });
  }

  setAuthCookies(res, {
    accessToken: result.session.accessToken,
    refreshToken: result.session.refreshToken,
  });

  return res.status(200).json({
    success: true,
    message: "Google login successful.",
    data: {
      user: result.user,
    },
  });
}

export async function refresh(req, res) {
  const rawRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];

  if (!rawRefreshToken) {
    clearAuthCookies(res);

    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_REFRESH_TOKEN",
        message: "Authentication session is no longer valid.",
      },
    });
  }

  const result = await rotateRefreshToken(rawRefreshToken);

  if (!result.rotated) {
    clearAuthCookies(res);

    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_REFRESH_TOKEN",
        message: "Authentication session is no longer valid.",
      },
    });
  }

  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });

  return res.status(200).json({
    success: true,
    message: "Authentication session refreshed.",
  });
}

export async function logout(req, res) {
  await revokeSession({
    sessionId: req.user.sessionId,
    userId: req.user.id,
  });

  clearAuthCookies(res);

  return res.status(200).json({
    success: true,
    message: "Logout successful.",
  });
}

export async function getCurrentUser(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
      },
    },
  });
}
