// lib/playground.js 純函式 — 請求驗證、三種上游的請求轉換、串流解析 fixtures。
import { describe, it, expect } from "vitest";
import {
  cleanChat,
  buildUpstream,
  extractDelta,
  extractFull,
  chModels,
  PG_LIMITS
} from "../../src/lib/playground.js";

describe("cleanChat（聊天請求驗證）", () => {
  const good = () => ({ channel: "Demo", model: "m1", messages: [{ role: "user", content: "hi" }] });

  it("合法請求 → 標準化（channel 轉小寫）", () => {
    const v = cleanChat(good());
    expect(v.err).toBeUndefined();
    expect(v.channel).toBe("demo");
    expect(v.model).toBe("m1");
    expect(v.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(v.convId).toBeNull();
  });
  it("conv_id 正整數才收", () => {
    expect(cleanChat({ ...good(), conv_id: 7 }).convId).toBe(7);
    expect(cleanChat({ ...good(), conv_id: -1 }).convId).toBeNull();
    expect(cleanChat({ ...good(), conv_id: "abc" }).convId).toBeNull();
  });
  it("缺本體／channel／model → err", () => {
    expect(cleanChat(null).err).toBeTruthy();
    expect(cleanChat({ model: "m", messages: [{ role: "user", content: "x" }] }).err).toBeTruthy();
    expect(cleanChat({ channel: "c", messages: [{ role: "user", content: "x" }] }).err).toBeTruthy();
  });
  it("messages 空／非陣列 → err", () => {
    expect(cleanChat({ channel: "c", model: "m", messages: [] }).err).toBeTruthy();
    expect(cleanChat({ channel: "c", model: "m", messages: "x" }).err).toBeTruthy();
  });
  it("超過訊息數上限 → err", () => {
    const msgs = Array.from({ length: PG_LIMITS.maxMsgs + 1 }, () => ({ role: "user", content: "x" }));
    expect(cleanChat({ channel: "c", model: "m", messages: msgs }).err).toBeTruthy();
  });
  it("非法 role → err；system 合法", () => {
    expect(
      cleanChat({ channel: "c", model: "m", messages: [{ role: "tool", content: "x" }] }).err
    ).toBeTruthy();
    const v = cleanChat({
      channel: "c",
      model: "m",
      messages: [
        { role: "system", content: "s" },
        { role: "user", content: "u" }
      ]
    });
    expect(v.err).toBeUndefined();
    expect(v.messages[0].role).toBe("system");
  });
  it("單則超長／整包超長 → err", () => {
    const long = "x".repeat(PG_LIMITS.maxChars + 1);
    expect(
      cleanChat({ channel: "c", model: "m", messages: [{ role: "user", content: long }] }).err
    ).toBeTruthy();
    const chunk = "x".repeat(PG_LIMITS.maxChars);
    const msgs = [];
    for (let total = 0; total <= PG_LIMITS.maxTotal; total += chunk.length) {
      msgs.push({ role: "user", content: chunk });
    }
    expect(cleanChat({ channel: "c", model: "m", messages: msgs }).err).toBeTruthy();
  });
  it("空白訊息會被剔除；最後一則必須是 user", () => {
    const v = cleanChat({
      channel: "c",
      model: "m",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "  " }
      ]
    });
    expect(v.err).toBeUndefined(); // 尾端空白 assistant 被剔除後，最後一則是 user
    expect(v.messages.length).toBe(1);
    expect(
      cleanChat({
        channel: "c",
        model: "m",
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "yo" }
        ]
      }).err
    ).toBeTruthy();
  });
});

describe("buildUpstream（三種上游的請求轉換）", () => {
  const msgs = [
    { role: "system", content: "你是助理" },
    { role: "user", content: "嗨" },
    { role: "assistant", content: "你好" },
    { role: "user", content: "再一句" }
  ];

  it("anthropic：/v1/messages、x-api-key、system 抽出、max_tokens 必填", () => {
    const ch = { kind: "anthropic", base_url: "https://api.anthropic.com", api_key: "sk-ant" };
    const up = buildUpstream(ch, "claude-x", msgs);
    expect(up.url).toBe("https://api.anthropic.com/v1/messages");
    expect(up.headers["x-api-key"]).toBe("sk-ant");
    expect(up.headers["anthropic-version"]).toBeTruthy();
    const b = JSON.parse(up.body);
    expect(b.model).toBe("claude-x");
    expect(b.stream).toBe(true);
    expect(b.max_tokens).toBe(PG_LIMITS.maxTokens);
    expect(b.system).toBe("你是助理");
    expect(b.messages.every((m) => m.role !== "system")).toBe(true);
    expect(b.messages.length).toBe(3);
  });

  it("gemini：streamGenerateContent?alt=sse、x-goog-api-key、assistant→model、systemInstruction", () => {
    const ch = { kind: "gemini", base_url: "https://generativelanguage.googleapis.com", api_key: "sk-goog" };
    const up = buildUpstream(ch, "gemini-x", msgs);
    expect(up.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:streamGenerateContent?alt=sse"
    );
    expect(up.headers["x-goog-api-key"]).toBe("sk-goog");
    expect(up.headers.authorization).toBeUndefined(); // 多送 Authorization 會 401（實測踩過）
    const b = JSON.parse(up.body);
    expect(b.systemInstruction.parts[0].text).toBe("你是助理");
    expect(b.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("openai/custom：/v1/chat/completions、Bearer、system 留在 messages", () => {
    const ch = { kind: "openai", base_url: "https://api.openai.com", api_key: "sk-oai" };
    const up = buildUpstream(ch, "gpt-x", msgs);
    expect(up.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(up.headers.authorization).toBe("Bearer sk-oai");
    const b = JSON.parse(up.body);
    expect(b.stream).toBe(true);
    expect(b.messages.length).toBe(4);
    expect(b.messages[0].role).toBe("system");
  });
});

describe("extractDelta（SSE 一筆 JSON → 增量文字）", () => {
  it("anthropic：content_block_delta 取字、error 事件丟例外", () => {
    expect(extractDelta("anthropic", { type: "content_block_delta", delta: { text: "喵" } })).toBe("喵");
    expect(extractDelta("anthropic", { type: "message_start" })).toBe("");
    expect(() => extractDelta("anthropic", { type: "error", error: { message: "overloaded" } })).toThrow(
      "overloaded"
    );
  });
  it("gemini：candidates parts 併字、error 丟例外", () => {
    expect(
      extractDelta("gemini", { candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] })
    ).toBe("ab");
    expect(extractDelta("gemini", { candidates: [] })).toBe("");
    expect(() => extractDelta("gemini", { error: { message: "quota" } })).toThrow("quota");
  });
  it("openai：choices[0].delta.content、error 丟例外", () => {
    expect(extractDelta("openai", { choices: [{ delta: { content: "哈" } }] })).toBe("哈");
    expect(extractDelta("openai", { choices: [{ delta: {} }] })).toBe("");
    expect(() => extractDelta("openai", { error: { message: "bad" } })).toThrow("bad");
  });
});

describe("extractFull（非串流整包 JSON → 全文）", () => {
  it("anthropic / gemini / openai", () => {
    expect(extractFull("anthropic", { content: [{ text: "a" }, { text: "b" }] })).toBe("ab");
    expect(extractFull("gemini", { candidates: [{ content: { parts: [{ text: "c" }] } }] })).toBe("c");
    expect(extractFull("openai", { choices: [{ message: { content: "d" } }] })).toBe("d");
    expect(extractFull("openai", {})).toBe("");
  });
});

describe("chModels", () => {
  it("逗號分隔 → 修剪空白、去空值", () => {
    expect(chModels({ models: " a , b ,,c " })).toEqual(["a", "b", "c"]);
    expect(chModels({ models: "" })).toEqual([]);
    expect(chModels(null)).toEqual([]);
  });
});
