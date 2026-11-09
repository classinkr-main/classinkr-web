// 리드마그넷 PDF 조판기 — 줄(Row)을 모은 블록(Block)을 쪽에 흘려 넣는다.
// scripts/generate-lead-magnet-pdfs.py 의 PdfDocument(ensure_space·text·note_box…)를 대신하며,
// 그 스크립트와 달리 블록이 한 쪽보다 길면 쪽을 넘겨 이어 그리고(넘침 없음),
// 절 제목은 밑에 본문이 붙을 자리가 없으면 다음 쪽으로 넘긴다(고아 제목 방지).
import "server-only"

import { PDFDocument, PDFHexString, type PDFFont, type PDFPage, rgb } from "pdf-lib"

import { toPdfUri } from "@/lib/lead-magnet-pdf/links"
import { cleanText, truncateToWidth, wrapText, type MeasureText } from "@/lib/lead-magnet-pdf/text"
import { CONTENT_WIDTH, PAGE, PDF_COLORS, TYPE, type Rgb } from "@/lib/lead-magnet-pdf/theme"

export type FontKey = "regular" | "semibold"

export interface TextStyle {
  font?: FontKey
  size: number
  leading: number
  color?: Rgb
}

export interface Run {
  text: string
  /** 블록 안쪽 왼쪽 기준 x. */
  x: number
  font: FontKey
  size: number
  color: Rgb
}

export interface RowDrawContext {
  page: PDFPage
  /** 줄 윗변 y. */
  top: number
  /** 블록 안쪽 왼쪽 x. */
  left: number
  width: number
  height: number
}

export interface Row {
  height: number
  runs: Run[]
  /** 체크 칸·인용 막대·기입 밑줄처럼 줄에 붙는 그림. */
  draw?: (ctx: RowDrawContext) => void
}

export interface BlockStyle {
  x?: number
  width?: number
  fill?: Rgb
  border?: Rgb
  /** 왼쪽 3pt 강조 막대. */
  accent?: Rgb
  /** 블록 윗변 헤어라인(목록 줄 구분). */
  topRule?: Rgb
  padX?: number
  padTop?: number
  padBottom?: number
  after?: number
  /** 블록 전체 영역을 누르면 여는 URL. 쪽을 넘기면 조각마다 건다. */
  link?: string
  /** 한 쪽 안에 들어가는 블록이면 쪼개지 않는다. */
  keepTogether?: boolean
  /** 블록 밑에 같은 쪽에 남아야 할 높이(제목 + 첫 본문). */
  keepWithNext?: number
  /** 쪼갤 때 한 조각의 최소 줄 수. */
  minRows?: number
}

export interface PdfWriterOptions {
  title: string
  footerNote: string
}

const RULE_WIDTH = 0.6

function toColor(value: Rgb) {
  return rgb(value[0], value[1], value[2])
}

function baselineOffset(size: number, height: number) {
  // 줄 높이 가운데에 한글 글자 몸통이 오도록 둔다.
  return height / 2 + size * 0.34
}

function isSpacer(row: Row) {
  return row.runs.length === 0 && !row.draw
}

export class PdfWriter {
  readonly doc: PDFDocument
  private readonly fonts: Record<FontKey, PDFFont>
  private readonly charsets: Record<FontKey, Set<number>>
  private readonly widthCache: Record<FontKey, Map<string, number>>
  private readonly options: PdfWriterOptions
  private readonly runningHeads: string[] = []
  private currentSection = ""
  private dividerEndY: number | null = null
  page: PDFPage
  y: number = PAGE.top

  constructor(doc: PDFDocument, fonts: Record<FontKey, PDFFont>, options: PdfWriterOptions) {
    this.doc = doc
    this.fonts = fonts
    this.options = options
    this.charsets = {
      regular: new Set(fonts.regular.getCharacterSet()),
      semibold: new Set(fonts.semibold.getCharacterSet()),
    }
    this.widthCache = { regular: new Map(), semibold: new Map() }
    this.page = this.addPage()
  }

  // ── 측정 ────────────────────────────────────────────────────────────────

  /** 글자별 폭 합. 렌더도 글자 → 글리프 cmap 직결(fonts.ts)이라 찍히는 폭과 같다. */
  measure(font: FontKey, size: number): MeasureText {
    const cache = this.widthCache[font]
    const pdfFont = this.fonts[font]
    return (text: string) => {
      let width = 0
      for (const char of text) {
        let charWidth = cache.get(char)
        if (charWidth === undefined) {
          charWidth = pdfFont.widthOfTextAtSize(char, 1)
          cache.set(char, charWidth)
        }
        width += charWidth
      }
      return width * size
    }
  }

  /** 글꼴에 없는 글자(이모지 등)는 □ 로 찍히지 않게 뺀다. */
  prepare(value: unknown, font: FontKey = "regular") {
    const charset = this.charsets[font]
    let out = ""
    for (const char of cleanText(value)) {
      const codePoint = char.codePointAt(0) ?? 0
      if (char === " " || charset.has(codePoint)) out += char
    }
    return out.replace(/\s+/g, " ").trim()
  }

  lines(value: unknown, style: TextStyle, width: number) {
    const font = style.font ?? "regular"
    return wrapText(this.prepare(value, font), this.measure(font, style.size), width)
  }

  /** 문단을 줄 목록으로. x 는 블록 안쪽 기준. */
  textRows(value: unknown, style: TextStyle, width: number, x = 0): Row[] {
    const font = style.font ?? "regular"
    const color = style.color ?? PDF_COLORS.body
    return this.lines(value, style, width).map((line) => ({
      height: style.leading,
      runs: [{ text: line, x, font, size: style.size, color }],
    }))
  }

  /** 머리표(번호·글머리)를 단 내어쓰기 문단. */
  hangingRows(
    prefix: string,
    value: unknown,
    style: TextStyle,
    width: number,
    options: { indent: number; prefixStyle?: Partial<TextStyle> & { font?: FontKey } }
  ): Row[] {
    const rows = this.textRows(value, style, width - options.indent, options.indent)
    if (rows.length === 0) return rows
    const prefixFont = options.prefixStyle?.font ?? style.font ?? "regular"
    rows[0].runs.unshift({
      text: this.prepare(prefix, prefixFont),
      x: 0,
      font: prefixFont,
      size: options.prefixStyle?.size ?? style.size,
      color: options.prefixStyle?.color ?? style.color ?? PDF_COLORS.body,
    })
    return rows
  }

  spacer(height: number): Row {
    return { height, runs: [] }
  }

  // ── 쪽 ──────────────────────────────────────────────────────────────────

  private addPage() {
    const page = this.doc.addPage([PAGE.width, PAGE.height])
    this.runningHeads.push(this.currentSection)
    this.y = PAGE.top
    return page
  }

  newPage() {
    this.page = this.addPage()
  }

  get atPageTop() {
    return this.y >= PAGE.top - 0.01
  }

  get available() {
    return this.y - PAGE.bottom
  }

  /** 머리글 오른쪽에 찍을 현재 절 이름. 새 쪽 맨 위에서 절이 시작하면 그 절로 바꾼다. */
  setSection(label: string) {
    this.currentSection = label
    if (this.atPageTop) this.runningHeads[this.runningHeads.length - 1] = label
  }

  /** 다음 쪽으로 넘길 만큼 자리가 없으면 넘긴다. */
  ensureSpace(height: number) {
    if (!this.atPageTop && this.available < height) this.newPage()
  }

  /** 절 사이 여백. 쪽 맨 위나 구분선 바로 뒤에서는 넣지 않는다. */
  sectionGap(gap: number) {
    if (this.atPageTop || this.y === this.dividerEndY) return
    this.y -= gap
  }

  /** 쪽 맨 위가 아니면 헤어라인 구분선을 긋는다(쪽 맨 위의 구분선은 의미가 없다). */
  divider(gap = 18) {
    if (this.atPageTop) return
    if (this.available < gap * 2 + 40) {
      this.newPage()
      return
    }
    this.y -= gap
    this.page.drawLine({
      start: { x: PAGE.marginX, y: this.y },
      end: { x: PAGE.width - PAGE.marginX, y: this.y },
      thickness: RULE_WIDTH,
      color: toColor(PDF_COLORS.hair),
    })
    this.y -= gap
    this.dividerEndY = this.y
  }

  /** 쪽 전체 바탕색(표지). */
  paintBackground(color: Rgb) {
    this.page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: toColor(color) })
  }

  rect(x: number, y: number, width: number, height: number, style: { fill?: Rgb; border?: Rgb; borderWidth?: number }) {
    this.page.drawRectangle({
      x,
      y,
      width,
      height,
      color: style.fill ? toColor(style.fill) : undefined,
      borderColor: style.border ? toColor(style.border) : undefined,
      borderWidth: style.border ? (style.borderWidth ?? RULE_WIDTH) : 0,
    })
  }

  line(page: PDFPage, x1: number, y1: number, x2: number, y2: number, color: Rgb, thickness = RULE_WIDTH) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: toColor(color) })
  }

  // ── 블록 ────────────────────────────────────────────────────────────────

  blockHeight(rows: readonly Row[], style: BlockStyle = {}) {
    return (style.padTop ?? 0) + rows.reduce((sum, row) => sum + row.height, 0) + (style.padBottom ?? 0)
  }

  /** 줄 묶음을 그린다. 한 쪽에 안 들어가면 줄 단위로 쪼개 다음 쪽에 이어 그린다. */
  block(rows: readonly Row[], style: BlockStyle = {}) {
    let remaining = rows.filter((row, index) => !(index === 0 && isSpacer(row)))
    if (remaining.length === 0) return
    const padTop = style.padTop ?? 0
    const padBottom = style.padBottom ?? 0
    const fullPage = PAGE.top - PAGE.bottom
    const total = this.blockHeight(remaining, style)
    const keepWithNext = style.keepWithNext ?? 0

    // 통째로 둘 블록(짧은 상자·제목)은 자리가 모자라면 다음 쪽으로 넘긴다.
    // 새 쪽에도 안 들어가는 긴 블록만 아래에서 줄 단위로 쪼갠다.
    const wantsWhole = style.keepTogether || keepWithNext > 0
    if (wantsWhole && !this.atPageTop && total + keepWithNext > this.available && total + keepWithNext <= fullPage) {
      this.newPage()
    }

    const minRows = Math.max(1, style.minRows ?? 2)
    while (remaining.length > 0) {
      let count = this.rowsThatFit(remaining, style)
      if (count < Math.min(minRows, remaining.length) && !this.atPageTop) {
        this.newPage()
        continue
      }
      if (count === 0) count = 1
      // 끝 조각이 minRows 보다 짧게 남으면(과부 줄) 앞 조각에서 줄을 넘겨 준다.
      const left = remaining.length - count
      if (left > 0 && left < minRows && count - (minRows - left) >= minRows) count -= minRows - left
      this.drawChunk(remaining.slice(0, count), style, padTop, padBottom)
      remaining = remaining.slice(count)
      while (remaining.length > 0 && isSpacer(remaining[0])) remaining = remaining.slice(1)
      if (remaining.length > 0) this.newPage()
    }
    this.y -= style.after ?? 0
  }

  private rowsThatFit(rows: readonly Row[], style: BlockStyle) {
    let height = (style.padTop ?? 0) + (style.padBottom ?? 0)
    let count = 0
    for (const row of rows) {
      if (height + row.height > this.available) break
      height += row.height
      count += 1
    }
    return count
  }

  private drawChunk(rows: readonly Row[], style: BlockStyle, padTop: number, padBottom: number, fixedHeight?: number) {
    const x = style.x ?? PAGE.marginX
    const width = style.width ?? CONTENT_WIDTH
    const padX = style.padX ?? 0
    const top = this.y
    const height = fixedHeight ?? padTop + rows.reduce((sum, row) => sum + row.height, 0) + padBottom
    const page = this.page

    if (style.fill || style.border) {
      this.rect(x, top - height, width, height, { fill: style.fill, border: style.border })
    }
    if (style.accent) this.rect(x, top - height, 3, height, { fill: style.accent })
    if (style.topRule) this.line(page, x, top, x + width, top, style.topRule)

    let rowTop = top - padTop
    const left = x + padX
    const innerWidth = width - padX * 2
    for (const row of rows) {
      for (const run of row.runs) {
        this.textAt(page, run.text, left + run.x, rowTop - baselineOffset(run.size, row.height), run)
      }
      row.draw?.({ page, top: rowTop, left, width: innerWidth, height: row.height })
      rowTop -= row.height
    }

    if (style.link) this.addLink(page, [x, top - height, x + width, top], style.link)
    this.y = top - height
  }

  /** 같은 높이의 상자를 가로로 나란히(표지 요약 칸). 쪼개지 않는다. */
  columns(columns: readonly (readonly Row[])[], style: BlockStyle & { gap: number }) {
    if (columns.length === 0) return
    const colWidth = this.columnWidth(columns.length, style.gap)
    const padTop = style.padTop ?? 0
    const padBottom = style.padBottom ?? 0
    const height = Math.max(...columns.map((rows) => this.blockHeight(rows, style)))
    this.ensureSpace(height)
    const top = this.y
    columns.forEach((rows, index) => {
      this.y = top
      const x = PAGE.marginX + (colWidth + style.gap) * index
      this.drawChunk(rows, { ...style, x, width: colWidth, link: undefined }, padTop, padBottom, height)
    })
    this.y = top - height - (style.after ?? 0)
  }

  columnWidth(count: number, gap: number) {
    return (CONTENT_WIDTH - gap * (count - 1)) / count
  }

  /** 글자를 기준선(baseline) 위치에 찍는다. 표처럼 줄 모형에 안 맞는 자리에서 쓴다. */
  textAt(page: PDFPage, text: string, x: number, baseline: number, style: { font: FontKey; size: number; color: Rgb }) {
    if (!text) return
    page.drawText(text, {
      x,
      y: baseline,
      size: style.size,
      font: this.fonts[style.font],
      color: toColor(style.color),
    })
  }

  /** 줄 높이 안에서 글자 기준선 위치. */
  baseline(top: number, size: number, leading: number) {
    return top - baselineOffset(size, leading)
  }

  /** 문단 하나(블록 없이). */
  paragraph(value: unknown, style: TextStyle, options: { after?: number; width?: number; keepWithNext?: number } = {}) {
    const rows = this.textRows(value, style, options.width ?? CONTENT_WIDTH)
    // 4줄 이하 짧은 문단은 쪼개지 않는다.
    this.block(rows, {
      after: options.after ?? 7,
      keepTogether: rows.length <= 4,
      keepWithNext: options.keepWithNext,
    })
  }

  // ── 링크 ────────────────────────────────────────────────────────────────

  addLink(page: PDFPage, rect: [number, number, number, number], url: string) {
    const uri = toPdfUri(url)
    const hex = Array.from(uri, (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    const context = this.doc.context
    const annotation = context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: rect,
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFHexString.of(hex) },
    })
    page.node.addAnnot(context.register(annotation))
  }

  // ── 머리글·바닥글 ──────────────────────────────────────────────────────

  /** 모든 쪽에 머리글(표지 제외)·바닥글을 찍는다. 전체 쪽수를 알아야 해서 마지막에 한 번 부른다. */
  finalize() {
    const pages = this.doc.getPages()
    const total = pages.length
    const folio = { font: "regular" as const, size: TYPE.folio.size }
    const measureFolio = this.measure(folio.font, folio.size)
    const contentRight = PAGE.width - PAGE.marginX

    pages.forEach((page, index) => {
      const draw = (text: string, x: number, y: number, color: Rgb = PDF_COLORS.muted) => {
        if (!text) return
        page.drawText(text, { x, y, size: folio.size, font: this.fonts[folio.font], color: toColor(color) })
      }

      if (index > 0) {
        const section = this.prepare(this.runningHeads[index] ?? "")
        const sectionWidth = section ? Math.min(measureFolio(section), CONTENT_WIDTH * 0.4) : 0
        const titleWidth = CONTENT_WIDTH - sectionWidth - (section ? 24 : 0)
        const title = truncateToWidth(this.prepare(this.options.title), measureFolio, titleWidth)
        const sectionText = truncateToWidth(section, measureFolio, CONTENT_WIDTH * 0.4)
        draw(title, PAGE.marginX, PAGE.headerBaseline)
        draw(sectionText, contentRight - measureFolio(sectionText), PAGE.headerBaseline)
        this.line(page, PAGE.marginX, PAGE.headerRule, contentRight, PAGE.headerRule, PDF_COLORS.hair)
      }

      this.line(page, PAGE.marginX, PAGE.footerRule, contentRight, PAGE.footerRule, PDF_COLORS.hair)
      draw(truncateToWidth(this.prepare(this.options.footerNote), measureFolio, CONTENT_WIDTH * 0.75), PAGE.marginX, PAGE.footerBaseline)
      const number = `${index + 1} / ${total}`
      draw(number, contentRight - measureFolio(number), PAGE.footerBaseline, PDF_COLORS.body)
    })
  }
}
