---
title: 기술지원 참조표
slug: reference-tables
as_of: 2026-09-29
visibility: internal
audience: [cs_staff]
---

# 기술지원 참조표

식별자 용어, 녹화 용어, 콘솔 필드·퇴장 코드, 전자칠판·카메라 용어와 NIC 규격, 오류 코드·문구 색인이다. 제품 사양과 용어만 담고 고객 데이터는 담지 않는다. 선례 ID는 [`cases.sanitized.json`](./cases.sanitized.json)과 각 플레이북의 "관련 선례"에서 찾는다.

## 1. 식별자

| 용어 | 뜻 |
|---|---|
| 기관 UID / SID | 기관(机构) 계정의 번호. API에서는 SID라 부르고 SID와 SECRET 쌍이 인증 단위다. 교사·학생 개인 UID와 별개 |
| Account ID / UID | 교사·학생 개인 계정 번호. Account는 전화번호형(국가번호 포함) 또는 이메일 |
| 课节ID / Lesson ID | 수업 한 회차의 번호. 수업을 조회하는 기본 키 |
| courseId / classId / 班级ID | 코스(반) 번호 |
| deviceName, Device ID | 접속 기기 이름과 고유값. 같은 기관의 여러 강의실을 구분할 때 Client IP와 함께 쓴다 |
| SN | 전자칠판·카메라 시리얼. 하드웨어 건에서 HQ가 반드시 요구한다. `BS86A`로 시작하면 86인치 2세대 |

코스 구조의 중국어 대응: 코스 = 班级, 과정 = 课程, 단원 = 单元, 기관 = 机构.

이 값들은 조회와 HQ 문의에만 쓰고, 이 저장소·코파일럿 적재 데이터에는 남기지 않는다.

## 2. 녹화 용어

| 표기 | 콘솔 로그 | 화면 표시 | 중국어 |
|---|---|---|---|
| 교실 녹화 | Online recording | "ClassIn 교실 녹화". 문서에 따라 온라인 녹화, 클라우드 녹화로도 적혀 있다 | HQ 대화에서는 云端录制로 불린 선례가 있다(S-03) |
| 카메라 녹화 | camera recording | 코스 목록에서는 "현장 녹화", 교실 안 패널은 "카메라 녹화" | 录制现场 |
| 로컬 녹화 전환 | isSwitchToLocal | "로컬 녹화로 전환" | 本地录制 |
| 녹화 수업 | — | 미리 올린 영상으로 하는 수업(실시간 수업의 녹화와 다름) | 录播 |

교실 녹화는 교실 화면(판서, 자료, 레이아웃)을 담고, 카메라 녹화는 카메라 영상만 담는다. 화면 표시 문구는 따옴표 안에 원문 그대로 인용한다.

## 3. 콘솔에서 보는 것

경로: 콘솔 → School Management → Query User UID → 계정과 날짜로 조회. **정상 입실한 세션만 기록된다.** 앱이 입실 전에 죽으면 여기에 남지 않는다. 계정 없이 수업명과 날짜만으로 찾는 것은 실질적으로 불가능하다. 기관 아이디를 찾아 들어가는 우회로가 있지만 권하지 않는다. 계정은 반드시 고객에게 받는다.

| 블록·항목 | 읽는 법 |
|---|---|
| Entering Time / The time and reasons of leaving | 입·퇴장 시각과 퇴장 사유(서버 반환 코드) |
| Internet Information | 5분 단위 품질 샘플. 수 초짜리 순간 단절은 드러나지 않을 수 있다 |
| Network Duration | 서버 연결 품질 비율. Excellent / General / Poor / Awful / Not Reach. 몇 %부터 나쁜 것인지 정해진 기준은 없다. 선례의 정상 구간은 Excellent 100%였고, Poor가 3% 보이기 시작한 구간부터 저하로 읽었다(D-19) |
| User Gateway | 기기에서 공유기까지 구간 |
| Gateway 2nd | 공유기 다음 구간(건물·통신사 쪽) |
| UDB server latency, TCP latency | 서버까지의 지연. 정상 사례는 44~63ms 수준 |
| serviceType | UDP가 기본. TCP로 바뀌었으면 회선이 나빠져 폴백한 것 |
| CPU Status | low / medium / high / busy 비율 |
| History 팝업 | OS, CPU, 클라이언트 버전, Device ID, Client IP |
| Recording Settings | 그 회차의 녹화 옵션. Enable / Disable |
| Status History | 녹화 이벤트 순서. `Lesson-recording Configuration Information` → `Start Lesson-recording` → `Pushflow Quality Upload`, 실패 시 `Lesson-recording Error` |
| Reason 문자열 | `"Online recording is enabled/disabled, camera recording is enabled/disabled"`, `Camera Name`, `Video Scope`, `Audio mode` |
| Identity | Teacher / Student. 조회한 계정의 성격을 먼저 확정한다 |

시각: 지사 콘솔의 시각은 항상 KST다. HQ가 보내는 캡처의 시각은 UTC+8이다(KST = HQ 시각 + 1시간).

### 퇴장 사유와 코드

| 표시 | 뜻 |
|---|---|
| 54 the client locally logs in repeatedly or reconnects after disconnecting | 반복 로그인 또는 끊긴 뒤 재접속 |
| 56 The network connection between the server and the client is interrupted | 서버와 클라이언트 사이 연결 중단. 수 초의 손실·지연으로도 난다 |
| 57 The server lost the client heartbeat | 클라이언트 쪽 신호가 멎음 |
| 120 Information from server | 정의 미확정(중복 로그인 추정) |
| The customer actively leave the classroom | 사용자가 직접 나감 |
| Classroom closed, force to leave | 교실 종료로 퇴장 |

## 4. 전자칠판·카메라

| 용어 | 뜻 |
|---|---|
| 전자칠판 (ClassIn Board) | S65 / S75 / S86 / S110. 2세대는 IR(적외선) 터치. 안드로이드 본체에 OPS가 꽂힌 구조 |
| OPS | 전자칠판에 들어가는 Windows PC 모듈. ClassIn X가 여기서 돈다 |
| ClassIn Cam T1 (CS11A) | 카메라. 화면이 두 개다: 트래킹(特写, 1080p 고정)과 파노라마(全景) |
| CameraCMS | T1 관리 프로그램. 검색, 등록, 재부팅, 화질 파라미터 |
| 메인 NIC | 인터넷용. 규격은 **자동 IP·자동 DNS**. 표준 구성은 ASIX USB 기가비트 |
| 카메라 NIC | 카메라 전용망. 규격은 **`192.168.1.222` / `255.255.255.0`, 게이트웨이·DNS 공란** |
| PoE | 랜선으로 카메라에 전원을 주는 방식(IEEE 802.3af). 스위치 또는 인젝터 |
| APIPA | `169.254.x.x`. IP를 받지 못했다는 표시 |
| `Duplicate` | `ipconfig`에 뜨는 IP 충돌 표시 |

배선 선례(D-02): 메인 랜선은 벽단자에서 전자칠판 하단 LAN 포트로 들어가 ASIX USB 랜카드로 잡힌다. 카메라는 PoE 스위치를 거쳐 OPS 본체 LAN(내장 Realtek)에 물린다. T1의 IP는 선례에서 `192.168.1.180`이었다(D-15, T-05). 다만 어느 NIC가 메인인지는 배선에 따라 기기마다 달랐고 고정 IP가 엉뚱한 NIC에 들어간 경우도 있었으므로, 어댑터 이름이나 설정값만으로 역할을 단정하지 않는다.

그 밖의 사양(선례에서 확인)

- ClassIn X 녹화는 카메라와 무관하게 최대 1080p. T1의 4K는 파노라마만(D-16).
- 무선 화면공유 구간 지연 기준 1.0~1.5초, HDMI 구간 0.1~0.2초. S86 2세대는 루프아웃 미지원(3세대 98인치만 지원)(D-08).
- RAM 8GB OPS의 가상 메모리는 물리 RAM × 1.5(12,288MB, 초기=최대). 16GB 기기는 기준이 달랐던 이력이 있어 다시 확인한다(D-02b).
- 과정(课程)당 단원(单元) 최대 100개(D-12).
- 제목 표시줄 이미지: 높이 정확히 24px / 너비 1280px 이하 / 50KB 이하 / PNG·JPG(D-10).
- 원격 지원 도구: 지사는 RustDesk, HQ는 AweSun(向日葵, SunLogin으로도 적힌다).

## 5. 오류 코드·문구로 찾기

| 코드·문구 | 뜻 | 선례 |
|---|---|---|
| 54 | the client locally logs in repeatedly or reconnects after disconnecting | D-02a, S-10, S-32 |
| 56 | The network connection between the server and the client is interrupted | D-02a, D-19, D-20, S-32, S-39(부수) |
| 57 | The server lost the client heartbeat | D-02a, D-18 |
| 120 | Information from server (정의 미확정, 중복 로그인 추정) | S-14 |
| error code 4001 | Exception was thrown out during camera video recording. 카메라 미지정. 앱 빌드 번호 끝자리 4001과는 별개 | D-21 |
| error code 2001 | 같은 문구(Exception was thrown out during camera video recording). HQ는 교사 인터넷 문제로 회신 | S-10 |
| Start Error: -5801 | 녹화 시작 오류(의미 미확인) | S-22 |
| errno 102 | Permission denied / No Permission. 공식 에러표는 보안 검증 실패로 설명하나, 권한 문제인지 서명 문제인지는 S-19에서 미확정 | S-19, W-04 |
| 101002005 | Signature error | S-19 |
| 10003 | 웹훅 응답 포맷 오류(API 문서의 일반 규칙) | W-03 |
| 0x80004002 | Windows 언어 기능(FOD) 설치 실패. 실사용 영향 없음 | S-06 |
| `Recording Settings: Disable` | 수업 생성 시 녹화 옵션 꺼짐 | D-04 |
| `Connection failed` | CameraCMS에서 검색은 되는데 접속 실패. NIC IP 대역 불일치 신호. (`Search:0`은 어댑터 하나를 끄고 재검색했을 때 나오는 판별 결과로, 카메라가 끈 쪽에 물려 있다는 뜻) | D-15a, T-05 |
| `0*0 0.0fps 0Kbps` | 카메라 영상 송출 정지 | S-40 |
| `Duplicate` (ipconfig) | 고정 IP 충돌 | D-02a |
| "네트워크 케이블 언플러그됨" | 카메라 NIC PoE 급전 실패 신호 | S-34 |
| "장치가 동일한 LAN에 연결되어 있지 않습니다" | 미러링 단말 간 도달 불가 | D-07 |
| "이미지 크기가 요구 사항을 충족하지 않음!" | 제목 표시줄 이미지 높이 24px 아님 | D-10 |
| "단원의 수가 상한선인 100개를 초과하여…" / "Maximum of 100 units can be added" | 과정당 단원 상한 | D-12 |
| "Network is malfunctioning" | 수업 중 네트워크 이상 팝업 | S-31 |
| "클라우드 녹화에 실패하였습니다…" / "현장 녹화가 실패했습니다…" | 녹화 태스크 중단 | S-10 |
| "현장 녹화가 시작되었습니다"(녹색) | 시작 이벤트만 반영. 이후 중단은 표시되지 않음 | D-21 |
| `Cannot read properties of undefined (reading 'enabled')` | 콘솔 코스 관리 크래시 | W-08 |
| "Pardon the interruption - Before you can shop, we need to update Microsoft Store" | OPS Store 자체 업데이트 실패 | S-23 |
| "no signal" | 후면 TV 신호 없음 | S-24 |
| "서비스 로딩중입니다" | 카드사 인증 구간 무한 대기 | S-27 |
| ◆ (U+FFFD) / `????` | UTF-8 베타 옵션·로캘 불일치로 글자 깨짐 | S-26, S-27 |
| `riskMonitor.common.classUnit` | 대시보드에 번역 키 노출 | T-02 |
| `AI Eval. 0점`, `0/6000` | AgentIn 수업 분석 차트 미렌더·템플릿 기본값 미로딩 | T-03 |
