import { describe, expect, it } from "vitest";

import { createAppConfig } from "./app.config";

const expectedPlugins = (enabled: boolean): NonNullable<
  ReturnType<typeof createAppConfig>["plugins"]
> => [
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
      enabled
    }
  ]
];

describe("createAppConfig", () => {
  it("enables Android cleartext traffic for an HTTP API build", () => {
    const config = createAppConfig({}, "http://10.0.2.2:3000");

    expect(config.plugins).toEqual(expectedPlugins(true));
    expect(config.extra?.apiUrl).toBe("http://10.0.2.2:3000");
    expect(config.icon).toBe("./assets/icon.png");
    expect(config.android).toEqual({
      package: "com.rowanxing.freshtrack"
    });
  });

  it("disables Android cleartext traffic for an HTTPS API build", () => {
    const config = createAppConfig({}, "https://api.freshtrack.example");

    expect(config.plugins).toEqual(expectedPlugins(false));
    expect(config.extra?.apiUrl).toBe("https://api.freshtrack.example");
  });
});
