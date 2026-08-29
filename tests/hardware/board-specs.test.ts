import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { BOARD_SPEC_GROUPS, type BoardSpecModel } from "@/lib/hardware/board-specs"

/**
 * `/product/hw` 스펙표가 문서 정본과 갈라지는 것을 막는다.
 *
 * 하드코딩 기대값으로 비교하면 문서만 고쳤을 때 그대로 통과해버리므로,
 * `tests/checkout/hardware-catalog.test.ts` 가 omo1 HTML 원문을 파싱하는 것과 같은 방식으로
 * **문서 원문의 표를 직접 읽어** 대조한다. 실제로 이 표는 한 번 갈라진 적이 있다 —
 * 모델명 BS86A(정본 BS86C), S110 전체 길이 2,620.55mm(정본 2,520.55mm)가 공개 페이지에
 * 남아 있었다.
 */
const SSOT_DOC = readFileSync(
  fileURLToPath(new URL("../../docs/active/classin-software-feature-inventory.md", import.meta.url)),
  "utf8"
)

/** 문서 §8 표의 열 순서 → 이 코드베이스의 모델 키. S98 Pro 는 페이지 표에 없다. */
const DOC_COLUMNS = ["s75", "s86", "s98pro", "s110"] as const
type DocColumn = (typeof DOC_COLUMNS)[number]

/** `| 라벨 | v1 | v2 | v3 | v4 |` 한 줄을 라벨 → 열별 값으로 편다. */
function readDocRow(label: string): Record<DocColumn, string> {
  const line = SSOT_DOC.split("\n").find(
    (candidate) => candidate.startsWith("|") && candidate.split("|")[1]?.trim() === label
  )
  if (!line) throw new Error(`문서 정본에서 "${label}" 행을 찾지 못했다 — 표가 바뀌었는지 확인할 것`)

  const cells = line
    .split("|")
    .slice(2, 6)
    .map((cell) => cell.trim())
  if (cells.length !== DOC_COLUMNS.length) {
    throw new Error(`"${label}" 행의 열 수가 ${cells.length} 개다 — 4 개를 기대했다`)
  }

  return Object.fromEntries(DOC_COLUMNS.map((key, i) => [key, cells[i]])) as Record<DocColumn, string>
}

/** 페이지 표에서 한 줄을 찾는다. */
function readSpecRow(label: string) {
  for (const group of BOARD_SPEC_GROUPS) {
    const row = group.rows.find((candidate) => candidate.label === label)
    if (row) return row
  }
  throw new Error(`board-specs 에 "${label}" 행이 없다`)
}

/** "1,718.18mm" / "1718.18" → 1718.18. 콤마·단위 표기 차이를 흡수한다. */
function toNumber(value: string): number {
  const parsed = Number(value.replace(/,/g, "").replace(/[^\d.]/g, ""))
  if (!Number.isFinite(parsed)) throw new Error(`숫자로 읽을 수 없다: ${value}`)
  return parsed
}

/** 페이지 표와 문서 표가 공유하는 모델(S98 Pro 제외). */
const SHARED_MODELS: ReadonlyArray<[BoardSpecModel, DocColumn]> = [
  ["s75", "s75"],
  ["s86", "s86"],
  ["s110", "s110"],
]

describe("Classin Board 스펙표 ↔ 문서 정본", () => {
  it("모델명이 규격서 값과 일치한다", () => {
    const doc = readDocRow("모델명")
    const row = readSpecRow("모델명")

    for (const [model, column] of SHARED_MODELS) {
      expect(row[model], `${model} 모델명`).toBe(doc[column])
    }
  })

  it("전체 크기(가로·높이·두께)가 규격서 값과 일치한다", () => {
    // 문서는 "1718.18×1000.2×113.1" 한 칸에 세 값을 담는다.
    const doc = readDocRow("전체크기 W×H×D(mm)")
    const width = readSpecRow("전체 길이")
    const height = readSpecRow("전체 높이")
    const depth = readSpecRow("두께")

    for (const [model, column] of SHARED_MODELS) {
      const [docWidth, docHeight, docDepth] = doc[column].split("×").map((part) => part.trim())

      expect(toNumber(width[model]), `${model} 전체 길이`).toBe(toNumber(docWidth))
      expect(toNumber(height[model]), `${model} 전체 높이`).toBe(toNumber(docHeight))
      expect(toNumber(depth[model]), `${model} 두께`).toBe(toNumber(docDepth))
    }
  })

  it("순중량이 규격서 값과 일치한다", () => {
    const doc = readDocRow("순중량")
    const row = readSpecRow("순중량")

    for (const [model, column] of SHARED_MODELS) {
      expect(toNumber(row[model]), `${model} 순중량`).toBe(toNumber(doc[column]))
    }
  })

  it("S110 내장 마이크를 '없음'으로 단정하지 않는다", () => {
    // 규격서에 기재가 없을 뿐이다. "—" 로 두면 미탑재로 읽힌다.
    expect(readDocRow("마이크").s110).toContain("미기재")
    expect(readSpecRow("내장 마이크").s110).toBe("별도 확인")
  })

  it("모든 그룹의 행이 네 모델 값을 빠짐없이 갖는다", () => {
    for (const group of BOARD_SPEC_GROUPS) {
      for (const row of group.rows) {
        for (const model of ["s110", "s86", "s75", "s65"] as const) {
          expect(row[model], `${group.category} / ${row.label} / ${model}`).toBeTruthy()
        }
      }
    }
  })
})
