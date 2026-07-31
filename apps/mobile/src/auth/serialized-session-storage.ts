import type { SessionStorage } from "./session-restore";

export interface SessionStorageDriver {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

export function createSerializedSessionStorage(
  driver: SessionStorageDriver
): SessionStorage {
  let queue: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  return {
    getToken() {
      return enqueue(() => driver.getToken());
    },
    setToken(token) {
      return enqueue(() => driver.setToken(token));
    },
    clearToken() {
      return enqueue(() => driver.clearToken());
    },
    compareAndClearToken(expectedToken) {
      return enqueue(async () => {
        const storedToken = await driver.getToken();
        if (storedToken !== expectedToken) {
          return false;
        }
        await driver.clearToken();
        return true;
      });
    }
  };
}
