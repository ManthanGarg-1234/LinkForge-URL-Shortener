import {
  getAdminDashboardOverview,
  getAdminUsers,
  getAdminUserById,
  suspendAdminManagedUser,
  reactivateAdminManagedUser,
} from "../services/admin.service.js";

import {
  adminUserIdSchema,
  adminUserListSchema,
  suspendUserSchema,
} from "../validators/admin.schemas.js";

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

function handleAdminError(error, res) {
  if (
    Number.isInteger(error.statusCode) &&
    typeof error.code === "string"
  ) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  throw error;
}

export async function getDashboardOverview(req, res) {
  const dashboard = await getAdminDashboardOverview();

  return res.status(200).json({
    success: true,
    data: dashboard,
  });
}

export async function listAdminUsers(req, res) {
  const parsed = adminUserListSchema.safeParse(req.query);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const result = await getAdminUsers(parsed.data);

  return res.status(200).json({
    success: true,
    data: {
      users: result.items,
      pagination: result.pagination,
    },
  });
}

export async function getAdminUser(req, res) {
  const parsed = adminUserIdSchema.safeParse(req.params);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  try {
    const user = await getAdminUserById(parsed.data.id);

    return res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    return handleAdminError(error, res);
  }
}

export async function suspendUser(req, res) {
  const params = adminUserIdSchema.safeParse(req.params);

  if (!params.success) {
    return validationError(res, params.error);
  }

  const body = suspendUserSchema.safeParse(req.body);

  if (!body.success) {
    return validationError(res, body.error);
  }

  try {
    const result = await suspendAdminManagedUser({
      targetUserId: params.data.id,
      adminUserId: req.user.id,
      reason: body.data.reason,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(200).json({
      success: true,
      message: "User account suspended successfully.",
      data: { user: result },
    });
  } catch (error) {
    return handleAdminError(error, res);
  }
}

export async function reactivateUser(req, res) {
  const params = adminUserIdSchema.safeParse(req.params);

  if (!params.success) {
    return validationError(res, params.error);
  }

  try {
    const result = await reactivateAdminManagedUser({
      targetUserId: params.data.id,
      adminUserId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(200).json({
      success: true,
      message: "User account reactivated successfully.",
      data: { user: result },
    });
  } catch (error) {
    return handleAdminError(error, res);
  }
}