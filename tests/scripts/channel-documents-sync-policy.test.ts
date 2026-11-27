import { describe, expect, it } from "vitest"

import {
  channelDocumentSlug,
  hasInternalTerm,
  isInternalLabelLine,
  parseSyncSelectionArgs,
  planStaleArchive,
  resolveDocVisibility,
  selectArticlesForSync,
  stripInternalBlocks,
} from "../../scripts/lib/channel-documents-sync-policy"

// 채널톡 동기화의 공개 경계 — 공개 챗봇 검색은 public·unlisted + noindex=false 를 읽는다(unlisted 도 공개).
// 초안·비공개·내부 블록이 그 길로 들어가지 않는지 고정한다. 글은 모두 샘플이다(실제 아티클·사람·연락처 없음).

describe("선택 인자", () => {
  it("기본은 published 만, --include-drafts 를 줄 때만 초안까지", () => {
    expect(parseSyncSelectionArgs([])).toEqual({ includeDrafts: false, publicRequested: false })
    expect(parseSyncSelectionArgs(["--published-only"])).toEqual({ includeDrafts: false, publicRequested: false })
    expect(parseSyncSelectionArgs(["--include-drafts", "--public"])).toEqual({ includeDrafts: true, publicRequested: true })
  })

  it("--include-drafts 와 --published-only 를 같이 쓰면 오류", () => {
    expect(() => parseSyncSelectionArgs(["--include-drafts", "--published-only"])).toThrow()
  })
})

describe("글 고르기", () => {
  const articles = [
    { id: "1", state: "published" },
    { id: "2", state: "draft" },
    { id: "3", state: "unpublished" },
    { id: "4" },
    { id: "5", state: " Published " },
  ]

  it("기본은 published 만 고르고 나머지는 notSelected 로 돌려준다", () => {
    const { selected, notSelected } = selectArticlesForSync(articles, { includeDrafts: false })
    expect(selected.map((article) => article.id)).toEqual(["1", "5"])
    expect(notSelected.map((article) => article.id)).toEqual(["2", "3", "4"])
  })

  it("--include-drafts 면 모두 고른다", () => {
    const { selected, notSelected } = selectArticlesForSync(articles, { includeDrafts: true })
    expect(selected).toHaveLength(5)
    expect(notSelected).toEqual([])
  })
})

describe("공개 범위", () => {
  it("published 가 아니면 --public 이어도 internal + noindex", () => {
    for (const channelState of ["draft", "unpublished", null, undefined, ""]) {
      for (const publicRequested of [false, true]) {
        expect(resolveDocVisibility({ channelState, publicRequested }), String(channelState)).toEqual({ visibility: "internal", noindex: true })
      }
    }
  })

  it("published 는 기본 unlisted, --public 이면 public — 둘 다 noindex false", () => {
    expect(resolveDocVisibility({ channelState: "published", publicRequested: false })).toEqual({ visibility: "unlisted", noindex: false })
    expect(resolveDocVisibility({ channelState: "published", publicRequested: true })).toEqual({ visibility: "public", noindex: false })
  })

  it("내부 표시 글(제목 머리)은 published 라도 internal", () => {
    expect(resolveDocVisibility({ channelState: "published", publicRequested: true, internalOnly: true })).toEqual({ visibility: "internal", noindex: true })
  })
})

describe("내부 블록 빼기", () => {
  it("제목 꼴 머리 — 그 절만 빼고 다음 같은 단계 제목부터 남긴다", () => {
    const markdown = [
      "## 수업 녹화 켜기",
      "수업 설정에서 녹화를 켭니다.",
      "## 게시 전 확인(내부용)",
      "샘플 내부 점검 문장입니다.",
      "### 점검 항목",
      "- 샘플 내부 항목",
      "## 녹화 파일 보기",
      "녹화 목록에서 봅니다.",
    ].join("\n")
    const scan = stripInternalBlocks(markdown)
    expect(scan.removedBlocks).toBe(1)
    expect(scan.markdown).toContain("수업 설정에서 녹화를 켭니다.")
    expect(scan.markdown).toContain("## 녹화 파일 보기")
    expect(scan.markdown).not.toMatch(/게시 전 확인|샘플 내부|점검 항목/)
    expect(scan.residualMentions).toBe(0)
  })

  it("콜아웃 꼴 — 내용이 든 인용 묶음 하나를 뺀다", () => {
    const markdown = ["앞 문단입니다.", "", "> :memo: **게시 전 확인(내부용)**", "> 샘플 내부 메모입니다.", "", "뒤 문단입니다."].join("\n")
    const scan = stripInternalBlocks(markdown)
    expect(scan.removedBlocks).toBe(1)
    expect(scan.markdown).toBe("앞 문단입니다.\n\n뒤 문단입니다.")
  })

  it("머리만 든 콜아웃·굵은 머리 줄 — 범위를 몰라 그 줄부터 본문 끝까지 뺀다", () => {
    const calloutOnly = stripInternalBlocks(["공개 안내입니다.", "> 📌 내부용", "샘플 내부 문장입니다.", "## 다른 절", "샘플 내부 계속"].join("\n"))
    expect(calloutOnly.markdown).toBe("공개 안내입니다.")

    const boldLabel = stripInternalBlocks(["공개 안내입니다.", "", "**게시 전 확인 (내부용)**", "- 샘플 내부 항목", "", "### 하위 절", "샘플 내부 계속"].join("\n"))
    expect(boldLabel.removedBlocks).toBe(1)
    expect(boldLabel.markdown).toBe("공개 안내입니다.")

    const listLabel = stripInternalBlocks(["공개 안내입니다.", "- [내부 전용] 샘플 내부 항목", "- 샘플 다음 항목"].join("\n"))
    expect(listLabel.markdown).toBe("공개 안내입니다.")
  })

  it("내부 블록이 없으면 그대로, 제품 설명 낱말(내부 용량·내부 메모 기능)은 머리로 보지 않는다", () => {
    const markdown = ["## 저장 공간", "내부 용량이 부족하면 녹화 파일을 지웁니다.", "내부 메모 기능은 수업 화면에 있습니다.", "> 팁: 설정에서 바꿀 수 있습니다."].join("\n")
    const scan = stripInternalBlocks(markdown)
    expect(scan).toEqual({ markdown, removedBlocks: 0, removedLines: 0, residualMentions: 0 })
  })

  it("문장 가운데 내부 표시 낱말은 빼지 않고 남은 줄 수로 알린다(경고용)", () => {
    const scan = stripInternalBlocks("이 화면은 사내 전용 설정과 다릅니다.")
    expect(scan.removedBlocks).toBe(0)
    expect(scan.residualMentions).toBe(1)
  })

  it("머리 판정 — 줄 머리 또는 괄호로 감싼 내부 표시", () => {
    expect(isInternalLabelLine("### 게시 전 확인(내부용)")).toBe(true)
    expect(isInternalLabelLine("FAQ 답변 [내부용]")).toBe(true)
    expect(isInternalLabelLine("> **Internal only**")).toBe(true)
    expect(isInternalLabelLine("1. 게시전 점검")).toBe(true)
    expect(isInternalLabelLine("수업 녹화 안내")).toBe(false)
    expect(isInternalLabelLine("내부 용량 확인")).toBe(false)
    expect(isInternalLabelLine("")).toBe(false)
    expect(hasInternalTerm("요약 — 내부용 메모 포함")).toBe(true)
    expect(hasInternalTerm("수업 녹화 요약")).toBe(false)
  })
})

describe("reconcile", () => {
  it("이번 세트에 없는 행은 archive, 고르지 않은 초안의 기존 행은 그대로 둔다", () => {
    const managed = ["1", "2", "3", "4"].map((id) => ({ id: `row-${id}`, slug: channelDocumentSlug(id) }))
    const plan = planStaleArchive({
      managed,
      currentSlugs: new Set([channelDocumentSlug("1")]),
      protectedSlugs: new Set([channelDocumentSlug("2")]),
    })
    expect(plan).toEqual({ archiveIds: ["row-3", "row-4"], keptUnselected: 1 })
  })
})
