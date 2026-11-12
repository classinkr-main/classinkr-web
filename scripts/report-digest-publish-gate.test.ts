// digest 공개 게이트 초안 보고서 생성기. 기본 테스트 실행에서는 건너뛴다.
// DIGEST_GATE_REPORT=1 npx vitest run scripts/report-digest-publish-gate.test.ts
import { writeFileSync } from "fs"
import path from "path"
import { describe, it } from "vitest"

import { CS_FIGMA_DIGEST_GUIDES } from "@/lib/cs-figma-guides.generated"
import { INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS, type CsFigmaGuide } from "@/lib/cs-figma-guides"
import { evaluateDigestPublishGate, summarizeDigestGate } from "@/lib/docs-gate/digest-publish-gate"

const REASON_LABEL: Record<string, string> = {
  internal_only: "기존 비공개",
  test_title: "테스트·임시 제목",
  empty_capture: "빈 캡처",
  dated_title: "날짜 공지성 제목",
  non_guide_title: "질문·지시문 제목",
  screen_only: "화면 설명만",
  internal_tool: "내부 도구·진단",
  duplicate_title: "제목 중복",
  raw_capture_section: "원본 캡처 섹션",
  capture_annotation: "캡처 판독 문장",
  typo: "생성 오타",
}

describe.skipIf(process.env.DIGEST_GATE_REPORT !== "1")("digest gate report", () => {
  it("writes docs/active/docs-digest-publish-gate-draft.md", () => {
    const results = evaluateDigestPublishGate(CS_FIGMA_DIGEST_GUIDES as readonly CsFigmaGuide[], {
      internalOnly: INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS,
    })
    const s = summarizeDigestGate(results)
    const lines: string[] = []
    lines.push("# 가이드 digest 공개 게이트 — 규칙과 제외 후보 (초안)", "")
    lines.push(
      "생성: `DIGEST_GATE_REPORT=1 npx vitest run scripts/report-digest-publish-gate.test.ts` · 규칙: `lib/docs-gate/digest-publish-gate.ts` · 대상: `lib/cs-figma-guides.generated.ts`",
      "",
      "**상태: 초안.** 게이트는 아직 공개 목록·검색·챗봇에 연결하지 않았습니다. 아래 후보를 사람이 검토한 뒤, 승인된 것만 `INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS` 또는 생성기에 반영합니다. 대량 삭제는 승인 후입니다.",
      ""
    )
    lines.push("## 요약", "")
    lines.push(`- 전체 digest: ${s.total}편`)
    lines.push(`- 제외 후보: ${s.excludeCandidates}편 (기존 비공개 포함, 새 후보 ${s.newExcludeCandidates}편)`)
    lines.push(`- 게이트 통과(공개 유지 후보): ${s.publishable}편`)
    lines.push(
      `- 제외 사유별: ${Object.entries(s.excludeCounts).map(([k, v]) => `${REASON_LABEL[k]} ${v}`).join(", ")}`
    )
    lines.push(
      `- 섹션 수정 필요: ${Object.entries(s.fixCounts).map(([k, v]) => `${REASON_LABEL[k]} ${v}`).join(", ")}`,
      ""
    )
    lines.push("## 규칙", "")
    lines.push("문서 단위(공개 목록에서 제외 후보):", "")
    lines.push("1. 테스트·임시·샘플·제목 없음 제목")
    lines.push("2. 빈 이미지·내용 없음")
    lines.push("3. 특정 날짜에 묶인 공지성 제목(예: `~4/23`, `6/16 (화)`)")
    lines.push("4. 질문·지시문이 제목인 경우(`Q :`, `?`로 끝남, `따라와 주세요`, `1.`로 시작)")
    lines.push("5. 단계 없이 화면 설명만 있는 경우")
    lines.push("6. 번역 툴·CS 진단·데이터 로그 등 고객용이 아닌 화면")
    lines.push("7. 같은 제목(문장부호만 정규화, 괄호 속 기기·화면 구분은 유지)이 앞에 있으면 통합 후보 — 대표 문서 하나로 모읍니다", "")
    lines.push("섹션 단위(문서는 남기고 공개 전 수정):", "")
    lines.push("- “CS 주의사항과 원본 캡처” 섹션: 원본 파일명·캡처 주석은 공개하지 않습니다. 고객에게 유효한 주의/팁만 본문으로 옮깁니다.")
    lines.push("- “빨간 박스”, “스텝 N:”, “강조됨” 같은 캡처 판독 문장: 행동 문장으로 다시 씁니다.")
    lines.push("- 생성 오타(요요합니다, 설졍 등): 원본 digest 또는 파서에서 고칩니다.", "")
    lines.push("## 제외 후보", "")
    lines.push("| slug | 카테고리 | 제목 | 사유 | 대표 문서 |", "|---|---|---|---|---|")
    for (const r of results.filter((x) => x.exclude.length)) {
      lines.push(
        `| ${r.slug} | ${r.docCategory} | ${r.title.replace(/\|/g, "\\|")} | ${r.exclude.map((e) => REASON_LABEL[e]).join(", ")} | ${r.duplicateOf ?? ""} |`
      )
    }
    lines.push("", "## 공개 유지 후보 (섹션 수정 필요)", "")
    lines.push("| slug | 카테고리 | 제목 | 수정 |", "|---|---|---|---|")
    for (const r of results.filter((x) => !x.exclude.length)) {
      lines.push(
        `| ${r.slug} | ${r.docCategory} | ${r.title.replace(/\|/g, "\\|")} | ${r.sectionFixes.map((e) => REASON_LABEL[e]).join(", ")} |`
      )
    }
    writeFileSync(path.join(process.cwd(), "docs/active/docs-digest-publish-gate-draft.md"), lines.join("\n") + "\n")
  })
})
