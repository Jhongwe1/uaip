// test/env.d.ts — 型別接線：宣告 cloudflare:test 的 env 就是我們的 Env，
// 外加 vitest.config.mjs 塞進來的測試專用綁定 TEST_MIGRATIONS。
import type { Env } from "../src/types.js";
import type { D1Migration } from "cloudflare:test";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
