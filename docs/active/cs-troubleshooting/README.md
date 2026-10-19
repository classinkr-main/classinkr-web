---
title: 기술지원 트러블슈팅 지식
slug: cs-troubleshooting
as_of: 2026-09-29
visibility: internal
audience: [cs_staff]
---

# 기술지원 트러블슈팅 지식

기준일: 2026-09-29(상태 스냅샷) · 정리일: 2026-10-19

## 목적

ClassIn Korea 기술지원 선례 76건(78행)과 업무 규칙·확인 흐름을 **내부 CS 코파일럿에 적재하기 위한** 비식별 트러블슈팅 지식으로 정리한 것이다. 증상군별 플레이북 12편, HQ 보고 양식, 참조표, 비식별 케이스 데이터, 표기 정규화표로 구성된다.

- **외부 공개 금지.** 공개 챗봇·문서센터에 그대로 쓰지 않는다. 외부 FAQ 후보는 별도 문서로 다시 쓰고 검토자 승인을 거친다([문서센터 작성 지침](../docs-center-content-guidelines.md)).
- 원본(케이스 문서, 대화 기록, 인덱스·보충기록·업무 규칙 원문)은 이 저장소 밖 사내 문서 저장소에 남는다. 이 폴더는 그 정리본이며, 원문 위치는 각 행의 선례 ID와 `source_chat_urls`(S·T 건)로 거슬러 찾는다.
- 정리 기준은 [내부 CS 콘텐츠 병합·적용 기준](../internal-cs-content-arrangement-2026-07-15.md) §5(태그)·§6(원문과 자산)을 따른다.

## as_of 규칙

- 모든 상태(대기·미해결·종결 등)는 **2026-09-29 기준 스냅샷**이다. 원본 문서·대화가 마지막으로 갱신된 시점의 기록이고 이후 진행은 반영돼 있지 않다. 고객에게 쓰기 전에 현재 상태를 확인한다.
- 예외: S-40은 2026-10-02 원격 점검 기록까지 포함한다(`aliases.json` date_conflict).
- 갱신 책임자와 주기는 운영 결정 사항이다(미정). 정해지면 이 절에 적고, 갱신 시 각 파일 front matter의 `as_of`와 JSON `meta.as_of`를 함께 바꾼다.

## 식별정보 정책

1. **고객 식별정보는 저장하지 않는다.** 다음을 모든 파일에서 뺐다: 개인 이름(고객 담당자·교사·학생·사내 직원), 전화번호·계정, 이메일, Account ID/UID/SID(기관 UID 포함), 课节ID/Lesson ID/courseId/classId/班级ID, 공인 IP(Client IP·게이트웨이), 고객 사설 IP, Device ID, deviceName, 시리얼 번호(SN), MAC, 결제 금액·카드 정보, 결제링크, 사내 테스트 계정, TAPD 번호.
   - 남긴 것: 고객사(학원) 상호(사업자명), 제품 사양 값(카메라 NIC `192.168.1.222` / `255.255.255.0`, T1 기본 `192.168.1.180`, APIPA `169.254.x.x`), 클라이언트 버전 번호, 오류 코드·화면 문구, 공식 문서 주소(docs.eeo.cn).
   - 고객 사설 IP가 원인 설명에 필요한 곳은 값 없이 "고정 IP 충돌"처럼 적었다.
2. **HQ 담당자는 실명 대신 역할명으로 쓴다.** 예: "HQ 네트워크·접속·메모리 담당", "HQ 서비스 1차 접점(小助手)". 역할이 정리되지 않은 경로는 "HQ 담당자(역할 미확정)". 실명·연락처는 사내 원문에서 확인한다. 영역별 역할명은 [hq-report-template.md](./hq-report-template.md) 3절.
3. HQ 문의 양식의 자리표시자(계정, ID, SN 등)는 WeCom 발송문을 쓸 때만 채우고, 채운 값을 이 저장소·적재 데이터에 남기지 않는다.

## 플레이북 H2 템플릿

청커가 H2 단위로 자르므로 H2 하나가 검색 단위다. 모든 플레이북은 아래 H2를 이 순서로 정확히 쓴다.

```
# <증상군 이름>
## 증상 표현                 ← 고객 표현 ↔ 실제 현상 표 + 증상 동의어(쉼표 구분)
## 먼저 받을 값               ← 조회 키(수업명·계정·시각), 하드웨어면 SN·버전·설치일, 접수 문구
## 진단 흐름                 ← 업무 규칙 5장 흐름(번호 단계·판정표, 콘솔 필드는 백틱)
## 원인 후보와 확신도         ← "원인 — 확정/추정/미확정 — 선례 ID"
## 고객 안내 문구             ← 접수용·결과용 뼈대 + 금지 사항
## HQ로 넘기는 조건과 적을 것  ← 넘길 조건, 받는 곳(역할명), 분류, 기재/비기재 값, KST→UTC+8
## 관련 선례                 ← ID | 날짜 | 증상 한 줄 | 원인(확신도) | 상태(2026-09-29 기준)
```

front matter: `title`, `slug`, `product_area`, `tags`, `symptoms`, `keywords`(오류 코드·용어), `case_ids`(주 선례 + 참조 선례), `as_of`, `visibility: internal`, `audience: [cs_staff]`.

## 파일 목록

| 파일 | 내용 |
|---|---|
| [playbooks/01-class-disconnect.md](./playbooks/01-class-disconnect.md) | 수업 중 끊김·튕김(퇴장 코드 54/56/57, 구간별 판정) |
| [playbooks/02-recording.md](./playbooks/02-recording.md) | 녹화(미생성, 분할, 녹화본만 이상, 화질) |
| [playbooks/03-camera-not-detected.md](./playbooks/03-camera-not-detected.md) | 카메라가 안 잡힌다(카메라 NIC, PoE, RTSP, 송출 정지) |
| [playbooks/04-board-network.md](./playbooks/04-board-network.md) | 전자칠판 네트워크(NIC 규격, `Duplicate`, Wi-Fi 폴백, 시계 지연) |
| [playbooks/05-mirroring.md](./playbooks/05-mirroring.md) | 미러링(동일 LAN 오류, AP 격리, 검은 여백) |
| [playbooks/06-rear-display-and-latency.md](./playbooks/06-rear-display-and-latency.md) | 후면 TV·보조 화면·화면 지연 |
| [playbooks/07-board-hardware.md](./playbooks/07-board-hardware.md) | 전자칠판 하드웨어·OPS(터치, 잔류물, 세로줄, 파손) |
| [playbooks/08-app-launch-login-audio.md](./playbooks/08-app-launch-login-audio.md) | 앱 실행·로그인·소리, 글자 깨짐, SMS 미수신 |
| [playbooks/09-lms-classroom.md](./playbooks/09-lms-classroom.md) | 수업·LMS·교실 기능, 클라우드 드라이브, AI 답안지·AgentIn |
| [playbooks/10-api.md](./playbooks/10-api.md) | API(errno 102, 웹훅, 콜백, 콘솔 크래시) |
| [playbooks/11-localization-chinese-ui.md](./playbooks/11-localization-chinese-ui.md) | 화면에 중국어가 그대로 보인다(AI 출력 포함) |
| [playbooks/12-payment.md](./playbooks/12-payment.md) | 결제(통화 EUR 표기, 결제창 멈춤·글자 깨짐) |
| [hq-report-template.md](./hq-report-template.md) | HQ 3개 언어 보고 양식, 에스컬레이션 규칙, 역할명 라우팅표, 자주 나오는 중국어 |
| [reference-tables.md](./reference-tables.md) | 식별자·녹화 용어, 콘솔 필드·퇴장 코드, 전자칠판·카메라 용어·NIC 규격, 오류 코드 색인 |
| [cases.sanitized.json](./cases.sanitized.json) | 비식별 케이스 78행(`confidence_normalized`, `playbook`, `tags`, `as_of` 포함) |
| [aliases.json](./aliases.json) | 고객사 별칭·단위·날짜·상태 표기 불일치 정규화표 |

## 근거 상태 어휘

원문의 확신도 표기와 기존 시스템 어휘를 한 벌로 맞춘 값이다. JSON에는 `confidence_normalized`로, 플레이북에는 한국어(확정/추정/미확정)로 적는다.

| 원문 표기 | 원인 검토 `cause_state` | 내부 지식 `status` | 공개 답변 라벨 | 통합값 |
|---|---|---|---|---|
| (확정) | confirmed | confirmed | 확인됨 | `confirmed` |
| (추정) | suspected | conditional | 조건부 가능 | `suspected` — 고객 전달 시 "추정됩니다" 강제 |
| 미확정 | unresolved | hq_confirmation_required | 확인 필요 | `unresolved` |
| HQ 견해와 지사 견해가 다름(D-19) | — | conflicting_sources | — | `conflicting` |
| 표기 없음(W-01~W-06) | — | — | — | 적재 시 `suspected`로 강등, `untagged_downgraded: true` |

`suspected`·`unresolved`·`conflicting`은 고객에게 단정해 전달하지 않는다.

## 태그 어휘

[내부 CS 콘텐츠 병합·적용 기준](../internal-cs-content-arrangement-2026-07-15.md) §5의 값에 아래를 추가해 쓴다. 상태·담당자·기한은 태그에 섞지 않고 구조화 필드로 둔다.

| 축 | 기존 값 | 추가 값 |
|---|---|---|
| area | software, board, camera, mic, billing, account, contract | network, display(미러링·보조 화면), ops(Windows·OPS), api, lms, ai, cloud_drive, sms |
| intent | howto, incident, policy, install, hq_confirmation | diagnose(원인 가르기 요청), intake(접수 값 수집) |
| topic | recording, login, audio_video, network, permission, refund, warranty | disconnect(끊김·퇴장 코드), camera_nic, mirroring, display_ratio, homework_lock, course_member, unit_limit, titlebar_image, payment_currency, localization |
| evidence | confirmed, conditional, hq_pending, conflict, field_verified | suspected(추정과 조건부 구분), customer_unreplied(고객 발송 불명) |

`cases.sanitized.json`의 `tags` 부여 규칙: area·topic은 플레이북과 케이스 내용 기준. `intent:hq_confirmation`·`evidence:hq_pending`은 HQ에 문의했고 상태가 종결계가 아닌 행. `evidence:field_verified`는 현장 해소·조치 완료 또는 실측으로 확정한 행. `evidence:customer_unreplied`는 고객 건 중 고객 발송 여부가 불명(`customer_message_sent: null`)인 행.

플레이북 `product_area`는 위 area 값 중 하나다(녹화는 area가 아니라 topic이라 02는 `software` + `topic:recording`).

## 적재 전 확인

- [ ] 식별정보 스캔이 0건인지(이메일, `+82`/`0082`/`010` 전화번호, 8자리 이상 숫자 ID, 허용 사양 값 외 IPv4, 기기 이름(deviceName)·MAC, 제품 SN 패턴, HQ 실명). 허용: 오류 코드(5자리 이하, 그리고 알려진 오류 코드 `0x80004002`·`101002005`), 날짜, `source_chat_urls`의 대화 링크, 클라이언트 버전(`6.0.x.x`), 사양 값 `192.168.1.222`·`192.168.1.180`·`255.255.255.0`·`169.254.x.x`.
- [ ] 모든 플레이북이 H2 8개를 정해진 순서로 갖는지, front matter `as_of`·`visibility: internal`이 있는지.
- [ ] `cases.sanitized.json`이 JSON으로 파싱되고 78행인지, `confidence_normalized`가 네 값 중 하나인지, `playbook`이 실제 파일명과 맞는지.
- [ ] 추정·미확정 원인이 단정형으로 바뀌지 않았는지(원문 표기 그대로).
- [ ] 고객 안내 문구에 오류 코드·서버명·IP·계정 ID·설정 주체가 없는지.
- [ ] 상태가 2026-09-29 스냅샷임을 적재 metadata(`as_of`)에 실었는지. 그 뒤 갱신이 있으면 원문 확인 후 반영.
- [ ] 적재 대상이 내부 코파일럿(`visibility: internal`)으로 한정되는지. 외부 채널로 승격하지 않는다.
- [ ] 원본 케이스 문서·대화 링크는 내부 참조로만 쓰고 고객 답변에 노출하지 않는지.
