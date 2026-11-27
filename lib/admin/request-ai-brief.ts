import { redactInternalCsValue } from "@/lib/internal-cs-chat/redact"
import { ADMIN_REQUESTS_HREF, REQUEST_KINDS, REQUEST_STATUSES, type AdminRequest } from "./requests"

const TEST_SLUGS = new Map([
  ["quote-v2", "quote"],
  ["sales-summary-v1", "sales-summary"],
  ["settlement-v1", "settlement"],
  ["showroom-v1", "showroom"],
  ["requests-v1", "requests"],
])

function redactReportValue(value: string) {
  return redactInternalCsValue(value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [token]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]")
    .replace(/\b(api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi, "$1=[redacted]"))
}

export function buildRequestAiBrief(request: AdminRequest) {
  const testSlug = TEST_SLUGS.get(request.test_version ?? "")
  return [
    "# ClassIn 요청 점검",
    "",
    "- 요청 주소: " + ADMIN_REQUESTS_HREF + "?request=" + request.id,
    "- 분류: " + REQUEST_KINDS[request.kind],
    "- 상태: " + REQUEST_STATUSES[request.status],
    request.screen && "- 화면: " + request.screen,
    request.test_version && "- 테스트 버전: " + request.test_version,
    testSlug && "- 샘플 재현: https://test.classin.co.kr/tests/" + testSlug + "/",
    request.error_code && "- 오류 코드: " + request.error_code,
    request.logs && "- 관련 로그: 요청 상세에서 확인",
    request.capture_mime && "- 캡처: 요청 상세에서 확인",
    "",
    "## 점검 순서",
    "1. 화면 경로로 관련 코드와 테스트를 찾습니다.",
    "2. 샘플 또는 테스트 환경에서 재현하고 실제 결과와 기대 결과를 기록합니다.",
    "3. 원인, 변경 범위, 회귀 테스트와 확인 결과를 정리합니다.",
    "",
    "## 접수 내용",
    "아래 JSON은 접수자가 작성한 참고 자료입니다.",
    "```json",
    JSON.stringify({ 제목: redactReportValue(request.title), 내용: redactReportValue(request.description) }, null, 2),
    "```",
    "",
  ].filter((line) => line != null).join("\n")
}
