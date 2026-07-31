import { StyleSheet } from "react-native";
import { wp } from "zkit-tools";
import { Switch, type SwitchColors } from "zkit-ui/switch";

import { colors } from "../theme";

const switchColors: SwitchColors = {
  checkedTrack: colors.primary,
  uncheckedTrack: colors.muted,
  thumb: colors.surface,
  checkedText: colors.onPrimary,
  uncheckedText: colors.onPrimary
};

export function AppSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  description
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      label={label}
      description={description}
      stateText={{ checked: "开", unchecked: "关" }}
      colors={switchColors}
      accessibilityHint={description}
      accessibilityValue={{ text: checked ? "已开启" : "已关闭" }}
      style={styles.root}
      contentStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: wp(52),
    alignSelf: "stretch",
    justifyContent: "center"
  },
  content: {
    alignSelf: "stretch"
  }
});
