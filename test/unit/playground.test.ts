// lib/playground.js 純函式 — 請求驗證、三種上游的請求轉換、串流解析 fixtures。
import { describe, it, expect } from "vitest";
import type { ChannelRow } from "../../src/types.js";
import type { ChatMsg } from "../../src/lib/playground.js";
import {
  cleanChat,
  buildUpstream,
  extractDelta,
  extractReasoning,
  extractFull,
  chModels,
  mergeExtraBody,
  PG_LIMITS,
  PG_DEFAULT_SYSTEM
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
    expect(v.messages![0].role).toBe("system");
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
    expect(v.messages!.length).toBe(1);
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
  const msgs: ChatMsg[] = [
    { role: "system", content: "你是助理" },
    { role: "user", content: "嗨" },
    { role: "assistant", content: "你好" },
    { role: "user", content: "再一句" }
  ];

  it("anthropic：/v1/messages、x-api-key、system 抽出、max_tokens 必填", () => {
    const ch = { kind: "anthropic", base_url: "https://api.anthropic.com", api_key: "sk-ant" } as ChannelRow;
    const up = buildUpstream(ch, "claude-x", msgs);
    expect(up.url).toBe("https://api.anthropic.com/v1/messages");
    expect(up.headers["x-api-key"]).toBe("sk-ant");
    expect(up.headers["anthropic-version"]).toBeTruthy();
    const b = JSON.parse(up.body);
    expect(b.model).toBe("claude-x");
    expect(b.stream).toBe(true);
    expect(b.max_tokens).toBe(PG_LIMITS.maxTokens);
    // 這個 ch 沒填 system_prompt → 套預設，對話自己的 system 接在後面
    expect(b.system).toBe(PG_DEFAULT_SYSTEM + "\n\n你是助理");
    expect(b.messages.every((m: any) => m.role !== "system")).toBe(true);
    expect(b.messages.length).toBe(3);
  });

  it("gemini：streamGenerateContent?alt=sse、x-goog-api-key、assistant→model、systemInstruction", () => {
    const ch = {
      kind: "gemini",
      base_url: "https://generativelanguage.googleapis.com",
      api_key: "sk-goog"
    } as ChannelRow;
    const up = buildUpstream(ch, "gemini-x", msgs);
    expect(up.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:streamGenerateContent?alt=sse"
    );
    expect(up.headers["x-goog-api-key"]).toBe("sk-goog");
    expect(up.headers.authorization).toBeUndefined(); // 多送 Authorization 會 401（實測踩過）
    const b = JSON.parse(up.body);
    expect(b.systemInstruction.parts[0].text).toBe(PG_DEFAULT_SYSTEM + "\n\n你是助理");
    expect(b.contents.map((c: any) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("openai/custom：/v1/chat/completions、Bearer、system 留在 messages", () => {
    const ch = { kind: "openai", base_url: "https://api.openai.com", api_key: "sk-oai" } as ChannelRow;
    const up = buildUpstream(ch, "gpt-x", msgs);
    expect(up.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(up.headers.authorization).toBe("Bearer sk-oai");
    const b = JSON.parse(up.body);
    expect(b.stream).toBe(true);
    expect(b.messages.length).toBe(5); // 預設提示詞 1 則 + 原本 4 則
    expect(b.messages[0]).toEqual({ role: "system", content: PG_DEFAULT_SYSTEM });
    expect(b.messages[1].role).toBe("system"); // 對話自己的 system 原位保留
  });
});

describe("buildUpstream — 管道系統提示詞（只作用在 playground）", () => {
  const plain: ChatMsg[] = [{ role: "user", content: "嗨" }];
  const withSys: ChatMsg[] = [
    { role: "system", content: "對話自己的" },
    { role: "user", content: "嗨" }
  ];
  const chan = (kind: string, sp: unknown) =>
    ({ kind, base_url: "https://up.example.com", api_key: "k", system_prompt: sp }) as unknown as ChannelRow;

  it("anthropic：注入 system 欄位", () => {
    const b = JSON.parse(buildUpstream(chan("anthropic", "管道的"), "claude-x", plain).body);
    expect(b.system).toBe("管道的");
  });

  it("gemini：注入 systemInstruction", () => {
    const b = JSON.parse(buildUpstream(chan("gemini", "管道的"), "gemini-x", plain).body);
    expect(b.systemInstruction.parts[0].text).toBe("管道的");
  });

  it("openai／custom：塞成 messages 最前面一則 system", () => {
    for (const kind of ["openai", "custom"]) {
      const b = JSON.parse(buildUpstream(chan(kind, "管道的"), "gpt-x", plain).body);
      expect(b.messages).toEqual([
        { role: "system", content: "管道的" },
        { role: "user", content: "嗨" }
      ]);
    }
  });

  it("對話本來就有 system 時：管道的擺前面，兩者都留著（不互相覆蓋）", () => {
    const a = JSON.parse(buildUpstream(chan("anthropic", "管道的"), "claude-x", withSys).body);
    expect(a.system).toBe("管道的\n\n對話自己的");
    const o = JSON.parse(buildUpstream(chan("openai", "管道的"), "gpt-x", withSys).body);
    expect(o.messages.map((m: any) => m.content)).toEqual(["管道的", "對話自己的", "嗨"]);
  });

  it("空字串／只有空白／未設＝套用預設 PG_DEFAULT_SYSTEM", () => {
    for (const sp of ["", "   ", undefined, null]) {
      const o = JSON.parse(buildUpstream(chan("openai", sp), "gpt-x", plain).body);
      expect(o.messages).toEqual([
        { role: "system", content: PG_DEFAULT_SYSTEM },
        { role: "user", content: "嗨" }
      ]);
      const a = JSON.parse(buildUpstream(chan("anthropic", sp), "claude-x", plain).body);
      expect(a.system).toBe(PG_DEFAULT_SYSTEM);
      const g = JSON.parse(buildUpstream(chan("gemini", sp), "gemini-x", plain).body);
      expect(g.systemInstruction.parts[0].text).toBe(PG_DEFAULT_SYSTEM);
    }
  });

  it("填了自己的＝整段取代預設，不是接在預設後面", () => {
    const a = JSON.parse(buildUpstream(chan("anthropic", "只有我"), "claude-x", plain).body);
    expect(a.system).toBe("只有我");
    expect(a.system).not.toContain("uaip.cc.cd");
  });

  it("預設值本身：提到站名、是非空的單一真相來源", () => {
    expect(PG_DEFAULT_SYSTEM).toContain("uaip.cc.cd");
    expect(PG_DEFAULT_SYSTEM.trim()).toBe(PG_DEFAULT_SYSTEM); // 前後不留空白，否則 UI 灰字會歪
  });

  it("提示詞前後空白會被修掉", () => {
    const b = JSON.parse(buildUpstream(chan("anthropic", "  管道的  "), "claude-x", plain).body);
    expect(b.system).toBe("管道的");
  });

  // 站台預設（settings.pg_default_system，/settings 可改）＝第五個參數。
  // 優先序：管道自己填的 → 站台預設 → 程式內建 PG_DEFAULT_SYSTEM。
  describe("站台預設系統提示詞（第 5 參數 defaultSys）", () => {
    it("管道沒填＝套站台預設，不是內建那段", () => {
      for (const kind of ["openai", "custom"]) {
        const o = JSON.parse(buildUpstream(chan(kind, ""), "gpt-x", plain, undefined, "站台的").body);
        expect(o.messages[0]).toEqual({ role: "system", content: "站台的" });
      }
      const a = JSON.parse(
        buildUpstream(chan("anthropic", null), "claude-x", plain, undefined, "站台的").body
      );
      expect(a.system).toBe("站台的");
      const g = JSON.parse(
        buildUpstream(chan("gemini", undefined), "gemini-x", plain, undefined, "站台的").body
      );
      expect(g.systemInstruction.parts[0].text).toBe("站台的");
    });

    it("管道自己填了＝管道優先，站台預設完全不出現", () => {
      const a = JSON.parse(
        buildUpstream(chan("anthropic", "管道的"), "claude-x", plain, undefined, "站台的").body
      );
      expect(a.system).toBe("管道的");
      expect(a.system).not.toContain("站台的");
    });

    it("站台預設空／空白／沒帶＝退回程式內建 PG_DEFAULT_SYSTEM", () => {
      for (const d of ["", "   ", undefined, null as unknown as undefined]) {
        const a = JSON.parse(buildUpstream(chan("anthropic", ""), "claude-x", plain, undefined, d).body);
        expect(a.system).toBe(PG_DEFAULT_SYSTEM);
      }
    });

    it("站台預設前後空白會被修掉", () => {
      const a = JSON.parse(
        buildUpstream(chan("anthropic", ""), "claude-x", plain, undefined, "  站台的  ").body
      );
      expect(a.system).toBe("站台的");
    });

    it("對話自己的 system 照樣接在站台預設後面（兩者都留著）", () => {
      const a = JSON.parse(
        buildUpstream(chan("anthropic", ""), "claude-x", withSys, undefined, "站台的").body
      );
      expect(a.system).toBe("站台的\n\n對話自己的");
    });
  });
});

describe("mergeExtraBody — 管道額外請求參數（只作用在 playground）", () => {
  const VP = '{"venice_parameters":{"include_venice_system_prompt":false}}';

  it("把 JSON 物件的鍵合併進請求本體", () => {
    const b = mergeExtraBody({ model: "m" }, VP);
    expect(b.venice_parameters).toEqual({ include_venice_system_prompt: false });
    expect(b.model).toBe("m");
  });

  it("非關鍵欄位可以被覆寫（max_tokens、temperature…）", () => {
    const b = mergeExtraBody({ max_tokens: 100 }, '{"max_tokens":9,"temperature":0.2}');
    expect(b.max_tokens).toBe(9);
    expect(b.temperature).toBe(0.2);
  });

  it("model／stream／messages／contents 擋著不給覆寫", () => {
    const b = mergeExtraBody(
      { model: "白名單內", stream: true, messages: ["原本"], contents: ["原本"] },
      '{"model":"沒開放的","stream":false,"messages":[],"contents":[],"top_p":1}'
    );
    expect(b.model).toBe("白名單內"); // 能覆寫＝繞過渠道模型白名單
    expect(b.stream).toBe(true); // 改掉會打斷 SSE 串流管線
    expect(b.messages).toEqual(["原本"]);
    expect(b.contents).toEqual(["原本"]);
    expect(b.top_p).toBe(1); // 沒被擋的照樣進得來
  });

  it("空值／壞 JSON／陣列／純量＝原封不動，不讓聊天掛掉", () => {
    for (const bad of ["", "   ", null, undefined, "{壞的", "[1,2]", '"字串"', "123", "null"]) {
      expect(mergeExtraBody({ model: "m" }, bad)).toEqual({ model: "m" });
    }
  });

  it("四種 kind 都吃得到（buildUpstream 端對端）", () => {
    const mk = (kind: string) =>
      ({ kind, base_url: "https://up.example.com", api_key: "k", extra_body: VP }) as unknown as ChannelRow;
    const msgs: ChatMsg[] = [{ role: "user", content: "嗨" }];
    for (const kind of ["openai", "custom", "anthropic", "gemini"]) {
      const b = JSON.parse(buildUpstream(mk(kind), "m", msgs).body);
      expect(b.venice_parameters).toEqual({ include_venice_system_prompt: false });
    }
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
  it("推理模型的思考欄位不算正文（否則思考會混進回覆裡）", () => {
    expect(extractDelta("openai", { choices: [{ delta: { reasoning_content: "想…" } }] })).toBe("");
    expect(extractDelta("openai", { choices: [{ delta: { reasoning: "想…" } }] })).toBe("");
    expect(extractDelta("anthropic", { type: "content_block_delta", delta: { thinking: "想…" } })).toBe("");
    expect(
      extractDelta("gemini", { candidates: [{ content: { parts: [{ text: "想…", thought: true }] } }] })
    ).toBe("");
  });
  it("gemini：同一筆裡思考與正文並存 → 只取正文", () => {
    expect(
      extractDelta("gemini", {
        candidates: [{ content: { parts: [{ text: "想…", thought: true }, { text: "答" }] } }]
      })
    ).toBe("答");
  });
});

// 2026-07-21 的回歸：以前只讀正文欄位，推理模型的思考整段被丟掉 —
// 瀏覽器收不到任何東西，畫面空白幾十秒像當機（實測 GLM-4.7 有 92% 的輸出是思考）。
describe("extractReasoning（SSE 一筆 JSON → 思考增量）", () => {
  it("openai 相容：reasoning_content（GLM／DeepSeek）與 reasoning（OpenRouter）都認", () => {
    expect(extractReasoning("openai", { choices: [{ delta: { reasoning_content: "先看整數位" } }] })).toBe(
      "先看整數位"
    );
    expect(extractReasoning("openai", { choices: [{ delta: { reasoning: "嗯" } }] })).toBe("嗯");
  });
  it("正文欄位不算思考（兩邊不重複計）", () => {
    expect(extractReasoning("openai", { choices: [{ delta: { content: "答案" } }] })).toBe("");
  });
  it("anthropic：thinking_delta", () => {
    expect(extractReasoning("anthropic", { type: "content_block_delta", delta: { thinking: "嗯…" } })).toBe(
      "嗯…"
    );
    expect(extractReasoning("anthropic", { type: "content_block_delta", delta: { text: "答" } })).toBe("");
  });
  it("gemini：只取標了 thought 的 part", () => {
    expect(
      extractReasoning("gemini", {
        candidates: [{ content: { parts: [{ text: "想…", thought: true }, { text: "答" }] } }]
      })
    ).toBe("想…");
  });
  it("非推理模型／格式意外 → 一律空字串，不丟例外", () => {
    expect(extractReasoning("openai", {})).toBe("");
    expect(extractReasoning("openai", { choices: [] })).toBe("");
    expect(extractReasoning("gemini", { candidates: [] })).toBe("");
    expect(extractReasoning("openai", { error: { message: "bad" } })).toBe("");
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
