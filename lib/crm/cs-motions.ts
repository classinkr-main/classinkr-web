import type { CrmTaskType } from "@/lib/repositories/crm-tasks"

// 고객 성공(Customer Success) 동선 프리셋(plan §5.6, culture-fit §3.1 "입력 10초").
// 별도 테이블 없이 crm_tasks 위에서 원클릭으로 CS task를 만든다.
export interface CsMotion {
  key: string
  label: string
  title: string
  taskType: CrmTaskType
}

export const CS_MOTIONS: CsMotion[] = [
  { key: "install", label: "설치 일정", title: "설치 일정 확정", taskType: "install" },
  { key: "onboarding", label: "초기 세팅", title: "초기 세팅 확인", taskType: "cs_checkin" },
  { key: "activation", label: "첫 수업", title: "첫 수업 활성화 확인", taskType: "cs_checkin" },
  { key: "balance", label: "잔액/만료", title: "잔액·만료 확인", taskType: "renewal" },
  { key: "reactivate", label: "휴면 재활성", title: "휴면 고객 재활성화", taskType: "cs_checkin" },
  { key: "renewal", label: "갱신 상담", title: "갱신 상담", taskType: "renewal" },
  { key: "claim", label: "클레임 후속", title: "클레임 후속 처리", taskType: "cs_checkin" },
]

export function findCsMotion(key: string): CsMotion | undefined {
  return CS_MOTIONS.find((motion) => motion.key === key)
}
