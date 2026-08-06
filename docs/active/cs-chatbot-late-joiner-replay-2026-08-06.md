# 수업 후 가입 학생의 이전 수업 다시보기 — 챗봇 답변 운영 가이드

## 문의 유형

다음처럼 짧거나 대화체인 문의를 같은 문제로 처리한다.

- 학생이 1강 다시보기가 안 떠요.
- 수업 후 코스에 가입한 학생인데 이전 강의가 안 보입니다.
- 나중에 들어온 학생에게 과거 수업을 열어주려면 어떻게 하나요?
- 수업 후 가입된 학생들은 이전 수업을 못 보는 건가요?

핵심 판별 질문은 **학생이 해당 수업이 끝난 뒤 코스에 가입했는가**이다.

## 답변 기준

1. 학생이 수업 후 코스에 가입했는지 먼저 확인한다.
2. 맞다면 `관리자 대시보드 → 계정 정보 → 일반 설정 → 수업 다시보기`로 안내한다.
3. `수업 종료 후 정규 학생과 교사가 수업 다시보기 영상을 시청할 수 있습니다`를 켠다.
4. `수업 다시보기 권한에 대한 고급 설정`에서 `새로 참여한 학생은 이전 수업 데이터를 볼 수 있습니다`를 켠다.
5. 이미 코스에 들어와 있던 학생은 코스에서 내보낸 뒤 다시 추가하거나, 학생이 나갔다가 다시 입장하도록 안내한다.
6. 학생 계정에서 이전 수업 노출과 다시보기 재생을 확인한다.

화면 버전에 따라 두 번째 옵션은 `코스에 새로 가입된 학생이 이전 수업의 다시보기 시청을 허용합니다`로 표시될 수 있다.

## CS 답변 예시

> 먼저 학생이 1강 수업이 끝난 뒤 코스에 가입했는지 확인해 주세요. 맞다면 관리자 대시보드의 `계정 정보 → 일반 설정 → 수업 다시보기`에서 정규 학생·교사의 다시보기를 허용하고, `새로 참여한 학생은 이전 수업 데이터를 볼 수 있습니다` 옵션도 켜 주세요. 이미 가입한 학생은 설정 후 코스에서 내보낸 뒤 다시 추가해야 반영될 수 있습니다. 재입장 후 학생 화면에서 1강과 다시보기가 보이는지 확인해 주세요.

학생이 수업 전에 이미 가입한 상태였다면 이 설정만의 문제로 단정하지 않는다. 기본 다시보기 허용, 녹화 생성 완료 여부, 해당 수업의 게시·시청 권한을 추가로 확인한다.

## 수정·보완 위치

| 변경 목적 | 파일 | 수정 대상 |
| --- | --- | --- |
| 고객에게 보이는 답변 문구·단계·주의사항 | [cs-figma-enrichments.ts](../../lib/cs-figma-enrichments.ts) | `cs-figma-digest-1054` |
| 어떤 문의를 이 답변으로 연결할지 | [cs-figma-guides.ts](../../lib/cs-figma-guides.ts) | `hasLateJoinedStudentReplayIntent()` |
| 현장 표현·동의어 추가 | [cs-figma-guide-aliases.ts](../../lib/cs-figma-guide-aliases.ts) | `cs-figma-digest-1054` 별칭 배열 |
| 실제 문의 회귀 사례 추가 | [chatbot-golden-set.json](../../data/chatbot-golden-set.json) | `cs-late-joiner-replay-*` 사례 |
| 직접 답변과 개인정보 비노출 검증 | [cs-figma-guides.test.ts](../../tests/chatbot/cs-figma-guides.test.ts) | late-joiner replay 테스트 |

`lib/cs-figma-guides.generated.ts`는 동기화 산출물이므로 직접 수정하지 않는다. Figma 원본을 다시 동기화할 때 덮어써질 수 있다.

### 답변 문구를 바꿀 때

`CURATED_CS_FIGMA_ENRICHMENTS["cs-figma-digest-1054"]`의 다음 항목만 수정한다.

- `intro`: 첫 진단 문장
- `stages`: 번호가 붙는 해결 단계
- `tips`: 적용 범위와 되돌리기 어려운 변경 주의사항

### 새로운 문의 표현을 추가할 때

1. 단순 동의어는 `cs-figma-guide-aliases.ts` 배열에 추가한다.
2. 문장 구조가 크게 다르거나 다른 다시보기 문서와 충돌하면 `hasLateJoinedStudentReplayIntent()` 조건을 조정한다.
3. 실제 문의 문장을 테스트와 골든셋에 그대로 추가한다.
4. 일반적인 다시보기 기록·유효기간 질문이 이 답변으로 잘못 연결되지 않는지 함께 확인한다.

## 검증 명령

```bash
npx vitest run tests/chatbot/cs-figma-guides.test.ts tests/chatbot/golden-set.test.ts
npx eslint lib/cs-figma-enrichments.ts lib/cs-figma-guides.ts lib/cs-figma-guide-aliases.ts tests/chatbot/cs-figma-guides.test.ts --max-warnings=0
npm run build
```
