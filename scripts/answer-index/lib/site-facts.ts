/**
 * 공개 페이지 사실 문장(site-facts.json) 만들기.
 *
 * 대상(§4.2): 회사 소개(/about), 서비스 소개서(/introduction 과 그 컴포넌트·문구 파일), 체크아웃(/checkout 과 컴포넌트),
 * 개인정보처리방침(app/privacy/page.tsx 현재판만, 개정 비교표 CHANGE_ROWS 제외), 약관, 데이터 삭제 안내, 문의 페이지, 푸터.
 *
 * TSX 를 TypeScript 구문 트리로 읽어 한글이 든 JSX 글과 문자열을 줄 단위로 모은다.
 * - 같은 줄에서 시작하는 JSX 글 조각은 이어 붙이고(<p>전화번호: <a>02-…</a></p> → "전화번호: 02-…"),
 *   같은 줄의 문자열 여러 개(표의 한 줄)는 " | "로 잇는다.
 * - 같은 파일의 최상위 문자열 상수를 가리키는 {상수}·${상수}는 그 값으로 바꾸고, 그 밖의 식은 {식}으로 남긴다.
 * - className·href 같은 속성 값은 뺀다.
 * id 는 site:<경로>:<줄>, 한 줄에서 나온 둘째 문장부터 site:<경로>:<줄>#2 …
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { splitIntoSentences } from "@/lib/chatbot/source-grounding"
import { sentenceHash } from "@/lib/chatbot/answer-index/hash"
import type { SiteFact } from "@/lib/chatbot/answer-index/types"
import { listFilesRecursive, repoRoot, toRepoPath } from "./common"

/** 대상 파일·폴더(저장소 기준). 폴더는 아래 .ts·.tsx 전부. */
export const SITE_FACT_TARGETS = [
  "app/about",
  "app/introduction",
  "lib/introduction/content.ts",
  "components/introduction",
  "app/checkout",
  "components/checkout",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/data-deletion/page.tsx",
  "app/contact",
  "components/contact",
  "components/sections/Footer.tsx",
] as const

/** 파일별로 뺄 최상위 선언(현재판이 아닌 글). */
export const SITE_FACT_EXCLUDED_DECLARATIONS: Record<string, string[]> = {
  "app/privacy/page.tsx": ["CHANGE_ROWS"],
}

const HANGUL_RE = /[가-힣]/
const HTML_ENTITIES: Record<string, string> = {
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&middot;": "·",
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
}

function decodeEntities(text: string) {
  return text.replace(/&[a-z]+;/g, (entity) => HTML_ENTITIES[entity] ?? entity)
}
const ALLOWED_TEXT_ATTRIBUTES = new Set(["title", "label", "description", "placeholder", "aria-label"])

export function listSiteFactFiles(root = repoRoot()) {
  const files: string[] = []
  for (const target of SITE_FACT_TARGETS) {
    const abs = join(root, target)
    if (/\.(?:ts|tsx)$/.test(target)) files.push(abs)
    else files.push(...listFilesRecursive(abs).filter((file) => /\.(?:ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file)))
  }
  return Array.from(new Set(files)).sort()
}

interface Fragment {
  line: number
  pos: number
  kind: "jsx" | "string"
  text: string
}

function collectTopLevelStrings(sf: ts.SourceFile) {
  const map = new Map<string, string>()
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const init = declaration.initializer
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) map.set(declaration.name.text, init.text)
    }
  }
  return map
}

function excludedRanges(sf: ts.SourceFile, names: string[]) {
  const ranges: [number, number][] = []
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && names.includes(declaration.name.text)) {
        ranges.push([statement.getStart(sf), statement.getEnd()])
      }
    }
  }
  return ranges
}

function expressionText(expr: ts.Expression, sf: ts.SourceFile, constants: Map<string, string>) {
  if (ts.isIdentifier(expr) && constants.has(expr.text)) return constants.get(expr.text) ?? ""
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
  return `{${expr.getText(sf).replace(/\s+/g, " ")}}`
}

function templateText(node: ts.TemplateExpression, sf: ts.SourceFile, constants: Map<string, string>) {
  return (
    node.head.text +
    node.templateSpans.map((span) => expressionText(span.expression, sf, constants) + span.literal.text).join("")
  )
}

function isAttributeValue(node: ts.Node) {
  const parent = node.parent
  if (!parent) return false
  if (ts.isJsxAttribute(parent)) return !ALLOWED_TEXT_ATTRIBUTES.has(parent.name.getText())
  if (ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent)) {
    return !ALLOWED_TEXT_ATTRIBUTES.has(parent.parent.name.getText())
  }
  return false
}

function isIgnoredContext(node: ts.Node) {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current)) return true
    if (ts.isCallExpression(current)) {
      const callee = current.expression.getText()
      if (/^console\./.test(callee)) return true
    }
  }
  return false
}

/** 파일 하나의 한글 글 조각을 줄 단위로 모은다. */
export function extractSiteLines(relPath: string, source: string) {
  const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true, relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const constants = collectTopLevelStrings(sf)
  const skip = excludedRanges(sf, SITE_FACT_EXCLUDED_DECLARATIONS[relPath] ?? [])
  const fragments: Fragment[] = []
  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
  const skipped = (node: ts.Node) => skip.some(([start, end]) => node.getStart(sf) >= start && node.getEnd() <= end)

  const visit = (node: ts.Node) => {
    if (skipped(node)) return
    if (ts.isJsxText(node)) {
      const text = decodeEntities(node.text).replace(/\s+/g, " ")
      if (text.trim()) fragments.push({ line: lineOf(node), pos: node.getStart(sf), kind: "jsx", text })
      return
    }
    if (ts.isJsxExpression(node) && node.expression && ts.isJsxElement(node.parent)) {
      const expr = node.expression
      if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) || ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr)) {
        fragments.push({ line: lineOf(node), pos: node.getStart(sf), kind: "jsx", text: expressionText(expr, sf, constants) })
        return
      }
      if (ts.isTemplateExpression(expr)) {
        fragments.push({ line: lineOf(node), pos: node.getStart(sf), kind: "jsx", text: templateText(expr, sf, constants) })
        return
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && HANGUL_RE.test(node.text)) {
      if (!isAttributeValue(node) && !isIgnoredContext(node)) {
        fragments.push({ line: lineOf(node), pos: node.getStart(sf), kind: "string", text: node.text })
      }
      return
    }
    if (ts.isTemplateExpression(node)) {
      const text = templateText(node, sf, constants)
      if (HANGUL_RE.test(text) && !isAttributeValue(node) && !isIgnoredContext(node)) {
        fragments.push({ line: lineOf(node), pos: node.getStart(sf), kind: "string", text })
      }
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  const byLine = new Map<number, Fragment[]>()
  for (const fragment of fragments) {
    const list = byLine.get(fragment.line) ?? []
    list.push(fragment)
    byLine.set(fragment.line, list)
  }
  const lines: { line: number; text: string }[] = []
  for (const [line, list] of Array.from(byLine.entries()).sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.pos - b.pos)
    const jsx = list.filter((fragment) => fragment.kind === "jsx").map((fragment) => fragment.text).join("")
    const strings = list.filter((fragment) => fragment.kind === "string").map((fragment) => fragment.text.trim())
    const text = [jsx.trim(), strings.filter(Boolean).join(" | ")].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
    if (HANGUL_RE.test(text)) lines.push({ line, text })
  }
  return lines
}

export function buildSiteFacts(root = repoRoot()): SiteFact[] {
  const facts: SiteFact[] = []
  for (const abs of listSiteFactFiles(root)) {
    const relPath = toRepoPath(abs, root)
    const lines = extractSiteLines(relPath, readFileSync(abs, "utf8"))
    for (const { line, text } of lines) {
      const parts = /\s\|\s/.test(text) ? [text] : splitIntoSentences(text)
      let k = 0
      for (const part of parts) {
        const sentence = part.replace(/\s+/g, " ").trim()
        if (!HANGUL_RE.test(sentence)) continue
        k += 1
        const id = k === 1 ? `site:${relPath}:${line}` : `site:${relPath}:${line}#${k}`
        facts.push({ id, path: relPath, line, text: sentence, hash: sentenceHash(sentence) })
      }
    }
  }
  return facts
}
