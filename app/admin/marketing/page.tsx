import { redirect } from "next/navigation"

// 마케팅 홈 = 캠페인 허브의 요약 탭. 광고비·리드·CPL·퍼널·캠페인을 같은 기간축으로 묶는
// 유일한 화면이라 "마케팅"으로 들어온 사람이 처음 볼 자리다.
//
// 예전에는 메시지 탭(?tab=email)으로 보냈다 — 발송 허브가 캠페인으로 흡수될 때
// (admin-ia-redesign §3) 걸어둔 호환 링크였는데, 그 사이 요약 탭이 퍼포먼스 대시보드가
// 되면서 "마케팅 홈이 이메일 발송함"이 된 상태로 남아 있었다.
export default function AdminMarketingPage() {
  redirect("/admin/campaigns?tab=summary")
}
