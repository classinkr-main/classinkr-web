import { Suspense } from "react"

import SyncHealthBannerServer from "@/components/admin/SyncHealthBannerServer"
import { SYNC_HEALTH_SOURCES } from "@/lib/admin/sync-health"

import OpsHealthClient from "./OpsHealthClient"

// 운영 상태 — 본문은 클라이언트(OpsHealthClient, 통합 상태·자동화 API를 읽는다). 서버 셸은
// 원천 동기화 요약만 얹는다: 설정 통합 상태 API(lib/admin-integrations/status.ts)는 env 존재만 판정해
// "설정은 있는데 실행이 멈춤"(시트 권한 오류)이나 "몇 주째 건너뜀"을 말하지 못한다. 실행 기록 기준
// 판정은 원천 화면(KR Team·장부·원천 고객·매출시트·검수)의 경고 띠와 같은 lib/admin/sync-health.ts다.
// 별도 Suspense(fallback 없음)라 본문을 기다리게 하지 않는다.
export default function AdminOpsPage() {
  return (
    <OpsHealthClient
      syncHealthSlot={
        <Suspense fallback={null}>
          <SyncHealthBannerServer sources={SYNC_HEALTH_SOURCES} variant="summary" className="mb-6" hideOpsLink />
        </Suspense>
      }
    />
  )
}
