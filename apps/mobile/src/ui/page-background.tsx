import { Image } from "expo-image";
import { StyleSheet } from "react-native";

type PageBackgroundVariant = "auth" | "home" | "history" | "settings";

/* eslint-disable @typescript-eslint/no-require-imports -- Metro requires static asset paths at build time. */
const pageBackgroundSources: Record<PageBackgroundVariant, number> = {
  auth: require<number>("../../assets/backgrounds/auth-background.webp"),
  home: require<number>("../../assets/backgrounds/home-background-v2.webp"),
  history: require<number>("../../assets/backgrounds/history-background.webp"),
  settings: require<number>("../../assets/backgrounds/settings-background.webp")
};
/* eslint-enable @typescript-eslint/no-require-imports */

type PageBackgroundProps = {
  variant: PageBackgroundVariant;
};

export function PageBackground({ variant }: PageBackgroundProps) {
  return (
    <Image
      source={pageBackgroundSources[variant]}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      contentPosition="center"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
