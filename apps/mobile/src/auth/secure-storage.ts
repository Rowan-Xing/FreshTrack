import * as SecureStore from "expo-secure-store";

import { createSerializedSessionStorage } from "./serialized-session-storage";

const SESSION_TOKEN_KEY = "freshtrack.auth.session-token.v1";

export const secureSessionStorage = createSerializedSessionStorage({
  getToken() {
    return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  },
  setToken(token) {
    return SecureStore.setItemAsync(SESSION_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  },
  clearToken() {
    return SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  }
});
