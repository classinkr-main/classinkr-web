# 가이드 digest 공개 게이트 — 규칙과 제외 후보 (초안)

생성: `DIGEST_GATE_REPORT=1 npx vitest run scripts/report-digest-publish-gate.test.ts` · 규칙: `lib/docs-gate/digest-publish-gate.ts` · 대상: `lib/cs-figma-guides.generated.ts`

**상태: 초안.** 게이트는 아직 공개 목록·검색·챗봇에 연결하지 않았습니다. 아래 후보를 사람이 검토한 뒤, 승인된 것만 `INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS` 또는 생성기에 반영합니다. 대량 삭제는 승인 후입니다.

## 요약

- 전체 digest: 107편
- 제외 후보: 39편 (기존 비공개 포함, 새 후보 26편)
- 게이트 통과(공개 유지 후보): 68편
- 제외 사유별: 테스트·임시 제목 2, 질문·지시문 제목 4, 제목 중복 14, 화면 설명만 5, 기존 비공개 13, 내부 도구·진단 7, 날짜 공지성 제목 2, 빈 캡처 1
- 섹션 수정 필요: 원본 캡처 섹션 107, 캡처 판독 문장 65, 생성 오타 2

## 규칙

문서 단위(공개 목록에서 제외 후보):

1. 테스트·임시·샘플·제목 없음 제목
2. 빈 이미지·내용 없음
3. 특정 날짜에 묶인 공지성 제목(예: `~4/23`, `6/16 (화)`)
4. 질문·지시문이 제목인 경우(`Q :`, `?`로 끝남, `따라와 주세요`, `1.`로 시작)
5. 단계 없이 화면 설명만 있는 경우
6. 번역 툴·CS 진단·데이터 로그 등 고객용이 아닌 화면
7. 같은 제목(문장부호만 정규화, 괄호 속 기기·화면 구분은 유지)이 앞에 있으면 통합 후보 — 대표 문서 하나로 모읍니다

섹션 단위(문서는 남기고 공개 전 수정):

- “CS 주의사항과 원본 캡처” 섹션: 원본 파일명·캡처 주석은 공개하지 않습니다. 고객에게 유효한 주의/팁만 본문으로 옮깁니다.
- “빨간 박스”, “스텝 N:”, “강조됨” 같은 캡처 판독 문장: 행동 문장으로 다시 씁니다.
- 생성 오타(요요합니다, 설졍 등): 원본 digest 또는 파서에서 고칩니다.

## 제외 후보

| slug | 카테고리 | 제목 | 사유 | 대표 문서 |
|---|---|---|---|---|
| cs-figma-digest-91 | teacher | 테스트 | 테스트·임시 제목 |  |
| cs-figma-digest-120 | teacher | Q : 1문단의 흐름이 어떻게 진행되나요? | 질문·지시문 제목 |  |
| cs-figma-digest-220 | teacher | 클래스인 '현장 녹화' 카메라 설정 | 제목 중복 | cs-figma-digest-194 |
| cs-figma-digest-299 | start | 클래스인 '현장 녹화' 카메라 설정 | 제목 중복 | cs-figma-digest-194 |
| cs-figma-digest-426 | teacher | 임시 수업 가이드 | 테스트·임시 제목 |  |
| cs-figma-digest-473 | start | 클래스인 '현장 녹화' 카메라 설정 | 제목 중복 | cs-figma-digest-194 |
| cs-figma-digest-557 | teacher | AI Board — 답안 현황 / 트로피 수여 | 화면 설명만 |  |
| cs-figma-digest-603 | admin | 교실 스크린샷 / 학생 수 도표 / 출석·시간줄 (수업 상세 모니터링 대시보드) | 화면 설명만 |  |
| cs-figma-digest-655 | admin | 1. 수업 삭제 방법 | 질문·지시문 제목 |  |
| cs-figma-digest-689 | admin | 학원F OMR CS | 기존 비공개, 내부 도구·진단 |  |
| cs-figma-digest-757 | admin | Classin AI 비활성화 안내 | 기존 비공개, 제목 중복 | cs-figma-digest-732 |
| cs-figma-digest-778 | admin | Classin AI 비활성화 안내 | 제목 중복 | cs-figma-digest-732 |
| cs-figma-digest-817 | admin | 코스 설정 | 제목 중복 | cs-figma-digest-803 |
| cs-figma-digest-831 | admin | 코스 설정 | 제목 중복 | cs-figma-digest-803 |
| cs-figma-digest-846 | admin | 코스 설정 | 제목 중복 | cs-figma-digest-803 |
| cs-figma-digest-881 | admin | 내부 비밀번호 재설정 | 기존 비공개, 내부 도구·진단 |  |
| cs-figma-digest-982 | admin | 2. 다시보기 유효 기간 설정 | 질문·지시문 제목 |  |
| cs-figma-digest-1035 | admin | 코스를 기존 교사에서 다른 교사로 변경해야 할 경우, 아래 내용을 따라와 주세요! | 질문·지시문 제목 |  |
| cs-figma-digest-1239 | admin | 클래스인 교실 내 카메라/ 마이크 설정 확인 | 제목 중복 | cs-figma-digest-1213 |
| cs-figma-digest-1385 | teacher | 사용자 정보 — 수업 상세 / 네트워크·녹화 기록 조회 화면 | 기존 비공개 |  |
| cs-figma-digest-1402 | teacher | 사용자 정보 (Classin 관리자 — 사용자 수업 이력/품질 진단 화면) | 기존 비공개, 화면 설명만, 내부 도구·진단 |  |
| cs-figma-digest-1427 | teacher | PC 데이터 로그 보고 | 내부 도구·진단 |  |
| cs-figma-digest-1492 | teacher | 데이터 확인 안내 | 기존 비공개 |  |
| cs-figma-digest-1516 | teacher | 전자칠판 데이터 로그 보고 | 내부 도구·진단 |  |
| cs-figma-digest-1535 | teacher | 전자칠판 에러 안내 ~4/23 | 날짜 공지성 제목 |  |
| cs-figma-digest-1695 | teacher | Windows용 (다운로드 \| 클래스인 — classin.com/kr/download) | 제목 중복 | cs-figma-digest-1679 |
| cs-figma-digest-1789 | teacher | Classin 업데이트 가이드 | 제목 중복 | cs-figma-digest-1764 |
| cs-figma-digest-1895 | admin | Classin 기관 관리자 홈 — 계정 잔액 충전 위치 (충전 버튼 강조) | 기존 비공개 |  |
| cs-figma-digest-1914 | admin | 충전 | 기존 비공개 |  |
| cs-figma-digest-1936 | admin | 결제 수단 선택 (Airwallex 결제 페이지) | 기존 비공개 |  |
| cs-figma-digest-1960 | admin | 클래스인 앱 → 관리자 대시보드 충전 방법 안내 | 기존 비공개 |  |
| cs-figma-digest-1988 | teacher | Crowdin UI 가이드 | 기존 비공개, 내부 도구·진단 |  |
| cs-figma-digest-2017 | teacher | Crowdin UI 가이드 — 작업 과정 (EEO ClassIn / Korean / All Strings) | 기존 비공개, 내부 도구·진단 |  |
| cs-figma-digest-2115 | student | 6/16 (화) 따라읽기 | 날짜 공지성 제목 |  |
| cs-figma-digest-2161 | start | 시험 문제 대량 업로드 + 시험 추가 | 제목 중복 | cs-figma-digest-2034 |
| cs-figma-digest-2256 | teacher | (빈 이미지 — 내용 없음) | 기존 비공개, 빈 캡처 |  |
| cs-figma-digest-2269 | teacher | AI Board — 학생 답안 상세 / AI 채점 결과 | 화면 설명만 |  |
| cs-figma-digest-2283 | teacher | New Course | 제목 중복 | cs-figma-digest-2242 |
| cs-figma-digest-2340 | teacher | Windows용 클래스인 (다운로드 \| 클래스인) | 화면 설명만, 제목 중복 | cs-figma-digest-1644 |

## 공개 유지 후보 (섹션 수정 필요)

| slug | 카테고리 | 제목 | 수정 |
|---|---|---|---|
| cs-figma-digest-24 | start | 클래스인 코스 입장 ~ 현장 녹화 확인 (IFP) | 원본 캡처 섹션, 캡처 판독 문장, 생성 오타 |
| cs-figma-digest-49 | teacher | 클래스인 코스 입장 ~ 현장 녹화 확인 (PC) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-77 | teacher | AI Board | 원본 캡처 섹션 |
| cs-figma-digest-106 | teacher | New Course (클래스인 PC 앱 과정/수업 상세 화면) | 원본 캡처 섹션 |
| cs-figma-digest-145 | admin | 대시보드 수업 내용 다운로드 및 공유 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-173 | admin | 코스 관리 / 수업 녹화 데이터 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-194 | start | 클래스인 '현장 녹화' 카메라 설정 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-245 | start | 클래스인 [로컬 녹화] 후 [녹화 수업] 생성하기 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-274 | start | 클래스인 코스 입장 ~ 카메라 녹화 확인 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-328 | teacher | 코스 학습 활동 다른 코스/과정에 복사하기 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-350 | admin | 웹 라이브 생성 방법 (대시보드) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-376 | start | 웹 라이브 생성 방법 (앱) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-401 | teacher | 클래스인 '마이크' 설정 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-449 | start | 클래스인 전자칠판 내 [로컬 녹화] 기능 안내 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-500 | teacher | 판서 생성 & 불러오기 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-523 | admin | 수업 녹화 데이터 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-578 | start | AI 스피킹 미제출자에게 알림 전달하기 (홈 → 코스 → AI 스피킹 → 미제출 → 알림 전달) | 원본 캡처 섹션 |
| cs-figma-digest-618 | admin | 답안 현황 (대시보드 통계 화면) | 원본 캡처 섹션 |
| cs-figma-digest-633 | admin | 클래스인 관리자 대시보드에서 계정 세부 사용 내역 확인 방법 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-713 | admin | 코스 종료/클래스 탈퇴 (코스 설정) | 원본 캡처 섹션 |
| cs-figma-digest-732 | admin | Classin AI 비활성화 안내 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-803 | admin | 코스 설정 | 원본 캡처 섹션 |
| cs-figma-digest-859 | admin | 코스 멤버 삭제하기 (모바일 앱) | 원본 캡처 섹션 |
| cs-figma-digest-904 | admin | Classin 로그인 화면 (Classin Board) | 원본 캡처 섹션 |
| cs-figma-digest-919 | admin | 클래스인 관리자 대시보드에서 하위 계정 설정 방법 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-940 | admin | 기관 공유 드라이브 접근 권한 부여 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-961 | admin | 기관 공유 드라이브 접근 권한 부여 (수업 활용, 저장 X) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1004 | admin | 대시보드 수업 교사 설졍 & 삭제 | 원본 캡처 섹션, 캡처 판독 문장, 생성 오타 |
| cs-figma-digest-1054 | admin | 새로 들어온 학생도 수업 다시보기 시청 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1081 | admin | 수업중 링크 자료 사용/브라우저 즐겨찾기 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1102 | admin | 학생 닉네임 동기화 & 추가 안내 가이드 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1131 | admin | 코스 내 닉네임 변경 옵션 활성/비활성화 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1151 | admin | 코스 내 수업 온스테이지 옵션 변경 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1174 | admin | 코스 내 수업 온스테이지 옵션 변경 (대량) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1195 | admin | 코스 내 초대 활성화(QR, Link 등) | 원본 캡처 섹션 |
| cs-figma-digest-1213 | admin | 클래스인 교실 내 카메라/ 마이크 설정 확인 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1266 | admin | 전자칠판 클래스인 교실에서 마이크 활성화/비활성화 및 카메라 설정 확인 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1294 | admin | 클래스인 스토리지 삭제 안내 | 원본 캡처 섹션 |
| cs-figma-digest-1327 | admin | 학생 대리 등록 & 코스 입장 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1357 | teacher | 수업 정보 (종료됨) | 원본 캡처 섹션 |
| cs-figma-digest-1370 | teacher | 수업 상세 (출석 현황 · 학생 수 도표 · 시간축 타임라인) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1446 | student | 나의 참여 내역 (수업 시청/참여 내역 화면) | 원본 캡처 섹션 |
| cs-figma-digest-1462 | student | 학습 보고서 (Learning Report) | 원본 캡처 섹션 |
| cs-figma-digest-1477 | teacher | 학습 보고서 (Attendance / Blackboard Notes) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1558 | teacher | 대시보드 내에서 수업 다시보기 확인 방법 안내 | 원본 캡처 섹션 |
| cs-figma-digest-1582 | start | PDF 다운로드 | 원본 캡처 섹션 |
| cs-figma-digest-1602 | start | Windows용 클래스인 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1623 | teacher | ClassIn Windows 클라이언트 다운로드 — '다른 이름으로 저장' 대화상자 | 원본 캡처 섹션 |
| cs-figma-digest-1644 | teacher | Windows용 클래스인 (다운로드 \| 클래스인) | 원본 캡처 섹션 |
| cs-figma-digest-1658 | teacher | Windows용 클래스인 다운로드 / 설치하기 페이지 | 원본 캡처 섹션 |
| cs-figma-digest-1679 | teacher | Windows용 (다운로드 \| 클래스인 — classin.com/kr/download/) | 원본 캡처 섹션 |
| cs-figma-digest-1719 | teacher | 안드로이드 기기 업데이트(Playstore) / iOS 기기 업데이트 확인 (Appstore) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1741 | teacher | 안드로이드 기기 업데이트(Playstore) / 안드로이드 기기 업데이트 확인 (클래스인) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1764 | teacher | Classin 업데이트 가이드 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1813 | teacher | 클래스인 업데이트 (모바일) / 클래스인 캐시 삭제 (모바일) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1840 | teacher | 클래스인 캐시 삭제/업데이트 (PC) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-1863 | teacher | 클래스인X 삭제/재설치 (전자칠판) | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-2034 | teacher | 시험 문제 대량 업로드 + 시험 추가 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-2061 | admin | EDX 파일 생성 & 사용법 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-2083 | student | QR 코드 스캔으로 코스 가입하기 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-2103 | teacher | 숙제 제출 완료(학생 페이지) / 숙제 미제출(학생 페이지) / 숙제 제출 페이지(선생님 화면_PC) | 원본 캡처 섹션 |
| cs-figma-digest-2140 | start | 로그인 (Classin) | 원본 캡처 섹션 |
| cs-figma-digest-2190 | teacher | 비디오 갤러리 | 원본 캡처 섹션, 캡처 판독 문장 |
| cs-figma-digest-2217 | student | 숙제 업로드_모바일 | 원본 캡처 섹션 |
| cs-figma-digest-2242 | teacher | New Course | 원본 캡처 섹션 |
| cs-figma-digest-2297 | student | 올인원 하이브리드 학습 플랫폼 클래스인 | 원본 캡처 섹션 |
| cs-figma-digest-2311 | student | Classin 홈 (학생 대시보드 화면) | 원본 캡처 섹션 |
| cs-figma-digest-2324 | teacher | 학습 보고서 | 원본 캡처 섹션 |
