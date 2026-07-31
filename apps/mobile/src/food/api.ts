import {
  FOOD_LIST_DEFAULT_PAGE_SIZE,
  foodCountsResponseSchema,
  foodItemsResponseSchema,
  foodListResponseSchema,
  foodResponseSchema,
  type Food,
  type FoodCounts,
  type FoodCreate,
  type FoodHistoryStatus,
  type FoodListResponse,
  type FoodProcess,
  type FoodSegment,
  type FoodSort,
  type FoodUpdate
} from "@freshtrack/contracts";

import {
  authorizationHeaders,
  request,
  requestEmpty
} from "../auth/api";

export type FoodListParams =
  | {
      view: "active";
      search: string;
      category?: FoodCreate["category"];
      segment: FoodSegment;
      sort: FoodSort;
      today: string;
    }
  | {
      view: "history";
      search: string;
      category?: FoodCreate["category"];
      status: FoodHistoryStatus;
    };

function queryString(params: FoodListParams, offset: number): string {
  const query = new URLSearchParams();
  query.set("view", params.view);
  query.set("search", params.search);
  if (params.category) {
    query.set("category", params.category);
  }
  if (params.view === "active") {
    query.set("segment", params.segment);
    query.set("sort", params.sort);
    if (params.segment !== "all") {
      query.set("today", params.today);
    }
  } else {
    query.set("status", params.status);
    query.set("sort", "created");
  }
  query.set("limit", String(FOOD_LIST_DEFAULT_PAGE_SIZE));
  query.set("offset", String(offset));
  return query.toString();
}

function jsonHeaders(token: string): HeadersInit {
  return {
    ...authorizationHeaders(token),
    "content-type": "application/json"
  };
}

export async function listFoods(
  token: string,
  params: FoodListParams,
  offset: number,
  signal?: AbortSignal
): Promise<FoodListResponse> {
  const response = await request(
    `/v1/foods?${queryString(params, offset)}`,
    foodListResponseSchema,
    {
      method: "GET",
      headers: authorizationHeaders(token),
      ...(signal ? { signal } : {})
    }
  );
  return response;
}

export async function listActiveFoodsForReminders(
  token: string,
  signal?: AbortSignal
): Promise<Food[]> {
  const response = await request(
    "/v1/foods/reminder-candidates",
    foodItemsResponseSchema,
    {
      method: "GET",
      headers: authorizationHeaders(token),
      ...(signal ? { signal } : {})
    }
  );
  return response.items;
}

export async function getFood(
  token: string,
  foodId: string,
  signal?: AbortSignal
): Promise<Food> {
  const response = await request(
    `/v1/foods/${encodeURIComponent(foodId)}`,
    foodResponseSchema,
    {
      method: "GET",
      headers: authorizationHeaders(token),
      ...(signal ? { signal } : {})
    }
  );
  return response.food;
}

export async function getFoodCounts(
  token: string,
  today: string,
  signal?: AbortSignal
): Promise<FoodCounts> {
  const response = await request(
    `/v1/foods/counts?today=${encodeURIComponent(today)}`,
    foodCountsResponseSchema,
    {
      method: "GET",
      headers: authorizationHeaders(token),
      ...(signal ? { signal } : {})
    }
  );
  return response.counts;
}

export async function createFood(
  token: string,
  input: FoodCreate
): Promise<Food> {
  const response = await request("/v1/foods", foodResponseSchema, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(input)
  });
  return response.food;
}

export async function updateFood(
  token: string,
  foodId: string,
  input: FoodUpdate
): Promise<Food> {
  const response = await request(
    `/v1/foods/${encodeURIComponent(foodId)}`,
    foodResponseSchema,
    {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify(input)
    }
  );
  return response.food;
}

export function deleteFood(token: string, foodId: string): Promise<void> {
  return requestEmpty(`/v1/foods/${encodeURIComponent(foodId)}`, {
    method: "DELETE",
    headers: authorizationHeaders(token)
  });
}

export async function processFood(
  token: string,
  foodId: string,
  input: FoodProcess
): Promise<Food> {
  const response = await request(
    `/v1/foods/${encodeURIComponent(foodId)}/process`,
    foodResponseSchema,
    {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify(input)
    }
  );
  return response.food;
}

export async function restoreFood(
  token: string,
  foodId: string
): Promise<Food> {
  const response = await request(
    `/v1/foods/${encodeURIComponent(foodId)}/restore`,
    foodResponseSchema,
    {
      method: "POST",
      headers: authorizationHeaders(token)
    }
  );
  return response.food;
}
