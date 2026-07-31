import { describe, expect, it, vi } from "vitest";

import {
  createSerializedSessionStorage,
  type SessionStorageDriver
} from "./serialized-session-storage";

function deferred<T>() {
  let resolvePromise:
    | ((value: T | PromiseLike<T>) => void)
    | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T | PromiseLike<T>) {
      resolvePromise?.(value);
    }
  };
}

function createDriver(initialToken: string | null) {
  let token = initialToken;
  const driver: SessionStorageDriver = {
    getToken: vi.fn(() => Promise.resolve(token)),
    setToken: vi.fn((nextToken: string) => {
      token = nextToken;
      return Promise.resolve();
    }),
    clearToken: vi.fn(() => {
      token = null;
      return Promise.resolve();
    })
  };
  return {
    driver,
    token() {
      return token;
    }
  };
}

describe("serialized session storage", () => {
  it("does not let a late old-token invalidation delete a replacement token", async () => {
    const fake = createDriver("old-token");
    const storage = createSerializedSessionStorage(fake.driver);

    await storage.setToken("replacement-token");
    await expect(
      storage.compareAndClearToken("old-token")
    ).resolves.toBe(false);
    expect(fake.token()).toBe("replacement-token");
  });

  it("serializes concurrent invalidations ahead of a replacement write", async () => {
    let token: string | null = "old-token";
    const clearStarted = deferred<void>();
    const allowClear = deferred<void>();
    const clearToken = vi.fn(async () => {
      clearStarted.resolve(undefined);
      await allowClear.promise;
      token = null;
    });
    const storage = createSerializedSessionStorage({
      getToken: () => Promise.resolve(token),
      setToken: (nextToken) => {
        token = nextToken;
        return Promise.resolve();
      },
      clearToken
    });

    const firstInvalidation = storage.compareAndClearToken("old-token");
    await clearStarted.promise;
    const secondInvalidation = storage.compareAndClearToken("old-token");
    const replacementWrite = storage.setToken("replacement-token");
    allowClear.resolve(undefined);

    await expect(firstInvalidation).resolves.toBe(true);
    await expect(secondInvalidation).resolves.toBe(false);
    await replacementWrite;
    expect(token).toBe("replacement-token");
    expect(clearToken).toHaveBeenCalledOnce();
  });
});
