import { IntroCaseGrid } from "@/components/introduction/IntroCaseGrid"

import { ProofSection, ProofSectionHead } from "./ProofParts"
import { PROOF_ALL_CASES } from "./proof-copy"

/**
 * 04 전체 사례 — 공용 IntroCaseGrid(분야 필터 index-tab + 사례 카드 17)를 그대로 쓴다.
 * 섹션 제목이 h2 라 카드 이름은 h3 다.
 */
export function ProofAllCases() {
  const { id, folio, kicker, title, lead } = PROOF_ALL_CASES
  return (
    <ProofSection id={id}>
      <ProofSectionHead id={id} folio={folio} kicker={kicker} title={title} lead={lead} />
      <IntroCaseGrid headingLevel={3} className="mt-10 md:mt-12" />
    </ProofSection>
  )
}
