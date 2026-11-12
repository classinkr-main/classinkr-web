# 챗봇 리드 소스 분류 — 합의 메모 (초안, 2026-11-12)

상태: **추천안으로 구현, 최종 합의 대기.** 브랜치 `fix/chatbot-lead-capture`.

## 결정 내용 (구현된 추천안)

- 챗봇 대화에서 이어진 문의는 `/contact?source=chatbot` 문의폼에서 접수하고, 리드 `source`는 `chatbot`으로 저장한다. 문의 유형(topic)은 지금처럼 `source_detail`에 남긴다.
- `chatbot`은 `DIRECT_INBOUND_LEAD_SOURCES`와 `WEBSITE_FORM_LEAD_SOURCES` **둘 다**에 넣는다. 즉 `contact_page`와 같은 규칙으로 Compass 전달·정시 재동기화 대상이 된다.
- 필수값·동의는 문의폼과 동일(기관명, 이름, 연락처, 문의 내용 / 개인정보·마케팅·광고 동의 체크박스). 모델 판단으로 동의를 받지 않는다.
- 이전 경로(`[LEAD_SUBMIT]` 토큰 → `saveLead`, source를 `contact_page`로 위장, `source_detail=chatbot_assist_registration`)는 삭제했다. 답변에 토큰이 남으면 지우고 경고 로그만 남긴다.
- 우선순위·랭킹 점수는 문의폼과 같은 급으로 취급한다(lead-ranking 22).

## 합의가 필요한 것

1. Compass 쪽이 `source=chatbot` 값을 받아들이는지 확인(이 저장소 밖, 미검증).
2. 둘 다 넣기(추천) vs `DIRECT_INBOUND`만. Compass 전달을 챗봇만 동의 게이트에 묶을지.
3. 광고 유입 후 챗봇 전환을 UTM으로 따로 집계할지.
4. 기존 `source=contact_page AND source_detail=chatbot_assist_registration` 행: 재분류 / 유지 / 제외. 조회 쿼리는 `supabase/queries/chatbot_assist_registration_audit.sql`(읽기 전용, 미실행, 브랜치 `chore/plan-day1-2`).
