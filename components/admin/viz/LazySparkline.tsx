"use client"

import dynamic from "next/dynamic"

// 클라이언트 캐시·번들 규약 점검(2026-09-10) — Sparkline은 Recharts를 끌고 오므로 소비처가
// next/dynamic(ssr:false)으로 감싸는 것이 저장소 규약이다(Sparkline.tsx 주석). 그런데 규약을
// "기억"에 의존해 소비처마다 같은 보일러플레이트를 손으로 반복하다 보니 실제로 한 곳
// (components/admin/campaigns/perf/CampaignScoreboard.tsx)이 정적 import로 규약을 어겨
// Recharts 사본을 하나 더 만들었다(횡단 인프라 감사 2026-09-10, 번들 실측 §3.5) — 그
// 소비처는 이 viz 디렉터리 밖 소유라 직접 고치지 못하고 위임했지만, "다음 소비처"가 같은
// 실수를 반복하지 않도록 규약 자체를 코드로 만들어 여기 둔다.
//
// 사용법: `import { Sparkline } from "@/components/admin/viz/Sparkline"` 대신
// `import LazySparkline from "@/components/admin/viz/LazySparkline"`를 쓴다 — props는 동일
// (SparklineProps 재수출). 로딩 중 자리표시가 필요하면(높이가 큰 경우 레이아웃 시프트 방지)
// 소비처가 own dynamic()으로 loading을 커스터마이즈하는 기존 방식도 여전히 유효하다 — 이
// 파일은 "기본값이 안전한" 지름길이지 유일한 방법으로 강제하지 않는다.
//
// viz/index.ts 배럴에는 올리지 않았다 — 그 배럴은 "정적 import해도 Recharts가 안 새는"
// 계약이고, 이 파일은 반대로 "정적 import해도 안전하도록 스스로 동적 로드를 감싼 것"이라
// 성격이 다르다. 직접 경로 import(다른 Sparkline 소비처와 동일한 관례)로 충분하다.
const LazySparkline = dynamic(() => import("./Sparkline").then((mod) => mod.Sparkline), {
  ssr: false,
})

export default LazySparkline
export type { SparklineProps } from "./Sparkline"
