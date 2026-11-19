
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/password-reset.schemas.js";

import {
  requestPasswordReset,
  resetPassword,
} from "../services/password-reset.service.js";

import {
  sendPasswordResetEmail,
} from "../services/password-reset-delivery.service.js";

import {
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

export async function forgotPassword(req, res) {
  const parsed = forgotPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const result = await requestPasswordReset(parsed.data.email);

  if (result.requested) {
    await sendPasswordResetEmail({
      email: result.user.email,
      name: result.user.name,
      token: result.resetToken,
    });
  }

  // Identical response whether or not the account exists.
  return res.status(202).json({
    success: true,
    message:
      "If an account exists for this email, password reset instructions will be sent.",
  });
}

export async function completePasswordReset(req, res) {
  const parsed = resetPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const result = await resetPassword(
    parsed.data.token,
    parsed.data.newPassword
  );

  if (!result.reset) {
    return res.status(400).json({
      success: false,
      error: {
        code: result.reason,
        message: "The password reset link is invalid or has expired.",
      },
    });
  }

  // The reset service revokes every session. Clear cookies in this browser too.
  clearAuthCookies(res);

  return res.status(200).json({
    success: true,
    message:
      "Password reset successful. Please sign in using your new password.",
  });
}
