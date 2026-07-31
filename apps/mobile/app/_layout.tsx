import "../src/bootstrap";
import "react-native-gesture-handler";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ZKitProvider } from "zkit-ui/provider";

import { AuthProvider, useAuth } from "../src/auth/provider";
import { ReminderProvider } from "../src/reminders/provider";
import { zkitTheme } from "../src/theme";
import { StartupScreen } from "../src/ui/startup-screen";

function AppNavigator() {
  const auth = useAuth();

  if (auth.status === "restoring") {
    return <StartupScreen mode="loading" />;
  }
  if (auth.status === "recoveryError") {
    return (
      <StartupScreen
        mode="error"
        message={auth.message}
        onRetry={() => {
          auth.retryRestore();
        }}
      />
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom" }}>
      <Stack.Protected guard={auth.status === "anonymous"}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={auth.status === "authenticated"}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
          mutations: { retry: false }
        }
      })
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ZKitProvider
          theme={zkitTheme}
          locale="zh-CN"
          missingKeyPolicy="key"
        >
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ReminderProvider>
                <AppNavigator />
              </ReminderProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ZKitProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
