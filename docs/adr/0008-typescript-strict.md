# ADR-0008: Full TypeScript (strict) migration

**Status**: accepted · **Date**: 2026-07-17 (v2.0.0 Phase F)

## Context

The server code was hand-written ES modules with no static checking beyond tests. v1.0.0
added `tsc` in `checkJs`-off mode (types only for the toolchain). Two audit findings kept
recurring: D1 rows and `request.json()` bodies flow untyped through handlers, and the
Pages-shaped context object (`ctx.env`, `ctx.params`) had no single definition — every
handler re-assumed its shape. With the Workers router (ADR-0006) already TypeScript,
half-and-half was the worst of both worlds.

## Decision

**Everything under `src/` and `test/` is TypeScript with `strict: true`.** The migration
was file-by-file rename (`git mv`, history preserved) with a hard rule: **no logic changes
in the same commit** — types were added, behavior was not touched (the one sanctioned
exception: widening a signature the runtime already accepted, e.g. `keyHint(null)`).

Shared shapes live in `src/types.ts`: `Env` (bindings + secrets), `RouteCtx` (the
Pages-shaped context the router builds), and descriptive D1 row types (`UserRow`,
`ChannelRow`, `ArticleRow`) that allow index access — D1 gives no runtime guarantees, so
row types are documentation plus autocomplete, not proofs.

**`any` is allowed at boundaries only** (`request.json()`, upstream JSON, whole D1 rows),
each with an inline comment; `@typescript-eslint/no-explicit-any` is off by policy rather
than sprinkled with disables. Directory restructure landed in the same phase:
`lib/` → `src/lib/`, `functions/` → `src/routes/`. Not converted: `public/assets/*.js`
(frontend stays no-build, per ADR-0001) and vendored `marked.mjs` (third-party, untouched).
The generated `src/lib/apidoc.ts` gets its type annotation from the generator.

## Consequences

**Won**: `tsc --noEmit` strict catches null-deref and shape drift before tests do; the
context/env/row contracts exist in exactly one file; editor navigation works across the
whole server; tests (29 files) type-check against the real handler signatures, so a
signature change breaks the build instead of silently passing loose fixtures.

**Paid**: boundary `any` means D1 column types are still trust-based — a schema change
can lie to the type system until a test catches it; test code carries `as any` casts where
it deliberately feeds malformed input; contributors now need `tsc` green, not just tests.

**Revisit when**: D1 grows typed query support worth adopting, or a validation layer
(hand-rolled, per ADR-0001) makes boundary types earned instead of asserted.

---

**中文摘要**：src/ 與 test/ 全面 TypeScript strict。遷移紀律＝逐檔改名、同 commit 禁改
邏輯（唯一例外：把執行期本來就接受的輸入寫進簽名，如 `keyHint(null)`）。共用形狀集中在
`src/types.ts`（Env／RouteCtx／D1 資料列）；`any` 只准出現在邊界（request.json()、上游
JSON、D1 整列）並附行內註解。前端 `public/assets` 與 vendored marked 不轉。換到的是
null 與形狀漂移在編譯期被抓、契約只有一份定義；代價是 D1 欄位型別仍是「宣稱」而非
「證明」，schema 改動要靠測試兜底。
