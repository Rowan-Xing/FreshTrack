import {
  formatLocalDate,
  type FoodHistoryStatus
} from "@freshtrack/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { wp } from "zkit-tools";
import { TextInput } from "zkit-ui/text-input";

import { useAuth } from "../../../src/auth/provider";
import {
  Chip,
  FoodCard,
  LoadMoreFooter,
  ListState,
  PageHeader
} from "../../../src/food/components";
import * as foodApi from "../../../src/food/api";
import {
  flattenFoodPages,
  foodQueryKeys,
  nextFoodPageOffset
} from "../../../src/food/state";
import { colors } from "../../../src/theme";
import { PageBackground } from "../../../src/ui/page-background";

const statusLabels: Record<FoodHistoryStatus, string> = {
  all: "全部",
  EATEN: "已吃完",
  DISCARDED: "已丢弃"
};

export default function HistoryScreen() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const token = auth.status === "authenticated" ? auth.token : "";
  const userId = auth.status === "authenticated" ? auth.user.id : "";
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<FoodHistoryStatus>("all");
  const today = formatLocalDate(new Date());

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => {
      clearTimeout(timeout);
    };
  }, [search]);

  const filters = useMemo(
    () => ({
      view: "history" as const,
      search: debouncedSearch,
      status
    }),
    [debouncedSearch, status]
  );
  const historyQuery = useInfiniteQuery({
    queryKey: foodQueryKeys.list(userId, token, filters),
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

  if (auth.status !== "authenticated") {
    return null;
  }

  const hasFilters = debouncedSearch.length > 0 || status !== "all";
  const foods = flattenFoodPages(historyQuery.data?.pages);
  return (
    <View style={styles.screen}>
      <PageBackground variant="history" />
      <FlatList
        data={foods}
        keyExtractor={(food) => food.id}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={historyQuery.isRefetching}
            onRefresh={() => {
              void historyQuery.refetch();
            }}
            colors={[colors.primary]}
            progressViewOffset={insets.top}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader
              title="处理历史"
              subtitle="吃完与丢弃的食品都保留在这里"
            />
            <TextInput
              value={search}
              onChange={setSearch}
              placeholder="搜索历史食品"
              clearable
              accessibilityLabel="搜索历史食品"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {(["all", "EATEN", "DISCARDED"] as const).map((value) => (
                <Chip
                  key={value}
                  label={statusLabels[value]}
                  selected={status === value}
                  onPress={() => {
                    setStatus(value);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <FoodCard
              food={item}
              today={today}
              history
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
            loading={historyQuery.isLoading}
            error={historyQuery.isError}
            emptyTitle={hasFilters ? "没有符合条件的记录" : "还没有处理记录"}
            emptyDescription={
              hasFilters
                ? "更换搜索词或状态筛选后再试"
                : "食品被标记为吃完或丢弃后会出现在这里"
            }
            onRetry={() => {
              void historyQuery.refetch();
            }}
          />
        }
        ListFooterComponent={
          foods.length > 0 ? (
            <LoadMoreFooter
              hasMore={historyQuery.hasNextPage}
              loading={historyQuery.isFetchingNextPage}
              error={historyQuery.isFetchNextPageError}
              onPress={() => {
                void historyQuery.fetchNextPage();
              }}
            />
          ) : null
        }
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
  header: {
    gap: wp(16),
    paddingTop: wp(12),
    paddingBottom: wp(12)
  },
  chips: {
    gap: wp(8)
  },
  item: {
    paddingVertical: wp(6)
  }
});
