import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";

import { useAuth } from "../../../../src/auth/provider";
import { ListState } from "../../../../src/food/components";
import * as foodApi from "../../../../src/food/api";
import { FoodFormScreen } from "../../../../src/food/food-form-screen";
import { foodQueryKeys } from "../../../../src/food/state";

export default function EditFoodScreen() {
  const params = useLocalSearchParams<{ foodId?: string }>();
  const foodId = typeof params.foodId === "string" ? params.foodId : "";
  const auth = useAuth();
  const token = auth.status === "authenticated" ? auth.token : "";
  const userId = auth.status === "authenticated" ? auth.user.id : "";
  const foodQuery = useQuery({
    queryKey: foodQueryKeys.detail(userId, token, foodId),
    enabled: auth.status === "authenticated" && foodId.length > 0,
    queryFn: async ({ signal }) => {
      try {
        return await foodApi.getFood(token, foodId, signal);
      } catch (error) {
        await auth.handleAuthenticatedError(error, token);
        throw error;
      }
    }
  });

  if (auth.status !== "authenticated") {
    return null;
  }
  if (!foodQuery.data) {
    return (
      <ListState
        loading={foodQuery.isLoading}
        error={foodQuery.isError}
        emptyTitle="食品不存在"
        emptyDescription="无法打开编辑表单"
        onRetry={() => {
          void foodQuery.refetch();
        }}
      />
    );
  }
  return <FoodFormScreen mode="edit" food={foodQuery.data} />;
}
