// 어드민 캘린더 캐시 태그 — 조립을 캐시하는 route.ts(핸들러 외 export 금지)와 그 원천에
// 쓰는 lib/calendar-data.ts가 같은 문자열을 공유해야 해서 한 곳에 둔다.
// (lib/admin/crm/cache-tags.ts와 같은 이유·같은 패턴.)

/** app/api/admin/calendar/health/route.ts의 조립 캐시(팀원 개인 캘린더 제외 7소스+공휴일). */
export const ADMIN_CALENDAR_HEALTH_CACHE_TAG = "admin-calendar-health"

/**
 * lib/calendar-data.ts의 월/전체 이벤트 조립 캐시(팀원 개인 캘린더 제외 8소스) 및
 * getPublicEventsAsCalendarEvents 캐시가 공유하는 태그. admin_calendar_events에 쓰는
 * createEvent/updateEvent/deleteEvent가 성공 시 이 태그를 무효화한다.
 */
export const ADMIN_CALENDAR_EVENTS_CACHE_TAG = "admin-calendar-events"
