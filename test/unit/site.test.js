// lib/site.js 純函式（esc／json／fmtDate）。
// html() 的 CSP nonce 蓋章測試在 Phase E 加；選單過濾在 Phase F 加。
import { describe, it, expect } from "vitest";
import { esc, json, fmtDate } from "../../lib/site.js";

describe("esc（HTML 跳脫）", () => {
  it("五個危險字元全跳", () => {
    expect(esc(`<a href="x" onclick='y'>&</a>`))
      .toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
  it("null / undefined → 空字串；數字轉字串", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
    expect(esc(42)).toBe("42");
  });
});

describe("json（API 回應工具）", () => {
  it("預設 200、JSON content-type、no-store", async () => {
    const r = json({ ok: true });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ ok: true });
  });
  it("自訂狀態碼", () => {
    expect(json({ error: "x" }, 403).status).toBe(403);
  });
});

describe("fmtDate（UTC ISO → 台灣日期）", () => {
  it("UTC+8 換日邊界", () => {
    expect(fmtDate("2026-07-14T15:59:00Z")).toBe("2026-07-14");
    expect(fmtDate("2026-07-14T16:00:00Z")).toBe("2026-07-15");
  });
  it("壞輸入回空字串", () => {
    expect(fmtDate("not-a-date")).toBe("");
    expect(fmtDate("")).toBe("");
  });
});
