// 덱 시각 QA: 슬라이드별 1920×1080 스크린샷 + 넘침·겹침 검사 + 선택적 PDF.
//   node scripts/lead-magnet-decks/qa.mjs <deck.html...> --shots <dir> [--pdf] [--click]
// --click: 체크 칸 일부를 눌러 결과 화면이 채워진 상태도 찍는다.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require("node:child_process").execSync("npm root -g").toString().trim() + "/playwright")); }
import path from "node:path";
import fs from "node:fs";

const args = process.argv.slice(2);
const files = args.filter((a) => a.endsWith(".html"));
const shotsIdx = args.indexOf("--shots");
const shots = shotsIdx >= 0 ? args[shotsIdx + 1] : null;
const wantPdf = args.includes("--pdf");
const click = args.includes("--click");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
let problems = 0;
for (const f of files) {
  const url = "file://" + path.resolve(f) + "?mode=present";
  await page.goto(url);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(url);
  await page.addStyleTag({ content: ".ui,.progress{display:none!important}" });
  await page.waitForTimeout(300);
  if (click) {
    await page.evaluate(() => {
      const cs = [...document.querySelectorAll(".chk")];
      cs.forEach((c, i) => { if (i % 3 !== 1 && i % 5 !== 0) c.click(); });
      const ins = [...document.querySelectorAll("input[data-col]")];
      ins.forEach((x, i) => { x.value = String(i % 2 === 0 ? 40 + i * 5 : 10 + i); x.dispatchEvent(new Event("input")); });
      const t = document.querySelector("[data-w='teachers']"); if (t) { t.value = "8"; t.dispatchEvent(new Event("input")); }
    });
  }
  const n = await page.evaluate(() => document.querySelectorAll(".frame").length);
  const base = path.basename(f, ".html");
  for (let i = 0; i < n; i++) {
    await page.evaluate((i) => { location.hash = "#" + (i + 1); }, i);
    await page.evaluate((i) => {
      const fr = [...document.querySelectorAll(".frame")];
      fr.forEach((x, j) => x.classList.toggle("on", j === i));
    }, i);
    await page.waitForTimeout(520);
    const issues = await page.evaluate((i) => {
      const slide = document.querySelectorAll(".slide")[i];
      const sr = slide.getBoundingClientRect();
      const s = sr.width / 1920;
      const out = [];
      const body = slide.querySelector(".body");
      const foot = slide.querySelector(".foot");
      const br = body.getBoundingClientRect();
      const footTop = foot ? foot.getBoundingClientRect().top : sr.bottom;
      slide.querySelectorAll(".body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const cs = getComputedStyle(el);
        if (cs.position === "absolute" && el.closest(".cover-art")) return;
        if (r.bottom > footTop - 4 && r.bottom > br.bottom + 2) out.push(`bottom ${Math.round((r.bottom - br.bottom) / s)}px <${el.tagName.toLowerCase()}.${el.className}> "${(el.textContent || "").trim().slice(0, 40)}"`);
        if (r.right > sr.right - 100 * s + 2) out.push(`right <${el.tagName.toLowerCase()}.${el.className}> "${(el.textContent || "").trim().slice(0, 30)}"`);
        if (el.scrollHeight > el.clientHeight + 2 && cs.overflow === "hidden" && !el.matches(".bar,.sb,.frame,.slide,.cover-art")) out.push(`clipped <${el.tagName.toLowerCase()}.${el.className}>`);
      });
      return [...new Set(out)].slice(0, 6);
    }, i);
    if (issues.length) { problems++; console.log(`${base} #${i + 1}:`, issues.join(" | ")); }
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: path.join(shots, `${base}-${String(i + 1).padStart(2, "0")}.png`) });
    }
  }
  if (wantPdf && shots) {
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: path.join(shots, `${base}.pdf`), width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
    await page.emulateMedia({ media: "screen" });
  }
}
await browser.close();
console.log(problems ? `QA: ${problems} slide(s) with issues` : "QA: no overflow issues");
