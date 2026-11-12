/**
 * 챗봇 답변 본문에서 `[LEAD_SUBMIT:...]` 토큰을 지운다.
 *
 * 예전에는 finalizeAnswer 가 이 토큰을 파싱해 `saveLead` 를 직접(fire-and-forget) 불렀다.
 * 그 경로는 submitLeadCapture 를 건너뛰어 Compass 전달(#72/#80)·광고 전환·동의 기록·중복
 * 가드가 빠졌고, source 를 contact_page 로 위장했다. 이제 대화 속에서는 리드를 저장하지 않는다.
 * 접수는 챗봇 상담 연결 → `/contact?source=chatbot` 문의 폼 → /api/lead → submitLeadCapture
 * 한 경로뿐이다. 프롬프트에서도 토큰 지시를 지웠지만, 모델(또는 캐시된 옛 답변)이 토큰을
 * 내더라도 사용자에게 보이지 않게 여기서 한 번 더 지운다.
 *
 * 닫히지 않은 토큰(스트림이 잘린 경우)도 줄 끝까지 지운다.
 */
const LEAD_SUBMIT_TOKEN = /\[LEAD_SUBMIT:[^\]\n]*(?:\]|$)/gim

export function stripLeadSubmitTokens(answer: string): { answer: string; stripped: boolean } {
  if (!answer || !/\[LEAD_SUBMIT:/i.test(answer)) return { answer, stripped: false }
  const cleaned = answer
    .replace(LEAD_SUBMIT_TOKEN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return { answer: cleaned, stripped: true }
}
