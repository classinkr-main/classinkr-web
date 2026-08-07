"use client"

import { useRef, useState } from "react"

import CrmMatchingCoverageBand from "@/components/admin/crm/matching/CrmMatchingCoverageBand"
import HwRevReconcilePanel from "@/components/admin/crm/matching/HwRevReconcilePanel"
import MatchingInboxClient from "@/components/admin/crm/matching/MatchingInboxClient"

// 커버리지 밴드(매출보유 계정 기준)와 매칭 인박스를 한 클라이언트 경계로 묶어
// 톱 계정 칩 클릭 → 인박스 이름 필터 프리필을 잇는 공유 상태를 관리한다.
// 하단에는 출고↔매출 존재성 대사 패널(접힘 기본, 펼칠 때 lazy fetch)을 둔다.
// initialNameFilter: 매칭 page가 ?name= 딥링크(rev-sheet '연결하기' 등)에서 시드(CRM-1).
export default function CrmMatchingWorkspace({ initialNameFilter }: { initialNameFilter?: string } = {}) {
  const [nameFilter, setNameFilter] = useState(initialNameFilter ?? "")
  const inboxRef = useRef<HTMLDivElement>(null)

  // useState 초기값으로만 받으면 첫 마운트 이후의 ?name= 변경(다른 딥링크·뒤로가기)이 무시돼
  // 주소는 새 고객인데 인박스는 이전 고객 필터에 머문다.
  // prop이 바뀔 때 상태를 맞추는 렌더 중 조정 패턴 — effect + setState보다 리렌더가 한 번 적다.
  const [seenInitialNameFilter, setSeenInitialNameFilter] = useState(initialNameFilter)
  if (initialNameFilter !== seenInitialNameFilter) {
    setSeenInitialNameFilter(initialNameFilter)
    setNameFilter(initialNameFilter ?? "")
  }

  const selectAccount = (name: string) => {
    setNameFilter((current) => (current === name ? "" : name))
    window.requestAnimationFrame(() => {
      inboxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  return (
    <>
      <div ref={inboxRef}>
        <MatchingInboxClient
          nameFilter={nameFilter || undefined}
          onClearNameFilter={() => setNameFilter("")}
        />
      </div>
      {/* 커버리지는 진단·필터 보조 표면이다. 확정 인박스 뒤에 두되 계정 선택 시
          결과가 있는 인박스로 되돌려, 아래에서 필터하고 위에서 찾는 단절을 막는다. */}
      <CrmMatchingCoverageBand
        onSelectAccount={selectAccount}
        activeName={nameFilter || undefined}
      />
      <HwRevReconcilePanel />
    </>
  )
}
