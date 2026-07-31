import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "AUTH_EMAIL_TAKEN",
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_REQUIRED",
  "AUTH_SESSION_INVALID",
  "AUTH_SESSION_EXPIRED",
  "REQUEST_INVALID",
  "INTERNAL_ERROR",
  "NOT_FOUND"
]);

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(1),
    fields: z.record(z.string(), z.array(z.string())).optional()
  })
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

