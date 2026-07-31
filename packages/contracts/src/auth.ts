import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "请输入邮箱")
  .max(254, "邮箱不能超过 254 个字符")
  .email("请输入有效邮箱");

export const passwordSchema = z
  .string()
  .min(8, "密码至少 8 位")
  .max(128, "密码不能超过 128 位");

export const authCredentialsSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema
});

export const userSchema = z.strictObject({
  id: z.string().uuid(),
  email: emailSchema,
  createdAt: z.string().datetime({ offset: true })
});

export const authSessionSchema = z.strictObject({
  token: z.string().min(32),
  expiresAt: z.string().datetime({ offset: true })
});

export const authResponseSchema = z.strictObject({
  user: userSchema,
  session: authSessionSchema
});

export const meResponseSchema = z.strictObject({
  user: userSchema
});

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type AuthUser = z.infer<typeof userSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;

