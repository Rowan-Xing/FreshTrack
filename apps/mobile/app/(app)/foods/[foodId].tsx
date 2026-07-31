import { Ionicons } from "@expo/vector-icons";
import {
  foodCategoryLabels,
  formatLocalDate
} from "@freshtrack/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sp, wp } from "zkit-tools";
import { Button } from "zkit-ui/button";
import { Text } from "zkit-ui/text";
import { toast } from "zkit-ui/toast";

import { ApiClientError } from "../../../src/auth/api";
import { useAuth } from "../../../src/auth/provider";
import { FoodCard, ListState } from "../../../src/food/components";
import * as foodApi from "../../../src/food/api";
import {
  getDetailActionConfirmation,
  type DetailAction
} from "../../../src/food/detail-action";
import { formatChineseLocalDateTime } from "../../../src/food/date-time";
import { foodQueryKeys } from "../../../src/food/state";
import { colors } from "../../../src/theme";
import { useReminders } from "../../../src/reminders/provider";
import {
  ConfirmationDialog,
  useConfirmationDialog
} from "../../../src/ui/confirmation-dialog";

export default function FoodDetailScreen() {
  const params = useLocalSearchParams<{ foodId?: string }>();
  const foodId = typeof params.foodId === "string" ? params.foodId : "";
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const reminders = useReminders();
  const confirmation = useConfirmationDialog();
  const token = auth.status === "authenticated" ? auth.token : "";
  const userId = auth.status === "authenticated" ? auth.user.id : "";
  const detailKey = foodQueryKeys.detail(userId, token, foodId);
  const foodQuery = useQuery({
    queryKey: detailKey,
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
  const action = useMutation({
    mutationFn: async (value: DetailAction) => {
      if (value.kind === "delete") {
        await foodApi.deleteFood(token, foodId);
        return null;
      }
      if (value.kind === "restore") {
        return foodApi.restoreFood(token, foodId);
      }
      return foodApi.processFood(token, foodId, { status: value.status });
    },
    onSuccess: async (saved, value) => {
      if (!auth.isCurrentSession(token)) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: foodQueryKeys.root(userId, token)
      });
      if (!auth.isCurrentSession(token)) {
        return;
      }
      if (value.kind === "delete") {
        const reminderWarnings = await reminders.cancelFood(foodId);
        if (!auth.isCurrentSession(token)) {
          return;
        }
        queryClient.removeQueries({ queryKey: detailKey });
        toast.success("食品已删除", {
          ...(reminderWarnings.length > 0
            ? { description: reminderWarnings.join("；") }
            : {})
        });
        router.back();
        return;
      }
      if (saved) {
        queryClient.setQueryData(detailKey, saved);
      }
      const reminderWarnings =
        value.kind === "restore" && saved
          ? await reminders.reconcileFood(saved)
          : await reminders.cancelFood(foodId);
      if (!auth.isCurrentSession(token)) {
        return;
      }
      toast.success(
        value.kind === "restore"
          ? "食品已恢复"
          : value.status === "EATEN"
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
      if (!auth.isCurrentSession(token)) {
        return;
      }
      toast.error("操作失败", {
        description:
          error instanceof ApiClientError ? error.message : "请稍后重试"
      });
    }
  });

  if (auth.status !== "authenticated") {
    return null;
  }

  const confirm = async (value: DetailAction) => {
    const accepted = await confirmation.confirm(
      getDetailActionConfirmation(value)
    );
    if (
      accepted &&
      !action.isPending &&
      auth.isCurrentSession(token)
    ) {
      action.mutate(value);
    }
  };

  const food = foodQuery.data;
  const pendingAction = action.isPending ? action.variables : undefined;
  const isEating =
    pendingAction?.kind === "process" && pendingAction.status === "EATEN";
  const isDiscarding =
    pendingAction?.kind === "process" && pendingAction.status === "DISCARDED";
  const isDeleting = pendingAction?.kind === "delete";
  const isRestoring = pendingAction?.kind === "restore";

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.topBar,
          {
            minHeight: insets.top + wp(58),
            paddingTop: insets.top
          }
        ]}
      >
        <Button
          iconOnly
          variant="ghost"
          icon={
            <Ionicons
              name="chevron-back"
              size={wp(23)}
              color={colors.onSurface}
            />
          }
          onPress={() => {
            router.back();
          }}
          accessibilityLabel="返回"
        />
        <Text variant="heading" size="lg" weight="bold">
          食品详情
        </Text>
        {food?.status === "ACTIVE" ? (
          <Button
            variant="link"
            size="sm"
            onPress={() => {
              router.push({
                pathname: "/(app)/foods/[foodId]/edit",
                params: { foodId }
              });
            }}
          >
            编辑
          </Button>
        ) : (
          <View style={styles.topPlaceholder} />
        )}
      </View>
      {!food ? (
        <ListState
          loading={foodQuery.isLoading}
          error={foodQuery.isError}
          emptyTitle="食品不存在"
          emptyDescription="它可能已经被删除"
          onRetry={() => {
            void foodQuery.refetch();
          }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + wp(30) }
          ]}
          showsVerticalScrollIndicator={false}
        >
          <FoodCard
            food={food}
            today={formatLocalDate(new Date())}
            history={food.status !== "ACTIVE"}
            presentation
          />
          <View style={styles.detailCard}>
            <DetailRow label="分类" value={foodCategoryLabels[food.category]} />
            <DetailRow label="数量" value={`${food.quantity} ${food.unit}`} />
            <DetailRow label="到期日期" value={food.expiryDate} />
            <DetailRow
              label="食品提醒"
              value={food.reminderEnabled ? "已开启" : "已关闭"}
            />
            <DetailRow label="备注" value={food.notes ?? "无"} />
            {food.processedAt ? (
              <DetailRow
                label="处理时间"
                value={formatChineseLocalDateTime(food.processedAt)}
              />
            ) : null}
          </View>
          {food.status === "ACTIVE" ? (
            <View style={styles.actions}>
              <Button
                block
                size="lg"
                tone="success"
                loading={isEating}
                disabled={action.isPending && !isEating}
                onPress={() => {
                  void confirm({ kind: "process", status: "EATEN" });
                }}
              >
                标记吃掉
              </Button>
              <Button
                block
                size="lg"
                variant="outline"
                tone="danger"
                loading={isDiscarding}
                disabled={action.isPending && !isDiscarding}
                onPress={() => {
                  void confirm({ kind: "process", status: "DISCARDED" });
                }}
              >
                标记丢弃
              </Button>
              <Button
                block
                variant="ghost"
                tone="danger"
                loading={isDeleting}
                disabled={action.isPending && !isDeleting}
                onPress={() => {
                  void confirm({ kind: "delete" });
                }}
              >
                删除食品
              </Button>
            </View>
          ) : (
            <View style={styles.actions}>
              <Button
                block
                size="lg"
                loading={isRestoring}
                disabled={action.isPending && !isRestoring}
                onPress={() => {
                  void confirm({ kind: "restore" });
                }}
              >
                恢复为活动食品
              </Button>
              <Button
                block
                variant="ghost"
                tone="danger"
                loading={isDeleting}
                disabled={action.isPending && !isDeleting}
                onPress={() => {
                  void confirm({ kind: "delete" });
                }}
              >
                删除历史记录
              </Button>
            </View>
          )}
        </ScrollView>
      )}
      <ConfirmationDialog
        request={confirmation.request}
        onResolve={confirmation.settle}
      />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text tone="muted" size="sm">
        {label}
      </Text>
      <Text style={styles.detailValue} align="right" lineHeight={sp(21)}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  topBar: {
    paddingHorizontal: wp(14),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: wp(1),
    borderBottomColor: colors.border,
    backgroundColor: colors.surface
  },
  topPlaceholder: {
    width: wp(44)
  },
  content: {
    gap: wp(18),
    padding: wp(18)
  },
  detailCard: {
    paddingHorizontal: wp(18),
    borderRadius: wp(20),
    borderWidth: wp(1),
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  detailRow: {
    minHeight: wp(54),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: wp(18),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  detailValue: {
    flex: 1
  },
  actions: {
    gap: wp(11)
  }
});
