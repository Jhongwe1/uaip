# ADR-0006: Migrate from Cloudflare Pages to Cloudflare Workers

**Status**: accepted · **Date**: 2026-07-16 (v2.0.0 Phase D; ADR backfilled in Phase F)

## Context

v1.0.0 ran on Cloudflare Pages (file-based Functions routing). Pages cannot attach
Durable Objects or cron triggers — both are on the v2.0.0 roadmap (atomic rate limiting,
backups/rollups/alerting). Staying on Pages meant either giving those up or bolting on a
second deployment target. DNS for `uaip.cc.cd` was verified to be a zone in the same
Cloudflare account, so a custom-domain cutover is minute-level (same-zone certificates).

## Decision

Move to a **single Worker** (`src/index.ts`, `export default { fetch }`) with a
**hand-written router** (zero-dependency, per ADR-0001): a route-table array where
registration order is priority, `:id` and `*path` params shaped exactly like Pages'
`params`, and middleware as function composition. Existing Pages-style handlers
(`onRequestGet` etc.) are mounted **unchanged** on the route table.

Static assets stay in `public/` via the `[assets]` binding with
`not_found_handling = "single-page-application"` and **`run_worker_first = true`** —
the Phase D spike showed that with SPA fallback enabled, every path "hits" `index.html`
unless the Worker runs first (with `run_worker_first = ["/"]`, `/api/health` returned the
SPA shell). Unmatched routes fall through to `env.ASSETS.fetch` (real static files, then
SPA fallback for `/ip` `/ua`). `_headers` still applies to asset responses (verified in
`wrangler dev`).

Cutover: deploy to workers.dev against the production D1 → set the four secrets (Pages
secrets do not transfer) → smoke test → detach the domain from Pages and attach it to
the Worker (same zone). Rollback during the transition window = re-attach the domain to
Pages; after Phase F removed `functions/`, the rollback unit is a git commit.

## Consequences

**Won**: Durable Objects and cron triggers become available (Phases H/I); one deployment
model (`wrangler deploy`) instead of Pages' implicit build; the router is ~100 lines of
reviewable code; tests gain `SELF.fetch` full-route coverage; static-asset requests are
free and don't count against the 100k req/day Worker quota.

**Paid**: routing is now our code — file-based auto-discovery is gone, and adding a route
means editing `src/routes.ts` (a drift test guards the table); `run_worker_first = true`
puts every request through the Worker (page views now spend Worker invocations, still far
below free-tier limits for this site); Workers secrets/vars had to be re-provisioned by
hand during cutover.

**Revisit when**: Cloudflare ships file-based routing for Workers with DO/cron parity, or
the route table outgrows linear scan (≈hundreds of routes).

---

**中文摘要**：Pages 掛不了 Durable Object 與 cron，v2 的原子限流與備份/告警都需要，
所以整站遷到單一 Worker＋手寫路由器（零依賴，路由表陣列、註冊順序即優先序、參數形狀
與 Pages 相同，既有 handler 原樣掛上）。靜態資產用 `[assets]`＋SPA fallback，spike 實測
必須 `run_worker_first = true`，否則所有路徑都被 index.html 吃掉。割接＝workers.dev 冒煙
→ 補 secrets → 同 zone 換綁網域（憑證分鐘級）；Phase F 刪除 functions/ 之後回滾單位是
git commit。代價是路由變成自己的程式（有防漂移測試看著）、每個請求都過 Worker。
