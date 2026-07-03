#!/usr/bin/env node
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, posix, resolve } from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { inflateRawSync } from "node:zlib"

const require = createRequire(import.meta.url)
const Papa = require("papaparse")
const { createClient } = require("@supabase/supabase-js")

const DEFAULT_FY = 2026
const PARSER_VERSION = "sales-ledger-import-v1"
const TAB_KEYS = ["dsh", "rev", "kpi"]
const KPI_METRICS = ["Lead", "Acc.", "opp.", "Sol.", "Visit"]
const REV_SHEET_NAME = "2. REV"
const XLSX_EXT_RE = /\.(xlsx|xlsm)$/i
const XLS_EXT_RE = /\.xls$/i
const THEME_COLOR_NAMES = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]
const INDEXED_COLORS = {
  2: "FF0000",
  3: "00FF00",
  4: "0000FF",
  8: "000000",
  9: "FFFFFF",
  10: "FF0000",
  11: "00FF00",
  12: "0000FF",
  13: "FFFF00",
  14: "FF00FF",
  15: "00FFFF",
}

function parseArgs(argv) {
  const args = {
    fy: DEFAULT_FY,
    dryRun: true,
    commit: false,
    out: null,
    actor: process.env.USERNAME || process.env.USER || "codex",
    sourceName: "FY26-27 Sales Ledger - Korea v1",
    files: {},
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === "--commit") {
      args.commit = true
      args.dryRun = false
    } else if (arg === "--dry-run") {
      args.commit = false
      args.dryRun = true
    } else if (arg === "--fy" && next) {
      args.fy = Number(next)
      i += 1
    } else if (arg === "--out" && next) {
      args.out = next
      i += 1
    } else if (arg === "--actor" && next) {
      args.actor = next
      i += 1
    } else if (arg === "--source-name" && next) {
      args.sourceName = next
      i += 1
    } else if ((arg === "--dsh" || arg === "--rev" || arg === "--kpi") && next) {
      args.files[arg.slice(2)] = resolve(next)
      i += 1
    } else if (arg === "--rev-xlsx" && next) {
      args.files.rev = resolve(next)
      i += 1
    } else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`)
    }
  }

  if (!Number.isInteger(args.fy) || args.fy < 2020 || args.fy > 2100) {
    throw new Error("--fy must be an integer fiscal year")
  }

  for (const tab of TAB_KEYS) {
    if (!args.files[tab]) args.files[tab] = findDefaultFile(tab)
    if (!args.files[tab] || !existsSync(args.files[tab])) {
      throw new Error(`Missing ${tab.toUpperCase()} source file. Pass --${tab} <path>.`)
    }
  }

  return args
}

function printHelp() {
  console.log(`
Usage:
  node scripts/import-sales-ledger-files.mjs --dry-run --out .tmp/sales-ledger-import-preview.json
  node scripts/import-sales-ledger-files.mjs --commit --actor "Admin Name"

Options:
  --dsh <path>          CSV export for tab "1. DSH"
  --rev <path>          CSV export for tab "2. REV" or the source XLSX workbook
  --rev-xlsx <path>     XLSX workbook for color-aware tab "2. REV" import
  --kpi <path>          CSV export for tab "3. KPI"
  --fy <year>           Fiscal year start, default ${DEFAULT_FY}
  --out <path>          Write normalized import payload JSON
  --commit              Insert into Supabase DB tables from the 20260701 migration
  --dry-run             Parse and validate only. This is the default.
`)
}

function findDefaultFile(tab) {
  const downloads = join(homedir(), "Downloads")
  if (!existsSync(downloads)) return null
  const marker = tab === "dsh" ? "1. DSH.csv" : tab === "rev" ? "2. REV.csv" : "3. KPI.csv"
  const match = readdirSync(downloads)
    .filter((name) => name.includes("Sales Ledger") && name.endsWith(marker))
    .sort()
    .pop()
  if (match) return join(downloads, match)
  if (tab !== "rev") return null
  const workbook = readdirSync(downloads)
    .filter((name) => name.includes("Sales Ledger") && XLSX_EXT_RE.test(name))
    .sort()
    .pop()
  return workbook ? join(downloads, workbook) : null
}

function sha256(bufferOrText) {
  return createHash("sha256").update(bufferOrText).digest("hex")
}

function parseCsvFile(path) {
  const buffer = readFileSync(path)
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "")
  const parsed = Papa.parse(text, {
    skipEmptyLines: false,
  })
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]
    throw new Error(`CSV parse error in ${path}: ${first.message}`)
  }
  return {
    path,
    sha256: sha256(buffer),
    rows: parsed.data.map((row) => row.map((cell) => String(cell ?? "").trim())),
  }
}

function parseSourceFile(tab, path) {
  if (XLSX_EXT_RE.test(path)) {
    if (tab !== "rev") {
      throw new Error(`${tab.toUpperCase()} XLSX import is not supported. Export that tab as CSV.`)
    }
    return parseRevXlsxFile(path)
  }
  if (XLS_EXT_RE.test(path)) {
    throw new Error("Legacy .xls files are not supported. Export CSV or XLSX instead.")
  }
  return parseCsvFile(path)
}

function parseRevXlsxFile(path) {
  const buffer = readFileSync(path)
  const entries = readZipEntries(buffer)
  const workbookXml = zipText(entries, "xl/workbook.xml")
  const workbookRelsXml = zipText(entries, "xl/_rels/workbook.xml.rels")
  const sheets = parseWorkbookSheets(workbookXml)
  const relationships = parseRelationships(workbookRelsXml)
  const revSheet = sheets.find((sheet) => sheet.name.trim().toLowerCase() === REV_SHEET_NAME.toLowerCase()) ??
    sheets.find((sheet) => sheet.name.toLowerCase().includes("rev"))

  if (!revSheet) {
    throw new Error(`XLSX parse error in ${path}: worksheet "${REV_SHEET_NAME}" was not found.`)
  }

  const target = relationships.get(revSheet.relId)
  if (!target) {
    throw new Error(`XLSX parse error in ${path}: worksheet relationship ${revSheet.relId} was not found.`)
  }

  const sheetPath = resolveXlsxTarget("xl", target)
  const worksheetXml = zipText(entries, sheetPath)
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml")?.toString("utf8") ?? "")
  const styles = parseXlsxStyles(
    entries.get("xl/styles.xml")?.toString("utf8") ?? "",
    entries.get("xl/theme/theme1.xml")?.toString("utf8") ?? "",
  )
  const worksheet = parseXlsxWorksheet(worksheetXml, sharedStrings, styles)

  return {
    path,
    sha256: sha256(buffer),
    sourceFormat: "xlsx",
    sheetName: revSheet.name,
    rows: worksheet.rows,
    cellFormats: worksheet.cellFormats,
  }
}

function readZipEntries(buffer) {
  let eocdOffset = -1
  const minOffset = Math.max(0, buffer.length - 0xffff - 22)
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset
      break
    }
  }

  if (eocdOffset < 0) throw new Error("XLSX parse error: ZIP end-of-central-directory was not found.")

  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  let directoryOffset = buffer.readUInt32LE(eocdOffset + 16)
  const entries = new Map()

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(directoryOffset) !== 0x02014b50) {
      throw new Error("XLSX parse error: invalid ZIP central directory.")
    }

    const flags = buffer.readUInt16LE(directoryOffset + 8)
    const method = buffer.readUInt16LE(directoryOffset + 10)
    const compressedSize = buffer.readUInt32LE(directoryOffset + 20)
    const fileNameLength = buffer.readUInt16LE(directoryOffset + 28)
    const extraLength = buffer.readUInt16LE(directoryOffset + 30)
    const commentLength = buffer.readUInt16LE(directoryOffset + 32)
    const localHeaderOffset = buffer.readUInt32LE(directoryOffset + 42)
    const fileName = buffer.toString("utf8", directoryOffset + 46, directoryOffset + 46 + fileNameLength)

    if ((flags & 0x1) !== 0) throw new Error(`XLSX parse error: encrypted ZIP entry is not supported (${fileName}).`)
    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`XLSX parse error: invalid local ZIP header for ${fileName}.`)
    }

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    let data
    if (method === 0) data = Buffer.from(compressed)
    else if (method === 8) data = inflateRawSync(compressed)
    else throw new Error(`XLSX parse error: unsupported ZIP compression method ${method} for ${fileName}.`)

    entries.set(normalizeZipPath(fileName), data)
    directoryOffset += 46 + fileNameLength + extraLength + commentLength
  }

  return entries
}

function zipText(entries, path) {
  const buffer = entries.get(normalizeZipPath(path))
  if (!buffer) throw new Error(`XLSX parse error: missing ${path}.`)
  return buffer.toString("utf8")
}

function normalizeZipPath(path) {
  return String(path).replace(/\\/g, "/").replace(/^\/+/, "")
}

function resolveXlsxTarget(baseDir, target) {
  if (target.startsWith("/")) return normalizeZipPath(target)
  return normalizeZipPath(posix.normalize(posix.join(baseDir, target)))
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function xmlAttr(tag, name) {
  const match = String(tag).match(new RegExp(`(?:^|\\s)${escapeRegExp(name)}="([^"]*)"`))
  return match ? decodeXml(match[1]) : null
}

function xmlSection(xml, name) {
  const match = xml.match(new RegExp(`<${escapeRegExp(name)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(name)}>`, "i"))
  return match ? match[1] : ""
}

function xmlElementTags(xml, name) {
  const escaped = escapeRegExp(name)
  return [...xml.matchAll(new RegExp(`<${escaped}\\b[^>]*\\/>|<${escaped}\\b[^>]*>[\\s\\S]*?<\\/${escaped}>`, "gi"))]
    .map((match) => match[0])
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function parseWorkbookSheets(workbookXml) {
  return [...workbookXml.matchAll(/<sheet\b[^>]*(?:\/>|>[\s\S]*?<\/sheet>)/gi)]
    .map((match) => ({
      name: xmlAttr(match[0], "name") ?? "",
      relId: xmlAttr(match[0], "r:id") ?? "",
    }))
    .filter((sheet) => sheet.name && sheet.relId)
}

function parseRelationships(relsXml) {
  const relationships = new Map()
  for (const tag of xmlElementTags(relsXml, "Relationship")) {
    const id = xmlAttr(tag, "Id")
    const target = xmlAttr(tag, "Target")
    if (id && target) relationships.set(id, target)
  }
  return relationships
}

function parseSharedStrings(sharedStringsXml) {
  if (!sharedStringsXml) return []
  return xmlElementTags(sharedStringsXml, "si").map((tag) => (
    [...tag.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
      .map((match) => decodeXml(match[1]))
      .join("")
  ))
}

function parseXlsxStyles(stylesXml, themeXml) {
  const themeColors = parseThemeColors(themeXml)
  const fonts = xmlElementTags(xmlSection(stylesXml, "fonts"), "font").map((font) => (
    parseXlsxColorTag(font.match(/<color\b[^>]*\/>/i)?.[0] ?? "", themeColors)
  ))
  const fills = xmlElementTags(xmlSection(stylesXml, "fills"), "fill").map((fill) => (
    parseXlsxColorTag(
      fill.match(/<fgColor\b[^>]*\/>/i)?.[0] ?? fill.match(/<bgColor\b[^>]*\/>/i)?.[0] ?? "",
      themeColors,
    )
  ))
  const cellFormats = xmlElementTags(xmlSection(stylesXml, "cellXfs"), "xf").map((xf, index) => {
    const fontId = Number(xmlAttr(xf, "fontId") ?? 0)
    const fillId = Number(xmlAttr(xf, "fillId") ?? 0)
    return {
      styleId: index,
      fg: fonts[fontId] ?? null,
      bg: fills[fillId] ?? null,
    }
  })

  return { cellFormats: cellFormats.length > 0 ? cellFormats : [{ styleId: 0, fg: null, bg: null }] }
}

function parseThemeColors(themeXml) {
  if (!themeXml) return []
  return THEME_COLOR_NAMES.map((name) => {
    const escaped = escapeRegExp(name)
    const section = themeXml.match(new RegExp(`<(?:\\w+:)?${escaped}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${escaped}>`, "i"))?.[0] ?? ""
    const srgb = section.match(/<(?:\w+:)?srgbClr\b[^>]*\bval="([^"]*)"/i)?.[1]
    const sys = section.match(/<(?:\w+:)?sysClr\b[^>]*\blastClr="([^"]*)"/i)?.[1]
    return normalizeHexColor(srgb ?? sys)
  })
}

function parseXlsxColorTag(colorTag, themeColors) {
  if (!colorTag) return null
  const rgb = normalizeHexColor(xmlAttr(colorTag, "rgb"))
  const theme = xmlAttr(colorTag, "theme")
  const indexed = xmlAttr(colorTag, "indexed")
  const tint = Number(xmlAttr(colorTag, "tint") ?? 0)
  let hex = rgb
  if (!hex && theme != null) hex = themeColors[Number(theme)] ?? null
  if (!hex && indexed != null) hex = INDEXED_COLORS[Number(indexed)] ?? null
  if (!hex) return null
  if (Number.isFinite(tint) && tint !== 0) hex = applyColorTint(hex, tint)
  return hexToCellColor(hex)
}

function normalizeHexColor(value) {
  if (!value) return null
  const hex = String(value).replace(/[^0-9a-f]/gi, "").toUpperCase()
  return hex.length >= 6 ? hex.slice(-6) : null
}

function applyColorTint(hex, tint) {
  const color = hexToRgb(hex)
  if (!color) return hex
  const channels = [color.red, color.green, color.blue].map((channel) => {
    if (tint < 0) return Math.round(channel * (1 + tint))
    return Math.round(channel * (1 - tint) + 255 * tint)
  })
  return channels.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0")).join("").toUpperCase()
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return null
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function hexToCellColor(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return {
    red: rgb.red / 255,
    green: rgb.green / 255,
    blue: rgb.blue / 255,
  }
}

function parseXlsxWorksheet(worksheetXml, sharedStrings, styles) {
  const rows = []
  const cellFormats = []
  const formatByStyleId = styles.cellFormats

  for (const rowMatch of worksheetXml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/gi)) {
    const rowIndex = Number(rowMatch[1]) - 1
    rows[rowIndex] = rows[rowIndex] ?? []
    cellFormats[rowIndex] = cellFormats[rowIndex] ?? []

    for (const cellMatch of rowMatch[2].matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/gi)) {
      const { col } = cellRefToIndexes(cellMatch[1])
      const cellTag = cellMatch[0]
      const styleId = Number(xmlAttr(cellTag, "s") ?? 0)
      cellFormats[rowIndex][col] = formatByStyleId[styleId] ?? formatByStyleId[0] ?? null
      const value = parseXlsxCellValue(cellTag, sharedStrings)
      if (value != null) rows[rowIndex][col] = normalizeXlsxCellValue(value)
    }
  }

  return { rows, cellFormats }
}

function cellRefToIndexes(ref) {
  const match = String(ref).match(/^([A-Z]+)(\d+)$/i)
  if (!match) return { row: -1, col: -1 }
  let col = 0
  for (const char of match[1].toUpperCase()) {
    col = col * 26 + char.charCodeAt(0) - 64
  }
  return { row: Number(match[2]) - 1, col: col - 1 }
}

function parseXlsxCellValue(cellTag, sharedStrings) {
  const type = xmlAttr(cellTag, "t")
  if (type === "inlineStr") {
    return [...cellTag.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((match) => decodeXml(match[1])).join("")
  }

  const value = cellTag.match(/<v>([\s\S]*?)<\/v>/i)?.[1]
  if (value == null) return null
  if (type === "s") return sharedStrings[Number(value)] ?? ""
  if (type === "b") return value === "1" ? "TRUE" : "FALSE"
  return decodeXml(value)
}

function normalizeXlsxCellValue(value) {
  const text = String(value ?? "").trim()
  if (/^-?\d+\.0+$/.test(text)) return String(Math.trunc(Number(text)))
  return text
}

function parseNumber(value) {
  if (value == null) return 0
  const text = String(value).trim()
  if (!text || text === "-") return 0
  const cleaned = text.replace(/[^\d.-]/g, "")
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0
  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? numeric : 0
}

function normalizeText(value) {
  const text = String(value ?? "").trim()
  return text.length > 0 ? text : null
}

function isRedBg(bg) {
  if (!bg) return false
  return (bg.red ?? 0) >= 0.85 && (bg.green ?? 0) < 0.5 && (bg.blue ?? 0) < 0.5
}

function isRedText(fg) {
  if (!fg) return false
  return (fg.red ?? 0) >= 0.75 && (fg.green ?? 0) <= 0.3 && (fg.blue ?? 0) <= 0.3
}

function isBlueText(fg) {
  if (!fg) return false
  const red = fg.red ?? 0
  const green = fg.green ?? 0
  const blue = fg.blue ?? 0
  return blue >= 0.5 && blue - red >= 0.25 && blue - green >= 0.15
}

function revCellConfidence(cellFormats, rowIndex, colIndex, fallback) {
  if (!cellFormats) return fallback
  const format = cellFormats[rowIndex]?.[colIndex]
  if (isRedText(format?.fg) || isRedBg(format?.bg)) return "confirmed"
  if (isBlueText(format?.fg)) return "high_confidence"
  return "expected"
}

function monthKeyFromHeader(value, fy) {
  const raw = String(value ?? "").trim()
  const match = raw.match(/^([1-9]|1[0-2])$/)
  if (!match) return null
  const month = Number(match[1])
  const year = month >= 4 ? fy : fy + 1
  return `${year}-${String(month).padStart(2, "0")}`
}

function rowHash(parts) {
  return sha256(parts.map((part) => String(part ?? "")).join("\u001f")).slice(0, 32)
}

function parseDsh(rows, fy) {
  const headers = rows[0] ?? []
  const monthColumns = []
  for (let col = 10; col < headers.length; col += 1) {
    const month = monthKeyFromHeader(headers[col], fy)
    if (month) monthColumns.push({ col, month })
  }

  const dshRows = []
  const validations = []
  let currentTeam = null
  let currentKind = null
  let previousCategory = null
  let previousStatusType = null

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    const sourceRow = index + 1
    const teamLabel = normalizeText(row[0])
    const section = normalizeText(row[1])
    const sectionLower = String(section ?? "").toLowerCase()

    if (teamLabel) currentTeam = teamLabel
    if (["goal", "status", "rate", "gap"].includes(sectionLower)) currentKind = sectionLower
    else if (sectionLower && !["software", "hardware", "new", "renew", "direct", "channel", "total"].includes(sectionLower)) {
      currentKind = null
    }

    if (!currentKind) continue

    const category = normalizeText(row[2]) ?? previousCategory
    const statusType = normalizeText(row[3]) ?? previousStatusType
    const channel = normalizeText(row[4])
    if (normalizeText(row[2])) previousCategory = normalizeText(row[2])
    if (normalizeText(row[3])) previousStatusType = normalizeText(row[3])

    const months = Object.fromEntries(monthColumns.map(({ col, month }) => [month, parseNumber(row[col])]))
    const annual = parseNumber(row[5])
    const q1 = parseNumber(row[6])
    const q2 = parseNumber(row[7])
    const q3 = parseNumber(row[8])
    const q4 = parseNumber(row[9])
    const numericTotal = Math.abs(annual) + Math.abs(q1) + Math.abs(q2) + Math.abs(q3) + Math.abs(q4) +
      Object.values(months).reduce((sum, value) => sum + Math.abs(value), 0)
    if (numericTotal === 0) continue

    const isBreakdown = Boolean(category && statusType && channel)
    const member = !isBreakdown && row[3] && ["goal", "status", "rate", "gap"].includes(String(row[4] ?? "").toLowerCase())
      ? normalizeText(row[3])
      : null

    dshRows.push({
      fiscal_year: fy,
      row_level: isBreakdown ? "breakdown" : member ? "member" : currentTeam ? "team" : "summary",
      row_kind: currentKind,
      team: currentTeam,
      member,
      category: isBreakdown ? category : null,
      status_type: isBreakdown ? statusType : null,
      channel: isBreakdown ? channel : null,
      annual,
      q1,
      q2,
      q3,
      q4,
      months,
      source_row: sourceRow,
      source_labels: { a: row[0] ?? "", b: row[1] ?? "", c: row[2] ?? "", d: row[3] ?? "", e: row[4] ?? "" },
      raw: { row },
    })
  }

  if (dshRows.length === 0) {
    validations.push(validation("dsh", "error", "no_dsh_rows", "No numeric DSH rows were parsed."))
  }

  return { rows: dshRows, validations }
}

function parseRev(rows, fy, options = {}) {
  const cellFormats = options.cellFormats ?? null
  const defaultConfidence = cellFormats ? "expected" : "format_unavailable"
  const headerIndex = rows.findIndex((row) => String(row?.[0] ?? "").trim().toLowerCase() === "account")
  if (headerIndex < 0) {
    return {
      lines: [],
      periodEntries: [],
      validations: [validation("rev", "error", "rev_header_missing", "REV header row with Account was not found.")],
    }
  }

  const headers = rows[headerIndex]
  const monthBlocks = []
  for (let col = 13; col < headers.length; col += 1) {
    const month = monthKeyFromHeader(headers[col], fy)
    if (month) {
      monthBlocks.push({ month, totalCol: col, weekCols: [] })
    } else if (/^(w\d|\dw)$/i.test(headers[col] ?? "") && monthBlocks.length > 0) {
      monthBlocks[monthBlocks.length - 1].weekCols.push({ col, label: headers[col] })
    }
  }

  const lines = []
  const periodEntries = []
  const validations = []

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    const account = normalizeText(row[0])
    if (!account) continue
    const sourceRow = index + 1
    const totalAmount = parseNumber(row[12])
    const sourceRecordKey = rowHash([
      account,
      row[5],
      row[6],
      row[7],
      row[8],
      sourceRow,
      totalAmount,
    ])
    const line = {
      fiscal_year: fy,
      source_row: sourceRow,
      source_record_key: sourceRecordKey,
      account_name: account,
      branch_contact: normalizeText(row[1]),
      location: normalizeText(row[2]),
      scale: normalizeText(row[3]),
      importance: normalizeText(row[4]),
      team: normalizeText(row[5]),
      manager: normalizeText(row[6]),
      status: normalizeText(row[7]),
      deal_type: normalizeText(row[8]),
      product: normalizeText(row[9]),
      first_payment: parseDate(row[10]),
      remark: normalizeText(row[11]),
      total_amount: totalAmount,
      raw: { row },
    }
    lines.push(line)

    for (const block of monthBlocks) {
      const total = parseNumber(row[block.totalCol])
      const totalConfidence = revCellConfidence(cellFormats, index, block.totalCol, defaultConfidence)
      let weekEntries = block.weekCols
        .map(({ col, label }) => ({
          amount: parseNumber(row[col]),
          confidence: revCellConfidence(cellFormats, index, col, defaultConfidence),
          source_week: label,
          source_col: columnName(col + 1),
        }))
        .filter((entry) => entry.amount !== 0)
      const hasWeekColorConfidence = weekEntries.some((entry) => entry.confidence !== defaultConfidence)
      if (cellFormats && weekEntries.length > 0 && !hasWeekColorConfidence && totalConfidence !== defaultConfidence) {
        weekEntries = weekEntries.map((entry) => ({ ...entry, confidence: totalConfidence }))
      }
      const weekSum = weekEntries.reduce((sum, entry) => sum + entry.amount, 0)

      if (weekEntries.length > 0) {
        for (const entry of weekEntries) {
          periodEntries.push({
            source_record_key: sourceRecordKey,
            fiscal_year: fy,
            period_month: block.month,
            amount: entry.amount,
            confidence: entry.confidence,
            source_week: entry.source_week,
            source_col: entry.source_col,
            source_row: sourceRow,
            raw: { account, total, weekSum },
          })
        }
        if (total !== 0 && Math.abs(total - weekSum) > 1) {
          validations.push(validation("rev", "warning", "month_week_mismatch", `Month total differs from week sum for ${account} ${block.month}.`, sourceRow, columnName(block.totalCol + 1), { total, weekSum }))
        }
      } else if (total !== 0) {
        periodEntries.push({
          source_record_key: sourceRecordKey,
          fiscal_year: fy,
          period_month: block.month,
          amount: total,
          confidence: totalConfidence,
          source_week: null,
          source_col: columnName(block.totalCol + 1),
          source_row: sourceRow,
          raw: { account, total },
        })
      }
    }
  }

  if (lines.length === 0) validations.push(validation("rev", "error", "no_rev_lines", "No REV account rows were parsed."))
  if (!cellFormats) {
    validations.push(validation("rev", "info", "csv_format_notice", "CSV does not preserve text/background colors; REV certainty is marked format_unavailable."))
  }
  return { lines, periodEntries, validations }
}

function parseKpi(rows, fy) {
  const blockStarts = []
  for (let col = 0; col < (rows[0] ?? []).length; col += 1) {
    const label = String(rows[0][col] ?? "").trim().toLowerCase()
    if (["goal", "status", "gap", "achievement"].includes(label)) blockStarts.push({ col, kind: label })
  }

  const kpiRows = []
  const validations = []

  for (const block of blockStarts) {
    let periodKey = "FY26-27"
    let periodMonth = null
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index] ?? []
      const first = normalizeText(row[block.col])
      if (!first) continue
      const month = monthKeyFromHeader(first, fy)
      if (month) {
        periodKey = month
        periodMonth = month
        continue
      }
      if (/^fy/i.test(first)) {
        periodKey = first
        periodMonth = null
        continue
      }
      if (first.toLowerCase() === "sum") continue

      const metricValues = {
        lead: parseKpiMetric(row[block.col + 4], block.kind),
        acc: parseKpiMetric(row[block.col + 5], block.kind),
        opp: parseKpiMetric(row[block.col + 6], block.kind),
        sol: parseKpiMetric(row[block.col + 7], block.kind),
        visit: parseKpiMetric(row[block.col + 8], block.kind),
      }

      kpiRows.push({
        fiscal_year: fy,
        period_key: periodKey,
        period_month: periodMonth,
        row_kind: block.kind,
        team: null,
        member: first,
        revenue_sum: parseNumber(row[block.col + 1]),
        new_revenue: parseNumber(row[block.col + 2]),
        renewal_revenue: parseNumber(row[block.col + 3]),
        metrics: metricValues,
        source_row: index + 1,
        source_labels: { block: block.kind, start_col: columnName(block.col + 1), metric_headers: KPI_METRICS },
        raw: { row: row.slice(block.col, block.col + 9) },
      })
    }
  }

  if (kpiRows.length === 0) validations.push(validation("kpi", "error", "no_kpi_rows", "No KPI rows were parsed."))
  return { rows: kpiRows, validations }
}

function parseKpiMetric(value, rowKind) {
  if (rowKind === "achievement") {
    const text = normalizeText(value)
    return text ?? null
  }
  return parseNumber(value)
}

function parseDate(value) {
  const text = normalizeText(value)
  if (!text || text === "-") return null
  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  const serial = Number(text)
  if (/^\d+(?:\.\d+)?$/.test(text) && Number.isFinite(serial) && serial >= 20000 && serial <= 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 24 * 60 * 60 * 1000)
    return date.toISOString().slice(0, 10)
  }
  if (!match) return null
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
}

function columnName(index) {
  let n = index
  let name = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    name = String.fromCharCode(65 + rem) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

function validation(tab_key, severity, issue_code, message, source_row = null, source_col = null, metadata = {}) {
  return { tab_key, severity, issue_code, message, source_row, source_col, metadata }
}

function loadEnvFile(path = ".env.local") {
  if (!existsSync(path)) return
  const text = readFileSync(path, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = trimmed.match(/^([^=]+)=(.*)$/)
    if (!match) continue
    const key = match[1].trim()
    const value = match[2].trim().replace(/^['"]|['"]$/g, "")
    if (!process.env[key]) process.env[key] = value
  }
}

function chunk(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

async function insertChunks(supabase, table, rows, size = 500) {
  for (const part of chunk(rows, size)) {
    const { error } = await supabase.from(table).insert(part)
    if (error) throw new Error(`[${table}] ${error.message}`)
  }
}

async function commitPayload(payload, args) {
  loadEnvFile()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase env is missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: run, error: runError } = await supabase
    .from("sales_ledger_import_runs")
    .insert({
      fiscal_year: args.fy,
      source_kind: payload.sourceKind,
      source_name: args.sourceName,
      status: "running",
      parser_version: PARSER_VERSION,
      source_checksum: payload.sourceChecksum,
      row_counts: payload.rowCounts,
      validation_counts: payload.validationCounts,
      imported_by: args.actor,
      metadata: { files: payload.files.map(({ tab_key, file_name, file_sha256 }) => ({ tab_key, file_name, file_sha256 })) },
    })
    .select("id")
    .single()
  if (runError) throw new Error(`[sales_ledger_import_runs] ${runError.message}`)

  const importRunId = run.id
  const stampRows = (rows) => rows.map((row) => ({ ...row, import_run_id: importRunId }))

  try {
    await insertChunks(supabase, "sales_ledger_source_files", payload.files.map((file) => ({ ...file, import_run_id: importRunId })))
    await insertChunks(supabase, "sales_ledger_import_snapshots", TAB_KEYS.map((tab_key) => ({
      import_run_id: importRunId,
      tab_key,
      payload_checksum: sha256(JSON.stringify(payload.snapshots[tab_key])),
      payload: payload.snapshots[tab_key],
    })))
    await insertChunks(supabase, "branch_dsh_rows", stampRows(payload.dshRows))
    await insertChunks(supabase, "branch_kpi_rows", stampRows(payload.kpiRows))

    const revLineRows = stampRows(payload.revLines)
    const { data: insertedLines, error: lineError } = await supabase
      .from("branch_rev_lines")
      .insert(revLineRows)
      .select("id, source_record_key")
    if (lineError) throw new Error(`[branch_rev_lines] ${lineError.message}`)

    const lineIdByKey = new Map((insertedLines ?? []).map((line) => [line.source_record_key, line.id]))
    const periodEntries = payload.revPeriodEntries.map(({ source_record_key, ...entry }) => ({
      ...entry,
      import_run_id: importRunId,
      rev_line_id: lineIdByKey.get(source_record_key),
    })).filter((entry) => entry.rev_line_id)
    await insertChunks(supabase, "branch_rev_period_entries", periodEntries)
    await insertChunks(supabase, "sales_ledger_validations", stampRows(payload.validations))

    const { error: finishError } = await supabase
      .from("sales_ledger_import_runs")
      .update({ status: "succeeded", finished_at: new Date().toISOString() })
      .eq("id", importRunId)
    if (finishError) throw new Error(`[sales_ledger_import_runs finish] ${finishError.message}`)

    const { error: activeSourceError } = await supabase.from("sales_ledger_active_sources").upsert(TAB_KEYS.map((tab_key) => ({
      tab_key,
      fiscal_year: args.fy,
      import_run_id: importRunId,
      activated_by: args.actor,
    })))
    if (activeSourceError) throw new Error(`[sales_ledger_active_sources] ${activeSourceError.message}`)
  } catch (error) {
    await supabase
      .from("sales_ledger_import_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error: error.message })
      .eq("id", importRunId)
    throw error
  }

  return importRunId
}

function buildPayload(args) {
  const sources = Object.fromEntries(TAB_KEYS.map((tab) => [tab, parseSourceFile(tab, args.files[tab])]))
  const dsh = parseDsh(sources.dsh.rows, args.fy)
  const rev = parseRev(sources.rev.rows, args.fy, sources.rev)
  const kpi = parseKpi(sources.kpi.rows, args.fy)
  const validations = [...dsh.validations, ...rev.validations, ...kpi.validations]
  const validationCounts = validations.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] ?? 0) + 1
    return acc
  }, {})

  const files = TAB_KEYS.map((tab_key) => ({
    tab_key,
    file_name: sources[tab_key].path.split(/[\\/]/).pop(),
    file_sha256: sources[tab_key].sha256,
    row_count: sources[tab_key].rows.length,
    header_hash: sha256(JSON.stringify(sources[tab_key].rows.slice(0, 2))),
    raw_sample: sources[tab_key].rows.slice(0, 5),
  }))

  return {
    fiscalYear: args.fy,
    parserVersion: PARSER_VERSION,
    sourceKind: Object.values(sources).some((source) => source.sourceFormat === "xlsx") ? "xlsx" : "csv",
    sourceName: args.sourceName,
    sourceChecksum: sha256(files.map((file) => file.file_sha256).join(":")),
    files,
    rowCounts: {
      dsh_rows: dsh.rows.length,
      rev_lines: rev.lines.length,
      rev_period_entries: rev.periodEntries.length,
      kpi_rows: kpi.rows.length,
      validations: validations.length,
    },
    validationCounts,
    dshRows: dsh.rows,
    revLines: rev.lines,
    revPeriodEntries: rev.periodEntries,
    kpiRows: kpi.rows,
    validations,
    snapshots: {
      dsh: { rows: dsh.rows },
      rev: { lines: rev.lines, period_entries: rev.periodEntries },
      kpi: { rows: kpi.rows },
    },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const payload = buildPayload(args)

  if (args.out) {
    const outPath = resolve(args.out)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`)
  }

  console.log("Sales ledger import payload")
  console.log(`- mode: ${args.commit ? "commit" : "dry-run"}`)
  console.log(`- fiscal year: ${payload.fiscalYear}`)
  console.log(`- source checksum: ${payload.sourceChecksum}`)
  console.log(`- DSH rows: ${payload.rowCounts.dsh_rows}`)
  console.log(`- REV lines: ${payload.rowCounts.rev_lines}`)
  console.log(`- REV period entries: ${payload.rowCounts.rev_period_entries}`)
  console.log(`- KPI rows: ${payload.rowCounts.kpi_rows}`)
  console.log(`- validations: ${payload.rowCounts.validations} ${JSON.stringify(payload.validationCounts)}`)
  if (args.out) console.log(`- payload: ${resolve(args.out)}`)

  if (args.commit) {
    const importRunId = await commitPayload(payload, args)
    console.log(`- committed import_run_id: ${importRunId}`)
  }
}

function isCliEntryPoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

export {
  buildPayload,
  parseCsvFile,
  parseRev,
  parseRevXlsxFile,
  parseSourceFile,
}

if (isCliEntryPoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
