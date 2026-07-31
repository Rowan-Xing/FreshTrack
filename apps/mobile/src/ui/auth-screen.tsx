import { zodResolver } from "@hookform/resolvers/zod";
import {
  authCredentialsSchema,
  type AuthCredentials
} from "@freshtrack/contracts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Dimensions,
  Image,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  type KeyboardEvent,
  type KeyboardEventEasing,
  View
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  FadeOutUp,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sp, wp } from "zkit-tools";
import { Button } from "zkit-ui/button";
import { Text } from "zkit-ui/text";
import { TextInput } from "zkit-ui/text-input";
import { toast } from "zkit-ui/toast";

import { ApiClientError } from "../auth/api";
import { useAuth } from "../auth/provider";
import { colors } from "../theme";
import { PageBackground } from "./page-background";

type AuthScreenProps = {
  mode: "login" | "register";
};

const contentEntrance = FadeInDown.duration(220).reduceMotion(
  ReduceMotion.System
);
const titleEntrance = FadeInDown.duration(220).reduceMotion(
  ReduceMotion.System
);
const titleExit = FadeOutUp.duration(160).reduceMotion(ReduceMotion.System);
const RESERVED_FIELD_MESSAGE = "\u00a0";
const KEYBOARD_GAP = 16;
const ESTIMATED_KEYBOARD_HEIGHT = 300;
const IOS_FALLBACK_KEYBOARD_DURATION = 250;
const ANDROID_FOCUS_LIFT_DURATION = 220;
const ANDROID_CORRECTION_DURATION = 140;
const KEYBOARD_HIDE_DURATION = 180;
// Metro requires a static asset path at build time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appIconSource = require<number>("../../assets/icon.png");

export function AuthScreen({ mode: initialMode }: AuthScreenProps) {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState(initialMode);
  const [inputFocused, setInputFocused] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authenticationInFlightRef = useRef(false);
  const submitButtonRef = useRef<View | null>(null);
  const minimumContentHeight = useRef(Dimensions.get("window").height).current;
  const { keyboardStyle, measureSubmitButton } = useKeyboardLift({
    anchorRef: submitButtonRef,
    estimatedKeyboardHeight: wp(ESTIMATED_KEYBOARD_HEIGHT),
    inputFocused,
    keyboardGap: wp(KEYBOARD_GAP)
  });
  const isRegister = mode === "register";
  const { control, handleSubmit } = useForm<AuthCredentials>({
    resolver: zodResolver(authCredentialsSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
    reValidateMode: "onSubmit"
  });

  const submit = handleSubmit(
    async (credentials) => {
      if (authenticationInFlightRef.current) {
        return;
      }

      authenticationInFlightRef.current = true;
      setIsAuthenticating(true);
      try {
        if (isRegister) {
          await auth.signUp(credentials);
          toast.success("账号创建成功", {
            description: "欢迎开始使用鲜知 FreshTrack"
          });
        } else {
          await auth.signIn(credentials);
          toast.success("欢迎回来");
        }
      } catch (error) {
        if (error instanceof ApiClientError) {
          toast.warning(
            error.fields?.email?.[0] ??
              error.fields?.password?.[0] ??
              error.message
          );
        } else {
          toast.warning(
            error instanceof Error ? error.message : "操作失败，请稍后重试"
          );
        }
      } finally {
        authenticationInFlightRef.current = false;
        setIsAuthenticating(false);
      }
    },
    (validationErrors) => {
      const message =
        validationErrors.email?.message ??
        validationErrors.password?.message ??
        "请检查输入内容";

      toast.warning(message);
    }
  );

  return (
    <View style={styles.screen}>
      <PageBackground variant="auth" />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            minHeight: minimumContentHeight,
            paddingTop: insets.top + wp(28),
            paddingBottom: insets.bottom + wp(24)
          }
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, keyboardStyle]}>
          <Animated.View style={styles.hero} entering={contentEntrance}>
            <View style={styles.brandRow}>
              <Image
                source={appIconSource}
                style={styles.brandMark}
                accessibilityLabel="鲜知 FreshTrack 应用图标"
              />
              <Text weight="bold" size="lg" color={colors.onSecondary}>
                鲜知 FreshTrack
              </Text>
            </View>
            <Animated.View
              key={mode}
              style={styles.heroCopy}
              entering={titleEntrance}
              exiting={titleExit}
            >
              <Text
                variant="display"
                size="4xl"
                weight="heavy"
                lineHeight={sp(44)}
              >
                {isRegister ? "把新鲜，记得更久" : "欢迎回来"}
              </Text>
              <Text size="md" tone="muted" lineHeight={sp(24)}>
                {isRegister
                  ? "创建你的专属空间，从真实、安全的账户开始。"
                  : "登录后继续管理你的食材与每一个新鲜日常。"}
              </Text>
            </Animated.View>
          </Animated.View>

          <Animated.View
            style={styles.card}
            entering={FadeInDown.delay(70)
              .duration(220)
              .reduceMotion(ReduceMotion.System)}
          >
            <View style={styles.formHeading}>
              <Text variant="heading" size="2xl" weight="bold">
                {isRegister ? "注册账号" : "账号登录"}
              </Text>
              <Text tone="muted">
                {isRegister ? "只需邮箱和密码" : "使用注册邮箱继续"}
              </Text>
            </View>

            <Controller
              control={control}
              name="email"
              render={({ field: { onBlur, onChange, value } }) => (
                <TextInput
                  label="邮箱"
                  required
                  value={value}
                  onChange={onChange}
                  onBlur={() => {
                    onBlur();
                    setInputFocused(false);
                  }}
                  onFocus={() => {
                    measureSubmitButton();
                    setInputFocused(true);
                  }}
                  placeholder="输入邮箱"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  returnKeyType="next"
                  clearable
                  size="lg"
                  accessibilityLabel="邮箱"
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { onBlur, onChange, value } }) => (
                <TextInput
                  label="密码"
                  required
                  value={value}
                  onChange={onChange}
                  onBlur={() => {
                    onBlur();
                    setInputFocused(false);
                  }}
                  onFocus={() => {
                    measureSubmitButton();
                    setInputFocused(true);
                  }}
                  placeholder={isRegister ? "至少 8 位" : "输入密码"}
                  secureTextEntry
                  textContentType={isRegister ? "newPassword" : "password"}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  returnKeyType="done"
                  onSubmit={() => {
                    if (!isAuthenticating) {
                      void submit();
                    }
                  }}
                  description={
                    isRegister
                      ? "使用 8–128 位不易猜测的密码"
                      : RESERVED_FIELD_MESSAGE
                  }
                  size="lg"
                  accessibilityLabel="密码"
                />
              )}
            />

            <View
              ref={submitButtonRef}
              collapsable={false}
              onLayout={measureSubmitButton}
            >
              <Button
                block
                size="xl"
                variant="solid"
                loading={isAuthenticating}
                onPress={() => {
                  void submit();
                }}
                accessibilityLabel={isRegister ? "注册并登录" : "登录"}
              >
                {isRegister ? "注册并登录" : "登录"}
              </Button>
            </View>

            <View style={styles.switchRow}>
              <Text tone="muted">
                {isRegister ? "已经有账号？" : "还没有账号？"}
              </Text>
              <Button
                variant="link"
                size="sm"
                disabled={isAuthenticating}
                onPress={() => {
                  setMode(isRegister ? "login" : "register");
                }}
                accessibilityLabel={isRegister ? "切换到登录" : "切换到注册"}
              >
                {isRegister ? "直接登录" : "立即注册"}
              </Button>
            </View>
          </Animated.View>

          <Text style={styles.footer} align="center" tone="subtle" size="xs">
            凭据仅安全保存在本设备，密码不会写入日志。
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

type KeyboardLiftOptions = {
  anchorRef: RefObject<View | null>;
  estimatedKeyboardHeight: number;
  inputFocused: boolean;
  keyboardGap: number;
};

type KeyboardCoordinates = Pick<
  KeyboardEvent["endCoordinates"],
  "height" | "screenY"
>;

function useKeyboardLift({
  anchorRef,
  estimatedKeyboardHeight,
  inputFocused,
  keyboardGap
}: KeyboardLiftOptions) {
  const keyboardLift = useSharedValue(0);
  const viewportHeightRef = useRef(Dimensions.get("window").height);
  const keyboardVisibleRef = useRef(false);
  const keyboardTopRef = useRef<number | null>(null);
  const anchorBottomRef = useRef<number | null>(null);
  const focusFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    const subscription = Dimensions.addEventListener(
      "change",
      ({ window }) => {
        if (!keyboardVisibleRef.current && window.height > 0) {
          viewportHeightRef.current = Math.max(
            viewportHeightRef.current,
            window.height
          );
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const clearFocusFallbackTimer = useCallback(() => {
    if (focusFallbackTimerRef.current !== null) {
      clearTimeout(focusFallbackTimerRef.current);
      focusFallbackTimerRef.current = null;
    }
  }, []);

  const animateLift = useCallback(
    (
      targetLift: number,
      duration: number,
      easingName: KeyboardEventEasing = "keyboard"
    ) => {
      cancelAnimation(keyboardLift);
      keyboardLift.value = withTiming(targetLift, {
        duration,
        easing: getKeyboardEasing(easingName)
      });
    },
    [keyboardLift]
  );

  const getKeyboardTop = useCallback((coordinates: KeyboardCoordinates) => {
    if (coordinates.screenY > 0) {
      return coordinates.screenY;
    }

    return Math.max(0, viewportHeightRef.current - coordinates.height);
  }, []);

  const getLiftFromKeyboardTop = useCallback(
    (keyboardTop: number) => {
      const anchorBottom = anchorBottomRef.current;
      if (anchorBottom === null) {
        return 0;
      }

      return Math.max(0, anchorBottom + keyboardGap - keyboardTop);
    },
    [keyboardGap]
  );

  const measureSubmitButton = useCallback(() => {
    const anchor = anchorRef.current;
    if (anchor === null) {
      return;
    }

    anchor.measureInWindow((_x, y, _width, height) => {
      const unshiftedBottom = y + height + keyboardLift.value;
      anchorBottomRef.current = unshiftedBottom;

      const keyboardTop = keyboardTopRef.current;
      if (keyboardVisibleRef.current && keyboardTop !== null) {
        animateLift(
          getLiftFromKeyboardTop(keyboardTop),
          ANDROID_CORRECTION_DURATION,
          "easeOut"
        );
      }
    });
  }, [anchorRef, animateLift, getLiftFromKeyboardTop, keyboardLift]);

  useEffect(() => {
    const handleKeyboardChange = (event: KeyboardEvent) => {
      clearFocusFallbackTimer();
      const keyboardTop = getKeyboardTop(event.endCoordinates);
      keyboardVisibleRef.current = true;
      keyboardTopRef.current = keyboardTop;
      animateLift(
        getLiftFromKeyboardTop(keyboardTop),
        getKeyboardDuration(event, getShowFallbackDuration()),
        event.easing
      );
    };

    const handleKeyboardHide = (event: KeyboardEvent) => {
      clearFocusFallbackTimer();
      keyboardVisibleRef.current = false;
      keyboardTopRef.current = null;
      animateLift(
        0,
        getKeyboardDuration(event, KEYBOARD_HIDE_DURATION),
        event.easing
      );
    };

    const changeEvent =
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const changeSubscription = Keyboard.addListener(
      changeEvent,
      handleKeyboardChange
    );
    const hideSubscription = Keyboard.addListener(
      hideEvent,
      handleKeyboardHide
    );

    return () => {
      changeSubscription.remove();
      hideSubscription.remove();
      clearFocusFallbackTimer();
    };
  }, [
    animateLift,
    clearFocusFallbackTimer,
    getKeyboardTop,
    getLiftFromKeyboardTop
  ]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    if (!inputFocused) {
      clearFocusFallbackTimer();
      if (!keyboardVisibleRef.current) {
        animateLift(0, KEYBOARD_HIDE_DURATION);
      }
      return;
    }

    if (keyboardVisibleRef.current) {
      return;
    }

    const metrics = Keyboard.metrics();
    if (Keyboard.isVisible() && metrics) {
      const keyboardTop = getKeyboardTop(metrics);
      keyboardVisibleRef.current = true;
      keyboardTopRef.current = keyboardTop;
      animateLift(
        getLiftFromKeyboardTop(keyboardTop),
        ANDROID_CORRECTION_DURATION,
        "easeOut"
      );
      return;
    }

    const estimatedKeyboardTop =
      metrics && metrics.screenY > 0
        ? metrics.screenY
        : Math.max(0, viewportHeightRef.current - estimatedKeyboardHeight);
    const estimatedLift = getLiftFromKeyboardTop(estimatedKeyboardTop);
    if (estimatedLift > 0) {
      animateLift(estimatedLift, ANDROID_FOCUS_LIFT_DURATION, "easeOut");
    }

    clearFocusFallbackTimer();
    focusFallbackTimerRef.current = setTimeout(() => {
      focusFallbackTimerRef.current = null;
      if (!keyboardVisibleRef.current && !Keyboard.isVisible()) {
        animateLift(0, KEYBOARD_HIDE_DURATION);
      }
    }, 650);
  }, [
    animateLift,
    clearFocusFallbackTimer,
    estimatedKeyboardHeight,
    getKeyboardTop,
    getLiftFromKeyboardTop,
    inputFocused
  ]);

  const keyboardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboardLift.value }]
  }));

  return { keyboardStyle, measureSubmitButton };
}

function getKeyboardDuration(event: KeyboardEvent, fallbackDuration: number) {
  return Number.isFinite(event.duration) && event.duration > 0
    ? event.duration
    : fallbackDuration;
}

function getShowFallbackDuration() {
  return Platform.OS === "ios"
    ? IOS_FALLBACK_KEYBOARD_DURATION
    : ANDROID_CORRECTION_DURATION;
}

function getKeyboardEasing(easingName: KeyboardEventEasing) {
  switch (easingName) {
    case "linear":
      return Easing.linear;
    case "easeIn":
      return Easing.in(Easing.cubic);
    case "easeOut":
      return Easing.out(Easing.cubic);
    case "easeInEaseOut":
      return Easing.inOut(Easing.cubic);
    case "keyboard":
      return Easing.bezier(0.25, 0.1, 0.25, 1);
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: wp(20)
  },
  content: {
    gap: wp(26)
  },
  hero: {
    gap: wp(12),
    paddingHorizontal: wp(4)
  },
  heroCopy: {
    gap: wp(12)
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: wp(10),
    marginBottom: wp(6)
  },
  brandMark: {
    width: wp(42),
    height: wp(42),
    borderRadius: wp(14)
  },
  card: {
    gap: wp(18),
    paddingHorizontal: wp(20),
    paddingVertical: wp(22),
    borderRadius: wp(24),
    borderWidth: wp(1),
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  formHeading: {
    gap: wp(4),
    marginBottom: wp(2)
  },
  switchRow: {
    minHeight: wp(44),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: wp(2)
  },
  footer: {
    paddingHorizontal: wp(18)
  }
});
