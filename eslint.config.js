// eslint.config.js — ESLint 9 flat config（v2.0.0 Phase E）。
// 定位：抓真 bug 與明顯壞味道，排版交給 Prettier（eslint-config-prettier 關掉所有排版規則）。
// typescript-eslint 為 Phase F 的 .ts 遷移預備。CI 的 lint job 吃這份設定。
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

// 後端（Workers／Pages Functions）執行環境的全域：Web 平台 API＋少數 workerd 專有。
const workerGlobals = {
  ...globals.browser,
  ...globals.worker,
  D1Database: "readonly",
  ExecutionContext: "readonly",
  DurableObject: "readonly",
  DurableObjectState: "readonly",
  DurableObjectNamespace: "readonly"
};

export default [
  {
    ignores: [
      "node_modules/**",
      ".wrangler/**",
      "src/lib/vendor/**", // 第三方 vendored（marked）— 不碰
      "src/lib/apidoc.ts", // 由 API.md 產生的生成檔
      "public/**" // 前端資產手工調校＋index.html 的 CSP sha256 釘死，不 lint 不格式化
    ]
  },
  js.configs.recommended,

  // 後端＋測試 .ts（Phase F 起全面 TypeScript）
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ["src/**/*.ts", "test/**/*.ts"]
  })),
  {
    files: ["src/**/*.ts"],
    languageOptions: { globals: workerGlobals },
    rules: {
      // 邊界處（request.json()、上游 JSON、D1 整列）允許 any — 各處都有行內註解說明
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }
      ],
      "no-empty": ["warn", { allowEmptyCatch: true }], // 觀測性程式大量「失敗就算了」的空 catch
      "no-control-regex": "off", // sanitize.ts 的 URL 控制字元過濾是刻意的
      "no-useless-escape": "off" // <\/script> 是 HTML-in-JS 的刻意防護（防提早關 script）
    }
  },

  // 測試（vitest；node＋worker 都會用到）
  {
    files: ["test/**/*.ts"],
    languageOptions: { globals: { ...workerGlobals, ...globals.node } },
    rules: {
      // 測試斷言大量對付「邊界形狀」（回應 JSON、D1 整列）— 與 src 同樣允許 any
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }]
    }
  },

  // 工具腳本（node）
  {
    files: ["tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  },

  prettier // 一定放最後：關掉所有與 Prettier 衝突的排版規則
];
