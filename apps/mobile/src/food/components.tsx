import { Ionicons } from "@expo/vector-icons";
import {
  classifyExpiry,
  foodCategoryLabels,
  type Food,
  type FoodSegment
} from "@freshtrack/contracts";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion
} from "react-native-reanimated";
import { wp } from "zkit-tools";
import { Button } from "zkit-ui/button";
import { LoadingSpinner } from "zkit-ui/loading-spinner";
import { Text } from "zkit-ui/text";

import { colors } from "../theme";

export function PageHeader({
  title,
  subtitle,
  action
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text variant="heading" size="2xl" weight="heavy">
          {title}
        </Text>
        {subtitle ? (
          <Text tone="muted" size="sm">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipDefault,
        pressed ? styles.pressed : null
      ]}
    >
      <Text
        size="sm"
        weight="semibold"
        color={selected ? colors.onPrimary : colors.onSurface}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function expiryLabel(food: Food, today: string): {
  label: string;
  tone: string;
  surface: string;
} {
  const status = classifyExpiry(food.expiryDate, today);
  if (status === "expired") {
    return {
      label: "已过期",
      tone: colors.danger,
      surface: colors.dangerSurface
    };
  }
  if (food.expiryDate === today) {
    return {
      label: "今天到期",
      tone: colors.warning,
      surface: colors.warningSurface
    };
  }
  if (status === "expiringSoon") {
    return {
      label: "1–3 天内",
      tone: colors.warning,
      surface: colors.warningSurface
    };
  }
  return {
    label: "新鲜",
    tone: colors.success,
    surface: colors.successSurface
  };
}

type FoodCardBaseProps = {
  food: Food;
  today: string;
  history?: boolean;
};

type FoodCardProps = FoodCardBaseProps &
  (
    | { presentation: true; onPress?: never }
    | {
        presentation?: false;
        onPress: () => void;
        onMenuPress?: () => void;
      }
  );

export function FoodCard(props: FoodCardProps) {
  const { food, today, history = false } = props;
  const presentation = props.presentation === true;
  const status = history
    ? {
        label: food.status === "EATEN" ? "已吃完" : "已丢弃",
        tone:
          food.status === "EATEN" ? colors.success : colors.muted,
        surface:
          food.status === "EATEN"
            ? colors.successSurface
            : colors.background
      }
    : expiryLabel(food, today);
  const content = (
    <>
      <View style={styles.foodTop}>
        <View style={styles.foodIcon}>
          <Ionicons name="nutrition-outline" size={wp(22)} color={colors.primary} />
        </View>
        <View style={styles.foodCopy}>
          <Text size="md" weight="bold" numberOfLines={1}>
            {food.name}
          </Text>
          <Text size="sm" tone="muted">
            {food.quantity} {food.unit} · {foodCategoryLabels[food.category]}
          </Text>
        </View>
        {!presentation && !props.onMenuPress ? (
          <Ionicons name="chevron-forward" size={wp(19)} color={colors.muted} />
        ) : null}
      </View>
      <View style={styles.foodBottom}>
        <Text size="sm" tone="muted">
          {history ? "到期日" : "到期"} {food.expiryDate}
        </Text>
        <View style={[styles.status, { backgroundColor: status.surface }]}>
          <Text size="xs" weight="bold" color={status.tone}>
            {status.label}
          </Text>
        </View>
      </View>
    </>
  );
  return (
    <Animated.View
      entering={FadeInDown.duration(190).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(160).reduceMotion(ReduceMotion.System)}
      layout={LinearTransition.duration(200).reduceMotion(ReduceMotion.System)}
    >
      {props.presentation === true ? (
        <View style={styles.foodCard}>{content}</View>
      ) : (
        <View style={styles.foodCardContainer}>
          <Pressable
            onPress={props.onPress}
            accessibilityRole="button"
            accessibilityLabel={`查看${food.name}详情`}
            style={({ pressed }) => [
              styles.foodCard,
              props.onMenuPress ? styles.foodCardWithMenu : null,
              pressed ? styles.pressed : null
            ]}
          >
            {content}
          </Pressable>
          {props.onMenuPress ? (
            <Pressable
              onPress={props.onMenuPress}
              accessibilityRole="button"
              accessibilityLabel={`打开${food.name}操作菜单`}
              hitSlop={wp(4)}
              style={({ pressed }) => [
                styles.menuTarget,
                pressed ? styles.menuTargetPressed : null
              ]}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={wp(22)}
                color={colors.onSurface}
              />
            </Pressable>
          ) : null}
        </View>
      )}
    </Animated.View>
  );
}

export function ListState({
  loading,
  error,
  emptyTitle,
  emptyDescription,
  onRetry
}: {
  loading: boolean;
  error: boolean;
  emptyTitle: string;
  emptyDescription: string;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.state}>
        <LoadingSpinner size={wp(30)} color={colors.primary} />
        <Text tone="muted">正在整理食品…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.state}>
        <Ionicons name="cloud-offline-outline" size={wp(36)} color={colors.danger} />
        <Text weight="bold">暂时无法加载</Text>
        <Text tone="muted" align="center">
          请检查网络与 API 连接后重试
        </Text>
        <Button variant="outline" onPress={onRetry}>
          重新加载
        </Button>
      </View>
    );
  }
  return (
    <View style={styles.state}>
      <Ionicons name="basket-outline" size={wp(40)} color={colors.muted} />
      <Text weight="bold">{emptyTitle}</Text>
      <Text tone="muted" align="center">
        {emptyDescription}
      </Text>
    </View>
  );
}

export function LoadMoreFooter({
  hasMore,
  loading,
  error,
  onPress
}: {
  hasMore: boolean;
  loading: boolean;
  error: boolean;
  onPress: () => void;
}) {
  if (!hasMore && !error) {
    return null;
  }
  return (
    <View style={styles.loadMore}>
      {error ? (
        <Text
          size="sm"
          color={colors.danger}
          align="center"
          accessibilityRole="alert"
        >
          后续食品加载失败，请重试
        </Text>
      ) : null}
      <Button
        variant="outline"
        loading={loading}
        onPress={onPress}
        accessibilityLabel={error ? "重试加载更多食品" : "加载更多食品"}
      >
        {error ? "重试加载更多" : "加载更多"}
      </Button>
    </View>
  );
}

export const segmentLabels: Record<FoodSegment, string> = {
  all: "全部",
  expired: "已过期",
  today: "今天",
  next3: "未来 1–3 天"
};

const styles = StyleSheet.create({
  header: {
    minHeight: wp(58),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: wp(12)
  },
  headerCopy: {
    flex: 1,
    gap: wp(3)
  },
  chip: {
    minHeight: wp(42),
    paddingHorizontal: wp(14),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: wp(999),
    borderWidth: wp(1)
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  chipDefault: {
    backgroundColor: colors.surface,
    borderColor: colors.border
  },
  pressed: {
    opacity: 0.72
  },
  foodCard: {
    gap: wp(14),
    padding: wp(16),
    borderRadius: wp(20),
    borderWidth: wp(1),
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  foodCardContainer: {
    position: "relative"
  },
  foodCardWithMenu: {
    paddingRight: wp(58)
  },
  menuTarget: {
    position: "absolute",
    top: wp(8),
    right: wp(8),
    zIndex: 2,
    width: wp(44),
    height: wp(44),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: wp(14),
    backgroundColor: colors.background
  },
  menuTargetPressed: {
    backgroundColor: colors.secondary,
    opacity: 0.78
  },
  foodTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: wp(12)
  },
  foodIcon: {
    width: wp(42),
    height: wp(42),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: wp(14),
    backgroundColor: colors.secondary
  },
  foodCopy: {
    flex: 1,
    gap: wp(4)
  },
  foodBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: wp(8)
  },
  status: {
    paddingHorizontal: wp(10),
    paddingVertical: wp(5),
    borderRadius: wp(999)
  },
  state: {
    minHeight: wp(240),
    paddingHorizontal: wp(28),
    alignItems: "center",
    justifyContent: "center",
    gap: wp(12)
  },
  loadMore: {
    minHeight: wp(76),
    alignItems: "center",
    justifyContent: "center",
    gap: wp(8),
    paddingVertical: wp(10)
  }
});
