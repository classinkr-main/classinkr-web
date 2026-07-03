"use client"

import { useState } from "react"

import CrmMatchingCoverageBand from "@/components/admin/crm/matching/CrmMatchingCoverageBand"
import MatchingInboxClient from "@/components/admin/crm/matching/MatchingInboxClient"

// 커버리지 밴드(매출보유 계정 기준)와 매칭 인박스를 한 클라이언트 경계로 묶어
// 톱 계정 칩 클릭 → 인박스 이름 필터 프리필을 잇는 공유 상태를 관리한다.
export default function CrmMatchingWorkspace() {
  const [nameFilter, setNameFilter] = useState("")

  return (
    <>
      <CrmMatchingCoverageBand
        onSelectAccount={(name) => setNameFilter((current) => (current === name ? "" : name))}
        activeName={nameFilter || undefined}
      />
      <MatchingInboxClient
        nameFilter={nameFilter || undefined}
        onClearNameFilter={() => setNameFilter("")}
      />
    </>
  )
}
