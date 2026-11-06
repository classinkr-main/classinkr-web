/**
 * 공개 문제 해결(버그 해결) 문서.
 *
 * 증상별로 "먼저 해 볼 것 → 그래도 안 되면 → 문의할 때 알려 줄 것" 순서로 쓴다.
 * 근거는 Figma 안내 화면 모음(CS용 캡쳐 모음)과 공식 도움말에서 확인되는 내용만 쓴다.
 * 내부 진단 화면·본사 보고 절차·고객사 사례는 공개하지 않는다(docs/active/cs-troubleshooting 은 내부 전용).
 * 각 섹션의 화면 사진은 lib/docs-guide-media/troubleshooting*.ts 에서 붙인다.
 * 챗봇 증상 트리아지(lib/chatbot/symptom-triage.ts)가 섹션 heading 으로 단계를 뽑아 답하므로,
 * heading 을 바꾸면 그 파일의 steps.heading 도 같이 바꾼다(tests/chatbot/symptom-triage.test.ts 가 깨져 알려 준다).
 */
import type { DocArticle } from "@/lib/docs"
import { APP_CLASS_TROUBLESHOOTING_DOCS } from "@/lib/docs-troubleshooting/app-class"
import { RECORDING_TROUBLESHOOTING_DOCS } from "@/lib/docs-troubleshooting/recording"

export const TROUBLESHOOTING_DOCS: DocArticle[] = [
  ...APP_CLASS_TROUBLESHOOTING_DOCS,
  ...RECORDING_TROUBLESHOOTING_DOCS,
]
