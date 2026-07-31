import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  StyleSheet,
  View
} from "react-native";
import { wp } from "zkit-tools";
import { Text } from "zkit-ui/text";

import { colors } from "../theme";
import {
  activeFoodQuickActions,
  type ActiveFoodQuickAction
} from "./quick-action";

const actionIcons: Record<
  ActiveFoodQuickAction,
  "create-outline" | "checkmark-circle-outline" | "trash-bin-outline" | "trash-outline"
> = {
  edit: "create-outline",
  eat: "checkmark-circle-outline",
  discard: "trash-bin-outline",
  delete: "trash-outline"
};

export function FoodQuickActionMenu({
  foodName,
  busy,
  onClose,
  onSelect
}: {
  foodName: string;
  busy: boolean;
  onClose: () => void;
  onSelect: (action: ActiveFoodQuickAction) => void;
}) {
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <Pressable
          accessible={false}
          style={StyleSheet.absoluteFill}
          disabled={busy}
          onPress={onClose}
        />
        <View style={styles.menu}>
          <View style={styles.heading}>
            <Text size="xs" tone="muted">
              食品操作
            </Text>
            <Text
              size="lg"
              weight="bold"
              numberOfLines={2}
              accessibilityRole="header"
            >
              {foodName}
            </Text>
          </View>
          <View>
            {activeFoodQuickActions.map((action) => {
              const destructive = action.id === "delete";
              return (
                <Pressable
                  key={action.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${action.label}${foodName}`}
                  disabled={busy}
                  onPress={() => {
                    onSelect(action.id);
                  }}
                  style={({ pressed }) => [
                    styles.action,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Ionicons
                    name={actionIcons[action.id]}
                    size={wp(21)}
                    color={destructive ? colors.danger : colors.onSurface}
                  />
                  <Text
                    weight="semibold"
                    color={destructive ? colors.danger : colors.onSurface}
                    style={styles.actionLabel}
                  >
                    {action.label}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={wp(18)}
                    color={colors.muted}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    padding: wp(18),
    backgroundColor: colors.backdrop
  },
  menu: {
    overflow: "hidden",
    borderRadius: wp(22),
    borderWidth: wp(1),
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  heading: {
    gap: wp(4),
    paddingHorizontal: wp(18),
    paddingTop: wp(18),
    paddingBottom: wp(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  action: {
    minHeight: wp(54),
    flexDirection: "row",
    alignItems: "center",
    gap: wp(12),
    paddingHorizontal: wp(18)
  },
  actionLabel: {
    flex: 1
  },
  pressed: {
    backgroundColor: colors.secondary,
    opacity: 0.82
  }
});
