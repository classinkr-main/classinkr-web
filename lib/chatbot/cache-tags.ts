// 챗봇/CS 콘솔 Data Cache 태그 — unstable_cache 로 감싼 조회와, 그 결과를 신선하지 않게
// 만드는 쓰기 경로가 같은 문자열을 공유하도록 한 곳에 둔다. 라우트 파일은 핸들러 외 export가
// 금지되므로(lib/admin/crm/cache-tags.ts 와 동일 관례) 여기서 export한다.

// /admin/chatbot 대시보드 통계(app/api/admin/chatbot/stats) — getChatbotStats.
export const CHATBOT_STATS_CACHE_TAG = "chatbot-stats"

// 문서 보강 큐(app/api/admin/docs/gaps, app/api/admin/docs/alpha-readiness) — listDocGapBacklog.
export const DOC_GAP_BACKLOG_CACHE_TAG = "chatbot-doc-gap-backlog"
