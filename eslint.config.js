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
      "lib/vendor/**",       // 第三方 vendored（marked）— 不碰
      "lib/apidoc.js",       // 由 API.md 產生的生成檔
      "public/**"            // 前端資產手工調校＋index.html 的 CSP sha256 釘死，不 lint 不格式化
    ]
  },
  js.configs.recommended,

  // 後端 .js（lib/ 與 functions/）
  {
    files: ["lib/**/*.js", "functions/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: workerGlobals
    },
    rules: {
      // catch (e) {} 是全站慣用的「失敗就算了」— caughtErrors:none 不把它當未用變數
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],   // 觀測性程式大量「失敗就算了」的空 catch
      "no-control-regex": "off",                         // sanitize.js 的 URL 控制字元過濾是刻意的
      "no-useless-escape": "off"                         // <\/script> 是 HTML-in-JS 的刻意防護（防提早關 script）
    }
  },

  // 後端 .ts（src/）
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ["src/**/*.ts"]
  })),
  {
    files: ["src/**/*.ts"],
    languageOptions: { globals: workerGlobals },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",       // 橋接寬鬆型別的 .js handler，過渡期允許
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }]
    }
  },

  // 測試（vitest；node＋worker 都會用到）
  {
    files: ["test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...workerGlobals, ...globals.node }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
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

  prettier   // 一定放最後：關掉所有與 Prettier 衝突的排版規則
];
