import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { pathToFileURL } from "url"
import { describe, expect, it } from "vitest"

const scriptPath = join(process.cwd(), "scripts/import-sales-ledger-files.mjs")

function scriptSource() {
  return readFileSync(scriptPath, "utf8")
}

async function loadImporter() {
  return import(pathToFileURL(scriptPath).href)
}

function writeStoredZip(path: string, entries: Record<string, string>) {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const [name, text] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, "utf8")
    const data = Buffer.from(text, "utf8")

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt32LE(0, 10)
    localHeader.writeUInt32LE(0, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, nameBuffer, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt32LE(0, 12)
    centralHeader.writeUInt32LE(0, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, nameBuffer)

    offset += localHeader.length + nameBuffer.length + data.length
  }

  const centralStart = offset
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const endHeader = Buffer.alloc(22)
  endHeader.writeUInt32LE(0x06054b50, 0)
  endHeader.writeUInt16LE(0, 4)
  endHeader.writeUInt16LE(0, 6)
  endHeader.writeUInt16LE(Object.keys(entries).length, 8)
  endHeader.writeUInt16LE(Object.keys(entries).length, 10)
  endHeader.writeUInt32LE(centralSize, 12)
  endHeader.writeUInt32LE(centralStart, 16)
  endHeader.writeUInt16LE(0, 20)

  writeFileSync(path, Buffer.concat([...localParts, ...centralParts, endHeader]))
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function makeRevWorkbookFixture() {
  const sharedStrings: string[] = []
  const sharedIndex = new Map<string, number>()
  const shared = (value: string) => {
    if (!sharedIndex.has(value)) sharedIndex.set(value, sharedStrings.push(value) - 1)
    return sharedIndex.get(value)
  }
  const cell = (ref: string, value: string | number, style?: number) => {
    const styleAttr = style == null ? "" : ` s="${style}"`
    if (typeof value === "number") return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`
    return `<c r="${ref}" t="s"${styleAttr}><v>${shared(value)}</v></c>`
  }
  const row = (index: number, cells: string[]) => `<row r="${index}">${cells.join("")}</row>`
  const headers = [
    "Account", "Branch", "Location", "Scale", "Importance", "Team", "Manager",
    "Status", "Type", "Product", "First Payment", "Remark", "Sum",
  ]

  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
${row(2, [
  ...headers.map((header, index) => cell(`${String.fromCharCode(65 + index)}2`, header)),
  cell("N2", 4),
  cell("O2", "w1"),
  cell("P2", "w2"),
  cell("Q2", 5),
])}
${row(3, [
  cell("A3", "Color Academy"),
  cell("K3", 46113),
  cell("M3", 300),
  cell("N3", 300),
  cell("O3", 100, 1),
  cell("P3", 200, 2),
])}
${row(4, [cell("A4", "Default Academy"), cell("M4", 50), cell("N4", 50)])}
${row(5, [cell("A5", "Red Total Academy"), cell("M5", 70), cell("N5", 70, 1)])}
${row(6, [cell("A6", "Blue Total Academy"), cell("M6", 80), cell("N6", 80, 2)])}
</sheetData></worksheet>`

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
${sharedStrings.map((value) => `<si><t>${xmlEscape(value)}</t></si>`).join("")}
</sst>`

  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="2. REV" sheetId="2" r:id="rId1"/></sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`,
    "xl/sharedStrings.xml": sharedStringsXml,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><color rgb="FF000000"/></font>
    <font><color rgb="FFFF0000"/></font>
    <font><color rgb="FF0000FF"/></font>
  </fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellXfs count="3">
    <xf fontId="0" fillId="0"/>
    <xf fontId="1" fillId="0"/>
    <xf fontId="2" fillId="0"/>
  </cellXfs>
</styleSheet>`,
    "xl/worksheets/sheet2.xml": worksheet,
  }
}

describe("sales ledger file importer", () => {
  it("keeps dry-run as the default and requires explicit commit for DB writes", () => {
    const source = scriptSource()

    expect(source).toContain("dryRun: true")
    expect(source).toContain('if (arg === "--commit")')
    expect(source).toContain("commitPayload(payload, args)")
  })

  it("activates a source only after the import run is marked succeeded", () => {
    const source = scriptSource()

    const finishIndex = source.indexOf('.update({ status: "succeeded"')
    const activeIndex = source.indexOf('.from("sales_ledger_active_sources").upsert')

    expect(finishIndex).toBeGreaterThan(-1)
    expect(activeIndex).toBeGreaterThan(-1)
    expect(activeIndex).toBeGreaterThan(finishIndex)
  })

  it("keeps CSV REV confidence as format_unavailable", async () => {
    const { parseRev } = await loadImporter()
    const header = Array(15).fill("")
    header[0] = "Account"
    header[13] = "4"
    header[14] = "w1"
    const row = Array(15).fill("")
    row[0] = "CSV Academy"
    row[12] = "100"
    row[13] = "100"
    row[14] = "100"

    const result = parseRev([[], header, row], 2026)

    expect(result.periodEntries).toHaveLength(1)
    expect(result.periodEntries[0].confidence).toBe("format_unavailable")
    expect(result.validations).toEqual(expect.arrayContaining([
      expect.objectContaining({ issue_code: "csv_format_notice" }),
    ]))
  })

  it("maps REV XLSX red and blue text to confidence values", async () => {
    const { parseRev, parseRevXlsxFile } = await loadImporter()
    const tempDir = mkdtempSync(join(tmpdir(), "sales-ledger-import-"))
    try {
      const workbookPath = join(tempDir, "rev.xlsx")
      writeStoredZip(workbookPath, makeRevWorkbookFixture())

      const source = parseRevXlsxFile(workbookPath)
      const result = parseRev(source.rows, 2026, source)
      const entriesFor = (account: string) => {
        const line = result.lines.find((item: { account_name: string }) => item.account_name === account)
        return result.periodEntries.filter((entry: { source_record_key: string }) => entry.source_record_key === line?.source_record_key)
      }

      expect(source.rows[1][13]).toBe("4")
      expect(result.lines.find((line: { account_name: string }) => line.account_name === "Color Academy")?.first_payment).toBe("2026-04-01")
      expect(entriesFor("Color Academy")).toEqual(expect.arrayContaining([
        expect.objectContaining({ amount: 100, confidence: "confirmed", source_week: "w1" }),
        expect.objectContaining({ amount: 200, confidence: "high_confidence", source_week: "w2" }),
      ]))
      expect(entriesFor("Default Academy")).toEqual([
        expect.objectContaining({ amount: 50, confidence: "expected", source_week: null }),
      ])
      expect(entriesFor("Red Total Academy")).toEqual([
        expect.objectContaining({ amount: 70, confidence: "confirmed", source_week: null }),
      ])
      expect(entriesFor("Blue Total Academy")).toEqual([
        expect.objectContaining({ amount: 80, confidence: "high_confidence", source_week: null }),
      ])
      expect(result.validations.some((item: { issue_code: string }) => item.issue_code === "csv_format_notice")).toBe(false)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
