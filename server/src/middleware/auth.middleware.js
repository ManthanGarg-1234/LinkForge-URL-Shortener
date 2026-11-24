import { prisma } from "../lib/prisma.js";
import { ACCESS_TOKEN_COOKIE } from "../config/auth.js";
import { verifyAccessToken } from "../utils/token.utils.js";

function unauthorized(res) {
  return res.status(401).json({
    success: false,
    error: {
      code: "UNAUTHENTICATED",
      message: "Authentication is required.",
    },
  });
}

/**
 * Verifies the access token and its database-backed session.
 *
 * On success, attaches the authenticated identity and safe account
 * metadata to req.user.
 */
export async function authenticate(req, res, next) {
  const accessToken = req.cookies?.[ACCESS_TOKEN_COOKIE];

  if (!accessToken) {
    return unauthorized(res);
  }

  let claims;

  try {
    claims = await verifyAccessToken(accessToken);
  } catch {
    return unauthorized(res);
  }

  try {
    const session = await prisma.session.findFirst({
      where: {
        id: claims.sessionId,
        userId: claims.userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session || !session.user) {
      return unauthorized(res);
    }

    const user = session.user;

    if (user.status !== "ACTIVE" || !user.emailVerifiedAt) {
      return unauthorized(res);
    }

    req.user = Object.freeze({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      sessionId: session.id,
    });

    return next();
  } catch (error) {
    return next(error);
  }
}
