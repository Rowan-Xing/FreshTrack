import type {
  AuthCredentials,
  AuthResponse,
  AuthUser
} from "@freshtrack/contracts";
import { Prisma, type PrismaClient, type User } from "@prisma/client";

import { AppError } from "./errors.js";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  verifyPassword
} from "./security.js";

export type AuthenticatedSession = {
  tokenHash: string;
  user: AuthUser;
};

export interface AuthService {
  register(credentials: AuthCredentials): Promise<AuthResponse>;
  login(credentials: AuthCredentials): Promise<AuthResponse>;
  authenticate(token: string): Promise<AuthenticatedSession>;
  logout(tokenHash: string): Promise<void>;
}

function toUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString()
  };
}

function expiresAtFrom(now: Date, sessionTtlDays: number): Date {
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + sessionTtlDays);
  return expiresAt;
}

function toAuthResponse(
  user: User,
  token: string,
  expiresAt: Date
): AuthResponse {
  return {
    user: toUser(user),
    session: {
      token,
      expiresAt: expiresAt.toISOString()
    }
  };
}

export async function createAuthService(
  prisma: PrismaClient,
  sessionTtlDays: number
): Promise<AuthService> {
  const dummyPasswordHash = await hashPassword(
    "freshtrack-dummy-password-never-used"
  );

  async function createSession(user: User): Promise<AuthResponse> {
    const token = createOpaqueToken();
    const tokenHash = hashOpaqueToken(token);
    const expiresAt = expiresAtFrom(new Date(), sessionTtlDays);
    await prisma.authSession.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt
      }
    });

    return toAuthResponse(user, token, expiresAt);
  }

  return {
    async register(credentials) {
      const passwordHash = await hashPassword(credentials.password);
      const token = createOpaqueToken();
      const tokenHash = hashOpaqueToken(token);
      const expiresAt = expiresAtFrom(new Date(), sessionTtlDays);
      let user: User;
      try {
        user = await prisma.$transaction(async (transaction) => {
          const createdUser = await transaction.user.create({
            data: {
              email: credentials.email,
              passwordHash
            }
          });
          await transaction.authSession.create({
            data: {
              tokenHash,
              userId: createdUser.id,
              expiresAt
            }
          });
          return createdUser;
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new AppError(
            "AUTH_EMAIL_TAKEN",
            "该邮箱已注册",
            409
          );
        }
        throw error;
      }
      return toAuthResponse(user, token, expiresAt);
    },

    async login(credentials) {
      const user = await prisma.user.findUnique({
        where: { email: credentials.email }
      });
      const passwordMatches = await verifyPassword(
        user?.passwordHash ?? dummyPasswordHash,
        credentials.password
      );

      if (!user || !passwordMatches) {
        throw new AppError(
          "AUTH_INVALID_CREDENTIALS",
          "邮箱或密码错误",
          401
        );
      }
      return createSession(user);
    },

    async authenticate(token) {
      const tokenHash = hashOpaqueToken(token);
      const session = await prisma.authSession.findUnique({
        where: { tokenHash },
        include: { user: true }
      });

      if (!session || session.revokedAt) {
        throw new AppError(
          "AUTH_SESSION_INVALID",
          "登录状态已失效，请重新登录",
          401
        );
      }

      if (session.expiresAt.getTime() <= Date.now()) {
        await prisma.authSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: new Date() }
        });
        throw new AppError(
          "AUTH_SESSION_EXPIRED",
          "登录状态已过期，请重新登录",
          401
        );
      }

      return {
        tokenHash,
        user: toUser(session.user)
      };
    },

    async logout(tokenHash) {
      await prisma.authSession.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }
  };
}
