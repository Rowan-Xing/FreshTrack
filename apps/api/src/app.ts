import {
  apiErrorSchema,
  authCredentialsSchema,
  authResponseSchema,
  foodCountsQuerySchema,
  foodCountsResponseSchema,
  foodCreateSchema,
  foodItemsResponseSchema,
  foodListQuerySchema,
  foodListResponseSchema,
  foodProcessSchema,
  foodResponseSchema,
  foodUpdateSchema,
  meResponseSchema,
  type ApiErrorCode
} from "@freshtrack/contracts";
import { Hono, type Context, type Next } from "hono";
import { z } from "zod";

import type {
  AuthenticatedSession,
  AuthService
} from "./auth-service.js";
import { AppError } from "./errors.js";
import type { FoodService } from "./food-service.js";
import type { Logger } from "./logger.js";

type Variables = {
  requestId: string;
  session: AuthenticatedSession;
};

type AppBindings = {
  Variables: Variables;
};

type AppContext = Context<AppBindings>;

type AppDependencies = {
  authService: AuthService;
  foodService: FoodService;
  logger: Logger;
};

const CLIENT_REQUEST_ID = /^[A-Za-z0-9_-]{8,100}$/;

function getBearerToken(header: string | undefined): string {
  if (!header) {
    throw new AppError("AUTH_REQUIRED", "请先登录", 401);
  }
  const match = /^Bearer ([A-Za-z0-9_-]{32,})$/.exec(header);
  if (!match?.[1]) {
    throw new AppError("AUTH_SESSION_INVALID", "登录凭据无效", 401);
  }
  return match[1];
}

function validationFields(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const name = issue.path.join(".") || "_";
    fields[name] = [...(fields[name] ?? []), issue.message];
  }
  return fields;
}

export function createApp({
  authService,
  foodService,
  logger
}: AppDependencies): Hono<{
  Variables: Variables;
}> {
  const app = new Hono<AppBindings>();

  app.use("*", async (context, next) => {
    const incoming = context.req.header("x-request-id");
    const requestId =
      incoming && CLIENT_REQUEST_ID.test(incoming)
        ? incoming
        : crypto.randomUUID();
    context.set("requestId", requestId);
    context.header("x-request-id", requestId);

    const startedAt = performance.now();
    await next();
    logger.log("info", "http_request", {
      requestId,
      method: context.req.method,
      path: new URL(context.req.url).pathname,
      status: context.res.status,
      durationMs: Math.round(performance.now() - startedAt)
    });
  });

  const requireAuth = async (
    context: AppContext,
    next: Next
  ): Promise<void> => {
    const token = getBearerToken(context.req.header("authorization"));
    context.set("session", await authService.authenticate(token));
    await next();
  };

  async function parseCredentials(context: AppContext) {
    return parseJson(context, authCredentialsSchema, "请检查表单内容");
  }

  async function parseJson<T>(
    context: AppContext,
    schema: z.ZodType<T>,
    message: string
  ): Promise<T> {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      throw new AppError("REQUEST_INVALID", "请求内容不是有效 JSON", 400);
    }
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new AppError(
        "REQUEST_INVALID",
        message,
        400,
        validationFields(result.error.issues)
      );
    }
    return result.data;
  }

  app.get("/health", (context) =>
    context.json({ status: "ok", requestId: context.get("requestId") })
  );

  app.post("/v1/auth/register", async (context) => {
    const response = authResponseSchema.parse(
      await authService.register(await parseCredentials(context))
    );
    return context.json(response, 201);
  });

  app.post("/v1/auth/login", async (context) => {
    const response = authResponseSchema.parse(
      await authService.login(await parseCredentials(context))
    );
    return context.json(response);
  });

  app.use("/v1/auth/me", requireAuth);
  app.get("/v1/auth/me", (context) => {
    const response = meResponseSchema.parse({
      user: context.get("session").user
    });
    return context.json(response);
  });

  app.use("/v1/auth/logout", requireAuth);
  app.post("/v1/auth/logout", async (context) => {
    await authService.logout(context.get("session").tokenHash);
    return context.body(null, 204);
  });

  app.use("/v1/foods", requireAuth);
  app.use("/v1/foods/*", requireAuth);

  app.post("/v1/foods", async (context) => {
    const food = await foodService.create(
      context.get("session").user.id,
      await parseJson(context, foodCreateSchema, "请检查食品内容")
    );
    return context.json(foodResponseSchema.parse({ food }), 201);
  });

  app.get("/v1/foods", async (context) => {
    const result = foodListQuerySchema.safeParse(context.req.query());
    if (!result.success) {
      throw new AppError(
        "REQUEST_INVALID",
        "请检查列表筛选条件",
        400,
        validationFields(result.error.issues)
      );
    }
    const page = await foodService.list(
      context.get("session").user.id,
      result.data
    );
    return context.json(foodListResponseSchema.parse(page));
  });

  app.get("/v1/foods/counts", async (context) => {
    const result = foodCountsQuerySchema.safeParse(context.req.query());
    if (!result.success) {
      throw new AppError(
        "REQUEST_INVALID",
        "请提供有效的设备日期",
        400,
        validationFields(result.error.issues)
      );
    }
    const counts = await foodService.counts(
      context.get("session").user.id,
      result.data.today
    );
    return context.json(foodCountsResponseSchema.parse({ counts }));
  });

  app.get("/v1/foods/reminder-candidates", async (context) => {
    const items = await foodService.listActiveForReminders(
      context.get("session").user.id
    );
    return context.json(foodItemsResponseSchema.parse({ items }));
  });

  const foodIdSchema = z.string().uuid();
  function foodId(context: AppContext): string {
    const result = foodIdSchema.safeParse(context.req.param("foodId"));
    if (!result.success) {
      throw new AppError("NOT_FOUND", "食品不存在或不可操作", 404);
    }
    return result.data;
  }

  app.get("/v1/foods/:foodId", async (context) => {
    const food = await foodService.get(
      context.get("session").user.id,
      foodId(context)
    );
    return context.json(foodResponseSchema.parse({ food }));
  });

  app.put("/v1/foods/:foodId", async (context) => {
    const food = await foodService.update(
      context.get("session").user.id,
      foodId(context),
      await parseJson(context, foodUpdateSchema, "请检查食品内容")
    );
    return context.json(foodResponseSchema.parse({ food }));
  });

  app.delete("/v1/foods/:foodId", async (context) => {
    await foodService.delete(
      context.get("session").user.id,
      foodId(context)
    );
    return context.body(null, 204);
  });

  app.post("/v1/foods/:foodId/process", async (context) => {
    const food = await foodService.process(
      context.get("session").user.id,
      foodId(context),
      await parseJson(context, foodProcessSchema, "请选择有效的处理状态")
    );
    return context.json(foodResponseSchema.parse({ food }));
  });

  app.post("/v1/foods/:foodId/restore", async (context) => {
    const food = await foodService.restore(
      context.get("session").user.id,
      foodId(context)
    );
    return context.json(foodResponseSchema.parse({ food }));
  });

  app.notFound((context) =>
    context.json(
      apiErrorSchema.parse({
        error: {
          code: "NOT_FOUND",
          message: "接口不存在",
          requestId: context.get("requestId")
        }
      }),
      404
    )
  );

  app.onError((error, context) => {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("INTERNAL_ERROR", "服务暂时不可用", 500);
    const code: ApiErrorCode = appError.code;

    if (appError.status === 500) {
      logger.log("error", "unhandled_error", {
        requestId: context.get("requestId"),
        errorName: error.name
      });
    }

    const payload = apiErrorSchema.parse({
      error: {
        code,
        message: appError.message,
        requestId: context.get("requestId"),
        ...(appError.fields ? { fields: appError.fields } : {})
      }
    });
    return context.json(payload, appError.status);
  });

  return app;
}
