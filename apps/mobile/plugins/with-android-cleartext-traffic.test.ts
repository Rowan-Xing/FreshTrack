import {
  AndroidConfig,
  type AndroidManifest
} from "expo/config-plugins";
import { describe, expect, it } from "vitest";

import { setAndroidCleartextTraffic } from "./with-android-cleartext-traffic";

function createManifest(): AndroidManifest {
  return {
    manifest: {
      $: {
        "xmlns:android": "http://schemas.android.com/apk/res/android"
      },
      queries: [],
      application: [
        {
          $: {
            "android:name": ".MainApplication"
          }
        }
      ]
    }
  };
}

describe("setAndroidCleartextTraffic", () => {
  it.each([
    [true, "true"],
    [false, "false"]
  ] as const)(
    "writes android:usesCleartextTraffic=%s to the main application",
    (enabled, expected) => {
      const manifest = setAndroidCleartextTraffic(createManifest(), enabled);
      const application = AndroidConfig.Manifest.getMainApplication(manifest);

      expect(application?.$["android:usesCleartextTraffic"]).toBe(expected);
    }
  );
});
