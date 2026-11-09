// 리드마그넷 PDF 절(節) — scripts/generate-lead-magnet-pdfs.py 의 draw_* 를 같은 순서·문구로 옮겼다.
// 바뀐 점: 내용이 빈 절은 제목만 남기지 않고 건너뛰고, 값이 잘리지 않게 전부 줄바꿈하며,
// 작업표의 예시값(hint)과 링크 주소를 인쇄본에서도 읽을 수 있게 적는다.
import "server-only"

import type {
  LeadMagnet,
  LeadMagnetScoreBand,
  LeadMagnetWorksheetRow,
} from "@/lib/lead-magnets"
import { absoluteUrl, displayUrl } from "@/lib/lead-magnet-pdf/links"
import {
  categoryLabel,
  cleanText,
  countChecklistItems,
  splitWorksheetHint,
  tierLabel,
} from "@/lib/lead-magnet-pdf/text"
import { CONTENT_WIDTH, PAGE, PDF_COLORS, SPACE, TYPE, type Rgb } from "@/lib/lead-magnet-pdf/theme"
import type { BlockStyle, PdfWriter, Row, TextStyle } from "@/lib/lead-magnet-pdf/writer"

export interface SectionContext {
  w: PdfWriter
  magnet: LeadMagnet
  magnetsBySlug: ReadonlyMap<string, LeadMagnet>
  siteUrl: string
}

const BOX_PAD_X = 16
const BOX_PAD_Y = 12

function nonEmpty(items: readonly unknown[] | undefined) {
  return (items ?? []).map((item) => cleanText(item)).filter(Boolean)
}

/** 그리기 전에 높이를 잴 수 있게 줄과 모양을 묶은 블록. */
interface BlockSpec {
  rows: Row[]
  style: BlockStyle
}

function drawSpec(w: PdfWriter, spec: BlockSpec) {
  w.block(spec.rows, spec.style)
}

/** 블록들이 차지할 높이(뒤 여백 포함). 절 머리에 「첫 본문이 같이 들어갈 자리」로 넘긴다. */
function specsHeight(w: PdfWriter, specs: readonly BlockSpec[]) {
  return specs.reduce((sum, spec) => sum + w.blockHeight(spec.rows, spec.style) + (spec.style.after ?? 0), 0)
}

// ── 공통 조각 ──────────────────────────────────────────────────────────────

/**
 * 킥커(「04 / 체크리스트」) + 절 제목. 지금 쪽에 제목과 첫 본문(follow 높이)이 같이 들어가면
 * 이어서 시작하고, 아니면 통째로 다음 쪽으로 넘긴다(쪽 바닥에 제목만 남지 않는다).
 */
function sectionHead(w: PdfWriter, kicker: string, title: string, follow: number = SPACE.keepWithHeading) {
  w.sectionGap(SPACE.sectionGap)
  w.setSection(kicker)
  const rows: Row[] = [
    ...w.textRows(kicker, { ...TYPE.kicker, font: "semibold", color: PDF_COLORS.green }, CONTENT_WIDTH),
    w.spacer(6),
    ...w.textRows(title, { ...TYPE.heading, font: "semibold", color: PDF_COLORS.ink }, CONTENT_WIDTH),
  ]
  w.block(rows, { after: 12, keepWithNext: Math.max(SPACE.keepWithHeading, follow) })
}

function paragraphSpec(w: PdfWriter, value: unknown, style: TextStyle, after: number): BlockSpec {
  const rows = w.textRows(value, style, CONTENT_WIDTH)
  return { rows, style: { after, keepTogether: rows.length <= 4 } }
}

function subheading(w: PdfWriter, text: string, options: { keepWithNext?: number; after?: number } = {}) {
  w.block(w.textRows(text, { ...TYPE.subheading, font: "semibold", color: PDF_COLORS.ink }, CONTENT_WIDTH), {
    after: options.after ?? 5,
    keepWithNext: options.keepWithNext ?? SPACE.keepWithSubheading,
  })
}

function bulletSpecs(w: PdfWriter, items: readonly unknown[] | undefined, options: { numbered?: boolean } = {}): BlockSpec[] {
  return nonEmpty(items).map((item, index) => {
    const prefix = options.numbered ? `${index + 1}.` : "•"
    const rows = w.hangingRows(prefix, item, { ...TYPE.body, color: PDF_COLORS.body }, CONTENT_WIDTH, {
      indent: 20,
      prefixStyle: options.numbered
        ? { font: "semibold", color: PDF_COLORS.green }
        : { color: PDF_COLORS.muted },
    })
    return { rows, style: { after: 4, keepTogether: true } }
  })
}

function bulletList(w: PdfWriter, items: readonly unknown[] | undefined, options: { numbered?: boolean } = {}) {
  for (const spec of bulletSpecs(w, items, options)) drawSpec(w, spec)
}

interface NoteBoxOptions {
  fill?: Rgb
  accent?: Rgb
  /** 본문을 한 문단 대신 글머리 목록으로. */
  items?: readonly string[]
}

function noteBox(w: PdfWriter, title: string, body: string, options: NoteBoxOptions = {}) {
  const innerWidth = CONTENT_WIDTH - BOX_PAD_X * 2
  const bodyStyle: TextStyle = { ...TYPE.small, color: PDF_COLORS.body }
  const bodyRows = options.items
    ? options.items.flatMap((item) =>
        w.hangingRows("•", item, bodyStyle, innerWidth, { indent: 14, prefixStyle: { color: PDF_COLORS.muted } })
      )
    : w.textRows(body, bodyStyle, innerWidth)
  const titleRows = w.textRows(title, { size: 10.4, leading: 16, font: "semibold", color: PDF_COLORS.ink }, innerWidth)
  if (titleRows.length === 0 && bodyRows.length === 0) return
  w.block([...titleRows, ...(titleRows.length && bodyRows.length ? [w.spacer(3)] : []), ...bodyRows], {
    fill: options.fill ?? PDF_COLORS.sunken,
    border: PDF_COLORS.hair,
    accent: options.accent ?? PDF_COLORS.green,
    padX: BOX_PAD_X,
    padTop: BOX_PAD_Y,
    padBottom: BOX_PAD_Y,
    after: SPACE.blockGap,
    keepTogether: true,
    minRows: 3,
  })
}

/** 누르면 열리는 링크 상자. 인쇄본을 위해 짧은 주소도 적는다. */
function linkRow(w: PdfWriter, ctx: SectionContext, label: string, href: string, description: string) {
  drawSpec(w, linkRowSpec(w, ctx, label, href, description))
}

function linkRowSpec(w: PdfWriter, ctx: SectionContext, label: string, href: string, description: string): BlockSpec {
  const url = absoluteUrl(href, cleanText(ctx.magnet.slug), ctx.siteUrl)
  const innerWidth = CONTENT_WIDTH - BOX_PAD_X * 2
  const rows: Row[] = [
    ...w.textRows(label, { size: 10.4, leading: 16, font: "semibold", color: PDF_COLORS.green }, innerWidth),
    ...w.textRows(description, { ...TYPE.small, color: PDF_COLORS.muted }, innerWidth),
    w.spacer(2),
    ...w.textRows(displayUrl(url), { ...TYPE.caption, color: PDF_COLORS.muted }, innerWidth),
  ]
  return {
    rows,
    style: {
      fill: PDF_COLORS.sheet,
      border: PDF_COLORS.hair,
      padX: BOX_PAD_X,
      padTop: 10,
      padBottom: 10,
      after: 6,
      keepTogether: true,
      link: url,
    },
  }
}

// ── 표지 ──────────────────────────────────────────────────────────────────

export function drawCover(ctx: SectionContext) {
  const { w, magnet } = ctx
  const guide = magnet.pdfGuide
  const itemCount = countChecklistItems(magnet)

  w.paintBackground(PDF_COLORS.paper)
  w.rect(PAGE.marginX, PAGE.height - 92, 92, 4, { fill: PDF_COLORS.green })
  w.y = PAGE.height - 118

  w.block(w.textRows("ClassIn Resource Library", { ...TYPE.kicker, font: "semibold", color: PDF_COLORS.green }, CONTENT_WIDTH), { after: 16 })
  w.block(w.textRows(magnet.title, { ...TYPE.coverTitle, font: "semibold", color: PDF_COLORS.ink }, CONTENT_WIDTH - 12), { after: 16 })
  w.block(w.textRows(cleanText(guide?.subtitle) || magnet.summary, { ...TYPE.coverSubtitle, color: PDF_COLORS.body }, CONTENT_WIDTH - 20), { after: 12 })
  w.block(w.textRows(cleanText(guide?.outcome) || magnet.summary, { ...TYPE.lede, color: PDF_COLORS.muted }, CONTENT_WIDTH - 20), { after: 24 })

  const gap = 10
  const colWidth = w.columnWidth(3, gap)
  const metric = (label: string, value: string): Row[] => [
    ...w.textRows(label, { ...TYPE.caption, color: PDF_COLORS.muted }, colWidth - 24),
    w.spacer(3),
    ...w.textRows(value, { size: 10, leading: 15, font: "semibold", color: PDF_COLORS.ink }, colWidth - 24),
  ]
  w.columns(
    [
      metric("대상", cleanText(magnet.audience)),
      metric("형식", `${tierLabel(magnet.tier)} · ${categoryLabel(magnet.category)} · PDF`),
      metric("분량", `${itemCount}문항 · 약 ${magnet.estimatedMinutes}분`),
    ],
    { gap, fill: PDF_COLORS.sheet, border: PDF_COLORS.hair, padX: 12, padTop: 12, padBottom: 12, after: 14 }
  )

  noteBox(
    w,
    "이 자료를 먼저 보는 이유",
    cleanText(guide?.expertNote) ||
      "도입 전 질문을 같은 기준으로 정리하면 가격 비교보다 먼저 확인해야 할 운영 병목이 보입니다.",
    { fill: PDF_COLORS.sheet }
  )
  w.paragraph("PDF 안의 링크는 필요한 자료와 상담 페이지로 바로 연결됩니다.", { ...TYPE.caption, color: PDF_COLORS.muted }, { after: 6 })
  linkRow(w, ctx, "ClassIn 도입 상담 신청", "/contact#contact-form", "체크 결과를 바탕으로 쇼룸, 데모, 견적 확인 범위를 정리합니다.")
  w.newPage()
}

// ── 본문 절 ────────────────────────────────────────────────────────────────

export function drawStory(ctx: SectionContext) {
  const { w, magnet } = ctx
  const story = magnet.storyGuide
  if (!story) return false

  sectionHead(w, "01 / 판단 흐름", cleanText(story.title) || "도입 전 판단 흐름")
  if (cleanText(story.body)) w.paragraph(story.body, { ...TYPE.lede, color: PDF_COLORS.muted }, { after: 12 })
  const beats = nonEmpty(story.beats)
  if (beats.length > 0) {
    subheading(w, "수업 한 편을 기준으로 확인할 장면")
    bulletList(w, beats, { numbered: true })
  }
  if (cleanText(story.takeaway)) {
    w.y -= 4
    noteBox(w, cleanText(story.eyebrow) || "판단 기준", cleanText(story.takeaway))
  }
  return true
}

export function drawUsage(ctx: SectionContext) {
  const { w, magnet } = ctx
  const guide = magnet.pdfGuide
  const bestUsedWhen = nonEmpty(guide?.bestUsedWhen)
  const howToUse = nonEmpty(guide?.howToUse)
  const prompts = nonEmpty(guide?.discussionPrompts)
  const voice = magnet.expertVoice
  if (bestUsedWhen.length === 0 && howToUse.length === 0 && prompts.length === 0 && !voice) return false

  sectionHead(w, "02 / 사용법", "PDF를 이렇게 사용하세요")
  if (bestUsedWhen.length > 0) {
    subheading(w, "언제 유용한가")
    bulletList(w, bestUsedWhen)
    w.y -= 6
  }
  if (howToUse.length > 0) {
    subheading(w, "추천 사용 순서")
    bulletList(w, howToUse, { numbered: true })
    w.y -= 6
  }
  if (prompts.length > 0) noteBox(w, "상담 전에 답해볼 질문", "", { items: prompts })
  if (voice) {
    const speaker = cleanText(voice.speaker)
    const role = cleanText(voice.role)
    const byline = role ? `${speaker} · ${role}` : speaker
    noteBox(w, `현장 한마디 — ${byline}`, cleanText(voice.comment), { fill: PDF_COLORS.sheet })
  }
  return true
}

export function drawDeliverables(ctx: SectionContext) {
  const { w, magnet } = ctx
  const deliverables = nonEmpty(magnet.deliverables)
  const prep = nonEmpty(magnet.consultationPrep)
  if (deliverables.length === 0 && prep.length === 0) return false

  sectionHead(w, "03 / 구성", "이 자료에 포함된 것")
  bulletList(w, deliverables)
  if (prep.length > 0) {
    w.y -= 6
    subheading(w, "상담 전에 준비하면 좋은 자료")
    bulletList(w, prep)
  }
  return true
}

export function drawWorksheet(ctx: SectionContext) {
  const { w, magnet } = ctx
  const worksheet = magnet.worksheet
  if (!worksheet) return false
  const columns = nonEmpty(worksheet.columns)
  const rows = (worksheet.rows ?? []).filter((row) => cleanText(row.label))
  if (columns.length === 0 || rows.length === 0) return false

  sectionHead(w, "02-1 / 계산표", cleanText(worksheet.title) || "계산표")
  if (cleanText(worksheet.intro)) w.paragraph(worksheet.intro, { ...TYPE.small, color: PDF_COLORS.muted }, { after: 10 })

  const labelWidth = CONTENT_WIDTH * 0.36
  const colWidth = (CONTENT_WIDTH - labelWidth) / columns.length
  const cellPad = 5
  const headerStyle = { size: 8.2, leading: 11.5, font: "semibold" as const, color: PDF_COLORS.green }
  const headerLabel = w.lines("항목", headerStyle, labelWidth - cellPad * 2)
  const headerCells = columns.map((column) => w.lines(column, headerStyle, colWidth - cellPad * 2))
  const headerHeight = Math.max(headerLabel.length, ...headerCells.map((cell) => cell.length), 1) * headerStyle.leading + 12

  const drawHeader = () => {
    const headerRow: Row = {
      height: headerHeight,
      runs: [],
      draw: ({ page, top, left }) => {
        const write = (lines: string[], x: number) =>
          lines.forEach((line, index) =>
            w.textAt(page, line, x, w.baseline(top - 6 - index * headerStyle.leading, headerStyle.size, headerStyle.leading), headerStyle)
          )
        write(headerLabel, left + cellPad)
        headerCells.forEach((cell, index) => write(cell, left + labelWidth + colWidth * index + cellPad))
        w.line(page, left, top - headerHeight, left + CONTENT_WIDTH, top - headerHeight, PDF_COLORS.ink, 0.7)
      },
    }
    w.block([headerRow], { keepWithNext: 34 })
  }

  const labelStyle = (row: LeadMagnetWorksheetRow) => ({
    size: 9.4,
    leading: 13.5,
    font: row.highlight ? ("semibold" as const) : ("regular" as const),
    color: row.highlight ? PDF_COLORS.ink : PDF_COLORS.body,
  })
  const hintStyle = { size: 8, leading: 11, font: "regular" as const, color: PDF_COLORS.muted }

  drawHeader()
  for (const row of rows) {
    const style = labelStyle(row)
    const labelLines = w.lines(row.label, style, labelWidth - cellPad * 2)
    const cellHints = splitWorksheetHint(row.hint, columns.length)
    const looseHint = cellHints ? [] : w.lines(row.hint, hintStyle, labelWidth - cellPad * 2)
    const cellLines = (cellHints ?? []).map((hint) => w.lines(hint, hintStyle, colWidth - cellPad * 2))
    const labelHeight = labelLines.length * style.leading + looseHint.length * hintStyle.leading
    const cellHeight = Math.max(0, ...cellLines.map((cell) => cell.length)) * hintStyle.leading
    // 손으로 적을 자리를 남긴다(값이 없는 줄도 최소 26pt).
    const height = Math.max(26, 8 + Math.max(labelHeight, cellHeight) + 14)

    if (!w.atPageTop && w.available < height) {
      w.newPage()
      drawHeader()
    }
    const tableRow: Row = {
      height,
      runs: [],
      draw: ({ page, top, left }) => {
        if (row.highlight) w.rect(left, top - height, CONTENT_WIDTH, height, { fill: PDF_COLORS.sunken })
        let lineTop = top - 7
        for (const line of labelLines) {
          w.textAt(page, line, left + cellPad, w.baseline(lineTop, style.size, style.leading), style)
          lineTop -= style.leading
        }
        for (const line of looseHint) {
          w.textAt(page, line, left + cellPad, w.baseline(lineTop, hintStyle.size, hintStyle.leading), hintStyle)
          lineTop -= hintStyle.leading
        }
        cellLines.forEach((cell, index) => {
          cell.forEach((line, lineIndex) => {
            const x = left + labelWidth + colWidth * index + cellPad
            w.textAt(page, line, x, w.baseline(top - 7 - lineIndex * hintStyle.leading, hintStyle.size, hintStyle.leading), hintStyle)
          })
        })
        // 칸마다 기입 밑줄, 줄 끝 헤어라인.
        for (let index = 0; index < columns.length; index += 1) {
          const x = left + labelWidth + colWidth * index
          w.line(page, x + cellPad, top - height + 7, x + colWidth - cellPad, top - height + 7, PDF_COLORS.control, 0.5)
        }
        w.line(page, left, top - height, left + CONTENT_WIDTH, top - height, PDF_COLORS.hair)
      },
    }
    w.block([tableRow], { keepTogether: true })
  }
  w.y -= 10

  if (cleanText(worksheet.formula)) noteBox(w, "계산식", cleanText(worksheet.formula), { fill: PDF_COLORS.sheet })
  if (cleanText(worksheet.note)) w.paragraph(worksheet.note, { ...TYPE.caption, color: PDF_COLORS.muted }, { after: 6 })
  return true
}

export function drawCaseCards(ctx: SectionContext) {
  const { w, magnet } = ctx
  const cards = (magnet.caseCards ?? []).filter((card) => cleanText(card.label) && cleanText(card.change))
  if (cards.length === 0) return false

  sectionHead(w, "02-2 / 도입 사례", "우리와 비슷한 학원은 이렇게 바뀌었습니다")
  const innerWidth = CONTENT_WIDTH - 14 * 2
  const textStyle: TextStyle = { size: 9.6, leading: 14.5, color: PDF_COLORS.body }
  for (const card of cards) {
    const quoteRows = w.textRows(card.quote, { size: 9.2, leading: 14, color: PDF_COLORS.body }, innerWidth - 12, 12)
    for (const row of quoteRows) {
      row.draw = ({ page, top, left, height }) => w.line(page, left + 1, top, left + 1, top - height, PDF_COLORS.green, 2)
    }
    const rows: Row[] = [
      ...w.textRows(card.label, { size: 10.6, leading: 16, font: "semibold", color: PDF_COLORS.ink }, innerWidth),
      ...w.textRows(card.profile, { ...TYPE.caption, color: PDF_COLORS.muted }, innerWidth),
      w.spacer(6),
      ...w.hangingRows("고민", card.challenge, { ...textStyle, color: PDF_COLORS.muted }, innerWidth, {
        indent: 34,
        prefixStyle: { font: "semibold", color: PDF_COLORS.muted },
      }),
      ...w.hangingRows("변화", card.change, { ...textStyle, color: PDF_COLORS.body }, innerWidth, {
        indent: 34,
        prefixStyle: { font: "semibold", color: PDF_COLORS.ink },
      }),
      ...(quoteRows.length > 0 ? [w.spacer(6), ...quoteRows] : []),
    ]
    w.block(rows, {
      fill: PDF_COLORS.paper,
      border: PDF_COLORS.hair,
      padX: 14,
      padTop: BOX_PAD_Y,
      padBottom: BOX_PAD_Y,
      after: SPACE.blockGap,
      keepTogether: true,
      minRows: 3,
    })
  }
  w.paragraph(
    "운영 변화 중심의 익명 사례입니다. 우리 학원과 조건이 가장 가까운 사례는 상담에서 안내해 드립니다.",
    { ...TYPE.caption, color: PDF_COLORS.muted },
    { after: 6 }
  )
  return true
}

export function drawScriptSamples(ctx: SectionContext) {
  const { w, magnet } = ctx
  const samples = (magnet.scriptSamples ?? []).filter((sample) => cleanText(sample.scenario) && cleanText(sample.good))
  if (samples.length === 0) return false

  sectionHead(w, "02-3 / 복사해서 쓰는 멘트", "상황별 메시지 예시")
  for (const sample of samples) {
    w.block(w.textRows(sample.scenario, { size: 11.4, leading: 16, font: "semibold", color: PDF_COLORS.ink }, CONTENT_WIDTH), {
      after: 5,
      keepWithNext: 64,
    })
    noteBox(w, "권장", cleanText(sample.good), { accent: PDF_COLORS.green })
    if (cleanText(sample.avoid)) noteBox(w, "피하기", cleanText(sample.avoid), { accent: PDF_COLORS.ink, fill: PDF_COLORS.sheet })
    if (cleanText(sample.why)) w.paragraph(sample.why, { ...TYPE.caption, color: PDF_COLORS.muted }, { after: 12 })
    else w.y -= 6
  }
  return true
}

export function drawChecklist(ctx: SectionContext) {
  const { w, magnet } = ctx
  const sections = (magnet.sections ?? []).filter((section) => nonEmpty(section.items).length > 0)
  if (sections.length === 0) return false

  const textX = 52
  const itemStyle: TextStyle = { size: 9.8, leading: 14.5, color: PDF_COLORS.body }
  const itemSpecs = (number: number, items: readonly string[]): BlockSpec[] =>
    items.flatMap((item, itemIndex) => {
      const rows = w.textRows(item, itemStyle, CONTENT_WIDTH - textX, textX)
      // 글꼴에 없는 글자(이모지)만 있던 문항은 빈 줄이 된다 — 번호는 원래 순번을 유지한다.
      if (rows.length === 0) return []
      rows[0].runs.unshift({ text: `${number}-${itemIndex + 1}`, x: 18, font: "semibold", size: 8.2, color: PDF_COLORS.green })
      rows[0].draw = ({ top, left, height }) => {
        const boxSize = 9
        const boxTop = top - (height - boxSize) / 2
        w.rect(left, boxTop - boxSize, boxSize, boxSize, { border: PDF_COLORS.control, borderWidth: 0.7 })
      }
      return [{ rows, style: { topRule: PDF_COLORS.hair, padTop: 6, padBottom: 6, keepTogether: true } }]
    })
  const groups = sections.map((section, sectionIndex) => {
    const number = sectionIndex + 1
    const items = itemSpecs(number, nonEmpty(section.items))
    const headRows: Row[] = [
      ...w.textRows(`${number}. ${cleanText(section.title)}`, { size: 13, leading: 18, font: "semibold", color: PDF_COLORS.ink }, CONTENT_WIDTH),
      ...(cleanText(section.description)
        ? [w.spacer(2), ...w.textRows(section.description, { ...TYPE.small, color: PDF_COLORS.muted }, CONTENT_WIDTH)]
        : []),
    ]
    // 영역 제목 밑에는 문항 2개까지 같이 붙어 있어야 한다.
    const head: BlockSpec = { rows: headRows, style: { after: 8, keepWithNext: specsHeight(w, items.slice(0, 2)) } }
    return { head, items }
  })
  const intro = paragraphSpec(
    w,
    "각 문항은 현재 상태가 안정적이면 1점, 불안정하거나 확인이 필요하면 0점으로 표시하세요. 애매한 항목은 0점으로 두는 편이 실제 도입 검토에 더 도움이 됩니다.",
    { ...TYPE.small, color: PDF_COLORS.muted },
    12
  )

  // 제목 + 안내 + 첫 영역 제목 + 문항 3개가 들어가면 지금 쪽에서 시작한다.
  sectionHead(w, "04 / 체크리스트", "전체 점검 문항", specsHeight(w, [intro, groups[0].head, ...groups[0].items.slice(0, 3)]))
  drawSpec(w, intro)
  for (const group of groups) {
    drawSpec(w, group.head)
    for (const item of group.items) drawSpec(w, item)
    w.y -= 14
  }
  return true
}

function scoreBandSpec(w: PdfWriter, band: LeadMagnetScoreBand): BlockSpec {
  const rangeWidth = 92
  const innerWidth = CONTENT_WIDTH - 14 * 2
  const rightWidth = innerWidth - rangeWidth
  const rangeRows = w.textRows(band.range, { size: 11, leading: 16, font: "semibold", color: PDF_COLORS.green }, rangeWidth - 10)
  const rows: Row[] = [
    ...w.textRows(band.label, { size: 10.6, leading: 16, font: "semibold", color: PDF_COLORS.ink }, rightWidth, rangeWidth),
    ...w.textRows(band.description, { ...TYPE.small, color: PDF_COLORS.muted }, rightWidth, rangeWidth),
  ]
  rangeRows.forEach((rangeRow, index) => {
    if (rows[index]) rows[index].runs.push(...rangeRow.runs)
    else rows.push(rangeRow)
  })
  return {
    rows,
    style: { border: PDF_COLORS.hair, padX: 14, padTop: BOX_PAD_Y, padBottom: BOX_PAD_Y, after: 6, keepTogether: true },
  }
}

export function drawScoring(ctx: SectionContext) {
  const { w, magnet } = ctx
  const bands = (magnet.scoreBands ?? []).filter((band) => cleanText(band.range) && cleanText(band.label))
  const redFlags = nonEmpty(magnet.redFlags)
  if (bands.length === 0 && redFlags.length === 0) return false

  const bandSpecs = bands.map((band) => scoreBandSpec(w, band))
  sectionHead(w, "05 / 점수 해석", "총점보다 낮게 나온 영역을 먼저 보세요", specsHeight(w, bandSpecs.slice(0, 2)))
  for (const spec of bandSpecs) drawSpec(w, spec)
  if (redFlags.length > 0) {
    w.y -= 4
    noteBox(w, "재검토 신호", "", { items: redFlags, accent: PDF_COLORS.ink })
  }
  return true
}

export function drawActionPlan(ctx: SectionContext) {
  const { w, magnet } = ctx
  const steps = (magnet.actionPlan ?? []).filter((step) => cleanText(step.day) && cleanText(step.title))
  if (steps.length === 0) return false

  const stepSpecs = steps.map((step) => {
    const tasks = bulletSpecs(w, step.tasks)
    const headRows: Row[] = [
      ...w.textRows(step.day, { size: 8.8, leading: 13, font: "semibold", color: PDF_COLORS.green }, CONTENT_WIDTH),
      ...w.textRows(step.title, { ...TYPE.subheading, font: "semibold", color: PDF_COLORS.ink }, CONTENT_WIDTH),
    ]
    const head: BlockSpec = { rows: headRows, style: { after: 5, keepWithNext: specsHeight(w, tasks.slice(0, 2)) } }
    return { head, tasks }
  })
  sectionHead(w, "06 / 실행 플랜", "실행 플랜", specsHeight(w, [stepSpecs[0].head, ...stepSpecs[0].tasks.slice(0, 2)]))
  for (const step of stepSpecs) {
    drawSpec(w, step.head)
    for (const task of step.tasks) drawSpec(w, task)
    w.y -= 10
  }
  return true
}

export function drawLinks(ctx: SectionContext) {
  const { w, magnet, magnetsBySlug } = ctx
  const guide = magnet.pdfGuide

  const links: BlockSpec[] = []
  for (const relatedSlug of nonEmpty(guide?.relatedMagnets)) {
    const related = magnetsBySlug.get(relatedSlug)
    // 공개되지 않은 자료로 보내면 404 다 — 공개 자료만 잇는다.
    if (!related || !related.published || related.slug === magnet.slug) continue
    links.push(
      linkRowSpec(
        w,
        ctx,
        cleanText(related.title),
        `/resources/${relatedSlug}#download`,
        cleanText(related.pdfGuide?.outcome) || cleanText(related.summary)
      )
    )
  }
  for (const cta of guide?.consultationCtas ?? []) {
    if (!cleanText(cta.label) || !cleanText(cta.href)) continue
    links.push(linkRowSpec(w, ctx, cleanText(cta.label), cleanText(cta.href), cleanText(cta.description) || "ClassIn 상담 페이지로 이동합니다."))
  }
  if (links.length === 0) {
    links.push(linkRowSpec(w, ctx, "ClassIn 도입 상담 신청", "/contact#contact-form", "체크 결과를 바탕으로 쇼룸, 데모, 견적 확인 범위를 정리합니다."))
  }
  const intro = paragraphSpec(
    w,
    "이 PDF의 링크는 다음 판단에 필요한 자료와 상담 페이지로 연결됩니다. 체크 결과에 맞춰 추가 자료를 이어서 확인하세요.",
    { ...TYPE.small, color: PDF_COLORS.muted },
    12
  )

  sectionHead(w, "07 / 다음 단계", "관련 자료와 상담 링크", specsHeight(w, [intro, ...links.slice(0, 2)]))
  drawSpec(w, intro)
  for (const link of links) drawSpec(w, link)

  const sourceLinks = (magnet.sourceLinks ?? []).filter((link) => cleanText(link.label) && cleanText(link.href))
  if (sourceLinks.length > 0) {
    w.y -= 6
    subheading(w, "참고 링크")
    for (const link of sourceLinks) {
      linkRow(
        w,
        ctx,
        cleanText(link.label),
        cleanText(link.href),
        cleanText(link.description) || "자료 검토에 참고할 수 있는 외부 링크입니다."
      )
    }
  }
  return true
}
