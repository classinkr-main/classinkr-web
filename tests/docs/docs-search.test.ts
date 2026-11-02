import { describe, expect, it } from "vitest"

import { getAllDocsSummaries, scoreDocsArticle } from "@/app/docs/_utils"
import { getDocPath, listDocs } from "@/lib/docs"
import {
  analyzeDocsQuery,
  convertQwertyToHangul,
  DOCS_POPULAR_SEARCHES,
  normalizeSearchText,
  scoreDocsSearch,
  searchDocs,
  suggestDocsQueries,
  type DocsSearchable,
} from "@/lib/docs-search"

/**
 * 가이드 검색 대표 질의 — 고객이 실제로 치는 말로 기대 문서가 3위 안에 드는지 본다.
 * 문제 해결 문서는 계속 늘어나므로 "있으면 그것, 없으면 주제 문서" 기준으로 쓴다.
 */

const summaries = getAllDocsSummaries()
const listedHrefs = new Set(summaries.map((doc) => doc.href))

function top(query: string, count = 3) {
  return searchDocs(summaries, query)
    .slice(0, count)
    .map((result) => result.doc.href)
}

function has(href: string) {
  return listedHrefs.has(href)
}

function troubleshootingHrefs(predicate: (title: string) => boolean) {
  return summaries
    .filter((doc) => doc.searchIndex?.kind === "troubleshooting" && predicate(doc.title))
    .map((doc) => doc.href)
}

function titleHrefs(predicate: (title: string) => boolean) {
  return summaries.filter((doc) => predicate(doc.title)).map((doc) => doc.href)
}

function expectSomeInTop(query: string, candidates: string[], count = 3) {
  expect(candidates.length, `"${query}" 기대 문서 후보가 없습니다`).toBeGreaterThan(0)
  const ranked = top(query, count)
  expect(
    ranked.some((href) => candidates.includes(href)),
    `"${query}" 상위 ${count}: ${ranked.join(", ")} / 후보: ${candidates.join(", ")}`
  ).toBe(true)
}

describe("docs search — 대표 질의", () => {
  it("로그인 안돼요 → 로그인 문제 해결 문서(없으면 로그인 문서)", () => {
    const expected = has("/docs/start/login-troubleshooting")
      ? ["/docs/start/login-troubleshooting"]
      : titleHrefs((title) => title.includes("로그인") || title.includes("비밀번호"))
    expectSomeInTop("로그인 안돼요", expected)
  })

  it("문제 해결 문서가 있으면 증상형 질의에서 1위로 올라온다", () => {
    if (!has("/docs/start/login-troubleshooting")) return
    expect(top("로그인 안돼요", 1)).toEqual(["/docs/start/login-troubleshooting"])
    expect(top("로그인이 안 될 때", 1)).toEqual(["/docs/start/login-troubleshooting"])
  })

  it("비밀번호변경(붙여 씀) → 비밀번호 변경 PC·모바일", () => {
    const ranked = top("비밀번호변경")
    for (const href of ["/docs/start/password-change-pc", "/docs/start/password-change-mobile"]) {
      if (has(href)) expect(ranked).toContain(href)
    }
  })

  it("녹화 안됨 → 녹화 문제 해결 문서(없으면 녹화 문서)", () => {
    const troubleshooting = troubleshootingHrefs((title) => title.includes("녹화"))
    const expected =
      troubleshooting.length > 0 ? troubleshooting : titleHrefs((title) => title.includes("녹화"))
    expectSomeInTop("녹화 안됨", expected)
    if (troubleshooting.length > 0) expect(troubleshooting).toContain(top("녹화 안됨", 1)[0])
  })

  it("학생 초대 → 코스 구성원 초대 또는 학생 추가", () => {
    expectSomeInTop(
      "학생 초대",
      ["/docs/teacher/course-members", "/docs/admin/student-onboarding"].filter(has)
    )
  })

  it("숙제 제출이 안돼요 / 과제 제출 → 숙제 제출 문서", () => {
    const troubleshooting = troubleshootingHrefs((title) => title.includes("숙제"))
    const howto = titleHrefs((title) => title.includes("제출"))
    expectSomeInTop("숙제 제출이 안돼요", troubleshooting.length > 0 ? troubleshooting : howto)
    expectSomeInTop("과제 제출", [...troubleshooting, ...howto])
  })

  it("캠 안 나와요 → 카메라 문제 해결(없으면 카메라 문서)", () => {
    const troubleshooting = troubleshootingHrefs((title) => title.includes("카메라"))
    expectSomeInTop(
      "캠 안 나와요",
      troubleshooting.length > 0 ? troubleshooting : titleHrefs((title) => title.includes("카메라"))
    )
  })

  it("다시보기 안 보여요 → 다시보기 문서", () => {
    expectSomeInTop("다시보기 안 보여요", titleHrefs((title) => title.includes("다시보기")))
  })

  it("PC 설치 → PC 설치 안내", () => {
    if (has("/docs/start/pc-install")) expect(top("PC 설치", 1)).toEqual(["/docs/start/pc-install"])
  })

  it("EDB·이디비 → EDB 를 다루는 문서가 결과에 있다", () => {
    expect(top("EDB").length).toBeGreaterThan(0)
    expect(top("이디비").length).toBeGreaterThan(0)
  })

  it("자주 찾는 주제는 모두 결과가 하나 이상 나온다", () => {
    for (const topic of DOCS_POPULAR_SEARCHES) {
      expect(searchDocs(summaries, topic).length, topic).toBeGreaterThan(0)
    }
  })

  it("공개 목록 문서만 결과에 나온다", () => {
    const hidden = new Set(
      listDocs()
        .filter((doc) => (doc.visibility ?? "public") !== "public" || doc.noindex)
        .map(getDocPath)
    )
    for (const query of ["로그인", "녹화", "설치", "학생"]) {
      for (const result of searchDocs(summaries, query)) {
        expect(hidden.has(result.doc.href)).toBe(false)
      }
    }
  })
})

describe("docs search — 정규화", () => {
  it("띄어쓰기를 무시한다", () => {
    expect(top("비밀번호변경", 2).sort()).toEqual(top("비밀번호 변경", 2).sort())
    expect(top("로그인안돼요", 1)).toEqual(top("로그인 안 돼요", 1))
  })

  it("안돼/안 돼/안됨/안되요 를 같은 증상으로 본다", () => {
    const first = top("로그인 안돼요", 1)
    for (const query of ["로그인 안 돼요", "로그인 안됨", "로그인 안되요", "로그인이 안 됩니다"]) {
      expect(top(query, 1), query).toEqual(first)
    }
    expect(analyzeDocsQuery("로그인 안돼요").symptom).toBe(true)
    expect(analyzeDocsQuery("로그인 방법").symptom).toBe(false)
  })

  it("흔한 구어·줄임말을 같은 말로 본다", () => {
    expect(top("로긴 안돼요", 1)).toEqual(top("로그인 안돼요", 1))
    const password = ["/docs/start/password-change-pc", "/docs/start/password-change-mobile"].filter(has)
    if (password.length > 0) expectSomeInTop("비번 변경", password)
  })

  it("조사와 '어떻게·방법' 같은 말은 검색어에서 뺀다", () => {
    const analysis = analyzeDocsQuery("학생을 초대하는 방법")
    expect(analysis.terms.filter((term) => !term.soft).map((term) => term.base)).toEqual([
      "학생",
      "초대",
    ])
  })

  it("normalizeSearchText 는 소문자·구두점 정리를 한다", () => {
    expect(normalizeSearchText("  PC 설치 (윈도우, 맥)  ")).toBe("pc 설치 윈도우 맥")
    expect(normalizeSearchText("+82 010")).toBe("+82 010")
  })
})

const syntheticDoc = (overrides: Partial<DocsSearchable> = {}): DocsSearchable => ({
  title: "관리자 대시보드 열기",
  description: "대시보드에서 학원 설정을 바꿉니다.",
  category: "관리자 가이드",
  tags: ["관리자"],
  searchIndex: {
    kind: "howto",
    keywords: ["관리자 대시보드"],
    sections: [
      { id: "section-1", heading: "대시보드 들어가기", text: "로그인한 뒤 대시보드를 엽니다." },
      { id: "section-2", heading: "비밀번호를 바꾸려면", text: "계정 설정에서 비밀번호를 변경합니다." },
    ],
    extra: "",
  },
  ...overrides,
})

describe("docs search — 점수와 결과 표시", () => {
  it("짧은 동의어(보드)는 대시보드 속 글자와 맞추지 않는다", () => {
    expect(scoreDocsSearch(syntheticDoc(), "보드")).toBe(0)
    expect(scoreDocsSearch(syntheticDoc({ title: "ClassIn Board 설치" }), "보드")).toBeGreaterThan(0)
  })

  it("제목 > 섹션 제목 > 키워드 > 설명 > 본문 순으로 점수를 준다", () => {
    const base = {
      title: "가",
      description: "나",
      tags: [],
      searchIndex: {
        kind: "howto" as const,
        keywords: [],
        sections: [{ id: "section-1", heading: "다", text: "라" }],
        extra: "",
      },
    }
    const inTitle = scoreDocsSearch({ ...base, title: "스토리지 관리" }, "스토리지")
    const inHeading = scoreDocsSearch(
      { ...base, searchIndex: { ...base.searchIndex, sections: [{ id: "section-1", heading: "스토리지 보기", text: "" }] } },
      "스토리지"
    )
    const inKeyword = scoreDocsSearch(
      { ...base, searchIndex: { ...base.searchIndex, keywords: ["스토리지"] } },
      "스토리지"
    )
    const inDescription = scoreDocsSearch({ ...base, description: "스토리지를 봅니다" }, "스토리지")
    const inBody = scoreDocsSearch(
      { ...base, searchIndex: { ...base.searchIndex, sections: [{ id: "section-1", heading: "다", text: "스토리지" }] } },
      "스토리지"
    )
    expect(inTitle).toBeGreaterThan(inHeading)
    expect(inHeading).toBeGreaterThan(inKeyword)
    expect(inKeyword).toBeGreaterThan(inDescription)
    expect(inDescription).toBeGreaterThan(inBody)
    expect(inBody).toBeGreaterThan(0)
  })

  it("증상형 질의는 문제 해결 문서를 같은 조건의 사용법 문서보다 위로 올린다", () => {
    const howto = syntheticDoc({ title: "로그인하기", searchIndex: { ...syntheticDoc().searchIndex!, kind: "howto" } })
    const troubleshooting = syntheticDoc({
      title: "로그인하기",
      searchIndex: { ...syntheticDoc().searchIndex!, kind: "troubleshooting" },
    })
    expect(scoreDocsSearch(troubleshooting, "로그인 안돼요")).toBeGreaterThan(
      scoreDocsSearch(howto, "로그인 안돼요")
    )
    expect(scoreDocsSearch(troubleshooting, "로그인 방법")).toBe(scoreDocsSearch(howto, "로그인 방법"))
  })

  it("맞은 섹션을 section-N 앵커와 함께 돌려주고 제목 강조어를 만든다", () => {
    const [result] = searchDocs([syntheticDoc({ title: "비밀번호 변경 (PC)" })], "비밀번호변경")
    expect(result.sections[0]).toEqual({ id: "section-2", title: "비밀번호를 바꾸려면" })
    expect(result.highlight.split(" ")).toEqual(expect.arrayContaining(["비밀번호", "변경"]))
  })

  it("색인이 없는 요약도 예전처럼 제목·설명·searchText 로 찾는다", () => {
    const plain = { title: "웹 라이브 만들기", description: "수업을 생중계합니다.", searchText: "플레이백 링크" }
    expect(scoreDocsSearch(plain, "웹라이브")).toBeGreaterThan(0)
    expect(scoreDocsSearch(plain, "플레이백")).toBeGreaterThan(0)
    expect(scoreDocsSearch(plain, "전자칠판")).toBe(0)
  })

  it("scoreDocsArticle 은 lib/docs-search 점수를 그대로 쓴다(홈·주제 페이지 호환)", () => {
    for (const doc of summaries.slice(0, 10)) {
      expect(scoreDocsArticle(doc, "로그인 안돼요")).toBe(scoreDocsSearch(doc, "로그인 안돼요"))
    }
    expect(scoreDocsArticle(summaries[0], "")).toBe(0)
  })
})

describe("docs search — 결과가 없을 때", () => {
  it("한/영 전환을 잊고 친 말을 한글로 되살린다", () => {
    expect(convertQwertyToHangul("fhrmdls")).toBe("로그인")
    expect(convertQwertyToHangul("shrghk")).toBe("녹화")
    expect(convertQwertyToHangul("qlalfqjsgh qusrud")).toBe("비밀번호 변경")
    expect(convertQwertyToHangul("로그인")).toBe("")
  })

  it("오타·자판 실수에 결과가 나오는 비슷한 검색어를 제안한다", () => {
    expect(searchDocs(summaries, "녹회")).toHaveLength(0)
    expect(suggestDocsQueries("녹회", summaries).some((word) => word.includes("녹화"))).toBe(true)
    expect(suggestDocsQueries("fhrmdls", summaries)[0]).toBe("로그인")
    for (const word of suggestDocsQueries("녹회", summaries)) {
      expect(searchDocs(summaries, word).length, word).toBeGreaterThan(0)
    }
  })
})
