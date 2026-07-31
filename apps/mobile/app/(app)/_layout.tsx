import { Stack } from "expo-router";

export default function AuthenticatedLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade"
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="foods/new"
        options={{ animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="foods/[foodId]"
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="foods/[foodId]/edit"
        options={{ animation: "slide_from_right" }}
      />
    </Stack>
  );
}
