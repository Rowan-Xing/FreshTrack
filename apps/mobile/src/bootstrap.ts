import { router } from "expo-router";
import {
  configureFontSizeMultiplier,
  configureViewportScale,
  createRouterGuard
} from "zkit-tools";

configureViewportScale({
  baseWidth: 375,
  fallbackWidth: 375,
  minScale: 0.85,
  maxScale: 1.2,
  minFontScale: 0.9,
  maxFontScale: 1.2
});

configureFontSizeMultiplier({
  maxFontSizeMultiplier: 1.3
});

createRouterGuard({
  router,
  lockMs: 900
});

