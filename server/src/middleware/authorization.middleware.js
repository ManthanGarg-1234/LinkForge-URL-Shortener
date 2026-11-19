
/**
 * Restricts access to users with one of the specified roles.
 *
 * Usage:
 * router.get("/admin", authenticate, authorizeRoles("ADMIN"), handler);
 */
export function authorizeRoles(...allowedRoles) {
  if (
    allowedRoles.length === 0 ||
    allowedRoles.some(
      (role) => typeof role !== "string" || role.length === 0
    )
  ) {
    throw new TypeError(
      "At least one valid role must be provided."
    );
  }

  const permittedRoles = new Set(allowedRoles);

  return function roleAuthorization(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication is required.",
        },
      });
    }

    if (!permittedRoles.has(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to access this resource.",
        },
      });
    }

    return next();
  };
}
