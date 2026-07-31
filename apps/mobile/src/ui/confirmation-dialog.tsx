import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { sp, wp } from "zkit-tools";

import { colors } from "../theme";
import {
  ConfirmationController,
  type ConfirmationRequest
} from "./confirmation-controller";

export function useConfirmationDialog() {
  const [controller] = useState(() => new ConfirmationController());
  const request = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  useEffect(
    () => () => {
      controller.dispose();
    },
    [controller]
  );

  return {
    request,
    confirm: controller.confirm,
    settle: controller.settle
  };
}

export function ConfirmationDialog({
  request,
  onResolve
}: {
  request: ConfirmationRequest | null;
  onResolve: (accepted: boolean) => void;
}) {
  if (!request) {
    return null;
  }

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        onResolve(false);
      }}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <Pressable
          accessible={false}
          style={StyleSheet.absoluteFill}
          onPress={() => {
            onResolve(false);
          }}
        />
        <View style={styles.card}>
          <View style={styles.copy}>
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={1.3}
              style={styles.title}
            >
              {request.title}
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.message}>
              {request.message}
            </Text>
          </View>
          <View style={styles.actions}>
            <DialogButton
              label={request.cancelLabel}
              tone="cancel"
              onPress={() => {
                onResolve(false);
              }}
            />
            <DialogButton
              label={request.confirmLabel}
              tone={request.tone === "danger" ? "danger" : "primary"}
              onPress={() => {
                onResolve(true);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DialogButton({
  label,
  tone,
  onPress
}: {
  label: string;
  tone: "cancel" | "primary" | "danger";
  onPress: () => void;
}) {
  const solid = tone !== "cancel";
  const backgroundColor =
    tone === "danger"
      ? colors.danger
      : tone === "primary"
        ? colors.primary
        : colors.surface;
  const textColor = solid ? colors.onPrimary : colors.onSurface;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderColor: solid ? backgroundColor : colors.border
        },
        pressed ? styles.pressed : null
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={[styles.buttonLabel, { color: textColor }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: wp(24),
    backgroundColor: colors.backdrop
  },
  card: {
    width: "100%",
    maxWidth: wp(360),
    gap: wp(24),
    padding: wp(22),
    borderRadius: wp(22),
    borderWidth: wp(1),
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  copy: {
    gap: wp(9)
  },
  title: {
    color: colors.onSurface,
    fontSize: sp(20),
    fontWeight: "700",
    lineHeight: sp(28)
  },
  message: {
    color: colors.muted,
    fontSize: sp(15),
    lineHeight: sp(23)
  },
  actions: {
    flexDirection: "row",
    gap: wp(12)
  },
  button: {
    minHeight: wp(48),
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: wp(14),
    borderWidth: wp(1),
    borderRadius: wp(14)
  },
  buttonLabel: {
    fontSize: sp(15),
    fontWeight: "700",
    lineHeight: sp(21),
    textAlign: "center"
  },
  pressed: {
    opacity: 0.78
  }
});
