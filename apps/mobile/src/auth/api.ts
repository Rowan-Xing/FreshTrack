import {
  apiErrorSchema,
  authResponseSchema,
  meResponseSchema,
  type ApiErrorCode,
  type AuthCredentials,
  type AuthResponse,
  type MeResponse
} from "@freshtrack/contracts";
import type { z } from "zod";

import { getMobileEnv } from "../env";

const NETWORK_ERROR_MESSAGE = "无法连接服务器，请检查网络";

export class ApiClientError extends Error {
  public constructor(
    message: string,
    public readonly code: ApiErrorCode | "NETWORK_ERROR" | "INVALID_RESPONSE",
    public readonly status?: number,
    public readonly fields?: Record<string, string[]>
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  public get isInvalidSession(): boolean {
    return (
      this.code === "AUTH_REQUIRED" ||
      this.code === "AUTH_SESSION_EXPIRED" ||
      this.code === "AUTH_SESSION_INVALID"
    );
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function parseResponse<T>(
  response: Response,
  schema: z.ZodType<T>
): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiClientError(
      "服务器返回了无法识别的内容",
      "INVALID_RESPONSE",
      response.status
    );
  }

  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    if (!error.success) {
      throw new ApiClientError(
        "服务器返回了无法识别的错误",
        "INVALID_RESPONSE",
        response.status
      );
    }
    throw new ApiClientError(
      error.data.error.message,
      error.data.error.code,
      response.status,
      error.data.error.fields
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError(
      "服务器数据格式不兼容，请稍后重试",
      "INVALID_RESPONSE",
      response.status
    );
  }
  return parsed.data;
}

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getMobileEnv().EXPO_PUBLIC_API_URL}${path}`, init);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiClientError(
      NETWORK_ERROR_MESSAGE,
      "NETWORK_ERROR"
    );
  }
  return parseResponse(response, schema);
}

export function authorizationHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`
  };
}

export async function requestEmpty(
  path: string,
  init: RequestInit
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${getMobileEnv().EXPO_PUBLIC_API_URL}${path}`, init);
  } catch {
    throw new ApiClientError(
      NETWORK_ERROR_MESSAGE,
      "NETWORK_ERROR"
    );
  }
  if (response.status === 204) {
    return;
  }
  await parseResponse(response, meResponseSchema);
}

export function register(credentials: AuthCredentials): Promise<AuthResponse> {
  return request("/v1/auth/register", authResponseSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials)
  });
}

export function login(credentials: AuthCredentials): Promise<AuthResponse> {
  return request("/v1/auth/login", authResponseSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials)
  });
}

export function me(token: string): Promise<MeResponse> {
  return request("/v1/auth/me", meResponseSchema, {
    method: "GET",
    headers: authorizationHeaders(token)
  });
}

export async function logout(token: string): Promise<void> {
  await requestEmpty("/v1/auth/logout", {
    method: "POST",
    headers: authorizationHeaders(token)
  });
}
