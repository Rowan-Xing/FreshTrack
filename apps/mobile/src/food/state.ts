import {
  foodFormSchema,
  type Food,
  type FoodCreate,
  type FoodForm,
  type FoodListResponse
} from "@freshtrack/contracts";

export const foodQueryKeys = {
  root(userId: string, token: string) {
    return ["foods", userId, token] as const;
  },
  list(userId: string, token: string, filters: unknown) {
    return [...this.root(userId, token), "list", filters] as const;
  },
  counts(userId: string, token: string, today: string) {
    return [...this.root(userId, token), "counts", today] as const;
  },
  detail(userId: string, token: string, foodId: string) {
    return [...this.root(userId, token), "detail", foodId] as const;
  }
};

export function foodToForm(food: Food): FoodForm {
  return {
    name: food.name,
    category: food.category,
    quantity: food.quantity,
    unit: food.unit,
    expiryDate: food.expiryDate,
    reminderEnabled: food.reminderEnabled,
    notes: food.notes
  };
}

export function formToFoodCreate(form: FoodForm): FoodCreate {
  return foodFormSchema.parse(form);
}

export function nextFoodPageOffset(
  page: FoodListResponse
): number | undefined {
  return page.pageInfo.hasMore
    ? (page.pageInfo.nextOffset ?? undefined)
    : undefined;
}

export function flattenFoodPages(
  pages: readonly FoodListResponse[] | undefined
): Food[] {
  const seen = new Set<string>();
  const foods: Food[] = [];
  for (const page of pages ?? []) {
    for (const food of page.items) {
      if (!seen.has(food.id)) {
        seen.add(food.id);
        foods.push(food);
      }
    }
  }
  return foods;
}
