// tools/check-docs.mjs — 文件數字防漂移檢查（CI 與發佈清單都跑），與 check-csp.mjs 同一套精神。
//
// 用法：npm run test 之後跑 `node tools/check-docs.mjs`
//       （`npm run test` 會順手把 vitest 的 JSON 報告寫到 .vitest-report.json）
//
// 起因（2026-07 稽核）：同一個 repo 裡對「有幾條測試」有**三個互相矛盾的數字** ——
// README 寫 321、升級計畫寫 369、實際跑出來 384。這是所有缺陷裡最不需要讀程式碼就能抓到的
// 一種，也因此對讀者的殺傷力最大：連數得出來的東西都是錯的，那些數不出來的宣稱
// （「上游金鑰永遠不離開伺服器」）憑什麼相信？
//
// ⚠ 為什麼數字要跟 vitest 拿，不自己數（這一版的重點）：
//   第一版把 `it(` 的出現次數當成測試數，注入測試環境後在測試裡斷言。**它是錯的** ——
//   寫在 `for` 迴圈裡的 `it()` 在原始碼只出現一次、執行期卻是 N 條。當下 README 寫 420、
//   實際跑 425，而那條「防漂移」測試自己**綠燈通過** —— 正好變成它要防的東西。
//   靜態數原始碼是在近似一個動態事實；改成直接讀 vitest 報告的 numTotalTests 就沒有近似。
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

const REPORT = new URL("../.vitest-report.json", import.meta.url);
if (!existsSync(REPORT)) {
  console.error("✗ 找不到 .vitest-report.json —— 先跑 `npm run test`（它會產生這份報告）");
  process.exit(1);
}
const report = JSON.parse(readFileSync(REPORT, "utf8"));
const TESTS = report.numTotalTests;
if (!TESTS || typeof TESTS !== "number") {
  console.error("✗ .vitest-report.json 裡沒有 numTotalTests，報告格式可能變了");
  process.exit(1);
}

// E2E 是 Playwright，不在 vitest 報告裡；它沒有迴圈產生測試，靜態數是準的。
const e2eSrc = read("e2e/site.spec.ts");
const E2E = (e2eSrc.match(/(^|[^A-Za-z0-9_.])test\(/g) || []).length;

const pkg = JSON.parse(read("package.json"));
const siteTs = read("src/lib/site.ts");
const VERSION = /export const VERSION = "([^"]+)"/.exec(siteTs)?.[1];

const DOCS = ["README.md", "README.zh-TW.md", "docs/COMPARISON.md"];
const errs = [];
const fail = (msg) => errs.push(msg);

// 1) 每一份文件裡「N tests／N 條測試」的宣稱都要等於實際測試數。
//    數字與「tests／測試」之間容許一小段修飾語（"unit/integration"、「個單元／整合」…），
//    但**不准夾到別的數字**（`[^\d\n]`）—— 那道限制是用來擋「2026-07-22 … 測試」這種誤命中的。
const claimRe = /([\d,]{2,})\s*\+?\s*[^\d\n]{0,20}?(?:tests?\b|測試)/gi;
for (const f of DOCS) {
  const md = read(f);
  let m;
  claimRe.lastIndex = 0;
  while ((m = claimRe.exec(md)) !== null) {
    const claimed = parseInt(m[1].replace(/,/g, ""), 10);
    if (claimed !== TESTS) fail(`${f}：寫著 ${claimed} 條測試，實際是 ${TESTS} 條 —— 把數字改成 ${TESTS}`);
  }
}

// 2) README 的 E2E 條數
const e2eClaim = /(\d+)\s*Playwright E2E flows/i.exec(read("README.md"));
if (!e2eClaim) fail("README.md：找不到「N Playwright E2E flows」這句");
else if (parseInt(e2eClaim[1], 10) !== E2E) fail(`README.md：寫著 ${e2eClaim[1]} 條 E2E，實際是 ${E2E} 條`);

// 3) 版本號三方一致（package.json / lib/site.ts / README 標題）
if (!VERSION) fail("src/lib/site.ts：抓不到 VERSION");
if (pkg.version !== VERSION) fail(`package.json 版本 ${pkg.version} ≠ lib/site.ts 的 ${VERSION}`);
const rmVer = /Engineering evidence \(v([\d.]+)\)/.exec(read("README.md"));
if (!rmVer) fail("README.md：找不到「Engineering evidence (vX.Y.Z)」這句");
else if (rmVer[1] !== VERSION) fail(`README.md 標的版本 v${rmVer[1]} ≠ 實際 v${VERSION}`);
const rmZhVer = /工程證據（v([\d.]+)）/.exec(read("README.zh-TW.md"));
if (!rmZhVer) fail("README.zh-TW.md：找不到「工程證據（vX.Y.Z）」這句");
else if (rmZhVer[1] !== VERSION) fail(`README.zh-TW.md 標的版本 v${rmZhVer[1]} ≠ 實際 v${VERSION}`);

// 4) COMPARISON.md 的架構列必須描述 Worker，不是已退役的 Pages（ADR-0006，2026-07-16 遷移）。
//    刻意驗「那兩列現在說什麼」而不是「全文禁止出現 Pages 字樣」：文件本來就該能敘述歷史，
//    關鍵字黑名單會把那段有價值的註記一起誤殺。正面斷言現況也更能表達這條檢查在守什麼。
const cmp = read("docs/COMPARISON.md");
const shape = /^\| Shape \|([^|]*)\|/m.exec(cmp);
const deploy = /^\| Deploy \|([^|]*)\|/m.exec(cmp);
if (!shape) fail("docs/COMPARISON.md：找不到 Shape 那一列");
else if (!/Worker/.test(shape[1]) || /Pages/i.test(shape[1]))
  fail(`docs/COMPARISON.md：Shape 列還在講 Pages →${shape[1].trim()}`);
if (!deploy) fail("docs/COMPARISON.md：找不到 Deploy 那一列");
else if (!deploy[1].includes("wrangler deploy") || /pages/i.test(deploy[1]))
  fail(`docs/COMPARISON.md：Deploy 列還在講 pages deploy →${deploy[1].trim()}`);

if (errs.length) {
  console.error("✗ 文件與現況對不上：\n");
  for (const e of errs) console.error("  · " + e);
  console.error("");
  process.exit(1);
}
console.log(`✓ 文件數字一致（測試 ${TESTS} 條、E2E ${E2E} 條、版本 v${VERSION}）`);
