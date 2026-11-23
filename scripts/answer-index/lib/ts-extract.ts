/**
 * 저장소 코드에 박힌 정해 둔 답을 TypeScript 구문 트리로 읽는다(실행하지 않는다).
 *
 * - service.ts buildServiceQuickAnswer 안의 make(...)·direct(...) 답(svc:*)
 * - service.ts buildPolicyGuardResponse 안에서 관문 대상(gateOriginal)이 붙은 답
 * - service.ts formatConsumerAnswer 가 고르는 분류별·제목 틀 답(template:*)
 * - quick-answers-field.ts·quick-answers-basics.ts 항목의 match 원문과 줄
 *
 * 질문에 따라 갈리는 글(삼항식, ?? , 조건부 문단)은 기본 갈래 하나를 text 로, 나머지 갈래를 alternatives 로 남긴다.
 * 기본 갈래는 일반적인 경우다: 삼항식은 거짓 쪽, ?? · || 는 오른쪽, 함수는 마지막 return.
 */
import { readFileSync } from "node:fs"
import ts from "typescript"

export interface Guard {
  expr: ts.Expression
  negate: boolean
  /** 함수 맨 바깥에서 앞선 if 들이 return 으로 끝나 붙은 부정(그 답 자체의 조건이 아니라 '앞 답이 아님'). */
  implicit?: boolean
}

export interface ParsedModule {
  sf: ts.SourceFile
  topConsts: Map<string, ts.Expression>
  functions: Map<string, ts.FunctionDeclaration>
}

export function parseModule(absPath: string, text = readFileSync(absPath, "utf8")): ParsedModule {
  const sf = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const topConsts = new Map<string, ts.Expression>()
  const functions = new Map<string, ts.FunctionDeclaration>()
  for (const statement of sf.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) topConsts.set(declaration.name.text, declaration.initializer)
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      functions.set(statement.name.text, statement)
    }
  }
  return { sf, topConsts, functions }
}

export function lineOf(mod: ParsedModule, node: ts.Node) {
  return mod.sf.getLineAndCharacterOfPosition(node.getStart(mod.sf)).line + 1
}

export function collapse(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

// ─── 문자열 갈래 계산 ───────────────────────────────────────────────────

interface EvalContext {
  mod: ParsedModule
  locals: Map<string, ts.Expression>
  depth: number
}

/** 함수 본문 최상위의 const 선언(지역 상수). */
function localConsts(body: ts.Block | undefined) {
  const map = new Map<string, ts.Expression>()
  if (!body) return map
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) map.set(node.name.text, node.initializer)
    if (ts.isFunctionLike(node) && node !== body.parent) return
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(body, visit)
  return map
}

/** 식이 될 수 있는 글 갈래. null 은 '아무 글도 없음'(조건부 문단이 빠지는 갈래). */
export function stringAlternatives(expr: ts.Expression, ctx: EvalContext): (string | null)[] {
  if (ctx.depth > 24) return [`{${collapse(expr.getText(ctx.mod.sf))}}`]
  const next = { ...ctx, depth: ctx.depth + 1 }
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text]
  if (expr.kind === ts.SyntaxKind.NullKeyword || expr.kind === ts.SyntaxKind.UndefinedKeyword) return [null]
  if (ts.isIdentifier(expr) && expr.text === "undefined") return [null]
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr)) {
    return stringAlternatives(expr.expression, next)
  }
  if (ts.isConditionalExpression(expr)) {
    return [...stringAlternatives(expr.whenFalse, next), ...stringAlternatives(expr.whenTrue, next)]
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
      const left = stringAlternatives(expr.left, next).filter((value): value is string => value !== null)
      return [...stringAlternatives(expr.right, next), ...left]
    }
    if (op === ts.SyntaxKind.PlusToken) {
      const left = stringAlternatives(expr.left, next)
      const right = stringAlternatives(expr.right, next)
      const out: string[] = []
      for (const a of left) for (const b of right) if (out.length < 8) out.push(`${a ?? ""}${b ?? ""}`)
      return out
    }
  }
  if (ts.isTemplateExpression(expr)) {
    let variants = [expr.head.text]
    for (const span of expr.templateSpans) {
      const alts = stringAlternatives(span.expression, next).map((value) => value ?? "")
      const merged: string[] = []
      for (const prefix of variants) for (const alt of alts) if (merged.length < 8) merged.push(prefix + alt + span.literal.text)
      variants = merged
    }
    return variants
  }
  if (ts.isIdentifier(expr)) {
    const local = ctx.locals.get(expr.text)
    if (local) return stringAlternatives(local, next)
    const top = ctx.mod.topConsts.get(expr.text)
    if (top) return stringAlternatives(top, next)
    return [`{${expr.text}}`]
  }
  if (ts.isCallExpression(expr)) {
    const joined = joinedArray(expr)
    if (joined) {
      const paragraphs = arrayParagraphs(joined.array, next)
      const sep = joined.separator
      const base = paragraphs.map((p) => p.default).filter((p): p is string => p !== null)
      const out = [base.join(sep)]
      for (const p of paragraphs) for (const alt of p.alternatives) out.push(alt)
      return out
    }
    if (ts.isIdentifier(expr.expression)) {
      const fn = ctx.mod.functions.get(expr.expression.text)
      if (fn) return functionReturnAlternatives(fn, ctx.mod, next.depth)
    }
  }
  return [`{${collapse(expr.getText(ctx.mod.sf))}}`]
}

/** [..].join(sep) 또는 [..].filter(Boolean).join(sep) */
function joinedArray(call: ts.CallExpression): { array: ts.ArrayLiteralExpression; separator: string } | null {
  if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== "join") return null
  const separatorArg = call.arguments[0]
  const separator = separatorArg && ts.isStringLiteral(separatorArg) ? separatorArg.text : ","
  let target: ts.Expression = call.expression.expression
  if (ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression) && target.expression.name.text === "filter") {
    target = target.expression.expression
  }
  return ts.isArrayLiteralExpression(target) ? { array: target, separator } : null
}

interface Paragraph {
  /** 기본 갈래(빠질 수 있는 조건부 문단이면 null). */
  default: string | null
  alternatives: string[]
}

export function arrayParagraphs(array: ts.ArrayLiteralExpression, ctx: EvalContext): Paragraph[] {
  return array.elements.map((element) => {
    const alts = stringAlternatives(element as ts.Expression, ctx)
    const strings = alts.filter((value): value is string => value !== null)
    const optional = alts.some((value) => value === null)
    const first = optional ? null : strings[0] ?? null
    const rest = optional ? strings : strings.slice(1)
    return { default: first, alternatives: Array.from(new Set(rest)) }
  })
}

function returnStatements(body: ts.Block | undefined) {
  const out: ts.ReturnStatement[] = []
  if (!body) return out
  const visit = (node: ts.Node) => {
    if (ts.isReturnStatement(node)) out.push(node)
    if (ts.isFunctionLike(node)) return
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(body, visit)
  return out
}

/** 함수가 돌려줄 수 있는 글 갈래(마지막 return 부터). */
export function functionReturnAlternatives(fn: ts.FunctionDeclaration, mod: ParsedModule, depth = 0): string[] {
  const ctx: EvalContext = { mod, locals: localConsts(fn.body), depth }
  const out: string[] = []
  for (const ret of returnStatements(fn.body).reverse()) {
    if (!ret.expression) continue
    for (const value of stringAlternatives(ret.expression, ctx)) if (value !== null && !out.includes(value)) out.push(value)
  }
  return out
}

// ─── 조건식 ─────────────────────────────────────────────────────────────

function regexFromLiteral(node: ts.RegularExpressionLiteral) {
  const text = node.text
  const lastSlash = text.lastIndexOf("/")
  try {
    return new RegExp(text.slice(1, lastSlash), text.slice(lastSlash + 1))
  } catch {
    return null
  }
}

function resolveRegex(expr: ts.Expression, mod: ParsedModule): RegExp | null {
  if (ts.isRegularExpressionLiteral(expr)) return regexFromLiteral(expr)
  if (ts.isIdentifier(expr)) {
    const init = mod.topConsts.get(expr.text)
    if (init && ts.isRegularExpressionLiteral(init)) return regexFromLiteral(init)
  }
  return null
}

/** 조건식 안의 정규식 원문(상수는 값으로 바꿈). */
export function regexSourcesIn(expr: ts.Node, mod: ParsedModule): string[] {
  const out: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isRegularExpressionLiteral(node)) out.push(node.text)
    else if (ts.isIdentifier(node) && /_RE$/.test(node.text)) {
      const init = mod.topConsts.get(node.text)
      if (init && ts.isRegularExpressionLiteral(init)) out.push(init.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(expr)
  return Array.from(new Set(out))
}

/**
 * 조건식을 질문 글(text)로 계산한다. RE.test(text)·/../.test(text)·!·&&·|| 만 안다. 모르는 식이 결과를 정하면 null.
 */
export function evaluateCondition(expr: ts.Expression, mod: ParsedModule, text: string): boolean | null {
  if (ts.isParenthesizedExpression(expr)) return evaluateCondition(expr.expression, mod, text)
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = evaluateCondition(expr.operand, mod, text)
    return inner === null ? null : !inner
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      const left = evaluateCondition(expr.left, mod, text)
      if (left === false) return false
      const right = evaluateCondition(expr.right, mod, text)
      if (right === false) return false
      return left === null || right === null ? null : true
    }
    if (op === ts.SyntaxKind.BarBarToken) {
      const left = evaluateCondition(expr.left, mod, text)
      if (left === true) return true
      const right = evaluateCondition(expr.right, mod, text)
      if (right === true) return true
      return left === null || right === null ? null : false
    }
  }
  if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression) && expr.expression.name.text === "test") {
    const regex = resolveRegex(expr.expression.expression, mod)
    const arg = expr.arguments[0]
    if (regex && arg && ts.isIdentifier(arg) && arg.text === "text") {
      regex.lastIndex = 0
      return regex.test(text)
    }
  }
  return null
}

export function evaluateGuards(guards: Guard[], mod: ParsedModule, text: string): boolean | null {
  let unknown = false
  for (const guard of guards) {
    const value = evaluateCondition(guard.expr, mod, text)
    if (value === null) {
      unknown = true
      continue
    }
    if ((guard.negate ? !value : value) === false) return false
  }
  return unknown ? null : true
}

export function guardsSource(guards: Guard[], mod: ParsedModule) {
  return guards
    .map((guard) => {
      const source = collapse(guard.expr.getText(mod.sf))
      return guard.negate ? `!(${source})` : `(${source})`
    })
    .join(" && ")
}

/** 문장 목록을 조건 갈래와 함께 걷는다. then 이 return 으로 끝나는 if 뒤의 문장에는 그 조건의 부정이 붙는다. */
function walkStatements(
  statements: readonly ts.Statement[],
  guards: Guard[],
  onStatement: (statement: ts.Statement, guards: Guard[]) => void,
  depth = 0
) {
  let current = guards
  for (const statement of statements) {
    if (ts.isIfStatement(statement)) {
      const thenStatements = ts.isBlock(statement.thenStatement) ? statement.thenStatement.statements : [statement.thenStatement]
      walkStatements(thenStatements, [...current, { expr: statement.expression, negate: false }], onStatement, depth + 1)
      if (statement.elseStatement) {
        const elseStatements = ts.isBlock(statement.elseStatement) ? statement.elseStatement.statements : [statement.elseStatement]
        walkStatements(elseStatements, [...current, { expr: statement.expression, negate: true }], onStatement, depth + 1)
      }
      const last = thenStatements[thenStatements.length - 1]
      if (last && ts.isReturnStatement(last) && !statement.elseStatement) {
        current = [...current, { expr: statement.expression, negate: true, implicit: depth === 0 }]
      }
      continue
    }
    onStatement(statement, current)
  }
}

/** 그 답 자체의 조건(맨 바깥의 '앞 답이 아님' 부정은 뺌). */
export function ownGuards(guards: Guard[]) {
  return guards.filter((guard) => !guard.implicit)
}

function findCalls(node: ts.Node, names: Set<string>) {
  const out: ts.CallExpression[] = []
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && names.has(child.expression.text)) out.push(child)
    if (ts.isFunctionLike(child)) return
    ts.forEachChild(child, visit)
  }
  visit(node)
  return out
}

function kebab(name: string) {
  return name.replace(/_RE$/, "").toLowerCase().replace(/_/g, "-")
}

// ─── service.ts: buildServiceQuickAnswer ───────────────────────────────

export interface ExtractedServiceAnswer {
  name: string
  helper: "make" | "direct" | "policy-guard"
  text: string
  alternatives: string[]
  handoff: "support" | "demo" | null
  category: string | null
  suggestedQuestions: string[]
  englishSummary: string | null
  guards: Guard[]
  conditionSource: string
  regexes: string[]
  regexNames: string[]
  line: number
  gateExempt: boolean
  gateOriginal: string | null
}

function literalStrings(expr: ts.Expression | undefined) {
  if (!expr || !ts.isArrayLiteralExpression(expr)) return []
  return expr.elements.filter((element): element is ts.StringLiteral => ts.isStringLiteral(element)).map((element) => element.text)
}

function literal(expr: ts.Expression | undefined) {
  return expr && (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) ? expr.text : null
}

function reNamesIn(guards: Guard[]) {
  const names: string[] = []
  for (const guard of guards) {
    if (guard.negate) continue
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && /_RE$/.test(node.text) && !names.includes(node.text)) names.push(node.text)
      ts.forEachChild(node, visit)
    }
    visit(guard.expr)
  }
  return names
}

function paragraphsToText(paragraphs: Paragraph[]) {
  const text = paragraphs
    .map((p) => p.default)
    .filter((p): p is string => p !== null)
    .join("\n\n")
  const alternatives = Array.from(new Set(paragraphs.flatMap((p) => p.alternatives)))
  return { text, alternatives }
}

/** 호출을 감싼 가장 가까운 블록 글(함수 본문이면 그 문장만). gateExempt 처럼 같은 블록의 다음 문장에 붙는 표시를 본다. */
function enclosingBlockText(node: ts.Node, body: ts.Block, statement: ts.Statement, mod: ParsedModule) {
  let current: ts.Node | undefined = node.parent
  while (current && !ts.isBlock(current)) current = current.parent
  return !current || current === body ? statement.getText(mod.sf) : current.getText(mod.sf)
}

export function extractServiceQuickAnswers(mod: ParsedModule): ExtractedServiceAnswer[] {
  const fn = mod.functions.get("buildServiceQuickAnswer")
  if (!fn?.body) throw new Error("service.ts 에서 buildServiceQuickAnswer 를 찾지 못했습니다")
  const ctx: EvalContext = { mod, locals: localConsts(fn.body), depth: 0 }
  const found: ExtractedServiceAnswer[] = []
  walkStatements(fn.body.statements, [], (statement, guards) => {
    for (const call of findCalls(statement, new Set(["make", "direct"]))) {
      const helper = (call.expression as ts.Identifier).text as "make" | "direct"
      const answerArg = call.arguments[0]
      if (!answerArg || !ts.isArrayLiteralExpression(answerArg)) continue
      const { text, alternatives } = paragraphsToText(arrayParagraphs(answerArg, ctx))
      const args = call.arguments
      const own = ownGuards(guards)
      const regexNames = reNamesIn(own)
      found.push({
        name: "",
        helper,
        text,
        alternatives,
        handoff: helper === "make" ? ((literal(args[1]) as "support" | "demo" | null) ?? null) : null,
        category: literal(helper === "make" ? args[2] : args[1]),
        suggestedQuestions: literalStrings(helper === "make" ? args[3] : args[2]),
        englishSummary: literal(helper === "make" ? args[4] : args[3]),
        guards: own,
        conditionSource: guardsSource(own, mod),
        regexes: Array.from(new Set(own.flatMap((guard) => regexSourcesIn(guard.expr, mod)))),
        regexNames,
        line: lineOf(mod, call),
        gateExempt: /gateExempt\s*:\s*true/.test(enclosingBlockText(call, fn.body!, statement, mod)),
        gateOriginal: "service",
      })
    }
  })
  const used = new Map<string, number>()
  for (const entry of found) {
    const base = entry.regexNames.length > 0 ? kebab(entry.regexNames[entry.regexNames.length - 1]) : "answer"
    const count = (used.get(base) ?? 0) + 1
    used.set(base, count)
    entry.name = count === 1 ? base : `${base}-${count}`
    if (entry.gateExempt) entry.gateOriginal = null
  }
  return found
}

/** buildPolicyGuardResponse 안에서 gateOriginal 이 붙은(관문 대상인) 답. 거절 답은 범위 밖이다. */
export function extractPolicyGuardAnswers(mod: ParsedModule): ExtractedServiceAnswer[] {
  const fn = mod.functions.get("buildPolicyGuardResponse")
  if (!fn?.body) return []
  const ctx: EvalContext = { mod, locals: localConsts(fn.body), depth: 0 }
  const found: ExtractedServiceAnswer[] = []
  walkStatements(fn.body.statements, [], (statement, guards) => {
    if (!ts.isReturnStatement(statement) || !statement.expression || !ts.isObjectLiteralExpression(statement.expression)) return
    const props = new Map<string, ts.Expression>()
    for (const prop of statement.expression.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) props.set(prop.name.text, prop.initializer)
    }
    const gateOriginal = literal(props.get("gateOriginal"))
    const response = props.get("response")
    if (!gateOriginal || !response || !ts.isObjectLiteralExpression(response)) return
    const responseProps = new Map<string, ts.Expression>()
    for (const prop of response.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) responseProps.set(prop.name.text, prop.initializer)
    }
    const answerExpr = responseProps.get("answer")
    if (!answerExpr) return
    const alts = stringAlternatives(answerExpr, ctx).filter((value): value is string => value !== null)
    const own = ownGuards(guards)
    found.push({
      name: gateOriginal.replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
      helper: "policy-guard",
      text: alts[0] ?? "",
      alternatives: alts.slice(1),
      handoff: null,
      category: literal(props.get("category")),
      suggestedQuestions: literalStrings(responseProps.get("suggestedQuestions")),
      englishSummary: null,
      guards: own,
      conditionSource: guardsSource(own, mod),
      regexes: Array.from(new Set(own.flatMap((guard) => regexSourcesIn(guard.expr, mod)))),
      regexNames: reNamesIn(own),
      line: lineOf(mod, statement),
      gateExempt: false,
      gateOriginal,
    })
  })
  return found
}

// ─── service.ts: formatConsumerAnswer 의 틀 답 ─────────────────────────

export interface ExtractedTemplateAnswer {
  key: string
  keyKind: "heading" | "path"
  fnName: string
  text: string
  alternatives: string[]
  conditionSource: string
  regexes: string[]
  line: number
}

function guardKey(guards: Guard[], mod: ParsedModule): { key: string; keyKind: "heading" | "path" } | null {
  let pathKey: string | null = null
  for (const guard of guards) {
    if (guard.negate) continue
    let headingKey: string | null = null
    const visit = (node: ts.Node) => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
        collapse(node.left.getText(mod.sf)) === "top.heading" &&
        ts.isStringLiteral(node.right)
      ) {
        headingKey = node.right.text
      }
      if (
        ts.isCallExpression(node) &&
        collapse(node.expression.getText(mod.sf)) === "top.urlPath.includes" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        pathKey = pathKey ?? node.arguments[0].text
      }
      ts.forEachChild(node, visit)
    }
    visit(guard.expr)
    if (headingKey) return { key: headingKey, keyKind: "heading" }
  }
  return pathKey ? { key: pathKey, keyKind: "path" } : null
}

export function extractTemplateAnswers(mod: ParsedModule): ExtractedTemplateAnswer[] {
  const fn = mod.functions.get("formatConsumerAnswer")
  if (!fn?.body) throw new Error("service.ts 에서 formatConsumerAnswer 를 찾지 못했습니다")
  const found: ExtractedTemplateAnswer[] = []
  walkStatements(fn.body.statements, [], (statement, guards) => {
    if (!ts.isReturnStatement(statement) || !statement.expression || !ts.isCallExpression(statement.expression)) return
    const callee = statement.expression.expression
    if (!ts.isIdentifier(callee) || !/^get[A-Z]/.test(callee.text)) return
    const target = mod.functions.get(callee.text)
    if (!target) return
    const own = ownGuards(guards)
    const key = guardKey(own, mod)
    if (!key) return
    const alts = functionReturnAlternatives(target, mod)
    found.push({
      key: key.key,
      keyKind: key.keyKind,
      fnName: callee.text,
      text: alts[0] ?? "",
      alternatives: alts.slice(1),
      conditionSource: guardsSource(own, mod),
      regexes: Array.from(new Set(own.flatMap((guard) => regexSourcesIn(guard.expr, mod)))),
      line: lineOf(mod, statement),
    })
  })
  return found
}

// ─── 배열 상수의 항목별 원문(field·basics) ─────────────────────────────

export interface ArrayEntrySource {
  id: string
  line: number
  matchSource: string | null
  regexes: string[]
}

/** export const NAME = [ { id: "...", match: ... }, ... ] 의 항목별 match 원문과 줄. */
export function extractArrayEntrySources(mod: ParsedModule, constName: string, idProp = "id", matchProp = "match"): Map<string, ArrayEntrySource> {
  const out = new Map<string, ArrayEntrySource>()
  const init = mod.topConsts.get(constName)
  let array: ts.Expression | undefined = init
  while (array && (ts.isAsExpression(array) || ts.isSatisfiesExpression(array) || ts.isParenthesizedExpression(array))) array = array.expression
  if (!array || !ts.isArrayLiteralExpression(array)) return out
  for (const element of array.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue
    let id: string | null = null
    let match: ts.Expression | null = null
    for (const prop of element.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue
      if (prop.name.text === idProp && ts.isStringLiteral(prop.initializer)) id = prop.initializer.text
      if (prop.name.text === matchProp) match = prop.initializer
    }
    if (!id) continue
    out.set(id, {
      id,
      line: lineOf(mod, element),
      matchSource: match ? collapse(match.getText(mod.sf)) : null,
      regexes: match ? regexSourcesIn(match, mod) : [],
    })
  }
  return out
}
