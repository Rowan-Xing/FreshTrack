import {
  AndroidConfig,
  type AndroidManifest,
  type ConfigPlugin,
  withAndroidManifest
} from "expo/config-plugins";

export type AndroidCleartextTrafficOptions = {
  enabled: boolean;
};

export function setAndroidCleartextTraffic(
  manifest: AndroidManifest,
  enabled: boolean
): AndroidManifest {
  const application =
    AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application.$["android:usesCleartextTraffic"] = enabled ? "true" : "false";
  return manifest;
}

const withAndroidCleartextTraffic: ConfigPlugin<
  AndroidCleartextTrafficOptions
> = (config, { enabled }) =>
  withAndroidManifest(config, (modConfig) => {
    setAndroidCleartextTraffic(modConfig.modResults, enabled);
    return modConfig;
  });

export default withAndroidCleartextTraffic;
