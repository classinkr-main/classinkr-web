import "server-only"

import { redactInternalCsDraft } from "@/lib/internal-cs-chat/redact"

/**
 * 내부 CS 값(질문·히스토리·OCR·첨부 파일명·검토 메모·교정본)에는 고객 식별정보가 섞일 수 있다.
 * 외부 모델(Gemini 생성·비전·회귀 심판·임베딩)로 나가는 모든 텍스트는 이 경계 함수를 먼저 통과한다.
 *
 * 현재 경계 통과 지점:
 * - lib/internal-cs-chat/gemini.ts buildContents — 질문·내부 컨텍스트·히스토리
 * - app/api/admin/cs-chat/conversations/[id]/generate/route.ts buildInternalCsAssetEvidence — 파일명·요약·OCR
 * - lib/internal-cs-chat/vision.ts analyzeInternalCsImage — 파일명·담당자 지시문(이미지 바이트 자체는 불가)
 * - lib/internal-cs-chat/regression-eval.ts judgeRegression — 질문·기준 답변·재생성 답변
 * - app/api/admin/cs-chat/messages/[messageId]/promote-knowledge/route.ts — 승격 청크 임베딩 입력
 * (consultation-search.ts·gap-ingest.ts 는 같은 redactPii 를 직접 호출한다.)
 *
 * 가리는 범위는 redact.ts 의 redactInternalCsDraft 와 같다: 이메일·사업자번호·카드·전화(공개 챗봇 redactPii) +
 * 주민등록번호·계좌·생년월일·'UID/계정' 표시가 붙은 번호.
 * 가리지 못하는 것: 사람 이름, 주소, 표시 없는 숫자 ID, 여권·IP, 이미지 속 글자. 이런 값은 사람이 직접 확인해야 하고,
 * 답에 되풀이되는지는 answer-checks.ts 가 경고한다.
 */
export function redactInternalCsText(value: string | null | undefined) {
  return redactInternalCsDraft(value).text
}
