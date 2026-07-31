import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";

import { createApp } from "./app.js";
import { createAuthService } from "./auth-service.js";
import { parseApiEnv } from "./env.js";
import { createFoodService } from "./food-service.js";
import { createLogger } from "./logger.js";

const env = parseApiEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const prisma = new PrismaClient();
const authService = await createAuthService(prisma, env.SESSION_TTL_DAYS);
const foodService = createFoodService(prisma);
const app = createApp({ authService, foodService, logger });

const server = serve({
  fetch: app.fetch,
  hostname: env.API_HOST,
  port: env.API_PORT
});

logger.log("info", "api_started", {
  host: env.API_HOST,
  port: env.API_PORT
});

async function shutdown(signal: string): Promise<void> {
  logger.log("info", "api_stopping", { signal });
  server.close();
  await prisma.$disconnect();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
