import { z } from "zod";

import { addLocalCalendarDays, localDateSchema } from "./date.js";

export const FOOD_NAME_MAX_LENGTH = 100;
export const FOOD_UNIT_MAX_LENGTH = 20;
export const FOOD_NOTES_MAX_LENGTH = 500;
export const FOOD_SEARCH_MAX_LENGTH = 100;
export const FOOD_LIST_DEFAULT_PAGE_SIZE = 50;
export const FOOD_LIST_MAX_PAGE_SIZE = 100;
export const FOOD_LIST_MAX_OFFSET = 1_000_000;

export const foodCategories = [
  "PRODUCE",
  "MEAT_EGGS_SEAFOOD",
  "DAIRY",
  "STAPLES",
  "SNACKS_DRINKS",
  "CONDIMENTS",
  "OTHER"
] as const;

export const foodCategoryLabels: Record<
  (typeof foodCategories)[number],
  string
> = {
  PRODUCE: "蔬菜水果",
  MEAT_EGGS_SEAFOOD: "肉蛋水产",
  DAIRY: "乳制品",
  STAPLES: "主食粮油",
  SNACKS_DRINKS: "零食饮料",
  CONDIMENTS: "调味品",
  OTHER: "其他"
};

export const builtinFoodUnits = [
  "克",
  "千克",
  "毫升",
  "升",
  "个",
  "盒",
  "袋",
  "瓶",
  "罐",
  "份"
] as const;

export const foodCategorySchema = z.enum(foodCategories);
export const foodStatusSchema = z.enum(["ACTIVE", "EATEN", "DISCARDED"]);

const DECIMAL_INPUT_PATTERN = /^\d+(?:\.\d{1,3})?$/;

export function normalizeFoodQuantity(value: string): string {
  const [integerPart = "", fractionalPart] = value.split(".");
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "");
  if (fractionalPart === undefined) {
    return normalizedInteger;
  }
  const normalizedFraction = fractionalPart.replace(/0+$/, "");
  return normalizedFraction.length > 0
    ? `${normalizedInteger}.${normalizedFraction}`
    : normalizedInteger;
}

export const foodQuantitySchema = z
  .string()
  .trim()
  .min(1, "请输入数量")
  .regex(DECIMAL_INPUT_PATTERN, "数量必须是最多三位小数的十进制数")
  .refine((value) => /[1-9]/.test(value), "数量必须大于 0")
  .refine(
    (value) =>
      (normalizeFoodQuantity(value).split(".")[0]?.length ?? 0) <= 15,
    "数量整数部分不能超过 15 位"
  )
  .transform(normalizeFoodQuantity);

export const foodNameSchema = z
  .string()
  .trim()
  .min(1, "请输入食品名称")
  .max(FOOD_NAME_MAX_LENGTH, `食品名称不能超过 ${FOOD_NAME_MAX_LENGTH} 个字符`);

export const foodUnitSchema = z
  .string()
  .trim()
  .min(1, "请输入单位")
  .max(FOOD_UNIT_MAX_LENGTH, `单位不能超过 ${FOOD_UNIT_MAX_LENGTH} 个字符`);

export const foodNotesSchema = z
  .string()
  .trim()
  .max(FOOD_NOTES_MAX_LENGTH, `备注不能超过 ${FOOD_NOTES_MAX_LENGTH} 个字符`)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .default(null);

export const foodFormSchema = z.strictObject({
  name: foodNameSchema,
  category: foodCategorySchema,
  quantity: foodQuantitySchema,
  unit: foodUnitSchema,
  expiryDate: localDateSchema,
  reminderEnabled: z.boolean(),
  notes: foodNotesSchema
});

export const foodCreateSchema = foodFormSchema;
export const foodUpdateSchema = foodFormSchema;

export const foodSchema = foodFormSchema.extend({
  id: z.string().uuid(),
  status: foodStatusSchema,
  processedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export const foodListViewSchema = z.enum(["active", "history"]);
export const foodSegmentSchema = z.enum([
  "all",
  "expired",
  "today",
  "next3"
]);
export const foodSortSchema = z.enum(["expiry", "created"]);
export const foodHistoryStatusSchema = z.enum(["all", "EATEN", "DISCARDED"]);

const optionalTrimmedSearchSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  z
    .string()
    .trim()
    .max(
      FOOD_SEARCH_MAX_LENGTH,
      `搜索内容不能超过 ${FOOD_SEARCH_MAX_LENGTH} 个字符`
    )
    .optional()
);

const optionalCategorySchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  foodCategorySchema.optional()
);

export const foodListQuerySchema = z
  .strictObject({
    view: foodListViewSchema.default("active"),
    search: optionalTrimmedSearchSchema,
    category: optionalCategorySchema,
    status: foodHistoryStatusSchema.default("all"),
    segment: foodSegmentSchema.default("all"),
    sort: foodSortSchema.optional(),
    today: localDateSchema.optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(FOOD_LIST_MAX_PAGE_SIZE)
      .default(FOOD_LIST_DEFAULT_PAGE_SIZE),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .max(FOOD_LIST_MAX_OFFSET)
      .default(0)
  })
  .superRefine((query, context) => {
    if (query.view === "active") {
      if (query.status !== "all") {
        context.addIssue({
          code: "custom",
          path: ["status"],
          message: "活动列表不能按历史状态筛选"
        });
      }
      if (query.segment !== "all" && !query.today) {
        context.addIssue({
          code: "custom",
          path: ["today"],
          message: "到期分段筛选需要设备当天日期"
        });
      }
      return;
    }
    if (query.segment !== "all" || query.today !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["segment"],
        message: "历史列表不支持到期分段"
      });
    }
    if (query.sort === "expiry") {
      context.addIssue({
        code: "custom",
        path: ["sort"],
        message: "历史列表按处理时间排序"
      });
    }
  })
  .transform((query) => ({
    ...query,
    sort: query.sort ?? (query.view === "active" ? "expiry" : "created")
  }));

export const foodCountsQuerySchema = z.strictObject({
  today: localDateSchema
});

export const foodCountsSchema = z.strictObject({
  all: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
  today: z.number().int().nonnegative(),
  next3: z.number().int().nonnegative()
});

export const foodItemsResponseSchema = z.strictObject({
  items: z.array(foodSchema)
});

export const foodListPageInfoSchema = z.strictObject({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(FOOD_LIST_MAX_PAGE_SIZE),
  hasMore: z.boolean(),
  nextOffset: z.number().int().nonnegative().nullable()
}).superRefine((pageInfo, context) => {
  const expectedNextOffset = pageInfo.offset + pageInfo.limit;
  if (
    pageInfo.hasMore &&
    pageInfo.nextOffset !== expectedNextOffset
  ) {
    context.addIssue({
      code: "custom",
      path: ["nextOffset"],
      message: "后续分页偏移量无效"
    });
  }
  if (!pageInfo.hasMore && pageInfo.nextOffset !== null) {
    context.addIssue({
      code: "custom",
      path: ["nextOffset"],
      message: "末页不能包含后续偏移量"
    });
  }
});

export const foodListResponseSchema = foodItemsResponseSchema.extend({
  pageInfo: foodListPageInfoSchema
});

export const foodResponseSchema = z.strictObject({
  food: foodSchema
});

export const foodCountsResponseSchema = z.strictObject({
  counts: foodCountsSchema
});

export const foodProcessSchema = z.strictObject({
  status: z.enum(["EATEN", "DISCARDED"])
});

export function expirySegmentBounds(
  segment: Exclude<FoodSegment, "all">,
  today: string
):
  | { before: string }
  | { exact: string }
  | { after: string; through: string } {
  const validToday = localDateSchema.parse(today);
  if (segment === "expired") {
    return { before: validToday };
  }
  if (segment === "today") {
    return { exact: validToday };
  }
  return {
    after: addLocalCalendarDays(validToday, 1),
    through: addLocalCalendarDays(validToday, 3)
  };
}

export type Food = z.infer<typeof foodSchema>;
export type FoodCategory = z.infer<typeof foodCategorySchema>;
export type FoodCounts = z.infer<typeof foodCountsSchema>;
export type FoodCreate = z.infer<typeof foodCreateSchema>;
export type FoodForm = z.input<typeof foodFormSchema>;
export type FoodHistoryStatus = z.infer<typeof foodHistoryStatusSchema>;
export type FoodListQuery = z.infer<typeof foodListQuerySchema>;
export type FoodListResponse = z.infer<typeof foodListResponseSchema>;
export type FoodProcess = z.infer<typeof foodProcessSchema>;
export type FoodSegment = z.infer<typeof foodSegmentSchema>;
export type FoodSort = z.infer<typeof foodSortSchema>;
export type FoodStatus = z.infer<typeof foodStatusSchema>;
export type FoodUpdate = z.infer<typeof foodUpdateSchema>;
