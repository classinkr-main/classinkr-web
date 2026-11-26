# 위컴 방에서 갈매봇에게 묻기 — 수신구(지능형 로봇 API 모드, URL 콜백)

- 상태: **준비만 됨, 기본 꺼짐.** 본사 위컴 관리자의 답(같은 기업·내부 방인지, 로봇 생성)이 오기 전이라 실제 연결은 하지 않았다.
- 사용자 결정(2026-11-25): "위컴 방에서 갈매봇에게 묻고 시키는 것이 가능하도록".
- 코드: `app/api/webhook/wecom-aibot/route.ts`, `lib/wecom/aibot-*.ts`. 시험: `tests/api/wecom-aibot-*.test.ts`.
- 갈매봇 조율기(`lib/admin-ai/server/orchestrator.ts`)는 그대로 쓴다. 위컴 쪽은 받기·확인·글 모양만 맡는다.

## 1. 무엇이 되는가

1. 회사 **내부** 단체방에서 로봇을 @하고 글을 쓰거나 로봇과 1:1 로 글을 쓰면, 위컴이 우리 콜백 주소로 암호화된 JSON 을 보낸다.
2. 수신구는 서명, 시각 창(±5분), 본문 크기(512KB), 요청 제한을 차례로 확인한다. 통과하면 복호화하고 msgid 중복을 걸러 낸다. 그다음 연결표로 보낸 사람을 확인하고 그 어드민 계정의 역할로 조율기를 부른다.
3. 답은 위컴 글(markdown)이다. 결론을 먼저 쓰고 한 단계는 한 줄로, 1,800자까지 쓴다(넘으면 "이어지는 내용은 어드민 갈매봇에서").
   - 2.5초 안에 끝나면 콜백 응답으로 바로 답한다. 이때 스트림을 열고 그 자리에서 닫는다(`finish: true`).
   - 2.5초 안에 끝나지 않으면 "확인 중입니다" 스트림으로 먼저 답한다. 응답을 돌려주기 전에 `after()` 를 등록해 두고, 응답이 나간 뒤 `response_url` 로 markdown 을 한 번 보낸다.
4. @ 없이 쓴 단체방 글, 외부 방·연동(互联)방·상하류방은 받을 수 없다. 출처는 공식 문서가 아니라 조사 보고서다(공식 문서에서 이 제약 문장을 직접 확인하지 못했다 — 6절 12번).

## 2. 방에서 보이는 것의 경계(총괄 기본값 = 사용자 결정으로 기록)

| | 단체방(chattype `group`) | 1:1(chattype `single`) |
|---|---|---|
| 클래스인 정보 답·사내 역할 담당(한국 지사·본사 영역)·화면 링크 | 답한다 | 답한다 |
| 고객사 담당(CRM 담당 매니저·딜 담당·같은 이름 고객 키) | **안 함** — 고객 조회 자체를 하지 않고 "1:1 로 물어봐 주세요" | 답한다 |
| 상담 내역(채널톡·내부 CS — 목록·요지·건수, 묻기 답의 "관련 상담 n건" 줄) | **안 함** — 상담 찾기를 부르지 않고 "1:1 로 물어봐 주세요". 건수도 내지 않는다 | 어드민 화면과 같은 역할 규칙(`canReadConsultationContent` — 아니면 건수만) |
| 고객 이력(CRM 활동 기록의 결제·견적·AS·API·CS 케이스 태그 기록, 담당 영업) | **안 함** — 고객 찾기·기록 조회를 부르지 않고 "1:1 로 물어봐 주세요". 건수·담당 영업도 내지 않는다 | 기록 글은 상담 내역과 같은 역할 규칙(`canReadConsultationContent` — 아니면 건수·담당 영업만). 맨 앞에 "내부용" 줄. 형식: [수기 적재 형식](crm-customer-events-manual-note-format-2026-11-26.md) |
| 조회(재고·견적·딜·방문 등) | **안 함** — "1:1 로 물어봐 주세요"(답이 방 전체에 보인다) | 답한다(연락처는 늘 가린 값, `pii` 범위 제외) |
| 쓰기(견적 초안·배송 예정) | **안 함** — "1:1 로 물어봐 주세요" | 미리보기 요지와 "어드민에서 확인" 링크만. **실행하지 않는다**(확인표를 발급하지 않는다. 확인은 로그인한 어드민 화면에서만 한다) |
| 사내 문서·상담 근거가 섞인 답 | 맨 앞에 "내부용 — 그대로 보내지 마세요" | 같음 |

- 단체방에서는 행위자 범위를 비운다. 조회 도구와 미리보기 함수도 막아서 이중으로 잠근다(`lib/wecom/aibot-bridge.ts` `groupScopedDeps`·`wecomActor`).
- 담당자 찾기(`resolveContact`)는 행위자 범위를 보지 않는다. 그래서 단체방은 연결 단계에서 고객사 갈래(통합 고객 목록·고객 360)를 끄고(`lib/wecom/aibot-server.ts` → `buildServerOrchestratorDeps({ customerContacts: false })` → `buildContactDeps({ customers: false })`), 브리지가 고객사 담당 카드가 오더라도 1:1 안내 카드로 바꾼다. 담당자 갈래뿐 아니라 근거를 못 찾은 묻기 갈래의 담당자 대체 길도 같은 함수를 지난다. 방에는 연결표에 없는 사람도 있다.
- 고객 이력도 같은 이중 잠금이다. 연결 단계는 고객 조회를 끈 단체방 연결에 고객 이력(`customerHistory`)을 싣지 않고 한 번 더 떼어 내며, 브리지(`groupScopedDeps`)가 1:1 안내 카드(`GROUP_CUSTOMER_HISTORY_DENY`)를 낸다.
- 한국 지사·모름 담당 카드의 사람 이름도 같은 이중 잠금이다. 연결 단계가 단체방에서는 `contactNames: false` → `buildContactDeps({ names: false })`로 담당자 표(DB)의 1차·대리 이름과 어드민 계정 이름 없이 역할만 싣고(`namesHidden`), 브리지(`groupScopedDeps`)가 `namesHidden` 없는 카드를 한 번 더 비운다(`groupRoleOnlyContact`). 본사 카드(문서의 본사 담당 표·위컴 멘션)는 그대로다. 근거: [담당자 표 연결](./internal-team-contacts-2026-11-26.md) §4.
- 상담 내역도 같은 이중 잠금이다. 연결 단계(`lib/wecom/aibot-server.ts`)가 단체방에서는 상담 글 권한을 끄고(`canReadConsultations: false`) 상담 찾기(`consultations`)와 관련 상담 건수(`knowledge.consultationCount`)를 떼어 낸다. 브리지(`groupScopedDeps`)가 한 번 더 떼고 상담 내역 갈래에는 1:1 안내 카드(`GROUP_CONSULTATIONS_DENY`)를 낸다. 1:1 의 상담 내역 카드는 늘 "내부용" 줄을 단다.
- 연결표에 없는 사람에게는 자료 없이 "연결되지 않은 계정입니다 — 어드민에서 써 주세요"만 답한다.
- 연결된 사람이라도 계정이 비활성이거나 역할이 없거나 갈매봇 역할(CRM 스태프) 밖이면 거절한다. 프로필(상태·역할)은 글마다 새로 읽으므로 어드민 화면에서 비활성·역할 변경을 하면 다음 글부터 따른다. 이메일 → 계정 키만 인스턴스 메모리에 5분 둔다(새로 만든 계정은 최대 5분 늦게 연결된다).
- 내비 표시나 메뉴 배치는 권한 경계가 아니다. 권한은 계정 역할로만 정한다.

## 3. 환경변수(모두 있어야 열린다. 하나라도 없으면 404)

| 이름 | 내용 |
|---|---|
| `WECOM_AIBOT_TOKEN` | 로봇 API 설정의 Token |
| `WECOM_AIBOT_ENCODING_AES_KEY` | 로봇 API 설정의 EncodingAESKey(43자) |
| `WECOM_AIBOT_ID` | 로봇 id. 콜백 본문의 `aibotid` 와 같아야 한다 |
| `WECOM_AIBOT_USER_MAP` | 연결표 JSON `{"<위컴 userid>": "<어드민 이메일>"}`. 한 줄이라도 틀리면 전체를 버린다(닫힘) |
| `WECOM_AIBOT_ALLOWED_CHATIDS` | (선택) 쉼표로 나눈 단체방 chatid. 있으면 그 밖의 단체방은 답하지 않는다 |
| `UPSTASH_REDIS_REST_URL`·`UPSTASH_REDIS_REST_TOKEN` | msgid 중복 제거 저장소. **운영·미리보기에서는 필수**이고, 없으면 수신을 열지 않는다(404). 갈매봇 확인표 판정(`ticket-claims.ts`)과 같은 규칙이다 |

- 값은 로그·응답·저장소에 남기지 않는다.
- 로그에는 userid 와 msgid 의 열쇠 섞은 해시(HMAC, 가명 — 6절 13번), 결과 코드, 걸린 시간만 남긴다. 글 내용은 남기지 않는다.
- 연결표는 다음 단계에서 DB 표로 옮긴다(`lib/wecom/aibot-accounts.ts` 만 바뀐다).

## 4. 콜백 주소

`https://<운영 도메인>/api/webhook/wecom-aibot`

- GET 으로 URL 을 검증하고 POST 로 메시지를 받는다.
- 인증 미들웨어(`proxy.ts`)의 우회 목록에 넣었다. `/api/meta/webhook` 과 같은 방식이고, 세션 왕복 없이 위컴 서명만 본다.
- `runtime nodejs`, `maxDuration 60`.

## 5. 확인된 규격(공식 문서, 2026-11-25 직접 열어 확인)

| 항목 | 문서 문장(요지) | 출처 |
|---|---|---|
| URL 검증 | 저장을 누르면 GET 을 보낸다. 쿼리는 `msg_signature`·`timestamp`·`nonce`·`echostr`. "需要做Urldecode处理". "在1秒内响应GET请求，响应内容为上一步得到的明文消息内容(不能加引号，不能带bom头，不能带换行符)" | https://developer.work.weixin.qq.com/document/path/101033 |
| 본문 꼴 | "智能机器人的回调格式为json". `{"encrypt": "msg_encrypt"}` | 101033 |
| 수동 답 봉투 | `{"encrypt","msgsignature","timestamp"(초),"nonce"(콜백 URL 의 nonce)}` | 101033 |
| receiveid | "企业内部智能机器人场景中，ReceiveId为\"\"" | 101033 |
| 서명 | `dev_msg_signature=sha1(sort(token、timestamp、nonce、msg_encrypt))`. 예제 값 token `QDG6eK`, 서명 `477715d1…f3e6` | https://developer.work.weixin.qq.com/document/path/91144 |
| 복호화 | `AESKey=Base64_Decode(EncodingAESKey + "=")`. EncodingAESKey 는 43자. "AES采用CBC模式，数据采用PKCS#7填充至32字节的倍数". "IV初始向量大小为16字节，取AESKey前16字节". 평문은 `random(16B) + msg_len(4B, 网络字节序) + msg + receiveid` | 91144 |
| 메시지 칸 | `msgid`("开发者需据此进行事件排重（可能因为网络等原因重复回调）"), `aibotid`, `chatid`(단체방만), `chattype`(single/group), `from.userid`(만든 사람이 超级管理员이면 평문, 아니면 암호화 userid), `response_url`, `msgtype`, `text.content`, `quote` | https://developer.work.weixin.qq.com/document/path/100719 |
| 받는 글 | 단체방에서 @ 한 글·혼합·인용, 1:1 에서는 글·그림·음성·파일·영상 | 100719 |
| 스트림 흐름 | 스트림으로 답하면, 끝날 때까지 위컴이 "流式消息刷新" 콜백을 계속 보낸다. "从用户发消息开始最多等待6min". 한 사람이 같은 로봇과 동시에 진행할 수 있는 글은 3개 | 100719 |
| 스트림 답 | `{"msgtype":"stream","stream":{"id","finish","content"}}`. content 는 markdown 이고 "最长不超过20480个字节，必须是utf8编码". 글 답(text)은 들어올 때 이벤트에만 쓸 수 있다 | https://developer.work.weixin.qq.com/document/path/101031 |
| response_url | POST JSON `{"msgtype":"markdown","markdown":{"content"}}`. content ≤ 20480바이트. "有效期为 1 个小时". "每个 response_url 用户可以调用接口一次" | https://developer.work.weixin.qq.com/document/path/101138 |

- 시험 `tests/api/wecom-aibot-crypto.test.ts` 는 91144 예제 값(token·EncodingAESKey·timestamp·nonce·암호문)으로 서명과 복호화를 그대로 맞춘다.
- 그 예제는 자체 앱 콜백이라 receiveid 가 corpid 다. 로봇 모드에서는 빈 문자열이다.

## 6. 실제 연결 전이라 검증하지 못한 것

1. **로봇 POST 콜백의 응답 제한 시간.** 문서에 숫자가 없다. 자체 앱 콜백의 5초를 기준으로 2.5초를 잡았다. 시험 방에서 재야 한다.
2. **스트림을 첫 답에서 바로 닫아도(`finish: true`) 되는지.** 문서는 이를 금지하지 않지만 예시는 `finish: false` 에서 시작한다.
3. **수동 답을 이미 한 글에 `response_url` 을 또 써도 되는지**, 그리고 "확인 중" 스트림 뒤에 markdown 이 새 글로 보이는지. 안 되면 대안이 있다. 스트림을 열어 두고(`finish: false`) 새로고침 콜백에서 저장소에 둔 답을 돌려준다(6분 안). 이 경우 저장소에 답을 두는 코드가 더 필요하다.
4. **빈 응답(200, 본문 없음)이 허용되는지.** 중복 msgid·다른 로봇·새로고침 콜백에 빈 200 을 돌려준다.
5. **`response_url` 의 실제 호스트.** 문서 예시는 자리표시자(`RESPONSEURL`)다. 우리는 `https` 이면서 `weixin.qq.com` 아래인 주소에만 보낸다. 다른 호스트면 보내지 않고 로그만 남긴다.
6. **`response_url` 응답의 `errcode` 꼴과 신뢰 IP 필요 여부.**
7. `from.userid` 가 평문인지 암호화 값인지. 로봇을 만든 사람에 따라 다르다. 연결표 열쇠는 콜백에 실제로 오는 값으로 적어야 한다.
8. 중국 본토에서 서울(icn1)로 오는 콜백의 지연과 콜드 스타트. GET 은 1초 제한이다.
9. 쿼리의 `+` 가 공백으로 풀리는 경우를 되돌리게 해 뒀다. 위컴이 실제로 어떻게 인코딩해 보내는지는 확인하지 못했다.
10. 혼합(mixed) 글의 칸 이름(`mixed.msg_item[].text.content`). 문서 구조에서 옮겼지만 실물로 확인하지 못했다. 인용(`quote`)은 아직 읽지 않는다.
11. **`compat_info`(100719, "非普通回调时返回", source 예: `ai_assistant`·`channel`).** 일반 콜백이 아닐 때 붙는 칸이다. 수신구는 이 칸이 있어도 일반 글과 똑같이 처리하고, 출처 값만 로그(`compat=`)에 남긴다. 실물에서 어떤 경로의 콜백이 섞여 오는지, 그 경로의 글에도 답해도 되는지 시험 방에서 확인해야 한다. 걸러야 하면 `parseInboundMessage` 의 `compatSource` 로 거른다.
12. **외부·互联·上下游 방을 받을 수 없다는 제약(1절 4번).** 조사 보고서의 결론이고 공식 문서 문장으로 확인하지 못했다.
13. **로그 키는 가명이다.** `user=`·`msg=` 는 EncodingAESKey 를 열쇠로 한 HMAC-SHA256 앞 12자다. 열쇠가 없으면 userid 목록으로 되짚을 수 없지만, 열쇠를 가진 쪽은 되짚을 수 있다(익명이 아니다). 원문은 남기지 않는다. 열쇠를 바꾸면 키도 바뀐다(중복 제거·요청 제한 키 포함).

## 7. 본사 위컴 관리자가 해 줄 것(설치 순서)

1. 한국 지사 스태프와 본사 담당자가 같은 위컴 기업(같은 CorpID)인지 확인한다. 함께 쓰는 방이 **内部群**인지도 확인한다. 外部·互联·上下游 방이면 이 길로는 안 된다.
2. 智能机器人을 만들 수 있는지 확인하고, API 모드를 쓰는 데 기업 인증이나 요금이 필요한지 확인한다.
3. 가능하면 **超级管理员 계정으로 로봇을 만든다**(발신자 userid 를 평문으로 받기 위해서다). 안 되면 openuserid→userid 변환용 자체 앱을 만들고 가시 범위를 정한다.
4. API 모드를 켜고(URL 콜백) 콜백 URL·Token·EncodingAESKey 를 정한다. Token·Key 는 우리 쪽 환경변수 담당에게 보안 채널로 넘긴다. 저장을 누르는 순간 GET 검증이 오므로, **환경변수를 먼저 넣고 배포한 뒤** 저장한다.
5. 콜백 URL 도메인에 회사 명의나 ICP 요건이 붙는지 확인한다.
6. 로봇 id(`aibotid`)를 알려 준다.
7. 시험용 내부 방을 하나 만들어 로봇을 넣는다('仅群主管理'이면 방장이 넣는다). 본사 담당자 1~2명이 참여한다.
8. 참여자 각자의 위컴 userid(콜백에 오는 값)를 알려 준다. 우리는 이것을 어드민 이메일과 짝지어 연결표에 넣는다.
9. 답할 때는 로봇을 @하는 운영 규칙에 동의받는다(@ 없는 글은 받지 못한다).

## 8. 시험 방 점검 순서(켜는 날)

1. 운영 환경에 Upstash 두 값이 있는지 확인한다. 없으면 수신구가 열리지 않는다.
2. 환경변수 네 개를 넣고 배포한다. 시험 방만 받으려면 `WECOM_AIBOT_ALLOWED_CHATIDS` 도 넣는다.
3. 관리자가 콜백 URL 을 저장한다. GET 검증이 통과해야 하고 1초 안에 평문이 나가야 한다. 실패하면 로그에서 `verify rejected reason=` 을 본다.
4. 1:1 에서 "수업 녹화는 어떻게 해?" → 바로 답이 와야 한다. 걸린 시간은 로그의 `mode=inline ms=` 로 본다.
5. 1:1 에서 "T1 재고 몇 대야?" → 조회 답이 와야 한다. 연락처는 가린 값이어야 한다.
6. 단체방에서 "@로봇 T1 재고 몇 대야?" → "1:1 로 물어봐 주세요"가 와야 한다. 단체방에서 "@로봇 녹화 담당 누구야?" → 담당자 안내가 와야 한다. 단체방에서 "@로봇 <고객사 이름> 담당 누구야?" → 담당 이름·고객 키 없이 "1:1 로 물어봐 주세요"가 와야 한다.
7. 1:1 에서 견적·배송 예정 요청 → 미리보기 요지와 어드민 링크만 와야 한다. 어드민에서 아무것도 만들어지지 않아야 한다.
8. 연결표에 없는 사람이 물으면 → "연결되지 않은 계정입니다"가 와야 한다.
9. 오래 걸리는 질문(복합 질문) → "확인 중" 뒤에 markdown 이 한 번 와야 한다. 로그에서 `mode=response_url sent=ok` 를 본다. 안 오면 6절 3번의 대안으로 바꾼다.
10. 같은 글이 두 번 처리되지 않는지 로그의 `duplicate` 로 본다.
11. 2주 동안 지연·실패를 기록한 뒤, 계속 쓸지와 연결표의 DB 이전을 정한다.

## 9. 다음 단계(이번에 하지 않은 것)

- 연결표를 DB 표로 옮긴다(`wecom_identity_map`). 지금은 환경변수다.
- 본사 답을 상담에 붙인다([CS-<짧은ID>] 태그 매칭, internal_note 저장, 사람 승인). 조사 보고서의 방안 B 설계에 있다.
- 그림·파일·음성(1:1), 인용글 읽기.
- 서명·복호화 실패가 이어질 때 긴급 방으로 알리기.
