import {
  expirySegmentBounds,
  foodSchema,
  type Food,
  type FoodCounts,
  type FoodCreate,
  type FoodListQuery,
  type FoodListResponse,
  type FoodProcess,
  type FoodUpdate
} from "@freshtrack/contracts";
import {
  Prisma,
  type Food as PrismaFood,
  type PrismaClient
} from "@prisma/client";

import { AppError } from "./errors.js";

export interface FoodService {
  create(userId: string, input: FoodCreate): Promise<Food>;
  get(userId: string, foodId: string): Promise<Food>;
  update(userId: string, foodId: string, input: FoodUpdate): Promise<Food>;
  delete(userId: string, foodId: string): Promise<void>;
  list(userId: string, query: FoodListQuery): Promise<FoodListResponse>;
  listActiveForReminders(userId: string): Promise<Food[]>;
  counts(userId: string, today: string): Promise<FoodCounts>;
  process(userId: string, foodId: string, input: FoodProcess): Promise<Food>;
  restore(userId: string, foodId: string): Promise<Food>;
}

function dateFromCalendar(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function calendarFromDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toFood(food: PrismaFood): Food {
  return foodSchema.parse({
    id: food.id,
    name: food.name,
    category: food.category,
    quantity: food.quantity.toFixed(3),
    unit: food.unit,
    expiryDate: calendarFromDate(food.expiryDate),
    reminderEnabled: food.reminderEnabled,
    notes: food.notes,
    status: food.status,
    processedAt: food.processedAt?.toISOString() ?? null,
    createdAt: food.createdAt.toISOString(),
    updatedAt: food.updatedAt.toISOString()
  });
}

function inputData(input: FoodCreate) {
  return {
    name: input.name,
    category: input.category,
    quantity: new Prisma.Decimal(input.quantity),
    unit: input.unit,
    expiryDate: dateFromCalendar(input.expiryDate),
    reminderEnabled: input.reminderEnabled,
    notes: input.notes
  };
}

function inaccessibleFood(): AppError {
  return new AppError("NOT_FOUND", "食品不存在或不可操作", 404);
}

function segmentWhere(
  segment: FoodListQuery["segment"],
  today: string | undefined
): Prisma.DateTimeFilter | undefined {
  if (segment === "all" || today === undefined) {
    return undefined;
  }
  const bounds = expirySegmentBounds(segment, today);
  if ("before" in bounds) {
    return { lt: dateFromCalendar(bounds.before) };
  }
  if ("exact" in bounds) {
    return { equals: dateFromCalendar(bounds.exact) };
  }
  return {
    gte: dateFromCalendar(bounds.after),
    lte: dateFromCalendar(bounds.through)
  };
}

export function createFoodService(prisma: PrismaClient): FoodService {
  async function findOwned(userId: string, foodId: string): Promise<PrismaFood> {
    const food = await prisma.food.findFirst({
      where: { id: foodId, userId }
    });
    if (!food) {
      throw inaccessibleFood();
    }
    return food;
  }

  return {
    async create(userId, input) {
      return toFood(
        await prisma.food.create({
          data: { userId, ...inputData(input) }
        })
      );
    },

    async get(userId, foodId) {
      return toFood(await findOwned(userId, foodId));
    },

    async update(userId, foodId, input) {
      const result = await prisma.food.updateMany({
        where: { id: foodId, userId, status: "ACTIVE" },
        data: inputData(input)
      });
      if (result.count !== 1) {
        throw inaccessibleFood();
      }
      return toFood(await findOwned(userId, foodId));
    },

    async delete(userId, foodId) {
      const result = await prisma.food.deleteMany({
        where: { id: foodId, userId }
      });
      if (result.count !== 1) {
        throw inaccessibleFood();
      }
    },

    async list(userId, query) {
      const isActive = query.view === "active";
      const expiryDate = isActive
        ? segmentWhere(query.segment, query.today)
        : undefined;
      const where: Prisma.FoodWhereInput = {
        userId,
        status: isActive
          ? "ACTIVE"
          : query.status === "all"
            ? { in: ["EATEN", "DISCARDED"] }
            : query.status,
        ...(query.search
          ? { name: { contains: query.search, mode: "insensitive" } }
          : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(expiryDate ? { expiryDate } : {})
      };
      const orderBy: Prisma.FoodOrderByWithRelationInput[] = isActive
        ? query.sort === "expiry"
          ? [{ expiryDate: "asc" }, { createdAt: "desc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "asc" }]
        : [{ processedAt: "desc" }, { id: "asc" }];
      const foods = await prisma.food.findMany({
        where,
        orderBy,
        skip: query.offset,
        take: query.limit + 1
      });
      const hasMore = foods.length > query.limit;
      const items = foods.slice(0, query.limit).map(toFood);
      return {
        items,
        pageInfo: {
          offset: query.offset,
          limit: query.limit,
          hasMore,
          nextOffset: hasMore ? query.offset + items.length : null
        }
      };
    },

    async listActiveForReminders(userId) {
      const foods = await prisma.food.findMany({
        where: { userId, status: "ACTIVE" },
        orderBy: [
          { expiryDate: "asc" },
          { createdAt: "desc" },
          { id: "asc" }
        ]
      });
      return foods.map(toFood);
    },

    async counts(userId, today) {
      const todayDate = dateFromCalendar(today);
      const next3Bounds = expirySegmentBounds("next3", today);
      if (!("after" in next3Bounds)) {
        throw new Error("Unexpected next-three-days bounds");
      }
      const tomorrow = dateFromCalendar(next3Bounds.after);
      const through = dateFromCalendar(next3Bounds.through);
      const [all, expired, dueToday, next3] = await prisma.$transaction([
        prisma.food.count({ where: { userId, status: "ACTIVE" } }),
        prisma.food.count({
          where: { userId, status: "ACTIVE", expiryDate: { lt: todayDate } }
        }),
        prisma.food.count({
          where: { userId, status: "ACTIVE", expiryDate: todayDate }
        }),
        prisma.food.count({
          where: {
            userId,
            status: "ACTIVE",
            expiryDate: { gte: tomorrow, lte: through }
          }
        })
      ]);
      return { all, expired, today: dueToday, next3 };
    },

    async process(userId, foodId, input) {
      const result = await prisma.food.updateMany({
        where: { id: foodId, userId, status: "ACTIVE" },
        data: { status: input.status, processedAt: new Date() }
      });
      if (result.count !== 1) {
        throw inaccessibleFood();
      }
      return toFood(await findOwned(userId, foodId));
    },

    async restore(userId, foodId) {
      const result = await prisma.food.updateMany({
        where: {
          id: foodId,
          userId,
          status: { in: ["EATEN", "DISCARDED"] }
        },
        data: { status: "ACTIVE", processedAt: null }
      });
      if (result.count !== 1) {
        throw inaccessibleFood();
      }
      return toFood(await findOwned(userId, foodId));
    }
  };
}
