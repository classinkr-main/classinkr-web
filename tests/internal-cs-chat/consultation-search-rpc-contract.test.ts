import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * PostgREST 는 인자 "이름"으로 함수를 고른다. 같은 이름·같은 인자명을 가진 오버로드가 둘 이상 남아 있으면
 * 어떤 호출도 "Could not choose the best candidate function" 으로 실패한다(20260716_channel_conversations.sql
 * 가 vector/text 두 오버로드를 동일 인자명으로 만들어 내부 CS 코파일럿의 상담 근거가 통째로 죽었던 사고).
 *
 * 이 테스트는 RPC 를 목킹하지 않는다. supabase/migrations/*.sql 을 파일명 순서로 접어서 "최종 살아남는 시그니처"
 * 를 계산하고, 런타임이 실제로 호출하는 모양(text 임베딩)이 유일하게 해석되는지 검증한다.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations")
const FUNCTION_NAME = "match_channel_conversation_chunks"

interface FunctionDefinition {
  migration: string
  signature: string
  paramNames: string[]
  body: string
}

/** `extensions.vector(768)` → `vector`, `int` → `int`. Postgres 의 시그니처 동일성 판정과 같은 정규화. */
function normalizeType(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\([^()]*\)\s*$/, "")
    .replace(/^(?:extensions|public|pg_catalog)\./, "")
    .trim()
}

/** 여는 괄호 위치에서 시작해 괄호 짝을 맞춰 인자 목록 원문을 잘라낸다. */
function readBalanced(source: string, openIndex: number): { inner: string; endIndex: number } | null {
  let depth = 0
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === "(") depth += 1
    else if (char === ")") {
      depth -= 1
      if (depth === 0) return { inner: source.slice(openIndex + 1, index), endIndex: index }
    }
  }
  return null
}

/** 최상위 콤마로만 분리한다(vector(768) 안의 콤마는 무시). */
function splitTopLevel(argList: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of argList) {
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === "," && depth === 0) {
      parts.push(current)
      current = ""
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

function parseParam(raw: string): { name: string | null; type: string } {
  const withoutDefault = raw.split(/\s+default\s+/i)[0].trim()
  const tokens = withoutDefault.split(/\s+/)
  // `drop function f(vector, int)` 처럼 타입만 오는 형태와 `name type` 형태를 함께 다룬다.
  if (tokens.length === 1) return { name: null, type: normalizeType(tokens[0]) }
  return { name: tokens[0].toLowerCase(), type: normalizeType(tokens.slice(1).join(" ")) }
}

function signatureOf(argList: string): { signature: string; paramNames: string[] } {
  const params = splitTopLevel(argList).map(parseParam)
  return {
    signature: params.map((param) => param.type).join(","),
    paramNames: params.map((param) => param.name ?? ""),
  }
}

/** 마이그레이션을 파일명 순서로 적용해 최종적으로 DB 에 남는 오버로드 집합을 계산한다. */
function resolveLiveOverloads(): Map<string, FunctionDefinition> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()

  const live = new Map<string, FunctionDefinition>()

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
    const statementPattern = new RegExp(
      String.raw`\b(create(?:\s+or\s+replace)?|drop)\s+function\s+(?:if\s+exists\s+)?(?:public\.)?${FUNCTION_NAME}\s*\(`,
      "gi"
    )

    let match: RegExpExecArray | null
    while ((match = statementPattern.exec(sql)) !== null) {
      const openIndex = sql.indexOf("(", match.index + match[0].length - 1)
      const balanced = readBalanced(sql, openIndex)
      if (!balanced) continue

      const { signature, paramNames } = signatureOf(balanced.inner)
      const isDrop = match[1].toLowerCase().startsWith("drop")

      if (isDrop) {
        live.delete(signature)
        statementPattern.lastIndex = balanced.endIndex
        continue
      }

      // 함수 본문은 다음 세미콜론까지가 아니라 $$...$$ 사이다.
      const bodyStart = sql.indexOf("$$", balanced.endIndex)
      const bodyEnd = bodyStart === -1 ? -1 : sql.indexOf("$$", bodyStart + 2)
      const body = bodyStart !== -1 && bodyEnd !== -1 ? sql.slice(bodyStart + 2, bodyEnd) : ""

      live.set(signature, { migration: file, signature, paramNames, body })
      statementPattern.lastIndex = balanced.endIndex
    }
  }

  return live
}

describe(`${FUNCTION_NAME} RPC overload contract`, () => {
  const live = resolveLiveOverloads()

  it("leaves exactly one overload so PostgREST can resolve the call", () => {
    expect([...live.keys()].sort()).toEqual(["text,int,float"])
  })

  it("keeps the text overload the runtime actually sends (JSON.stringify'd embedding)", () => {
    const survivor = live.get("text,int,float")

    expect(survivor).toBeDefined()
    expect(survivor!.paramNames).toEqual(["query_embedding", "match_count", "min_similarity"])
  })

  it("never leaves two overloads sharing the same argument names", () => {
    // PostgREST 는 타입이 아니라 인자 이름으로 후보를 좁힌다 → 인자명이 같으면 타입이 달라도 모호해진다.
    const byParamNames = new Map<string, string[]>()
    for (const definition of live.values()) {
      const key = definition.paramNames.join(",")
      byParamNames.set(key, [...(byParamNames.get(key) ?? []), definition.signature])
    }

    for (const [paramNames, signatures] of byParamNames) {
      expect(
        signatures,
        `overloads sharing argument names (${paramNames}) are unresolvable by PostgREST`
      ).toHaveLength(1)
    }
  })

  it("does not leave the surviving overload delegating to a dropped one", () => {
    // 원래 text 오버로드는 본문에서 vector 오버로드를 호출했다. SQL 문자열 본문은 pg_depend 추적이 안 되므로
    // vector 오버로드를 drop 해도 조용히 통과하고, 호출 시점에야 "function does not exist" 로 터진다.
    const survivor = live.get("text,int,float")

    expect(survivor).toBeDefined()
    expect(survivor!.body.toLowerCase()).not.toContain(`${FUNCTION_NAME}(`)
  })

  it("reloads the PostgREST schema cache in the migration that fixes the overloads", () => {
    const survivor = live.get("text,int,float")
    const sql = readFileSync(join(MIGRATIONS_DIR, survivor!.migration), "utf8")

    expect(sql.toLowerCase()).toContain("notify pgrst, 'reload schema'")
  })
})
