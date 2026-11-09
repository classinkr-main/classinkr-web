#!/usr/bin/env node
/**
 * 리드 마그넷 PDF — 워크북 템플릿(2026-11 시안 B안). HTML 로 그리고 Chromium 으로 인쇄한다.
 *
 * 왜 따로 있나: scripts/generate-lead-magnet-pdfs.py(reportlab)는 가변 폰트를 한 굵기로만 써서
 * 제목·본문 위계가 서지 않고, 줄간격·체크 칸 같은 워크북 요소를 손으로 좌표를 찍어 그려야 한다.
 * 이 스크립트는 공개 사이트 글꼴(IBM Plex Sans KR, @fontsource)로 시안과 같은 HTML/CSS 를 인쇄한다.
 * WORKBOOK_SLUGS 에 있는 자료만 이 템플릿으로 만들고, 파이썬 생성기는 이 슬러그를 건너뛴다.
 * scripts/lead-magnet-ebooks/<slug>.html 이 있으면 data 대신 그 인쇄 원본(디자인 캔버스에서 옮긴 6쪽 e-book)을 찍는다.
 *
 * 사용:
 *   node scripts/render-lead-magnet-workbook-pdf.mjs                 # WORKBOOK_SLUGS 전부
 *   node scripts/render-lead-magnet-workbook-pdf.mjs academy-system-checklist --html-out=/tmp/x.html
 *
 * 준비물: playwright(또는 playwright-core)와 Chromium. 저장소 의존성이 아니므로 없으면
 *   npm i --no-save playwright && npx playwright install chromium
 * 로 받거나, 설치된 Chrome 을 쓰려면 LEAD_MAGNET_PDF_CHANNEL=chrome 을 준다.
 * 링크는 NEXT_PUBLIC_SITE_URL(기본 https://classin.co.kr) 기준 절대 주소 + utm(pdf/lead_magnet/<slug>).
 */

import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { WORKBOOK_SLUGS } from "../lib/lead-magnet-pdf/workbook-slugs.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DATA_PATH = path.join(ROOT, "data", "lead-magnets.json")
const EBOOK_DIR = path.join(ROOT, "scripts", "lead-magnet-ebooks")
const PUBLIC_DIR = path.join(ROOT, "public")
const FONT_DIR = path.join(ROOT, "node_modules", "@fontsource", "ibm-plex-sans-kr")
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://classin.co.kr").replace(/\/$/, "")

/**
 * 이 템플릿으로 만드는 자료. 정본은 lib/lead-magnet-pdf/workbook-slugs.mjs — 런타임 PDF 라우트도 같은 목록을
 * 「따로 만든 PDF」로 보고 서버 생성본으로 바꾸지 않는다. 파이썬 생성기(generate-lead-magnet-pdfs.py)의
 * WORKBOOK_SLUGS 와 같게 둔다.
 */
export { WORKBOOK_SLUGS }

/** 표지 제목 줄바꿈 — 의미 단위로 끊는다(자동 줄바꿈은 '누수' 한 단어만 위로 올라간다). */
const COVER_TITLE_LINES = {
  "academy-system-checklist": ["우리 학원 수업 운영", "누수 진단표"],
}

const MAX_ITEMS_PER_SECTION_PAGE = 7

// ── 공통 유틸 ────────────────────────────────────────────────────────────

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function pad2(value) {
  return String(value).padStart(2, "0")
}

function trackedUrl(href, slug) {
  const raw = clean(href)
  if (!raw) return SITE_URL
  if (/^(https?:|mailto:)/i.test(raw)) return raw
  const url = new URL(raw, `${SITE_URL}/`)
  if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "pdf")
  if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "lead_magnet")
  if (!url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", slug)
  return url.toString()
}

/** 인쇄본에서도 읽히는 짧은 주소 표시(classin.co.kr/contact). */
function displayUrl(href) {
  const raw = clean(href)
  if (/^https?:/i.test(raw)) {
    const url = new URL(raw)
    return url.hostname.replace(/^www\./, "")
  }
  const url = new URL(raw || "/", `${SITE_URL}/`)
  return `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}`
}

function linkKey(href) {
  const raw = clean(href)
  if (/^https?:/i.test(raw)) return raw
  return new URL(raw || "/", `${SITE_URL}/`).pathname
}

const CHECK_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const ARROW_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'

// ── 스타일 ──────────────────────────────────────────────────────────────

async function buildFontCss() {
  const filesUrl = pathToFileURL(path.join(FONT_DIR, "files")).href
  const weights = [400, 500, 600, 700]
  const chunks = await Promise.all(
    weights.map(async (weight) => {
      const css = await readFile(path.join(FONT_DIR, `${weight}.css`), "utf8")
      return css.replaceAll("url(./files/", `url(${filesUrl}/`)
    })
  )
  return chunks.join("\n")
}

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #FFFFFF; }
body {
  font-family: 'IBM Plex Sans KR', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
  color: #31302E; word-break: keep-all; overflow-wrap: break-word; font-synthesis: none;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
p, h1, h2, h3, ul, ol { margin: 0; padding: 0; }
ul, ol { list-style: none; }
a { color: inherit; text-decoration: none; }
.num { font-variant-numeric: tabular-nums; }

.page {
  position: relative; width: 210mm; height: 297mm; overflow: hidden; background: #FFFFFF;
  display: flex; flex-direction: column; padding: 52px 64px 40px;
  break-after: page; page-break-after: always;
}
.page:last-child { break-after: auto; page-break-after: auto; }
.page.with-tabs { padding-right: 80px; }

.footer {
  margin-top: auto; padding-top: 12px; border-top: 1px solid rgba(17,17,16,0.14);
  display: flex; justify-content: space-between; gap: 24px;
  font-size: 12px; line-height: 1.5; color: #615D59;
}

.kicker { font-size: 13px; font-weight: 700; line-height: 1.5; color: #0B7A52; }
.h2 { margin-top: 6px; font-size: 30px; font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; color: #111110; }
.lead { margin-top: 8px; font-size: 15px; line-height: 1.75; color: #615D59; text-wrap: pretty; }
.h3 { font-size: 17px; font-weight: 700; line-height: 1.45; color: #111110; }
.h3-sub { font-weight: 400; color: #615D59; font-size: 14px; margin-left: 6px; }

.box { flex: none; width: 22px; height: 22px; border-radius: 5px; border: 2px solid #0B7A52; background: #FFFFFF; }
.box.sm { width: 18px; height: 18px; border-radius: 4px; }
.box.warn { border-color: #B85C33; }
.circle { flex: none; width: 24px; height: 24px; border-radius: 50%; border: 2px solid #0B7A52; }
.circle.sm { width: 22px; height: 22px; }

/* 표지 */
.cover { padding: 0; }
.cover-top { height: 580px; background: #084734; color: #FAFAF8; padding: 52px 64px 44px; display: flex; flex-direction: column; }
.cover-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; line-height: 1.5; }
.cover-head .brand { font-weight: 700; }
.cover-head .muted { color: rgba(250,250,248,0.72); }
.cover-title { margin-top: 84px; font-size: 56px; font-weight: 700; line-height: 1.18; letter-spacing: -0.025em; color: #FAFAF8; }
.cover-sub { margin-top: 22px; max-width: 540px; font-size: 17px; line-height: 1.8; color: rgba(250,250,248,0.84); text-wrap: pretty; }
.cover-boxes { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
.cover-box-row { display: flex; gap: 18px; }
.cover-box-group { display: flex; gap: 6px; }
.cover-box-group span { width: 22px; height: 22px; border-radius: 5px; border: 1.5px solid rgba(250,250,248,0.55); }
.cover-box-group span.on { border: 0; background: #8FC4AC; }
.cover-caption { margin-top: 4px; font-size: 13px; line-height: 1.5; color: rgba(250,250,248,0.72); }
.cover-bottom { flex: 1; padding: 44px 64px 40px; display: flex; flex-direction: column; }
.steps { margin-top: 16px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.step { background: #F3F2EE; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 6px; }
.step-no { width: 28px; height: 28px; border-radius: 50%; background: #0B7A52; color: #FAFAF8; font-size: 14px; font-weight: 700; line-height: 28px; text-align: center; }
.step-title { margin-top: 8px; font-size: 16px; font-weight: 700; line-height: 1.5; color: #111110; }
.step-body { font-size: 14px; line-height: 1.75; color: #31302E; }
.pills { margin-top: 24px; display: flex; flex-direction: column; gap: 8px; }
.pill { align-self: flex-start; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(17,17,16,0.16); font-size: 13px; line-height: 1.5; color: #31302E; }
.pill b { font-weight: 600; color: #111110; margin-right: 6px; }

/* 시작하기 전에 */
.when-list { margin-top: 22px; display: flex; flex-direction: column; gap: 8px; }
.when { display: flex; gap: 12px; align-items: flex-start; padding: 14px 18px; border-radius: 10px; background: #F7F6F3; font-size: 15px; line-height: 1.7; color: #31302E; }
.when-icon { flex: none; margin-top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #0B7A52; color: #FAFAF8; display: flex; align-items: center; justify-content: center; }
.block { margin-top: 30px; }
.quote { margin-top: 12px; padding: 22px 24px; border-radius: 12px; border: 1px solid rgba(17,17,16,0.14); }
.quote-mark { font-size: 40px; font-weight: 700; line-height: 0.6; color: #0B7A52; height: 22px; }
.quote-body { margin-top: 6px; font-size: 15px; line-height: 1.85; color: #31302E; text-wrap: pretty; }
.quote-by { margin-top: 12px; font-size: 13px; font-weight: 600; line-height: 1.5; color: #615D59; }
.numbered { margin-top: 12px; display: flex; flex-direction: column; }
.numbered li { display: flex; gap: 14px; align-items: baseline; padding: 10px 0; border-bottom: 1px solid rgba(17,17,16,0.10); font-size: 15px; line-height: 1.65; color: #31302E; }
.numbered li:first-child { border-top: 1px solid rgba(17,17,16,0.10); }
.numbered .n { flex: none; width: 24px; font-size: 13px; font-weight: 700; color: #0B7A52; }

/* 점검 문항 */
.tabs { position: absolute; top: 196px; right: 0; display: flex; flex-direction: column; gap: 4px; }
.tabs span { width: 40px; height: 56px; border-radius: 8px 0 0 8px; background: #F3F2EE; color: #615D59; font-size: 13px; font-weight: 600; line-height: 56px; text-align: center; }
.tabs span.on { background: #084734; color: #FAFAF8; font-weight: 700; }
.progress-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; line-height: 1.5; }
.progress-head .where { font-weight: 700; color: #0B7A52; }
.progress-head .doc { color: #615D59; }
.progress { margin-top: 8px; display: flex; gap: 4px; height: 6px; }
.progress span { flex: 1; border-radius: 3px; background: #E4E1DB; }
.progress span.on { background: #0B7A52; }
.section-head { margin-top: 28px; display: flex; gap: 16px; align-items: flex-start; }
.badge { flex: none; width: 48px; height: 48px; border-radius: 10px; background: #084734; color: #FAFAF8; font-size: 18px; font-weight: 700; line-height: 48px; text-align: center; }
.section-title { font-size: 26px; font-weight: 700; line-height: 1.3; letter-spacing: -0.015em; color: #111110; }
.section-desc { margin-top: 6px; font-size: 15px; line-height: 1.75; color: #615D59; text-wrap: pretty; }
.hint { margin-top: 20px; align-self: flex-start; display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: #F3F2EE; font-size: 14px; line-height: 1.5; color: #31302E; }
.hint svg { color: #0B7A52; }
.items { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
.item { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 14px; align-items: start; padding: 16px 18px; border-radius: 10px; border: 1px solid rgba(17,17,16,0.14); }
.item .box { margin-top: 3px; }
.item-text { font-size: 16px; line-height: 1.7; color: #31302E; text-wrap: pretty; }
.item-code { margin-right: 8px; font-size: 13px; font-weight: 700; color: #0B7A52; }
.tally { margin-top: 22px; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 20px; border-radius: 12px; background: #F3F2EE; }
.tally-label { font-size: 15px; font-weight: 700; line-height: 1.5; color: #111110; }
.tally-label span { font-weight: 400; color: #615D59; }
.tally-dots { display: flex; align-items: center; gap: 8px; }
.tally-dots .of { margin-left: 4px; font-size: 14px; color: #615D59; }
.memo { margin-top: 14px; flex: 1; min-height: 72px; border-radius: 12px; border: 1.5px dashed #8A857F; padding: 12px 16px; font-size: 13px; font-weight: 600; line-height: 1.5; color: #615D59; }
.memo-gap { margin-bottom: 18px; }

/* 결과 기록 */
.chart { margin-top: 22px; border-radius: 12px; border: 1px solid rgba(17,17,16,0.14); padding: 4px 20px; }
.chart-row { display: grid; grid-template-columns: 250px minmax(0, 1fr) 72px; gap: 12px; align-items: center; padding: 11px 0; border-bottom: 1px solid rgba(17,17,16,0.10); }
.chart-row:last-child { border-bottom: 0; }
.chart-name { font-size: 15px; font-weight: 600; line-height: 1.5; color: #111110; }
.chart-name .code { margin-right: 8px; color: #0B7A52; }
.chart-dots { display: flex; gap: 8px; }
.chart-of { text-align: right; font-size: 14px; line-height: 1.5; color: #615D59; }
.total { margin-top: 14px; display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-radius: 12px; background: #084734; color: #FAFAF8; }
.total-label { font-size: 18px; font-weight: 700; line-height: 1.4; }
.total-fill { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 600; line-height: 1.4; }
.total-fill span:first-child { width: 96px; height: 44px; border-radius: 8px; background: #FFFFFF; }
.bands { margin-top: 22px; display: flex; flex-direction: column; gap: 8px; }
.band { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 16px; align-items: start; padding: 14px 18px; border-radius: 10px; background: #F7F6F3; }
.band.top { background: #FFFFFF; border: 1.5px solid #0B7A52; padding: 13px 17px; }
.band-range { font-size: 18px; font-weight: 700; line-height: 1.3; color: #111110; }
.band-label { font-size: 14px; font-weight: 600; line-height: 1.5; color: #31302E; }
.band-desc { font-size: 14px; line-height: 1.7; color: #31302E; text-wrap: pretty; }

/* 다시 볼 신호·상담 질문 */
.flags { margin-top: 18px; display: flex; flex-direction: column; gap: 8px; }
.flag { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 14px; align-items: start; padding: 13px 18px; border-radius: 10px; background: #FAF6F0; border: 1px solid #E7D9C9; font-size: 15px; line-height: 1.7; color: #31302E; }
.flag .box { margin-top: 3px; }
.prompts { margin-top: 12px; display: flex; flex-direction: column; gap: 18px; }
.prompt-q { display: flex; gap: 12px; font-size: 15px; font-weight: 600; line-height: 1.65; color: #111110; }
.prompt-q .n { flex: none; width: 24px; height: 24px; border-radius: 50%; background: #0B7A52; color: #FAFAF8; font-size: 13px; font-weight: 700; line-height: 24px; text-align: center; margin-top: 1px; }
.write { margin-left: 36px; height: 32px; border-bottom: 1px solid #A39E98; }

/* 실행 플랜 */
.plan { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }
.plan-step { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 18px; align-items: start; padding: 16px 18px; border-radius: 12px; border: 1px solid rgba(17,17,16,0.14); }
.day { align-self: start; padding: 5px 0; border-radius: 8px; background: #084734; color: #FAFAF8; font-size: 13px; font-weight: 700; line-height: 1.5; text-align: center; }
.plan-title { font-size: 17px; font-weight: 700; line-height: 1.45; color: #111110; }
.tasks { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.task { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 10px; align-items: start; font-size: 14.5px; line-height: 1.7; color: #31302E; }
.task .box { margin-top: 3px; }
.prep { margin-top: 26px; padding: 18px 20px; border-radius: 12px; background: #F3F2EE; }
.prep ul { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.prep li { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 10px; align-items: start; font-size: 14.5px; line-height: 1.65; color: #31302E; }
.prep li .box { margin-top: 3px; }

/* 다음 단계 */
.cta-row { margin-top: 22px; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 12px; }
.cta { display: flex; flex-direction: column; gap: 6px; padding: 20px 22px; border-radius: 12px; }
.cta.primary { background: #084734; color: #FAFAF8; }
.cta.secondary { border: 1.5px solid #0B7A52; color: #111110; }
.cta-title { font-size: 17px; font-weight: 700; line-height: 1.45; }
.cta-desc { font-size: 14px; line-height: 1.7; text-wrap: pretty; }
.cta.primary .cta-desc { color: rgba(250,250,248,0.84); }
.cta.secondary .cta-desc { color: #31302E; }
.cta-url { margin-top: auto; padding-top: 8px; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; line-height: 1.5; }
.cta.primary .cta-url { color: #FAFAF8; }
.cta.secondary .cta-url { color: #0B7A52; }
.grid2 { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.res-card { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; border-radius: 10px; border: 1px solid rgba(17,17,16,0.14); }
.res-title { font-size: 15px; font-weight: 700; line-height: 1.5; color: #111110; }
.res-desc { font-size: 13.5px; line-height: 1.65; color: #615D59; text-wrap: pretty; }
.res-url { margin-top: auto; padding-top: 6px; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; line-height: 1.5; color: #0B7A52; }
.ref-list { margin-top: 12px; display: flex; flex-direction: column; }
.ref { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: baseline; padding: 11px 0; border-bottom: 1px solid rgba(17,17,16,0.10); }
.ref:first-child { border-top: 1px solid rgba(17,17,16,0.10); }
.ref-title { font-size: 14.5px; font-weight: 600; line-height: 1.55; color: #111110; }
.ref-desc { font-size: 13px; line-height: 1.6; color: #615D59; }
.ref-url { font-size: 12.5px; font-weight: 600; color: #0B7A52; white-space: nowrap; }
`

// ── 페이지 ──────────────────────────────────────────────────────────────

function footer(magnet, pageNo) {
  return `<div class="footer"><span>ClassIn Korea 자료실 · ${esc(magnet.title)}</span><span class="num">${pageNo}</span></div>`
}

function pageHead(kicker, title, lead) {
  return `<div>
    <p class="kicker">${esc(kicker)}</p>
    <h2 class="h2">${esc(title)}</h2>
    ${lead ? `<p class="lead">${esc(lead)}</p>` : ""}
  </div>`
}

function coverPage(magnet, layout) {
  const guide = magnet.pdfGuide ?? {}
  const sections = magnet.sections ?? []
  const lines = COVER_TITLE_LINES[magnet.slug] ?? [magnet.title]
  // 표지 장식 — 영역별 문항 수만큼 칸을 그린다(6·6·6·5·6·5). 칠한 칸은 무늬일 뿐 점수 예시가 아니다.
  const groups = sections.map((section, sectionIndex) => {
    const cells = (section.items ?? []).map((_, itemIndex) => {
      const on = (itemIndex * 5 + sectionIndex * 3) % 3 === 0
      return `<span class="${on ? "on" : ""}"></span>`
    })
    return `<div class="cover-box-group">${cells.join("")}</div>`
  })
  const half = Math.ceil(groups.length / 2)
  const steps = [
    ["체크하기", "문항마다 지금 안정적으로 되고 있으면 체크합니다. 애매하면 비워 둡니다."],
    ["점수 칠하기", `영역마다 체크한 개수만큼 ${layout.resultPage}쪽 결과표의 동그라미를 칠합니다.`],
    ["질문으로 바꾸기", clean(guide.howToUse?.[2]) || "가장 불안한 항목 3개를 상담에서 확인할 질문으로 적습니다."],
  ]

  return `<section class="page cover">
  <div class="cover-top">
    <div class="cover-head"><span class="brand">ClassIn Korea 자료실</span><span class="muted">원장용 진단 워크북</span></div>
    <h1 class="cover-title">${lines.map(esc).join("<br>")}</h1>
    <p class="cover-sub">${esc(clean(guide.outcome) || magnet.summary)}</p>
    <div class="cover-boxes" aria-hidden="true">
      <div class="cover-box-row">${groups.slice(0, half).join("")}</div>
      <div class="cover-box-row">${groups.slice(half).join("")}</div>
      <p class="cover-caption">${sections.length}개 영역 · ${layout.itemCount}문항 · 약 ${esc(magnet.estimatedMinutes)}분</p>
    </div>
  </div>
  <div class="cover-bottom">
    <h2 class="h3" style="font-size: 18px">이렇게 쓰세요</h2>
    <div class="steps">
      ${steps
        .map(
          ([title, body], index) => `<div class="step">
        <span class="step-no">${index + 1}</span>
        <span class="step-title">${esc(title)}</span>
        <span class="step-body">${esc(body)}</span>
      </div>`
        )
        .join("")}
    </div>
    <div class="pills">
      <span class="pill"><b>대상</b>${esc(magnet.audience)}</span>
      <span class="pill"><b>구성</b>${esc(magnet.formatLabel)}</span>
    </div>
    <div class="footer"><span>${esc(displayUrl("/resources"))}</span><span class="num">1</span></div>
  </div>
</section>`
}

function introPage(magnet, pageNo) {
  const guide = magnet.pdfGuide ?? {}
  const voice = magnet.expertVoice
  const when = (guide.bestUsedWhen ?? []).map(clean).filter(Boolean)
  const deliverables = (magnet.deliverables ?? []).map(clean).filter(Boolean)
  return `<section class="page">
  ${pageHead("시작하기 전에", "이럴 때 꺼내 보세요", guide.subtitle)}
  ${
    when.length
      ? `<div class="when-list">${when
          .map((text) => `<div class="when"><span class="when-icon">${CHECK_ICON}</span><span>${esc(text)}</span></div>`)
          .join("")}</div>`
      : ""
  }
  ${
    voice?.comment
      ? `<div class="block">
    <h3 class="h3">현장 한마디</h3>
    <div class="quote">
      <div class="quote-mark" aria-hidden="true">“</div>
      <p class="quote-body">${esc(clean(voice.comment))}</p>
      <p class="quote-by">${esc(clean(voice.speaker))}${voice.role ? ` · ${esc(clean(voice.role))}` : ""}</p>
    </div>
  </div>`
      : ""
  }
  ${
    deliverables.length
      ? `<div class="block">
    <h3 class="h3">이 자료에 담긴 것</h3>
    <ol class="numbered">${deliverables
      .map((text, index) => `<li><span class="n num">${pad2(index + 1)}</span><span>${esc(text)}</span></li>`)
      .join("")}</ol>
  </div>`
      : ""
  }
  ${footer(magnet, pageNo)}
</section>`
}

function sectionPage(magnet, section, sectionIndex, sectionCount, pageNo) {
  const items = (section.items ?? []).map(clean).filter(Boolean)
  const code = pad2(sectionIndex + 1)
  const tabs = Array.from({ length: sectionCount }, (_, index) =>
    `<span class="${index === sectionIndex ? "on" : ""} num">${pad2(index + 1)}</span>`
  ).join("")
  const progress = Array.from({ length: sectionCount }, (_, index) =>
    `<span class="${index <= sectionIndex ? "on" : ""}"></span>`
  ).join("")

  return `<section class="page with-tabs">
  <div class="tabs" aria-hidden="true">${tabs}</div>
  <div class="progress-head"><span class="where">영역 ${sectionIndex + 1} / ${sectionCount}</span><span class="doc">${esc(magnet.title)}</span></div>
  <div class="progress" aria-hidden="true">${progress}</div>
  <div class="section-head">
    <span class="badge num">${code}</span>
    <div>
      <h2 class="section-title">${esc(clean(section.title))}</h2>
      <p class="section-desc">${esc(clean(section.description))}</p>
    </div>
  </div>
  <div class="hint">${CHECK_ICON}<span>지금 안정적으로 되고 있으면 체크(1점) · 애매하면 비워 두기(0점)</span></div>
  <div class="items">
    ${items
      .map(
        (text, index) => `<div class="item"><span class="box"></span><p class="item-text"><span class="item-code num">${sectionIndex + 1}-${index + 1}</span>${esc(text)}</p></div>`
      )
      .join("")}
  </div>
  <div class="tally">
    <p class="tally-label">영역 ${code} 점수 <span>— 체크한 개수만큼 칠하세요</span></p>
    <div class="tally-dots">${items.map(() => '<span class="circle sm"></span>').join("")}<span class="of num">/ ${items.length}</span></div>
  </div>
  <div class="memo memo-gap">메모 · 상담에서 물어볼 것</div>
  ${footer(magnet, pageNo)}
</section>`
}

function resultPage(magnet, layout, pageNo) {
  const sections = magnet.sections ?? []
  const bands = magnet.scoreBands ?? []
  const showroom = trackedUrl("/showroom", magnet.slug)
  return `<section class="page">
  ${pageHead("결과 기록", "내 점수 한눈에 보기", "영역마다 체크한 개수만큼 칠하면, 어디가 새고 있는지 막대처럼 보입니다. 짧은 줄이 먼저 손볼 곳입니다.")}
  <div class="chart">
    ${sections
      .map((section, index) => {
        const count = (section.items ?? []).length
        return `<div class="chart-row">
      <span class="chart-name"><span class="code num">${pad2(index + 1)}</span>${esc(clean(section.title))}</span>
      <div class="chart-dots">${Array.from({ length: count }, () => '<span class="circle"></span>').join("")}</div>
      <span class="chart-of num">___ / ${count}</span>
    </div>`
      })
      .join("")}
  </div>
  <div class="total"><span class="total-label">총점</span><span class="total-fill"><span></span><span class="num">/ ${layout.itemCount}</span></span></div>
  <div class="bands">
    ${bands
      .map(
        (band, index) => `<div class="band${index === bands.length - 1 ? " top" : ""}">
      <div><p class="band-range num">${esc(clean(band.range).replace(/(\d)-(\d)/, "$1–$2"))}</p><p class="band-label">${esc(clean(band.label))}</p></div>
      <p class="band-desc">${esc(clean(band.description))}</p>
    </div>`
      )
      .join("")}
  </div>
  <div class="footer"><a href="${esc(showroom)}">결과표를 들고 목동 쇼룸에 오시면, 낮게 나온 영역부터 대표 수업 한 편으로 확인합니다 · ${esc(displayUrl("/showroom"))}</a><span class="num">${pageNo}</span></div>
</section>`
}

function signalsPage(magnet, pageNo) {
  const guide = magnet.pdfGuide ?? {}
  const flags = (magnet.redFlags ?? []).map(clean).filter(Boolean)
  const prompts = (guide.discussionPrompts ?? []).map(clean).filter(Boolean)
  return `<section class="page">
  ${pageHead("다시 볼 신호", "점수와 상관없이 다시 볼 신호", guide.expertNote)}
  ${
    flags.length
      ? `<div class="flags">${flags
          .map((text) => `<div class="flag"><span class="box sm warn"></span><span>${esc(text)}</span></div>`)
          .join("")}</div>`
      : ""
  }
  ${
    prompts.length
      ? `<div class="block">
    <h3 class="h3">상담 전에 답해 볼 질문<span class="h3-sub">짧게 적어 두면 상담이 빨라집니다</span></h3>
    <div class="prompts">${prompts
      .map(
        (text, index) => `<div>
        <p class="prompt-q"><span class="n num">${index + 1}</span><span>${esc(text)}</span></p>
        <div class="write"></div><div class="write"></div>
      </div>`
      )
      .join("")}</div>
  </div>`
      : ""
  }
  ${footer(magnet, pageNo)}
</section>`
}

function planPage(magnet, pageNo) {
  const steps = magnet.actionPlan ?? []
  const prep = (magnet.consultationPrep ?? []).map(clean).filter(Boolean)
  const lastDay = Math.max(
    0,
    ...steps.flatMap((step) => (clean(step.day).match(/\d+/g) ?? []).map(Number))
  )
  return `<section class="page">
  ${pageHead("실행 플랜", lastDay ? `${lastDay}일 정리 플랜` : "실행 플랜", null)}
  <div class="plan">
    ${steps
      .map(
        (step) => `<div class="plan-step">
      <span class="day">${esc(clean(step.day))}</span>
      <div>
        <p class="plan-title">${esc(clean(step.title))}</p>
        <div class="tasks">${(step.tasks ?? [])
          .map(clean)
          .filter(Boolean)
          .map((task) => `<div class="task"><span class="box sm"></span><span>${esc(task)}</span></div>`)
          .join("")}</div>
      </div>
    </div>`
      )
      .join("")}
  </div>
  ${
    prep.length
      ? `<div class="prep">
    <h3 class="h3">상담 전에 준비하면 좋은 자료</h3>
    <ul>${prep.map((text) => `<li><span class="box sm"></span><span>${esc(text)}</span></li>`).join("")}</ul>
  </div>`
      : ""
  }
  ${footer(magnet, pageNo)}
</section>`
}

function nextStepsPage(magnet, magnetsBySlug, pageNo) {
  const guide = magnet.pdfGuide ?? {}
  const slug = magnet.slug
  const seen = new Set()
  const take = (href) => {
    const key = linkKey(href)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }

  const ctas = (guide.consultationCtas ?? []).filter((cta) => clean(cta.href))
  const primary = ctas[0] ?? { label: "Classin 도입 상담", href: "/contact#contact-form", description: "진단 결과를 바탕으로 쇼룸, 데모, 견적 확인 범위를 정리합니다." }
  take(primary.href)
  const showroomLink = (magnet.sourceLinks ?? []).find((link) => linkKey(link.href) === "/showroom")
  const secondary = showroomLink ?? { label: "목동 쇼룸 방문 예약", href: "/showroom", description: "우리 학원 수업 한 편을 기준으로 하드웨어와 소프트웨어 조합을 검토합니다." }
  take(secondary.href)

  const resources = []
  for (const relatedSlug of guide.relatedMagnets ?? []) {
    const related = magnetsBySlug.get(relatedSlug)
    if (!related) continue
    const href = `/resources/${relatedSlug}`
    if (!take(href)) continue
    resources.push({ label: related.title, href, description: related.pdfGuide?.outcome || related.summary })
  }
  for (const link of [...ctas.slice(1), ...(magnet.sourceLinks ?? [])]) {
    const href = clean(link.href)
    if (!href.startsWith("/resources/") || !take(href)) continue
    resources.push({ label: link.label, href, description: link.description })
  }
  const references = (magnet.sourceLinks ?? []).filter((link) => {
    const href = clean(link.href)
    return !href.startsWith("/resources/") && take(href)
  })

  const card = (item) => `<a class="res-card" href="${esc(trackedUrl(item.href, slug))}">
      <span class="res-title">${esc(clean(item.label))}</span>
      <span class="res-desc">${esc(clean(item.description))}</span>
      <span class="res-url">자료 페이지 열기${ARROW_ICON}</span>
    </a>`

  return `<section class="page">
  ${pageHead("다음 단계", "결과를 들고 다음 단계로", "아래 카드를 누르면 해당 페이지가 바로 열립니다.")}
  <div class="cta-row">
    <a class="cta primary" href="${esc(trackedUrl(primary.href, slug))}">
      <span class="cta-title">${esc(clean(primary.label))}</span>
      <span class="cta-desc">${esc(clean(primary.description))}</span>
      <span class="cta-url">${esc(displayUrl(primary.href))}${ARROW_ICON}</span>
    </a>
    <a class="cta secondary" href="${esc(trackedUrl(secondary.href, slug))}">
      <span class="cta-title">${esc(clean(secondary.label))}</span>
      <span class="cta-desc">${esc(clean(secondary.description))}</span>
      <span class="cta-url">${esc(displayUrl(secondary.href))}${ARROW_ICON}</span>
    </a>
  </div>
  ${
    resources.length
      ? `<div class="block"><h3 class="h3">이어서 볼 자료</h3><div class="grid2">${resources.slice(0, 4).map(card).join("")}</div></div>`
      : ""
  }
  ${
    references.length
      ? `<div class="block"><h3 class="h3">참고 가이드</h3><div class="ref-list">${references
          .slice(0, 4)
          .map(
            (link) => `<a class="ref" href="${esc(trackedUrl(link.href, slug))}">
        <span><span class="ref-title">${esc(clean(link.label))}</span><br><span class="ref-desc">${esc(clean(link.description))}</span></span>
        <span class="ref-url">${esc(displayUrl(link.href))}</span>
      </a>`
          )
          .join("")}</div></div>`
      : ""
  }
  ${footer(magnet, pageNo)}
</section>`
}

export function buildWorkbookHtml(magnet, magnetsBySlug, fontCss = "") {
  const sections = magnet.sections ?? []
  for (const section of sections) {
    if ((section.items ?? []).length > MAX_ITEMS_PER_SECTION_PAGE) {
      throw new Error(
        `[${magnet.slug}] '${section.title}' 문항이 ${section.items.length}개라 한 쪽에 들어가지 않습니다(최대 ${MAX_ITEMS_PER_SECTION_PAGE}).`
      )
    }
  }
  const itemCount = sections.reduce((sum, section) => sum + (section.items ?? []).length, 0)
  const firstSectionPage = 3
  const resultPageNo = firstSectionPage + sections.length
  const layout = { itemCount, resultPage: resultPageNo }

  const pages = [
    coverPage(magnet, layout),
    introPage(magnet, 2),
    ...sections.map((section, index) => sectionPage(magnet, section, index, sections.length, firstSectionPage + index)),
    resultPage(magnet, layout, resultPageNo),
    signalsPage(magnet, resultPageNo + 1),
    planPage(magnet, resultPageNo + 2),
    nextStepsPage(magnet, magnetsBySlug, resultPageNo + 3),
  ]

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${esc(magnet.title)}</title>
<meta name="author" content="ClassIn Korea">
<style>${fontCss}</style>
<style>${CSS}</style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`
}

// ── e-book 인쇄 원본 ─────────────────────────────────────────────────────

/** 인쇄 원본의 public 기준 이미지 경로를 file:// 로, 사이트 상대 링크를 utm 붙은 절대 주소로 바꾼다. */
function buildEbookHtml(source, slug, fontCss) {
  return source
    .replace("/* FONT_CSS */", () => fontCss)
    .replace(/src="\/([^"]+)"/g, (_, rel) => `src="${pathToFileURL(path.join(PUBLIC_DIR, rel)).href}"`)
    .replace(/href="(\/[^"]*)"/g, (_, href) => `href="${esc(trackedUrl(href, slug))}"`)
}

// ── 인쇄 ────────────────────────────────────────────────────────────────

function loadPlaywright() {
  const require = createRequire(import.meta.url)
  for (const name of ["playwright", "playwright-core"]) {
    try {
      return require(name)
    } catch {
      // 다음 후보
    }
  }
  throw new Error(
    "playwright 를 찾지 못했습니다. `npm i --no-save playwright && npx playwright install chromium` 뒤 다시 실행하세요."
  )
}

async function launchBrowser(chromium) {
  const channel = process.env.LEAD_MAGNET_PDF_CHANNEL
  if (channel) return chromium.launch({ channel })
  try {
    return await chromium.launch()
  } catch (error) {
    // 번들 Chromium 이 없으면 설치된 Chrome 으로 한 번 더 시도한다(맥 로컬).
    try {
      return await chromium.launch({ channel: "chrome" })
    } catch {
      throw error
    }
  }
}

function outputPathFor(magnet) {
  const resourceUrl = clean(magnet.resourceUrl)
  if (resourceUrl.startsWith("/") && resourceUrl.endsWith(".pdf")) {
    return path.join(PUBLIC_DIR, resourceUrl.replace(/^\//, ""))
  }
  return path.join(PUBLIC_DIR, "materials", "lead-magnets", `${magnet.slug}.pdf`)
}

async function main() {
  const args = process.argv.slice(2)
  const htmlOutArg = args.find((arg) => arg.startsWith("--html-out="))
  const htmlOut = htmlOutArg ? path.resolve(htmlOutArg.slice("--html-out=".length)) : null
  const requested = args.filter((arg) => !arg.startsWith("--"))
  const slugs = requested.length ? requested : WORKBOOK_SLUGS

  const magnets = JSON.parse(await readFile(DATA_PATH, "utf8"))
  const magnetsBySlug = new Map(magnets.map((magnet) => [magnet.slug, magnet]))
  const fontCss = await buildFontCss()
  const { chromium } = loadPlaywright()
  const browser = await launchBrowser(chromium)
  const workDir = await mkdtemp(path.join(os.tmpdir(), "lead-magnet-pdf-"))

  try {
    for (const slug of slugs) {
      const magnet = magnetsBySlug.get(slug)
      if (!magnet) throw new Error(`자료를 찾지 못했습니다: ${slug}`)
      const ebookPath = path.join(EBOOK_DIR, `${slug}.html`)
      const html = existsSync(ebookPath)
        ? buildEbookHtml(await readFile(ebookPath, "utf8"), slug, fontCss)
        : buildWorkbookHtml(magnet, magnetsBySlug, fontCss)
      const htmlPath = path.join(workDir, `${slug}.html`)
      await writeFile(htmlPath, html, "utf8")
      if (htmlOut) {
        await mkdir(path.dirname(htmlOut), { recursive: true })
        await writeFile(htmlOut, html, "utf8")
      }

      const page = await browser.newPage()
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" })
      await page.evaluate(() => document.fonts.ready)
      const overflow = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".page"))
          .map((element, index) => ({ page: index + 1, over: element.scrollHeight - element.clientHeight }))
          .filter((entry) => entry.over > 1)
      )
      if (overflow.length) {
        throw new Error(
          `[${slug}] 내용이 쪽을 넘칩니다: ${overflow.map((entry) => `${entry.page}쪽 +${entry.over}px`).join(", ")}`
        )
      }

      const outPath = outputPathFor(magnet)
      await mkdir(path.dirname(outPath), { recursive: true })
      await page.pdf({ path: outPath, preferCSSPageSize: true, printBackground: true })
      await page.close()
      console.log(path.relative(ROOT, outPath))
    }
  } finally {
    await browser.close()
    await rm(workDir, { recursive: true, force: true })
  }
  console.log(`Generated ${slugs.length} workbook PDF file(s).`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
