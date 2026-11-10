// 워크북 템플릿(HTML → Chromium, scripts/render-lead-magnet-workbook-pdf.mjs)으로 따로 만드는 자료 — 목록의 정본.
// 보는 곳: 그 렌더 스크립트(만들 대상), lib/lead-magnet-pdf/links.ts(따로 만든 PDF 예외 — 서버 생성본으로 바꾸지 않는다),
// scripts/generate-lead-magnet-pdfs.py 의 WORKBOOK_SLUGS(건너뛰기, tests/scripts/lead-magnet-workbook-pdf.test.ts 가 대조).
// 노드 스크립트와 앱(클라이언트 번들 포함)이 같이 import 하므로 의존성 없는 순수 .mjs 로 둔다.
export const WORKBOOK_SLUGS = [
  "academy-system-checklist",
  "electronic-whiteboard-classroom-checklist",
  "academy-ai-data-ops-guide",
]
