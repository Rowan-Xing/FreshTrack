import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { wp } from "zkit-tools";
import { Button } from "zkit-ui/button";
import { LoadingSpinner } from "zkit-ui/loading-spinner";
import { Text } from "zkit-ui/text";

import { colors } from "../theme";

type StartupScreenProps =
  | { mode: "loading" }
  | { mode: "error"; message: string; onRetry: () => void };

export function StartupScreen(props: StartupScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom
          }
        ]}
      >
        <View style={styles.mark}>
          <Text size="2xl" weight="heavy" color={colors.onPrimary}>
            鲜
          </Text>
        </View>
        <Text variant="heading" size="2xl" weight="bold">
          鲜知 FreshTrack
        </Text>
        {props.mode === "loading" ? (
          <>
            <LoadingSpinner size={wp(30)} color={colors.primary} />
            <Text tone="muted">正在安全恢复登录状态…</Text>
          </>
        ) : (
          <View style={styles.errorBlock}>
            <Text align="center" tone="danger">
              {props.message}
            </Text>
            <Button
              variant="solid"
              size="lg"
              onPress={props.onRetry}
              accessibilityLabel="重新恢复登录状态"
            >
              重新连接
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: wp(18),
    paddingHorizontal: wp(28)
  },
  mark: {
    width: wp(72),
    height: wp(72),
    borderRadius: wp(24),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: wp(8) },
    shadowOpacity: 0.2,
    shadowRadius: wp(16),
    elevation: wp(6)
  },
  errorBlock: {
    width: "100%",
    gap: wp(18)
  }
});
