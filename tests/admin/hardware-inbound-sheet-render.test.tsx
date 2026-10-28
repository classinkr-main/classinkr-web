import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import InboundSheet from "@/components/admin/hardware/inventory/InboundSheet"
import type { HardwareItem } from "@/components/admin/hardware/inventory/shared"

// 입고표 v2 첫 화면 — 서버 렌더로 칸이 그려지는지만 본다(검증·전송은 hardware-inbound-sheet-model.test.ts).

const ITEMS: HardwareItem[] = [
  { id: "item-86", name: '86" IFP', category: "전자칠판", reorder_point: 5, lead_time_days: 30, source_aliases: [], lot_tracked: true },
  { id: "item-a1", name: "A1", category: "액세서리", reorder_point: 0, lead_time_days: 14, source_aliases: [], lot_tracked: false },
]

const noop = () => {}

describe("입고표 v2 화면", () => {
  it("물류번호(다음 순번)·유상/무상·고정 보관 장소 3종 + 고객사 직배송을 보여 준다", () => {
    const html = renderToStaticMarkup(
      <InboundSheet open onClose={noop} items={ITEMS} movements={[]} initialProduct="A1" canWrite onSaved={noop} canManageInventory />
    )
    expect(html).toContain("물류번호")
    expect(html).toContain("C1")
    expect(html).toContain("새 물류번호")
    expect(html).toContain("유상 · 무상")
    for (const label of ["오산 창고", "인천 더조은", "클래스인 사무실", "고객사 직배송"]) expect(html).toContain(label)
    // 보관 장소는 직접 입력을 받지 않는다(수입자는 그대로 직접 입력이 있다).
    expect(html).not.toContain("기본 보관처 직접 입력")
    expect(html).not.toContain("보관처 이름")
    // 물류번호 관리 안 하는 품목 표시
    expect(html).toContain("수량만 · 물류번호 없음")
  })

  it("입고관리 권한이 없으면 입력 화면 대신 안내를 보여 준다", () => {
    const html = renderToStaticMarkup(
      <InboundSheet open onClose={noop} items={ITEMS} movements={[]} canWrite onSaved={noop} canManageInventory={false} />
    )
    expect(html).toContain("입고는 입고관리 권한자만 등록할 수 있습니다.")
    expect(html).not.toContain("유상 · 무상")
    expect(html).not.toContain("입고 저장")
  })
})
