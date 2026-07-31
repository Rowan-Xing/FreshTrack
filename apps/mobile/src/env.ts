import { z } from "zod";

const mobileEnvSchema = z.strictObject({
  EXPO_PUBLIC_API_URL: z
    .string()
    .url("API 地址无效")
    .refine(
      (value) => value.startsWith("http://") || value.startsWith("https://"),
      "API 地址必须使用 http 或 https"
    )
    .transform((value) => value.replace(/\/+$/, ""))
});

export type MobileEnv = z.infer<typeof mobileEnvSchema>;

let cachedEnv: MobileEnv | undefined;

export function getMobileEnv(): MobileEnv {
  cachedEnv ??= mobileEnvSchema.parse({
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL
  });
  return cachedEnv;
}

