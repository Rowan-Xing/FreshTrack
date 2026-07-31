import { Redirect } from "expo-router";

export default function AuthenticatedIndex() {
  return <Redirect href="/(app)/(tabs)" />;
}
