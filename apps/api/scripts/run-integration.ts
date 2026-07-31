import { spawn } from "node:child_process";

import { z } from "zod";

const testDatabaseUrl = z
  .string()
  .url()
  .startsWith("postgresql://")
  .parse(process.env.TEST_DATABASE_URL);

const parsedUrl = new URL(testDatabaseUrl);
const schema = parsedUrl.searchParams.get("schema");
if (!schema || !schema.toLowerCase().includes("test")) {
  throw new Error(
    "TEST_DATABASE_URL must use a dedicated schema whose name contains 'test'"
  );
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        NODE_ENV: "test"
      },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${String(code)}`));
      }
    });
  });
}

await run("pnpm", ["exec", "prisma", "migrate", "reset", "--force"]);
await run("pnpm", [
  "exec",
  "vitest",
  "run",
  "--no-file-parallelism",
  "src/auth.integration.test.ts",
  "src/food.integration.test.ts"
]);
