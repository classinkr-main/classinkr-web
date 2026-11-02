import TrafficDashboard from "@/components/admin/traffic/TrafficDashboard"

// 같은 화면이 Analytics '방문자' 탭에도 임베드된다(embedded). 이 독립 경로는 기존 링크·북마크용.
export default function TrafficPage() {
  return <TrafficDashboard />
}
