import { Ionicons } from "@expo/vector-icons";
import {
  foodCategories,
  foodCategoryLabels,
  foodCategorySchema,
  formatLocalDate,
  type Food,
  type FoodCategory,
  type FoodListResponse,
  type FoodSegment,
  type FoodSort
} from "@freshtrack/contracts";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useQuery
} from "@tanstack/react-query";
import { router } from "expo-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { wp } from "zkit-tools";
import { Button } from "zkit-ui/button";
import { Picker, type PickerOption } from "zkit-ui/picker";
import { Text } from "zkit-ui/text";
import { TextInput } from "zkit-ui/text-input";
import { toast } from "zkit-ui/toast";

import { ApiClientError } from "../../../src/auth/api";
import { useAuth } from "../../../src/auth/provider";
import {
  Chip,
  FoodCard,
  LoadMoreFooter,
  ListState,
  PageHeader,
  segmentLabels
} from "../../../src/food/components";
import * as foodApi from "../../../src/food/api";
import {
  getDetailActionConfirmation,
  type DetailAction
} from "../../../src/food/detail-action";
import { FoodQuickActionMenu } from "../../../src/food/quick-action-menu";
import {
  quickActionToDetailAction,
  type ActiveFoodQuickAction
} from "../../../src/food/quick-action";
import {
  flattenFoodPages,
  foodQueryKeys,
  nextFoodPageOffset
} from "../../../src/food/state";
import { useReminders } from "../../../src/reminders/provider";
import { colors } from "../../../src/theme";
import {
  ConfirmationDialog,
  useConfirmationDialog
} from "../../../src/ui/confirmation-dialog";
import { PageBackground } from "../../../src/ui/page-background";

const categoryOptions: PickerOption<string>[] = [
  { value: "all", label: "全部分类" },
  ...foodCategories.map((category) => ({
    value: category,
    label: foodCategoryLabels[category]
  }))
];

function useDebouncedValue(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebounced(value);
    }, 250);
    return () => {
      clearTimeout(timeout);
    };
  }, [value]);
  return debounced;
}

export default function HomeScreen() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const reminders = useReminders();
  const queryClient = useQueryClient();
  const confirmation = useConfirmationDialog();
  const mounted = useRef(true);
  const token = auth.status === "authenticated" ? auth.token : "";
  const userId = auth.status === "authenticated" ? auth.user.id : "";
  const today = formatLocalDate(new Date());
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [segment, setSegment] = useState<FoodSegment>("all");
  const [category, setCategory] = useState<FoodCategory | undefined>();
  const [sort, setSort] = useState<FoodSort>("expiry");
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setSelectedFood(null);
    confirmation.settle(false);
  }, [confirmation.settle, token, userId]);
  const filters = useMemo(
    () => ({
      view: "active" as const,
      search: debouncedSearch,
      ...(category ? { category } : {}),
      segment,
      sort,
      today
    }),
    [category, debouncedSearch, segment, sort, today]
  );
  const foodsKey = foodQueryKeys.list(userId, token, filters);

  const foodsQuery = useInfiniteQuery({
    queryKey: foodsKey,
    enabled: auth.status === "authenticated",
    initialPageParam: 0,
    queryFn: async ({ signal, pageParam }) => {
      try {
        return await foodApi.listFoods(
          token,
          filters,
          pageParam,
          signal
        );
      } catch (error) {
        await auth.handleAuthenticatedError(error, token);
        throw error;
      }
    },
    getNextPageParam: nextFoodPageOffset
  });
  const countsQuery = useQuery({
    queryKey: foodQueryKeys.counts(userId, token, today),
    enabled: auth.status === "authenticated",
    queryFn: async ({ signal }) => {
      try {
        return await foodApi.getFoodCounts(token, today, signal);
      } catch (error) {
        await auth.handleAuthenticatedError(error, token);
        throw error;
      }
    }
  });
  const quickMutation = useMutation({
    mutationFn: async ({
      foodId,
      action
    }: {
      foodId: string;
      action: Exclude<DetailAction, { kind: "restore" }>;
    }) => {
      const saved =
        action.kind === "delete"
          ? await foodApi.deleteFood(token, foodId).then(() => null)
          : await foodApi.processFood(token, foodId, {
              status: action.status
            });
      const reminderWarnings = await reminders.cancelFood(foodId);
      return { saved, reminderWarnings };
    },
    onSuccess: async ({ saved, reminderWarnings }, variables) => {
      if (!auth.isCurrentSession(token)) {
        return;
      }
      const detailKey = foodQueryKeys.detail(
        userId,
        token,
        variables.foodId
      );
      if (saved) {
        queryClient.setQueryData(detailKey, saved);
      } else {
        queryClient.removeQueries({ queryKey: detailKey });
      }
      await queryClient.invalidateQueries({
        queryKey: foodQueryKeys.root(userId, token)
      });
      if (!mounted.current || !auth.isCurrentSession(token)) {
        return;
      }
      setSelectedFood(null);
      toast.success(
        variables.action.kind === "delete"
          ? "食品已删除"
          : variables.action.status === "EATEN"
            ? "已标记为吃完"
            : "已标记为丢弃",
        {
          ...(reminderWarnings.length > 0
            ? { description: reminderWarnings.join("；") }
            : {})
        }
      );
    },
    onError: async (error) => {
      await auth.handleAuthenticatedError(error, token);
      if (!mounted.current || !auth.isCurrentSession(token)) {
        return;
      }
      setSelectedFood(null);
      toast.error("操作失败", {
        description:
          error instanceof ApiClientError ? error.message : "请稍后重试"
      });
    }
  });

  if (auth.status !== "authenticated") {
    return null;
  }

  const hasFilters =
    debouncedSearch.length > 0 || category !== undefined || segment !== "all";
  const refreshing = foodsQuery.isRefetching || countsQuery.isRefetching;
  const foods = flattenFoodPages(foodsQuery.data?.pages);
  const refresh = () => {
    void Promise.all([foodsQuery.refetch(), countsQuery.refetch()]);
  };
  const selectQuickAction = async (
    quickAction: ActiveFoodQuickAction
  ) => {
    const selection = selectedFood;
    setSelectedFood(null);
    if (
      !selection ||
      quickMutation.isPending ||
      !auth.isCurrentSession(token)
    ) {
      return;
    }
    const currentData =
      queryClient.getQueryData<InfiniteData<FoodListResponse>>(foodsKey);
    const currentFood = flattenFoodPages(currentData?.pages).find(
      (food) => food.id === selection.id
    );
    if (!currentFood || currentFood.status !== "ACTIVE") {
      return;
    }
    if (quickAction === "edit") {
      router.push({
        pathname: "/(app)/foods/[foodId]/edit",
        params: { foodId: currentFood.id }
      });
      return;
    }
    const action = quickActionToDetailAction(quickAction);
    if (!action || action.kind === "restore") {
      return;
    }
    const accepted = await confirmation.confirm(
      getDetailActionConfirmation(action)
    );
    if (
      !accepted ||
      quickMutation.isPending ||
      !mounted.current ||
      !auth.isCurrentSession(token)
    ) {
      return;
    }
    const latestData =
      queryClient.getQueryData<InfiniteData<FoodListResponse>>(foodsKey);
    const stillActive = flattenFoodPages(latestData?.pages).some(
      (food) => food.id === currentFood.id && food.status === "ACTIVE"
    );
    if (!stillActive) {
      return;
    }
    quickMutation.mutate({ foodId: currentFood.id, action });
  };

  return (
    <View style={styles.screen}>
      <PageBackground variant="home" />
      <FlatList
        data={foods}
        keyExtractor={(food) => food.id}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top }
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressViewOffset={insets.top}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <PageHeader
              title="我的鲜食"
              subtitle={`今天是 ${today}`}
              action={
                <Button
                  icon={<Ionicons name="add" size={wp(20)} color={colors.onPrimary} />}
                  size="md"
                  onPress={() => {
                    router.push("/(app)/foods/new");
                  }}
                >
                  新增
                </Button>
              }
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.countRow}
            >
              {(["all", "expired", "today", "next3"] as const).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    setSegment(key);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: segment === key }}
                  style={({ pressed }) => [
                    styles.countCard,
                    segment === key ? styles.countCardSelected : null,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Text
                    size="2xl"
                    weight="heavy"
                    color={segment === key ? colors.onPrimary : colors.onSurface}
                  >
                    {countsQuery.data?.[key] ?? "—"}
                  </Text>
                  <Text
                    size="xs"
                    color={segment === key ? colors.onPrimary : colors.muted}
                  >
                    {segmentLabels[key]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {countsQuery.isError ? (
              <View style={styles.countsError} accessibilityRole="alert">
                <Ionicons
                  name="alert-circle-outline"
                  size={wp(19)}
                  color={colors.warning}
                />
                <Text size="sm" style={styles.countsErrorText}>
                  概览暂时无法加载，食品列表仍可继续使用。
                </Text>
                <Button
                  variant="link"
                  size="sm"
                  onPress={() => {
                    void countsQuery.refetch();
                  }}
                >
                  重试
                </Button>
              </View>
            ) : null}

            <TextInput
              value={search}
              onChange={setSearch}
              placeholder="搜索食品名称"
              prefix={
                <Ionicons name="search" size={wp(18)} color={colors.muted} />
              }
              clearable
              accessibilityLabel="搜索食品名称"
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {(["all", "expired", "today", "next3"] as const).map((value) => (
                <Chip
                  key={value}
                  label={segmentLabels[value]}
                  selected={segment === value}
                  onPress={() => {
                    setSegment(value);
                  }}
                />
              ))}
            </ScrollView>

            <View style={styles.filterRow}>
              <Picker
                options={categoryOptions}
                value={category ?? "all"}
                title="选择分类"
                onChange={(value) => {
                  if (typeof value !== "string") {
                    return;
                  }
                  const parsed = foodCategorySchema.safeParse(value);
                  setCategory(parsed.success ? parsed.data : undefined);
                }}
              >
                {({ label, open }) => (
                  <Button
                    variant="outline"
                    size="md"
                    onPress={open}
                    icon={
                      <Ionicons
                        name="options-outline"
                        size={wp(17)}
                        color={colors.primary}
                      />
                    }
                  >
                    {label || "全部分类"}
                  </Button>
                )}
              </Picker>
              <View style={styles.sortGroup}>
                <Chip
                  label="到期优先"
                  selected={sort === "expiry"}
                  onPress={() => {
                    setSort("expiry");
                  }}
                />
                <Chip
                  label="最近添加"
                  selected={sort === "created"}
                  onPress={() => {
                    setSort("created");
                  }}
                />
              </View>
            </View>
            {hasFilters ? (
              <Button
                variant="link"
                size="sm"
                onPress={() => {
                  setSearch("");
                  setCategory(undefined);
                  setSegment("all");
                }}
              >
                清除筛选
              </Button>
            ) : null}
            <View style={styles.sectionTitle}>
              <Text weight="bold">活动食品</Text>
              <Text size="sm" tone="muted">
                已加载 {foods.length} 项
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <FoodCard
              food={item}
              today={today}
              onMenuPress={() => {
                if (!quickMutation.isPending) {
                  setSelectedFood(item);
                }
              }}
              onPress={() => {
                router.push({
                  pathname: "/(app)/foods/[foodId]",
                  params: { foodId: item.id }
                });
              }}
            />
          </View>
        )}
        ListEmptyComponent={
          <ListState
            loading={foodsQuery.isLoading}
            error={foodsQuery.isError}
            emptyTitle={hasFilters ? "没有符合条件的食品" : "还没有活动食品"}
            emptyDescription={
              hasFilters
                ? "试试清除筛选或更换搜索词"
                : "点击右上角新增，记录第一份食品"
            }
            onRetry={() => {
              void foodsQuery.refetch();
            }}
          />
        }
        ListFooterComponent={
          foods.length > 0 ? (
            <LoadMoreFooter
              hasMore={foodsQuery.hasNextPage}
              loading={foodsQuery.isFetchingNextPage}
              error={foodsQuery.isFetchNextPageError}
              onPress={() => {
                void foodsQuery.fetchNextPage();
              }}
            />
          ) : null
        }
      />
      {selectedFood ? (
        <FoodQuickActionMenu
          foodName={selectedFood.name}
          busy={quickMutation.isPending}
          onClose={() => {
            if (!quickMutation.isPending) {
              setSelectedFood(null);
            }
          }}
          onSelect={(action) => {
            void selectQuickAction(action);
          }}
        />
      ) : null}
      <ConfirmationDialog
        request={confirmation.request}
        onResolve={confirmation.settle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    paddingHorizontal: wp(18),
    paddingBottom: wp(28)
  },
  headerContent: {
    gap: wp(16),
    paddingTop: wp(12),
    paddingBottom: wp(12)
  },
  countRow: {
    gap: wp(10)
  },
  countCard: {
    width: wp(94),
    minHeight: wp(82),
    padding: wp(13),
    justifyContent: "space-between",
    borderRadius: wp(18),
    borderWidth: wp(1),
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  countCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  countsError: {
    minHeight: wp(44),
    flexDirection: "row",
    alignItems: "center",
    gap: wp(8),
    paddingHorizontal: wp(12),
    paddingVertical: wp(8),
    borderRadius: wp(14),
    backgroundColor: colors.warningSurface
  },
  countsErrorText: {
    flex: 1
  },
  pressed: {
    opacity: 0.72
  },
  chips: {
    gap: wp(8)
  },
  filterRow: {
    gap: wp(10)
  },
  sortGroup: {
    flexDirection: "row",
    gap: wp(8)
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: wp(4)
  },
  item: {
    paddingVertical: wp(6)
  }
});
