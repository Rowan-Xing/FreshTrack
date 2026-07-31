import type { ConfigContext, ExpoConfig } from "expo/config";
import { z } from "zod";

const apiUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    "EXPO_PUBLIC_API_URL must use http or https"
  );

export function createAppConfig(
  config: Partial<ExpoConfig>,
  rawApiUrl: string | undefined
): ExpoConfig {
  const apiUrl = apiUrlSchema.parse(rawApiUrl);

  return {
    ...config,
    name: "鲜知 FreshTrack",
    slug: "freshtrack",
    version: "0.1.0",
    icon: "./assets/icon.png",
    orientation: "portrait",
    scheme: "freshtrack",
    userInterfaceStyle: "light",
    platforms: ["android"],
    android: {
      package: "com.rowanxing.freshtrack"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          android: {
            backgroundColor: "#FFFFFF",
            image: "./assets/icon.png",
            imageWidth: 200,
            resizeMode: "contain"
          }
        }
      ],
      [
        "expo-notifications",
        {
          defaultChannel: "freshtrack-expiry-reminders"
        }
      ],
      [
        "expo-secure-store",
        {
          configureAndroidBackup: true
        }
      ],
      [
        "./plugins/with-android-cleartext-traffic",
        {
          enabled: apiUrl.startsWith("http://")
        }
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      apiUrl,
      eas: {
        projectId: "f2fee7a0-00f2-4ad4-ac6b-31daf8f36faf"
      }
    }
  };
}

export default ({ config }: ConfigContext): ExpoConfig =>
  createAppConfig(config, process.env.EXPO_PUBLIC_API_URL);
