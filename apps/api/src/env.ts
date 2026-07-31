import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export type ApiEnv = z.infer<typeof envSchema>;

export function parseApiEnv(source: NodeJS.ProcessEnv): ApiEnv {
  const result = envSchema.safeParse({
    ...source,
    API_PORT: source.PORT ?? source.API_PORT
  });
  if (!result.success) {
    const names = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter((name) => name.length > 0);
    throw new Error(
      `Invalid API environment variables: ${[...new Set(names)].join(", ")}`
    );
  }
  return result.data;
}
