import type { ThemeOverride } from "zkit-ui";

const deepGreen = "#14532D";

export const colors = {
  primary: deepGreen,
  onPrimary: "#FFFFFF",
  secondary: "#E4EFE8",
  onSecondary: "#123E26",
  surface: "#FFFFFF",
  onSurface: "#132A1D",
  border: "#CBDCCF",
  muted: "#5D7163",
  disabled: "#9EADA3",
  background: "#F3F7F4",
  danger: "#B42318",
  dangerSurface: "#FEF3F2",
  warning: "#B54708",
  warningSurface: "#FFFAEB",
  success: deepGreen,
  successSurface: "#E4EFE8",
  backdrop: "rgba(10, 39, 24, 0.56)"
} as const;

export const zkitTheme: ThemeOverride = {
  colors: {
    primary: colors.primary,
    onPrimary: colors.onPrimary,
    secondary: colors.secondary,
    onSecondary: colors.onSecondary,
    surface: colors.surface,
    onSurface: colors.onSurface,
    border: colors.border,
    muted: colors.muted,
    disabled: colors.disabled
  }
};
