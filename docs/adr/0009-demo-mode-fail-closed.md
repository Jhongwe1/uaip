# ADR-0009: Public demo mode is fail-closed (the inverse of member quotas)

**Status**: accepted · **Date**: 2026-07-17 (v2.0.0 Phase K)

## Context

The playground previously required a Google sign-in plus per-member approval. For a
public portfolio repo we want a "try it without signing in" path — but anonymous
traffic pointed at a paid LLM upstream is a money-burning surface: no identity, no
recourse, and bots find open endpoints fast. Member quotas (ADR-0007) are
deliberately **fail-open** — if the quota system breaks, members are served,
because availability for known, approved people beats accounting. That trade is
wrong for strangers.

## Decision

Anonymous `POST /api/playground/chat` is served only when the admin has switched
demo mode on (`settings demo_mode='1'` **and** `demo_channel` set), and the demo
path is locked down on every axis:

- **Channel and model allowlist** (`demo_channel`, `demo_models`; empty list =
  all models of that one channel). The channel lock is checked **before** the DB
  lookup, so anonymous callers cannot probe other channel slugs.
- **Small inputs, optionally capped outputs**: 4k input chars total; `max_tokens`
  forced to `demo_max_tokens` for all three upstream kinds when the admin sets a
  value (the default became "unset" on 2026-07-21 — see the update below).
- **One synthetic owner**: everything demo writes — `req_log`, and since
  2026-07-21 the conversation itself — is attributed to a lazily-created user row
  `google_sub='demo:public'` that can never log in. Cost accounting (Phase J)
  therefore covers demo traffic for free. Visitors get no read path at all; see
  the update below for what changed and why the read side stays shut.
- **Fail-closed double rate limit** reusing the Phase H `RateLimiter` DO:
  one instance per IP (`demo-ip:<ip>`, per-minute default 3 + per-day default 10)
  plus one global instance (`demo:global`, per-day default 200). If the DO is
  unbound or throws → **503, never allow** (and an `errlog` row `demo.do`, which
  the Telegram alert cron picks up).

Worst-case daily burn is bounded by `demo_global_day ×` the per-reply output cap
regardless of attacker behavior, and the admin can kill the whole surface with
one settings write (`demo_mode: false`), no deploy.

## The deliberate asymmetry

| | member quota (ADR-0007) | demo limits (this ADR) |
|---|---|---|
| identity | approved account | none (IP only) |
| on limiter failure | **fail-open** (serve) | **fail-closed** (503) |
| who bears the failure | admin absorbs risk for known users | anonymous visitors just retry later |

Same DO class, opposite failure policy — the policy lives in the caller
(`lib/quota.ts` vs `lib/demo.ts`), which is why the DO itself stays policy-free.

## Consequences

- A DO outage silently disables the public demo (503) while members keep
  working — exactly the intended priority.
- Per-IP limits are honest-visitor limits, not bot-proof (IPs rotate); the
  global cap is the actual financial backstop.
- The demo user row shows up in member lists as a pending, service-less account;
  admins should leave it alone (deleting it just gets it re-created).

## Update (2026-07-21)

Two of the limits above were relaxed on the same day. The fail-closed rate
limiting — the actual subject of this ADR — is untouched.

### `demo_max_tokens` defaults to unset

The original default forced every demo reply to 512 output tokens — short enough
that answers routinely stop mid-sentence, which reads as "broken" rather than
"limited" to exactly the first-time visitor the demo exists for. The default is
now **unset = no cap** (`DEMO_DEFAULTS.demo_max_tokens = 0`); an admin who wants
a hard per-reply ceiling types a number into /settings.

Only the per-reply half of the burn bound moves. The request-count half
(`demo_global_day`, 200/day, fail-closed) is untouched — and the Consequences
above already said that global cap, not the per-IP or per-reply limits, is the
actual financial backstop. Anthropic upstreams still receive
`PG_LIMITS.maxTokens` (4096) because that API requires the field.

### Demo conversations now persist (write-only from the visitor's side)

"Nothing persists" left the admin blind: `req_log` records that a request
happened, on which model, at what cost — but not one word of what the public
demo is actually being used for. Abuse, prompt-injection probing, and "is anyone
getting anything out of this" were all invisible.

Demo chats now take the same `pg_conversations` / `pg_messages` path as members,
owned by `demo:public`. The asymmetry moved to the **read** side:

- **No visitor read path.** `/api/playground/conversations` (list) and
  `/api/playground/conversations/{id}` (read / rename / delete) both run `pgUser`
  first: anonymous → 401, member → scoped to their own `user_id`, which is never
  the synthetic row. The demo UI has no history sidebar. A visitor therefore
  cannot read back their own chat — and, since every visitor shares one owner
  row, that is the property that also stops them reading *everyone else's*.
- **Admin reads all of it** in /logs, listed as 體驗模式（匿名訪客合計）.

Accepted residual risk: `conv_id` is a sequential integer that the demo client
echoes back, so a determined anonymous caller can post into another anonymous
visitor's thread — the ownership check only proves "some demo visitor". Nothing
is read back and the victim never sees it (their UI never re-reads from the
server); the only effect is a confusing entry in the admin's log, which that
same caller could already produce by opening junk threads up to the rate limit.
Posting into a **member's** conversation stays blocked — the ownership check
binds to `demo:public`. Closing the residual hole would need an unguessable
handle (random column + migration); not worth it for log tidiness.

Retention: bounded by `demo_global_day` (200/day) — worst case a couple of
hundred short rows a day, with no automatic cleanup.

Privacy: the demo banner's "chats stay in this browser, nothing is uploaded"
line was removed in the same change, so the site no longer claims otherwise. It
makes no retention promise at all now; if one is ever wanted, the banner is
where it belongs.

---

**中文摘要**：體驗模式讓「完全沒登入」的訪客直接試聊，但匿名流量打付費上游＝燒錢面，
所以限流哲學跟會員配額**刻意相反**：會員 fail-open（配額系統壞了照樣服務熟人）、
demo **fail-closed**（DO 壞了直接 503，絕不放行陌生人）。鎖渠道＋模型白名單（先擋再查庫，
探測不到其他渠道）、輸入 4k 字、`demo_max_tokens` 有填才壓回覆長度（2026-07-21 起預設不填
＝不限，見上面的 Update）；對話與 req_log 都記在懶建的 `demo:public` 合成帳號上（成本記帳自然
涵蓋），**對話 2026-07-21 起會落地但只有管理員看得到** — 訪客那三支讀取端點都要登入，看不到
自己也看不到別人。雙保險＝每 IP 一顆 DO（分鐘 3／日 10）＋全站一顆（日 200）；
最壞燒錢上限＝全站日上限 × 每則回覆上限（真正扛住的是前者），
管理員一鍵 `demo_mode:false` 免部署關閉。同一顆 DO、相反的失效策略 — 策略住在呼叫端，
DO 本身保持無策略。
