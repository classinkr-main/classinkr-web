import type { SymptomTopic } from "@/lib/chatbot/symptom-triage"

/**
 * 페르소나 평가 3회차에서 일반 폴백·엉뚱한 문서로 새던 현장 질문 주제.
 * SYMPTOM_TOPICS 맨 앞에 붙는다. 그래서 주제마다 대상(subject)을 좁게 잡는다.
 *
 * 규칙:
 * - 단계는 공개 문서 섹션에서만 가져온다(주제당 문서 하나).
 * - 문서에 없는 사실(해상도 상한, 링크 유효 기간, 리전 선택 등)은 "공개 안내에 없다"고 밝히고 상담으로 넘긴다.
 * - 아이디·전화번호·시리얼 같은 식별 정보를 채팅에 적으라고 하지 않는다.
 */
const UPDATE_FROM_STORE =
  "휴대폰은 Play 스토어(아이폰·아이패드는 App Store)에서 ClassIn을 검색해 [업데이트]가 보이면 눌러 최신 버전으로 올려 주세요."

export const FIELD_SYMPTOM_TOPICS: SymptomTopic[] = [
  // ─── 페르소나 5회차 ───────────────────────────────────────────────
  {
    id: "password-change-howto",
    subject: /비밀번호\s*(?:를|을)?\s*(?:바꾸|바꿀|바꿔|변경|새로\s*정)/,
    exclude: /정책|길이|주기|2단계|잊|기억|틀|모르/,
    requireSymptom: false,
    howto: true,
    category: "troubleshooting",
    doc: { category: "start", slug: "password-change-pc" },
    steps: [{ heading: "비밀번호 변경 화면 열기", take: 2 }],
    intro: "비밀번호는 공식 홈페이지가 아니라 설치한 클래스인의 로그인 화면에서 바꿔요.",
    variants: [
      {
        when: /휴대폰|폰|모바일|태블릿|아이패드|앱/,
        doc: { category: "start", slug: "password-change-mobile" },
        steps: [{ heading: "비밀번호 변경 화면 열기", take: 2 }],
      },
    ],
    branches: ["그다음 화면에서 아이디를 넣고 인증코드를 받아 새 비밀번호를 정하면 돼요."],
    en: "Change it in the installed ClassIn app, not the website: on the login screen tap [비밀번호 변경] (PC) or [비밀번호를 잊으셨나요?] (mobile), get a verification code, and set a new password.",
    suggestedQuestions: ["인증코드가 안 와요", "로그인이 안 돼요", "비밀번호를 잊어버렸어요"],
  },
  {
    id: "board-turns-off-no-sound",
    subject: /(?:칠판|티비|tv|보드).{0,30}(?:켜면|켰는데|켜도).{0,30}(?:금방|바로|곧|자꾸)\s*(?:꺼|꺼져|꺼지)/,
    requireSymptom: false,
    category: "hardware",
    doc: { category: "hardware", slug: "board-basic-operation" },
    steps: [
      { heading: "화면이나 터치가 이상할 때 먼저 볼 것", pick: [0] },
      { heading: "버튼은 화면 오른쪽 사이드 하단에 있습니다", pick: [2] },
      { heading: "HDMI 입력으로 전환하기", pick: [4] },
    ],
    intro:
      "선생님들이 수업을 못 하실 정도면 급하시죠. 두 증상이 한 가지 고장인지는 여기서 단정하기 어려워서, 화면이 꺼지는 것과 소리가 안 나는 것을 나눠서 볼게요.",
    branches: [
      "전원 버튼을 짧게 누르면 대기 모드로 들어갈 수 있어요. 켤 때 버튼을 한 번만 누르고 기다려 보세요.",
      "그래도 켜자마자 꺼지거나 소리가 계속 안 나면 A/S로 접수해야 해요. 아래 [실시간 상담 연결]로 증상과 처음 생긴 날을 알려 주세요.",
    ],
    handoff: true,
    suggestedQuestions: ["전자칠판 화면이 안 켜져요", "전자칠판 보증 기간이 궁금해요", "HDMI 연결했는데 화면이 안 나와요"],
  },
  {
    id: "screen-share-black-recording",
    subject:
      /(?:녹화|recording).{0,30}(?:화면\s*공유|screen\s*share).{0,30}(?:검|black|까맣|안\s*나|안\s*보)|(?:화면\s*공유|screen\s*share)\s*(?:부분|구간)?\s*만?.{0,10}(?:검은|black|까맣|검게)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [{ heading: "PC에서 앱이 안 켜지거나 카메라·마이크가 막힐 때", pick: [1] }],
    intro:
      "라이브에서는 학생들이 잘 봤는데 녹화본에서 화면 공유 부분만 검게 나온다면, 공유한 화면이 저작권 보호(DRM)가 걸린 영상이나 프로그램이었을 가능성이 있어요. 인강 재생 플레이어 같은 프로그램은 다른 프로그램의 화면 녹화를 막습니다. 다만 원인을 단정할 수는 없어요.",
    branches: [
      "보여 줄 자료가 파일이면 화면 공유 대신 수업 자료로 올려 띄우면 녹화에도 남아요.",
      "계속 검게 나오면 아래 [실시간 상담 연결]로 그때 공유한 프로그램 이름과 녹화본의 시각을 알려 주세요.",
    ],
    handoff: true,
    en: "If students saw the shared screen live but the recording is black, the shared app or video may be copy-protected (DRM), which blocks recording. Upload the file as class material instead, or tap 상담원 연결 with the app name.",
    suggestedQuestions: ["화면 공유가 안 돼요", "녹화본에 소리가 없어요", "녹화가 안 돼요"],
  },
  {
    id: "class-chat-not-visible",
    subject: /(?:채팅|메시지).{0,20}(?:안\s*보|안보|안\s*써|안써|안\s*올라|안\s*떠|못\s*봐|못\s*써)/,
    exclude: /웹\s*라이브|라이브|중계|시청자/,
    requireSymptom: false,
    category: "classroom",
    doc: { category: "student", slug: "chat" },
    steps: [{ heading: "채팅이 안 될 때", pick: [1, 0, 3] }],
    intro: "학생들이 채팅이 안 보인다거나 안 써진다고 하면, 코스 설정에서 학생 채팅을 막아 두지 않았는지부터 봐 주세요.",
    branches: [
      "코스 설정은 코스 이름을 눌러 열고, [코스 관리]의 '전체 학생 채팅 금지'(화면에 따라 '전체 학생 발언 금지')가 꺼져 있는지 확인합니다.",
    ],
    suggestedQuestions: ["채팅 알림 끄는 법 알려줘", "카메라가 안 켜져요", "수업 중에 계속 튕겨요"],
  },
  {
    id: "missing-accessory",
    subject: /(?:리모컨|펜|구성품|부속품|케이블|스탠드|브래킷).{0,12}(?:이|가)?\s*(?:없|빠졌|빠져|누락|안\s*왔|안왔|안\s*들어)/,
    requireSymptom: false,
    category: "hardware",
    doc: { category: "hardware", slug: "board-install-readiness" },
    steps: [{ heading: "카메라·마이크와 함께 쓸 기기", pick: [1] }],
    intro: "받은 구성품이 빠져 있다면 평가에 지장이 없도록 바로 챙겨 드려야 해요. 먼저 받은 구성품을 견적서와 맞춰 봐 주세요.",
    branches: ["빠진 구성품은 아래 [실시간 상담 연결]로 기기 모델과 빠진 품목을 알려 주세요. 담당자가 확인해 보내 드리는 방법을 안내합니다."],
    handoff: true,
    suggestedQuestions: ["미러링이 안 돼요", "전자칠판 터치가 안 돼요", "전자칠판 스펙 알려줘"],
  },
  {
    id: "pre-class-checklist",
    subject:
      /(?:공개\s*수업|중요한\s*수업|시범\s*수업|발표\s*수업|수업\s*전에?|사전에?).{0,30}(?:점검|체크|확인할\s*것|뭘\s*(?:점검|확인|봐야|해야))|체크\s*리스트|checklist/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "software", slug: "classroom-tools" },
    steps: [{ heading: "신규 강사 교육과 수업 전 점검", pick: [1] }],
    intro: "중요한 수업이라 더 신경 쓰이시죠. 공개 수업 전에는 이것만 확인해 두세요.",
    branches: [
      "네트워크: 공유기 가까이에서 쓰고, 끊길 때 바로 바꿀 수 있게 휴대폰 핫스팟을 준비해 둡니다. 수업 중 끊기면 다른 인터넷이나 핫스팟으로 바꿔 다시 들어가면 됩니다.",
      "기기·앱: 클래스인을 최신 버전으로 올리고, 수업에는 한 계정이 기기 1대로만 들어가요. 클래스인 말고 켜 둔 프로그램과 인터넷 창은 닫아 둡니다.",
      "리허설: 전날 실제로 쓸 기기·장소에서 미리 교실에 들어가 화면 공유·판서·녹화를 한 번씩 눌러 봅니다.",
    ],
    suggestedQuestions: ["수업 중에 계속 튕겨요", "녹화가 안 돼요", "학생 목소리가 안 들려요"],
  },
  {
    id: "device-test-before-class",
    subject:
      /(?:수업\s*전에?|미리|before|입장\s*전).{0,30}(?:카메라|마이크|스피커|장비|기기).{0,20}(?:테스트|확인|점검|시험)|(?:카메라|마이크|장비)\s*(?:테스트|test).{0,10}(?:할\s*수|하는|어디|어떻게|돼|되)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "teacher", slug: "classroom-basic-setup" },
    steps: [{ heading: "입장 전 장비 테스트", pick: [3, 0, 1, 2] }],
    intro: "네, 수업 전에 미리 해 볼 수 있어요. 학생을 기다리게 하지 않으려면 수업 전에 기기 테스트로 확인해 두세요.",
    en: "Yes—test before class: in the PC app go to Profile > [계정 및 설정] > [기기 테스트] > [마이크 검사]. When you enter the classroom, the device-test screen also lets you check camera, mic and speaker.",
    suggestedQuestions: ["카메라가 안 켜져요", "마이크가 안 돼요", "학생 목소리가 안 들려요"],
  },
  {
    id: "board-first-use-flow",
    subject:
      /(?:처음|새로\s*온|신규).{0,30}(?:칠판|티비|tv|보드|전자칠판).{0,40}(?:켜는|순서|시작|쓰는|사용법)|켜는\s*것?\s*부터.{0,30}(?:수업|시작)/,
    requireSymptom: false,
    howto: true,
    category: "hardware",
    doc: { category: "hardware", slug: "board-basic-operation" },
    steps: [{ heading: "버튼은 화면 오른쪽 사이드 하단에 있습니다", pick: [0] }],
    intro: "옆에서 설명해 주시기 좋게 켜는 것부터 수업 시작까지 아주 쉽게 정리할게요.",
    branches: [
      "켜지면 화면에서 클래스인(ClassIn X)을 눌러 선생님 계정으로 로그인합니다.",
      "수업 시작 20분 전부터 화면 위쪽이나 [할 일]의 수업에서 [교실 입장]을 누릅니다. 먼저 뜨는 장비 테스트 화면에서 카메라·마이크가 맞는지 보고 들어가면 돼요.",
      "끝낼 때는 화면 아래를 위로 쓸어 올려 나오는 패널에서 [슬라이드하여 수업 종료하기]를 밀면 수업이 끝납니다.",
    ],
    suggestedQuestions: ["미러링이 안 돼요", "전자칠판 터치가 안 돼요", "전자칠판 밝기 줄이는 법 알려줘요"],
  },
  {
    id: "board-red-light-no-screen",
    subject:
      /(?:차단기|정전|전기\s*공사|전원\s*(?:을\s*)?내렸).{0,60}(?:칠판|티비|tv|보드|화면)|(?:빨간\s*불|빨간불|빨간색\s*불).{0,30}(?:화면|안\s*나|만\s*켜|만)/,
    requireSymptom: false,
    category: "hardware",
    doc: { category: "hardware", slug: "board-basic-operation" },
    steps: [
      { heading: "화면이나 터치가 이상할 때 먼저 볼 것", pick: [0] },
      { heading: "버튼은 화면 오른쪽 사이드 하단에 있습니다", pick: [0] },
    ],
    intro:
      "겁나셨죠. 바로 고장이라고 볼 일은 아니에요. 빨간 불이 켜져 있으면 전원은 들어와 있는 상태일 수 있어요. 차단기를 내렸다 올린 뒤라면 아래 순서로 다시 켜 보세요.",
    branches: [
      "멀티탭 스위치까지 껐다 켠 뒤 1~2분 기다렸다가 오른쪽 옆면 아래 전원 버튼을 눌러 보세요.",
      "그래도 화면이 안 나오면 아래 [실시간 상담 연결]로 A/S를 접수해 주세요. 보드를 직접 열지는 마세요.",
    ],
    handoff: true,
    suggestedQuestions: ["전자칠판 화면이 안 켜져요", "전자칠판 보증 기간이 궁금해요", "HDMI 연결했는데 화면이 안 나와요"],
  },
  {
    id: "recording-no-voice",
    subject: /(?:녹화|녹화한\s*것|녹화본).{0,50}(?:목소리|소리).{0,16}(?:안\s*들|없|안\s*나|묻혀|섞여|작)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "recording-troubleshooting" },
    steps: [{ heading: "녹화본에 소리가 없을 때", pick: [1, 2, 3] }],
    intro: "칠판 글씨는 나오는데 목소리가 녹화에 안 담겼다면, 녹화할 때 클래스인에서 고른 마이크가 실제로 쓰는 마이크였는지부터 봐 주세요.",
    variants: [
      {
        when: /천장|dt2/,
        steps: [{ heading: "녹화본에 소리가 없을 때", pick: [2, 3] }],
        intro: "천장 마이크를 쓰신다면, 칠판 화면에서 고른 마이크가 그 천장 마이크인지부터 봐 주세요. '사용 안 함'이나 다른 마이크로 골라져 있으면 목소리가 녹화에 담기지 않아요.",
      },
      {
        when: /묻혀|섞여|학생(?:들)?\s*소리/,
        doc: { category: "teacher", slug: "lesson-option-concepts" },
        steps: [{ heading: "온스테이지와 스테이지 표시", pick: [2] }],
        intro:
          "정말 속상하셨겠어요. 수업 중엔 잘 들렸는데 녹화본에서 학생 소리에 묻혔다면, 다음 수업부터는 발표하는 학생만 마이크를 켜게 하고 강사 마이크는 입 가까이 두는 게 좋아요.",
      },
    ],
    branches: [
      { text: "톱니바퀴를 누르면 나오는 패널의 [마이크]에서 천장 마이크 이름을 고르고, 말할 때 막대가 움직이는지 보세요. 목록에 천장 마이크가 없으면 설치 담당자나 상담 채널에 확인해 주세요.", when: /천장|dt2/ },
      { text: "이미 녹화된 영상의 소리를 나중에 따로 키우거나 나누는 기능은 공개 안내에 없어서, 이번 녹화본은 보정이 어려울 수 있어요.", when: /묻혀|섞여|학생(?:들)?\s*소리/ },
      { text: "노트북 내장 마이크 대신 외장 마이크나 줄 이어폰을 쓰면 목소리가 더 또렷하게 담겨요.", when: /묻혀|섞여|학생(?:들)?\s*소리|작/ },
    ],
    suggestedQuestions: ["녹화가 안 돼요", "마이크가 안 돼요", "천장 마이크 연결 방법 알려줘요"],
  },
  {
    id: "screen-half-visible",
    subject: /(?:화면|선생님\s*화면|칠판).{0,20}(?:반만|잘려|잘린|일부만|조금만)\s*(?:보|나|보여)?/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "먼저 확인할 것", pick: [0] }],
    intro: "아이가 뭘 잘못 누른 거라기보다 작은 화면에서 생기는 경우일 수 있어요. 이렇게 해 보세요.",
    branches: [
      "휴대폰을 가로로 돌려 보세요. 두 손가락으로 화면을 확대해 두었다면 오므려서 원래 크기로 돌립니다.",
      "작은 휴대폰에서는 판서가 잘 안 보일 수 있어요. 가능하면 태블릿이나 PC로 들어가는 편이 보기 편합니다.",
    ],
    suggestedQuestions: ["수업 중에 계속 튕겨요", "선생님 목소리가 안 들려요", "앱이 자꾸 멈춰요"],
  },
  {
    id: "homework-file-types",
    subject: /(?:숙제|과제).{0,12}(?:pdf|피디에프|파일|문서|한글|hwp|워드|영상|동영상|음성).{0,16}(?:올려도|돼|되나|되나요|가능|내도|제출해도|올릴\s*수)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "student", slug: "course-submit-activity" },
    steps: [{ heading: "숙제 제출하기", pick: [1] }],
    intro: "네, PDF로 내도 돼요. 숙제는 사진, 음성 녹음, PDF 파일로 낼 수 있어요.",
    suggestedQuestions: ["숙제 제출이 안 돼요", "숙제 사진이 안 올라가요", "숙제 다시 냈더니 점수가 사라졌어요"],
  },
  {
    id: "teacher-muted-mic",
    subject: /(?:선생님|강사)(?:이|가)?\s*(?:제|내)?\s*마이크.{0,12}(?:꺼|끄|막|잠)|(?:내|제)\s*마이크.{0,12}(?:못\s*켜|안\s*켜|켜지지|회색|막혀)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "선생님이 내 목소리가 안 들린다고 할 때", pick: [0, 1] }],
    intro: "선생님이 학생 마이크를 켜고 끌 수 있어요. 스테이지에 올라가 있고 마이크 권한을 받아야 내 마이크가 켜져요.",
    branches: ["말해야 하면 손을 들거나 채팅으로 '마이크 켜 주세요'라고 선생님께 부탁해 보세요."],
    suggestedQuestions: ["선생님이 제 목소리가 안 들린대요", "마이크가 안 돼요", "카메라가 안 켜져요"],
  },
  {
    id: "field-recording-av-delay",
    subject: /현장\s*녹화.{0,60}(?:늦게|지연|싱크|딜레이|밀려|어긋)|(?:싱크|sync).{0,20}(?:안\s*맞|어긋|틀어)/,
    requireSymptom: false,
    overridesKnownIntent: true,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [{ heading: "화면이 깨지거나 느릴 때", pick: [0, 1] }],
    intro:
      "두 증상이 같은 원인인지는 공개 안내로 확정할 수 없어 단정하지 않을게요. 다만 현장 녹화는 PC 부담이 큰 편이라(권장: Intel 6세대 i5 이상, 업로드 3Mbps 이상) 기기 부하부터 나눠 보면 좋아요.",
    branches: [
      "현장 녹화를 켠 상태와 끈 상태에서 작업 관리자의 CPU·메모리 사용률을 비교해 보세요. 켰을 때 끝까지 차면 기기 성능 쪽일 가능성이 커요.",
      "기술지원에 보낼 때는 PC 사양(CPU·메모리), 앱 버전, 현장 녹화 카메라 모델, 증상이 난 수업 시각과 그 녹화본을 함께 알려 주세요. 아래 [실시간 상담 연결]로 이어 드릴게요.",
    ],
    handoff: true,
    suggestedQuestions: ["현장 녹화 카메라 설정 어떻게 해요?", "녹화가 중간에 끊겼어요", "학생 목소리가 안 들려요"],
  },
  {
    id: "exam-ends-early",
    subject: /(?:시험|퀴즈).{0,50}(?:일찍|먼저|빨리|예정보다).{0,20}(?:끝|제출|종료)|(?:시험|퀴즈).{0,30}자동\s*(?:으로\s*)?제출/,
    exclude: /튕|꺼졌|나갔|재응시/,
    requireSymptom: false,
    category: "classroom",
    doc: { category: "teacher", slug: "course-activities" },
    steps: [{ heading: "시험 만들기", pick: [7] }],
    intro:
      "제한 시간보다 일찍 자동 제출되면, 시험 활동의 마감(종료) 시각이 학생 응시 시간보다 먼저 오는 건 아닌지부터 봐 주세요. 시작 시각에 50분을 더한 시각보다 마감이 이르면 마감에 맞춰 끝날 가능성이 있어요. 시험 설정은 이것을 봅니다.",
    branches: [
      "설정이 맞는데도 40분쯤 끝나면 오류일 수 있어요. 아래 [실시간 상담 연결]로 시험 이름과 학생이 응시를 시작한 시각을 알려 주세요.",
    ],
    handoff: true,
    suggestedQuestions: ["시험 중에 튕긴 학생 다시 응시하게 할 수 있나요?", "숙제 제출이 안 돼요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "web-live-app-closed",
    subject: /(?:웹\s*라이브|라이브|송출|중계).{0,40}(?:앱을?\s*(?:닫|껐|꺼)|나갔다|재접속|다시\s*들어)/,
    requireSymptom: false,
    howto: true,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "lesson-option-concepts" },
    steps: [{ heading: "수업 녹화와 현장 녹화", pick: [4] }],
    intro:
      "웹 라이브 송출은 교실에서 녹화가 돌아가는 동안 나가요. 앱을 닫았다 다시 들어오면 녹화가 멈춰 있을 수 있어서, 다시 들어온 뒤 녹화 아이콘이 초록색인지 보고 멈춰 있으면 다시 시작해야 송출도 이어집니다.",
    branches: [
      "닫은 뒤 구간이 플레이백에 없으면 복구할 수 있는지는 담당자가 확인해야 해요. 된다고 미리 약속드리기는 어려워요. 아래 [실시간 상담 연결]로 수업 이름과 앱을 닫은 시각을 남겨 주세요.",
      "다음에는 송출 중에 다른 알림을 꺼 두고, 실수로 나갔다면 다시 들어와 녹화 아이콘부터 확인하세요.",
    ],
    handoff: true,
    suggestedQuestions: ["웹 라이브 링크를 열면 방송이 시작되지 않았대요", "녹화가 중간에 끊겼어요", "녹화가 안 돼요"],
  },
  {
    id: "manual-score-not-in-stats",
    subject: /(?:수기|직접|손으로).{0,10}(?:점수|채점).{0,40}(?:반영|안\s*들어|빠져|통계)|(?:고친|수정한|바꾼)\s*점수.{0,30}(?:반영|안\s*들어|빠져)|점수.{0,20}통계에\s*반영/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "course-activities" },
    steps: [{ heading: "숙제와 일일 과제 내기", pick: [9] }],
    intro: "자동 채점 점수는 들어가는데 직접 고친 점수만 빠진다면, 고친 점수가 다시 저장됐는지부터 봐 주세요. 이미 준 피드백과 점수는 [재채점]으로 고쳐 저장합니다.",
    branches: [
      "저장한 직후라면 잠시 기다렸다가 통계 화면을 새로고침해 반영됐는지 다시 보세요.",
      "저장하고 새로고침해도 빠지면 반영 오류일 수 있어 기술지원이 확인해야 해요. 아래 [실시간 상담 연결]로 숙제 이름과 점수를 고친 학생을 알려 주세요.",
    ],
    handoff: true,
    suggestedQuestions: ["성적이 안 보여요", "숙제 다시 냈더니 점수가 사라졌어요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "recording-trim",
    subject: /(?:녹화본|녹화|영상|다시\s*보기|다시보기).{0,30}(?:구간|부분)?.{0,10}(?:잘라|자르|편집|빼고\s*싶|지우고\s*싶|삭제하고\s*싶)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "teacher", slug: "course-activities" },
    steps: [{ heading: "녹화 수업과 학습 자료 올리기", pick: [5, 0, 1] }],
    intro: "녹화본에서 특정 구간만 잘라 내는 편집 기능은 공개 안내에 없어서, 있다고 말씀드리지 않을게요. 차선책은 녹화본을 내려받아 그 구간을 잘라 낸 뒤 [녹화 수업]으로 다시 올리는 거예요.",
    branches: [
      "원본 다시보기는 코스 설정의 [다시 보기 유효 기간]을 줄이거나, [스토리지] > [수업 리소스]에서 지울 수 있어요. 지운 영상은 복구되지 않으니 원본은 먼저 내려받아 보관해 두세요.",
    ],
    suggestedQuestions: ["녹화 다운로드가 안 돼요", "다시보기 다운로드 못 받게 하고 싶어요", "녹화본이 안 보여요"],
  },
  {
    id: "parent-check-homework",
    subject: /(?:아이|자녀|애|우리\s*애).{0,20}(?:숙제|과제).{0,24}(?:냈는지|제출했는지|다\s*냈|확인하는\s*방법|따로\s*확인|확인할\s*수)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "student", slug: "course-submit-activity" },
    steps: [
      { heading: "휴대폰으로 숙제 사진 올리기", pick: [5] },
      { heading: "숙제가 안 올라가거나 화면이 이상할 때", pick: [3] },
    ],
    intro: "학부모 전용 확인 화면은 공개 안내에 없어서 있다고 말씀드리지 않을게요. 대신 아이 계정이 로그인된 기기에서 그 숙제를 열어 보면 바로 알 수 있어요.",
    suggestedQuestions: ["숙제 제출이 안 돼요", "선생님이 숙제 미제출이래요", "다시보기는 어디서 봐요?"],
  },
  {
    id: "recording-share-large",
    subject: /(?:녹화본|영상|녹화\s*파일).{0,40}(?:용량|크기).{0,20}(?:커서|커|크|안\s*보내|못\s*보내)|(?:카톡|카카오톡|메일).{0,20}(?:녹화본|영상).{0,20}(?:안\s*보내|못\s*보내|용량)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "recording-file-troubleshooting" },
    steps: [{ heading: "내려받기가 안 될 때", pick: [4] }],
    intro: "녹화본은 용량이 커서 메신저로는 잘 안 보내져요. 파일 대신 재생 화면 링크를 보내는 방법이 있어요.",
    branches: [
      "걱정하신 부분도 맞아요. 이 링크는 로그인 없이 열리니 원장님께만 보내 주세요. 학생 얼굴과 목소리가 담긴 영상은 학원 밖으로 보내지 않는 게 안전하고, 내려받은 파일은 권한 있는 담당자만 보관합니다.",
    ],
    suggestedQuestions: ["녹화 다운로드가 안 돼요", "녹화본 공유 링크가 로그인 없이 열려요", "녹화본이 안 보여요"],
  },
  {
    id: "course-weekly-report",
    subject: /(?:코스별|반별|주간|주별|한\s*번에).{0,30}(?:출석|출결|숙제|제출률|과제).{0,30}(?:한\s*번에|보는|보고|정리|방법|볼\s*수)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "statistics-data" },
    steps: [{ heading: "통계 파일 내려받기", pick: [0, 1, 2] }],
    intro: "코스별 출석은 통계 파일로 한 번에 받고, 숙제는 관리자 대시보드 [학습 관리] > [숙제 관리]에서 반별로 봐요. 출석과 숙제를 한 파일로 합쳐 주는 메뉴는 공개 안내에 없어서 두 곳을 함께 보시면 됩니다. 출석은 이렇게 받아요.",
    branches: ["숙제는 [학습 관리] > [숙제 관리]에서 반별 미제출 현황을 보고, 학생별로는 코스의 [성적] > [학습 활동]에서 봐요."],
    suggestedQuestions: ["통계 파일은 어디서 받아요?", "학생이 다시보기를 봤는지 어디서 봐요?", "담당자 상담으로 이어주세요"],
  },
  {
    id: "deleted-recording-restore",
    subject: /(?:녹화본|녹화|영상|다시\s*보기|다시보기).{0,30}(?:지웠|삭제했|지워\s*버|날렸).{0,50}(?:휴지통|복구|되돌|살릴|남아|살려)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "storage-management" },
    steps: [{ heading: "수업 데이터 지우기", pick: [1, 5] }],
    intro:
      "많이 놀라셨죠. 너무 자책하지 않으셔도 돼요. 다만 공개 안내 기준으로 [스토리지] > [수업 리소스]에서 지운 녹화 영상은 복구되지 않고, 휴지통 같은 곳도 안내돼 있지 않아요. 다음부터는 이렇게 지키면 같은 일을 막을 수 있어요.",
    branches: [
      "혹시 다른 곳에 사본이 남아 있을 수 있으니, 그 강사님이 영상을 내려받아 두셨는지 먼저 물어보세요.",
      "바로 아래 [실시간 상담 연결]로 지운 날짜와 코스를 알려 주시면 담당자가 확인해 드려요. 복구를 약속드리기는 어려워요.",
    ],
    handoff: true,
    suggestedQuestions: ["예전 녹화본이 사라졌어요", "스토리지가 꽉 찼다고 떠요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "proxy-vs-normal-student",
    subject: /대리\s*등록\s*(?:학생)?\s*(?:으로|과|이랑|하고|은|이).{0,40}(?:일반|본인|그냥)\s*학생|(?:일부는|어떤\s*학생은|누구는).{0,20}대리\s*등록/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "student-onboarding" },
    steps: [{ heading: "등록한 뒤에 할 일", pick: [1, 0] }],
    intro:
      "대리 등록 학생은 학생이 클래스인에 직접 가입하기 전에 학원이 대신 계정을 만든 학생이고, 일반 학생은 본인이 먼저 가입한 계정이에요. 같은 엑셀로 올렸는데 표시가 다르다면, 학생마다 그때 이미 가입돼 있었는지가 달랐을 수 있어요. 정확한 기준은 공개 안내에 없어 단정하지 않을게요.",
    branches: [
      "알림은 관련이 있을 수 있어요. 숙제·수업 알림은 클래스인 앱에 로그인한 기기로 와서, 대리 등록 학생이 아직 앱에 한 번도 로그인하지 않았다면 알림을 받을 기기가 없어요. 받은 계정으로 첫 로그인을 하고 휴대폰 알림을 허용하게 해 주세요.",
    ],
    suggestedQuestions: ["대리 등록했는데 문자가 안 가요", "수업 알림이 안 와요", "학생 추가가 안 돼요"],
  },
  {
    id: "stats-time-basis",
    subject: /(?:통계|수업\s*시간\s*합계|수업\s*시간).{0,40}(?:적게|많게|다르게|안\s*맞|기준|산정|계산)/,
    exclude: /내려받|다운로드|뽑|엑셀/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "statistics-data" },
    steps: [{ heading: "통계 파일 내려받기", pick: [2] }],
    intro:
      "공개 안내 기준으로, 통계의 실제 수업 시간은 예정 시간이나 반 전체가 아니라 강사와 학생 한 사람씩 교실에 실제로 있었던 시간으로 계산돼요. 그래서 예정 시간과 비교하면 적게 나올 수 있어요.",
    branches: ["실제 입장 기록과 비교해도 차이가 크면 아래 [실시간 상담 연결]로 차이가 난 수업 예시를 알려 주세요. 담당자가 확인해 드립니다."],
    suggestedQuestions: ["통계 파일은 어디서 받아요?", "학생이 다시보기를 봤는지 어디서 봐요?", "담당자 상담으로 이어주세요"],
  },
  {
    id: "ai-per-course",
    subject: /(?:ai|인공지능).{0,30}(?:특정\s*코스|코스별|일부\s*코스|반별|코스만|반만|한\s*반만)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "teacher", slug: "course-create" },
    steps: [{ heading: "코스 설정에서 정할 것", pick: [0, 1] }],
    intro:
      "기관 전체 AI 기능은 관리자 대시보드 [일반 설정] > [부가가치 서비스]에서 켜고 끄고, 코스 설정에도 [AI 에이전트 설정]이 따로 있어요. 코스마다 어디까지 따로 켜고 끌 수 있는지는 공개 안내에 자세히 없어서, 시범 코스의 코스 설정에서 먼저 확인해 보세요.",
    branches: ["코스 단위로 원하는 만큼 나뉘지 않으면, 시범 운영 범위를 담당자와 상의해 주세요."],
    suggestedQuestions: ["AI 기능 끄는 법 알려줘요", "통계 파일은 어디서 받아요?", "담당자 상담으로 이어주세요"],
  },
  {
    id: "replay-visible-other-student",
    subject: /(?:학생|다른\s*학생).{0,20}(?:다른\s*학생|남의|친구).{0,20}(?:다시\s*보기|다시보기|녹화|숙제|성적).{0,20}(?:볼\s*수|보인|보여|봤)/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "teacher", slug: "course-activities" },
    steps: [{ heading: "시험 만들기", pick: [8] }],
    intro:
      "보안 제보라면 가볍게 넘기지 않는 게 맞아요. 먼저 같은 코스 학생은 그 코스 수업의 다시보기를 함께 볼 수 있다는 점을 기준으로, 그 학생이 볼 수 없는 코스의 구성원으로 들어가 있지 않은지 [구성원]에서 확인해 주세요. 숙제·성적을 서로 보는 설정은 이렇게 끕니다.",
    branches: [
      "웹 라이브·플레이백 링크로 본 거라면 [라이브&플레이백] 세부 설정의 로그인 요구·시청 비밀번호·시청 권한도 함께 점검해 주세요.","재현되지 않더라도 제보 내용은 아래 [실시간 상담 연결]로 해당 코스와 받은 제보를 그대로 알려 주세요. 담당자가 확인합니다."],
    handoff: true,
    suggestedQuestions: ["다시보기 다운로드 못 받게 하고 싶어요", "학생 추가가 안 돼요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "process-stuck-camera-busy",
    subject: /(?:프로세스|메모리|백그라운드).{0,40}(?:종료되지|남아|점유|안\s*꺼)|다른\s*(?:앱|프로그램)에서\s*사용\s*중/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "먼저 확인할 것", pick: [0, 1] }],
    intro:
      "말씀하신 대로 지난 수업의 프로세스가 남아 카메라를 잡고 있을 가능성이 있어요. 다만 공개 안내로 원인을 확정할 수는 없어요. 임시로는 다음 수업 전에 남은 프로세스를 끝내 보세요.",
    branches: [
      "Ctrl+Shift+Esc로 작업 관리자를 열어 남아 있는 ClassIn 항목을 끝낸 뒤 다시 들어가면 카메라가 잡히는지 확인해 주세요.",
      "버그 신고는 아래 [실시간 상담 연결]로 앱 버전, Windows 버전, 남은 프로세스 이름과 메모리 사용량 캡처, 다시 생기는 순서를 함께 보내 주세요.",
    ],
    handoff: true,
    suggestedQuestions: ["카메라가 안 켜져요", "앱이 자꾸 멈춰요", "업데이트하고 나서 안 열려요"],
  },
  {
    id: "update-lost-materials",
    subject: /업데이트.{0,40}(?:자료|판서|칠판|파일|교안).{0,20}(?:없어|사라|날아|안\s*보)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "drive-materials" },
    steps: [{ heading: "판서 파일(EDB)을 드라이브에 두고 쓰기", pick: [2] }],
    intro:
      "정말 당황스러우셨겠어요. 업데이트 뒤 자료가 안 보이면 그 자료가 클라우드 드라이브에 있었는지, 기기에만 있었는지부터 나눠 봐야 해요. 드라이브에 저장한 판서(EDB)는 계정의 드라이브에 남아 있어요.",
    branches: [
      "수업 중 칠판에 쓴 필기는 학원이 [일반 설정] > [칠판 내용 및 수업자료 보관]을 켜 두었을 때 자동 저장돼요. 끝난 수업의 판서는 학습 보고서에서도 확인해 보세요.",
      "전자칠판 기기에만 따로 저장해 둔 파일은 다시 설치하면 지워질 수 있어요.",
      "드라이브에도 없으면 아래 [실시간 상담 연결]로 자료 이름과 업데이트한 날짜를 알려 주세요. 담당자가 확인해 드리지만 복구를 약속드리기는 어려워요.",
    ],
    handoff: true,
    suggestedQuestions: ["드라이브에 자료가 안 올라가요", "앱이 자꾸 멈춰요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "slow-device-or-service",
    subject: /(?:everything|전부|다|모든\s*게)\s*느려|(?:노트북|laptop|컴퓨터|pc)\s*(?:문제|탓).{0,20}(?:인지|일까|같)|(?:클래스인|classin)\s*문제인지/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [{ heading: "화면이 깨지거나 느릴 때", pick: [0, 1, 2] }],
    intro:
      "괜찮아요, 천천히 같이 봐요. 클래스인 문제인지 노트북 문제인지는 이렇게 나눠 볼 수 있어요. 휴대폰 핫스팟으로 바꿨더니 괜찮아지면 원래 쓰던 인터넷 쪽, 같은 인터넷에서 다른 기기는 괜찮은데 이 노트북만 느리면 노트북 쪽일 가능성이 커요.",
    branches: ["학원에 IT 담당자가 있으면 같이 봐 달라고 하셔도 좋아요. 언제든 '상담원 연결'이라고 쓰시면 사람이 이어서 도와드려요."],
    en: "Don't worry. If it gets better after switching to a phone hotspot, your original network is the cause; if other devices are fine on the same network but this laptop is slow, it's likely the laptop. Close other programs and update the app. Type 상담원 연결 anytime.",
    suggestedQuestions: ["수업 중에 계속 튕겨요", "앱이 자꾸 멈춰요", "화면이 이상하게 나와요"],
  },
  {
    id: "homework-deadline-missed",
    subject: /(?:숙제|과제).{0,24}(?:시간|마감|기한).{0,10}(?:이|가)?\s*(?:지나|지났|놓쳤|넘었|넘어)/,
    requireSymptom: false,
    category: "classroom",
    doc: { category: "student", slug: "course-submit-activity" },
    steps: [{ heading: "숙제가 안 올라가거나 화면이 이상할 때", pick: [0] }],
    intro: "숙제 마감이 지났다면 선생님께 사정을 말씀드리고 다시 낼 수 있는지 여쭤 보세요. 마감이 지난 숙제는 선생님 설정에 따라 낼 수 없을 수 있어요.",
    suggestedQuestions: ["숙제 제출이 안 돼요", "선생님 목소리가 안 들려요", "수업 중에 계속 튕겨요"],
  },
  // ─── 페르소나 4회차: 녹화·다시보기 ──────────────────────────────────
  {
    id: "recording-processing-stuck",
    subject: /(?:녹화|녹화본|다시\s*보기|다시보기).{0,20}처리\s*중.{0,40}(?:이틀|하루|며칠|사흘|계속|그대로|아직)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "admin", slug: "recording-file-troubleshooting" },
    steps: [{ heading: "먼저 확인할 것", pick: [1, 2] }],
    intro:
      "시험이 내일인데 녹화본이 이틀째 처리 중이면 정말 급하시죠. 수업이 끝난 뒤 처리 시간이 조금 걸리는 건 정상이지만, 이틀째 그대로라면 기다리기만 할 상황이 아니에요. 바로 담당자 확인을 요청해 주세요.",
    branches: [
      "아래 [실시간 상담 연결]로 코스 이름, 수업 날짜, '녹화본 처리 지연·시험 일정 급함'을 함께 남겨 주시면 담당자가 그 녹화본부터 확인합니다. 처리 완료 시점은 확인 전에 약속드리기 어려워요.",
      "기다리는 동안 학생들은 그 수업의 학습 보고서에서 판서를 먼저 볼 수 있어요.",
    ],
    handoff: true,
    suggestedQuestions: ["녹화본이 안 보여요", "녹화 다운로드가 안 돼요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "recording-not-kept",
    subject:
      /(?:어제|지난|그|오늘|방금)\s*(?:그\s*)?수업.{0,16}(?:왜\s*)?(?:안\s*남|안남|없어졌|사라졌|녹화\s*(?:가|이)?\s*없)|녹화(?:본)?.{0,12}(?:안\s*남|안남)/,
    exclude: /다시\s*보기|다시보기|다시\s*보는|리플레이/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "admin", slug: "recording-file-troubleshooting" },
    steps: [
      { heading: "먼저 확인할 것", pick: [1, 2, 0] },
      { heading: "수업 녹화 데이터에서 녹화본 찾기", pick: [0] },
    ],
    intro:
      "선생님이 녹화를 켰다고 했는데 녹화본이 안 보이면, 아직 처리 중이거나 목록 필터에 가려진 경우일 수 있어요. 누구 실수로 단정하기 전에 아래부터 봐 주세요.",
    branches: ["그래도 없으면 담당자가 그 수업의 녹화 기록을 확인해 드려요. 다만 복구할 수 있다고 미리 약속드리기는 어려워요."],
    suggestedQuestions: ["녹화본이 안 보여요", "녹화가 안 돼요", "예전 녹화본이 사라졌어요"],
  },
  {
    id: "recording-both-modes",
    subject:
      /현장\s*녹화.{0,24}수업\s*녹화|수업\s*녹화.{0,24}현장\s*녹화|(?:녹화|recording).{0,40}(?:학생|students?)\s*(?:들)?\s*(?:화면|얼굴)?\s*(?:은|이|가)?\s*(?:없|안\s*나|빠져|빠졌)|(?:녹화|녹화본|recording).{0,40}(?:제|내|선생님)\s*얼굴\s*(?:은|이)?\s*(?:만|안\s*나|없|빠)/,
    exclude: /누가|저장\s*관리|권한|보관|차이가?\s*(?:뭐|무엇)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "teacher", slug: "lesson-option-concepts" },
    steps: [{ heading: "수업 녹화와 현장 녹화", pick: [2, 3] }],
    intro:
      "두 녹화는 찍는 대상이 달라요. 수업 녹화는 클래스인 교실 화면(판서·자료와 화면 속 카메라 영역)을, 현장 녹화는 카메라가 비춘 교실을 찍습니다. 둘 다 켜면 다시보기에서 둘 중 하나를 골라 보게 돼요.",
    variants: [
      {
        when: /(?:제|내|선생님)\s*얼굴\s*(?:은|이)?\s*(?:안\s*나|없|빠)/,
        steps: [{ heading: "수업 녹화와 현장 녹화", pick: [2, 3] }],
        intro:
          "칠판 글씨는 나오는데 얼굴이 안 나오면 수업 녹화만 켜져 있는 경우일 수 있어요. 수업 녹화는 교실 화면을 찍어서, 카메라를 켜 스테이지에 띄웠을 때만 얼굴이 함께 남아요. 얼굴과 교실까지 남기려면 수업을 만들 때 [현장 녹화]도 켜고, 입장할 때 보드 위 카메라를 고르세요.",
      },
    ],
    branches: [
      { text: "온라인 학생 얼굴은 스테이지에 올라와 카메라를 켠 학생만 수업 녹화에 담겨요. 학생도 나오게 하려면 수업 중 그 학생을 스테이지에 올리고 카메라를 켜게 하세요(온스테이지 인원수가 1v0이면 학생 자리가 없어요). 스테이지 밖 학생은 카메라와 마이크가 꺼져 있습니다.", unless: /(?:제|내|선생님)\s*얼굴\s*(?:은|이)?\s*(?:안\s*나|없|빠)/ },
      "둘 다 켰다면 관리자 대시보드에서 그 수업의 [관리] > [수업 녹화 데이터]를 열어 보세요. [동영상 화면]에 '교실'(수업 녹화)과 '현장 녹화' 클립이 따로 있어요. 한쪽만 있으면 상담원이 그 수업의 녹화 기록을 확인해 드릴게요.",
    ],
    en: "Class recording captures the ClassIn screen (board, materials, and the on-stage camera area); field recording captures what the classroom camera sees. Online students appear only if they're on stage with their camera on.",
    suggestedQuestions: ["현장 녹화 카메라 설정 어떻게 해요?", "학생을 무대에 올리는 방법 알려줘", "녹화본이 안 보여요"],
  },
  {
    id: "download-zero-kb",
    subject: /(?:0\s*kb|0\s*바이트|용량\s*(?:이|가)?\s*0|빈\s*파일)|(?:다운|내려받).{0,20}(?:0\s*kb|0kb|비어|안\s*열)/,
    requireSymptom: false,
    overridesKnownIntent: true,
    category: "troubleshooting",
    doc: { category: "admin", slug: "recording-file-troubleshooting" },
    steps: [{ heading: "내려받기가 안 될 때", pick: [0, 1, 2] }],
    intro:
      "여러 번 받아도 0KB라면 녹화본 처리가 아직 끝나지 않았거나 내려받기가 중간에 끊긴 경우일 수 있어요. 수업이 막 끝났다면 잠시 뒤 다시 받아 보시고, 아래 방법으로도 받아 보세요.",
    branches: [
      "PC 저장 공간이 넉넉한지, 다른 브라우저(크롬·엣지)에서도 같은지 확인해 주세요.",
      "그래도 계속 0KB면 담당자가 그 녹화본을 직접 확인해야 해요. 상담할 때 코스 이름과 수업 날짜를 알려 주세요.",
    ],
    suggestedQuestions: ["녹화본이 안 보여요", "녹화본에 소리가 없어요", "녹화 다운로드가 안 돼요"],
  },
  {
    id: "recording-link-public",
    subject:
      /(?:녹화본|녹화|다시\s*보기|다시보기|재생).{0,20}(?:공유\s*)?링크.{0,40}(?:로그인\s*없이|누구나|시크릿|아무나|만료)/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "admin", slug: "recording-file-troubleshooting" },
    steps: [{ heading: "내려받기가 안 될 때", pick: [4] }],
    intro:
      "짚어 주신 부분이 맞아요. 공개 안내 기준으로 재생 화면 링크는 로그인 없이 열리니, 보안이 중요한 영상이라면 가볍게 볼 일이 아닙니다. 녹화본 재생 화면 링크에 만료를 거는 설정은 공개 안내에 없어 있다고 말씀드리지 않을게요.",
    branches: [
      "웹 라이브·플레이백 링크라면 관리자 대시보드 [라이브&플레이백] 세부 설정에서 로그인 요구, 시청 비밀번호, 시청 권한(링크를 받은 누구나 또는 선택한 인원만)을 정할 수 있어요.",
      "민감한 수업은 링크 대신 학생이 코스 안 다시보기로 보게 하고, 시청 범위는 코스 설정의 다시보기 기간·시청 횟수로 좁혀 두세요.",
      "이미 보낸 링크를 막아야 하거나 만료 설정이 꼭 필요하면 아래 [실시간 상담 연결]로 알려 주세요. 담당자가 그 녹화본 처리 방법을 확인해 드립니다.",
    ],
    handoff: true,
    suggestedQuestions: ["다시보기 다운로드 못 받게 하고 싶어요", "녹화본이 안 보여요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "replay-leak",
    subject:
      /(?:다시\s*보기|다시보기|녹화본|녹화\s*영상|영상).{0,30}(?:퍼뜨|유출|퍼졌|퍼져|빼돌)|(?:유출|퍼뜨).{0,20}(?:막|방지|차단)/,
    requireSymptom: false,
    howto: true,
    overridesKnownIntent: true,
    category: "admin",
    doc: { category: "teacher", slug: "course-activities" },
    steps: [{ heading: "녹화 수업과 학습 자료 올리기", pick: [2, 5] }],
    intro:
      "속상하셨겠어요. 막을 수 있는 범위부터 솔직하게 말씀드리면, 화면을 찍거나 다른 기기로 녹화하는 것까지 완전히 막는다고 보장할 수는 없어요. 녹화는 워터마크로 저작권을 보호하고, 퍼질 여지를 줄이는 설정이 따로 있습니다.",
    branches: [
      "수업 녹화 다시보기는 관리자 대시보드 [기관 관리] > [코스 관리] > [설정]의 [다시 보기 유효 기간]과 [시청 횟수 제한]으로 볼 수 있는 기간과 횟수를 좁혀 주세요.",
      "재생 화면 링크는 로그인 없이 열리니 링크로 보내지 말고 코스 안에서만 보게 해 주세요. 학습 자료로 올린 파일은 [고급 설정]의 파일 다운로드 허용을 꺼 둘 수 있어요.",
      "이미 퍼진 영상 처리나 추가 보호 기능이 필요하면 아래 [실시간 상담 연결]로 담당자와 상의해 주세요.",
    ],
    handoff: true,
    suggestedQuestions: ["다시보기 다운로드 못 받게 하고 싶어요", "다시보기 기간이 지났대요", "담당자 상담으로 이어주세요"],
  },
  // ─── 계정·권한 ───────────────────────────────────────────────────
  {
    id: "teacher-two-academies",
    subject:
      /(?:두|여러|2)\s*(?:곳|군데|개)?\s*(?:의\s*)?(?:학원|기관).{0,30}(?:동시에|같이|함께)?.{0,20}(?:강의|수업|소속|일|근무)|한\s*계정으로.{0,20}(?:두|여러)\s*(?:학원|기관)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "강사 가입부터 확인하기", take: 2 }],
    intro:
      "한 계정을 두 학원(기관)에 교사로 함께 쓸 수 있는지는 공개 안내에 기준이 정리돼 있지 않아 단정하지 않을게요. 참고로 공유 드라이브는 [드라이브]에서 소속 학원을 골라 들어가는 구조예요. 각 학원이 강사를 등록할 때는 이렇게 진행됩니다.",
    branches: [
      "한 학원이 다른 학원의 수업 정보를 볼 수 있는지도 공개 안내로 확인되지 않아요. 두 학원에서 계속 쓰실 계획이면 아래 [실시간 상담 연결]로 두 학원 모두에 등록하는 방법과 정보가 어떻게 나뉘는지 확인해 드릴게요.",
    ],
    handoff: true,
    suggestedQuestions: ["다른 기관 소속이라고 나와서 강사 등록이 안 돼요", "강사 한 명이 여러 반 맡을 수 있나요?", "담당자 상담으로 이어주세요"],
  },
  {
    id: "web-filter-domains",
    subject: /웹\s*필터|필터링\s*(?:솔루션|장비|프로그램)|(?:어떤|무슨)\s*도메인|도메인.{0,8}(?:허용|화이트|열어)/,
    requireSymptom: false,
    howto: true,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [{ heading: "자꾸 끊기거나 교실에서 튕길 때", pick: [1] }],
    intro:
      "LTE에서는 되고 학원 와이파이에서만 안 된다면 학원 네트워크의 필터링이 막고 있을 가능성이 커요. 허용해야 할 도메인 목록은 공개 안내에 없어서, 제가 주소를 지어 드리지 않을게요.",
    branches: [
      "먼저 필터링 솔루션의 차단 로그에서 웹 라이브를 열 때 막힌 주소를 확인해 보세요. 그 주소를 기술지원에 보내면 허용해도 되는지 확인이 빨라요.",
      "공식 도메인·포트 목록은 기술지원이 학원 환경을 보고 안내드려요. 아래 [실시간 상담 연결]로 쓰는 필터링 솔루션 이름과 막힌 주소를 남겨 주세요.",
    ],
    handoff: true,
    en: "If it works on LTE but not on your academy Wi-Fi, your web filter is likely blocking it. Check the filter's block log for the blocked addresses and send them to tech support via 상담원 연결; we don't publish a domain list here.",
    suggestedQuestions: ["학원 네트워크에서만 접속이 안 돼요", "웹 라이브 링크를 열면 방송이 시작되지 않았대요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "verification-reverted",
    subject: /미인증|인증\s*(?:이|된\s*게)?\s*(?:풀렸|풀려|취소|해제|다시\s*안)|인증\s*(?:끝난|된)\s*줄|다시\s*(?:미인증|인증\s*하라)/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "admin", slug: "account-verification" },
    steps: [
      { heading: "인증 절차", pick: [1, 4] },
      { heading: "인증이 반려되거나 늦어지는 경우", pick: [1] },
    ],
    intro:
      "인증이 끝난 줄 알았는데 다시 미인증으로 보이면, 메인 관리자 계정으로 인증 자료 화면의 상태부터 확인해 주세요. 상태가 왜 바뀌었는지는 화면만으로는 알 수 없어 단정하지 않을게요.",
    branches: [
      "학원명·소재지처럼 인증 서류와 맞아야 하는 정보를 최근에 바꿨다면 다시 확인이 필요할 수 있어요. 이유를 확인하려면 상담 채널(홈페이지 하단 채팅)에 '인증 상태 변경 확인'으로 문의해 주세요.",
    ],
    suggestedQuestions: ["기관 인증이 안 돼요", "녹화가 안 돼요", "인증 서류를 다시 내라고 해요"],
  },
  {
    id: "teacher-sees-all-students",
    subject:
      /(?:선생님|강사|교사).{0,20}(?:학생(?:들)?\s*(?:을|이)?\s*(?:다|전부|모두)|다른\s*반|자기\s*반\s*(?:이\s*)?아닌).{0,24}(?:보인|보여|볼\s*수|본다|봐)/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "코스를 직접 만드는 강사에게만 권한 더 주기", pick: [0, 2, 4] }],
    intro:
      "강사가 자기 반이 아닌 학생까지 본다면, 그 강사가 하위 계정으로 관리자 메뉴 권한(기관 관리 등)을 받았는지부터 봐 주세요. 하위 계정은 학원 데이터에 접근할 수 있어서 꼭 필요한 메뉴만 줘야 합니다.",
    branches: [
      "하위 계정이 아닌 일반 교사인데도 보인다면, [기관 관리] > [코스 관리]에서 그 강사가 다른 코스의 [구성원]에 교사로 들어가 있지 않은지 확인해 주세요. 코스 교사는 그 코스 학생을 볼 수 있어요.",
    ],
    suggestedQuestions: ["실장님한테 관리자 권한 줄 수 있나요?", "그만둔 선생님 계정 빼는 법 알려줘요", "학생 추가가 안 돼요"],
  },
  {
    id: "role-switched-student",
    subject: /(?:제가|내가|저는|선생님이|교사가|강사가).{0,20}학생으로\s*(?:바뀌|바껴|변경|돼|되어|들어와|나와)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "course-members" },
    steps: [{ heading: "역할 변경하기 (학생·교사)", take: 3 }],
    intro:
      "수업 중에 갑자기 학생으로 바뀌면 칠판도 학생 관리도 막혀 정말 당황스러우셨겠어요. 그 코스에서 내 계정이 교사로 남아 있는지부터 확인해야 해요. 담임 교사나 관리자가 아래처럼 역할을 다시 교사로 바꾸고, 다시 교실에 들어오면 됩니다.",
    branches: [
      "학원에 등록된 교사 아이디가 아닌 다른 계정으로 들어갔을 때도 학생처럼 보일 수 있어요. 프로필에서 지금 로그인한 계정을 확인해 주세요.",
      "역할이 맞는데도 수업 중에 또 바뀌면 오류일 수 있으니, 아래 [실시간 상담 연결]로 수업 이름과 바뀐 시각을 남겨 주세요. 기술지원이 확인합니다.",
    ],
    handoff: true,
    suggestedQuestions: ["강사 한 명이 여러 반 맡을 수 있나요?", "수업 중에 계속 튕겨요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "phone-number-changed-login",
    subject:
      /(?:폰|휴대폰|핸드폰|번호|phone).{0,12}(?:바꿨|바꿔서|바뀌|변경|새로|changed|new).{0,40}(?:로그인|login|인증|verification)|(?:old|예전|옛날)\s*(?:number|번호)|changed\s*(?:my\s*)?phone|new\s*phone/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "잘못된 계정 또는 비밀번호라고 나올 때", pick: [2] }],
    intro:
      "휴대폰만 바꾸고 번호는 그대로라면 새 폰에서도 같은 번호로 로그인하면 돼요. 번호까지 바뀌었다면 계정은 예전 번호로 가입돼 있어서, 인증코드도 예전 번호로 가요.",
    branches: [
      "가입할 때 이메일도 함께 등록했다면 이메일로 로그인해 보세요.",
      "예전 번호를 더는 쓸 수 없으면 계정 번호를 바꾸는 확인이 필요해요. 번호는 채팅에 적지 말고 아래 [실시간 상담 연결]에서 상담원 안내에 따라 진행해 주세요.",
    ],
    handoff: true,
    en: "If only the phone changed, log in with the same number. If your number changed, the account still uses the old number, so the code goes there—try logging in with email if you registered one, or tap 상담원 연결 to update the number.",
    suggestedQuestions: ["로그인이 안 돼요", "인증코드가 안 와요", "비밀번호를 잊어버렸어요"],
  },
  {
    id: "login-code-wrong",
    subject: /인증\s*(?:번호|코드).{0,20}(?:틀리|틀렸|틀려|오류|안\s*맞|잘못|계속\s*실패)|국번\s*(?:을|를)?\s*(?:바꿔|바꾸|바꿀)|국가\s*번호\s*(?:를|을)?\s*(?:바꿔|바꾸|뭐)/,
    requireSymptom: false,
    howto: true,
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "잘못된 계정 또는 비밀번호라고 나올 때", pick: [0, 1] }],
    intro: "네, 국가번호부터 보세요. 한국 번호면 +82여야 하고, PC는 +1로 잡혀 있을 때가 있어요.",
    branches: ["인증코드를 여러 번 받았다면 가장 마지막에 온 코드만 맞아요. 예전 문자의 코드를 넣으면 틀렸다고 나옵니다."],
    suggestedQuestions: ["인증코드가 안 와요", "로그인이 안 돼요", "비밀번호를 잊어버렸어요"],
  },
  {
    id: "classes-alone-in-room",
    subject:
      /(?:들어가\s*보니|들어갔는데|들어가니까|입장했는데|들어가\s*봤는데).{0,20}(?:아무도\s*없|혼자|선생님이\s*없|아무도\s*안)|(?:교실|수업).{0,10}(?:에\s*)?(?:혼자|아무도\s*없)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "수업이 안 보이거나 입장이 안 될 때", pick: [1, 3, 2] }],
    intro:
      "많이 속상하셨겠어요. 아이는 들어갔는데 아무도 없고 선생님은 안 들어왔다고 하시면, 둘 다 맞을 수 있어요. 아이가 다른 계정이나 다른 교실로 들어간 경우가 흔합니다.",
    branches: [
      "실제 입장 기록은 학원이 관리자 화면에서 확인할 수 있어요. 어제 수업 시간과 함께 학원에 확인을 부탁해 보세요.",
    ],
    suggestedQuestions: ["로그인했는데 수업이 다 없어졌어요", "수업 입장이 안 돼요", "다시보기는 어디서 봐요?"],
  },
  {
    id: "merge-accounts",
    subject: /계정\s*(?:이|을|를)?\s*(?:두\s*개|2개|여러\s*개).{0,30}(?:합치|통합|하나로)|(?:합치|통합|하나로\s*합).{0,10}계정|계정\s*(?:통합|병합)|(?:2|두)\s*(?:accounts?|계정)\s*\??$|다른\s*사람\s*(?:이\s*)?(?:됐|되었)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "teacher", slug: "course-members" },
    steps: [{ heading: "구성원 강제 퇴장시키기", pick: [0] }],
    intro:
      "두 계정을 하나로 합치는 기능은 공개 안내에 없어서 합칠 수 있다고 말씀드리지 않을게요. 대신 학생이 앞으로 쓸 계정 하나를 정해 그 계정을 코스에 넣고, 안 쓸 계정은 코스에서 빼는 방법이 있어요.",
    branches: [
      "쓸 계정은 [기관 관리] > [학생]에서 학생으로 추가한 뒤 코스 [구성원]에 넣어 주세요. 안 쓸 계정은 위 순서대로 코스에서 삭제합니다.",
      "기록 이전처럼 꼭 합쳐야 하는 사정이 있으면 상담 채널로 문의해 주세요.",
    ],
    en: "There's no documented way to merge two accounts. Keep the account the student actually uses, add it to the course, and remove the unused one from the course.",
    suggestedQuestions: ["학생 추가가 안 돼요", "대리 등록했는데 문자가 안 가요", "학생 이름이 전화번호로 보여요"],
  },
  // ─── 수업·과제 ───────────────────────────────────────────────────
  {
    id: "homework-deadline-extend",
    subject: /(?:숙제|과제).{0,20}마감.{0,20}(?:연장|늘|미뤘|바꿨|변경)|(?:미제출).{0,30}(?:제출\s*버튼|제출이?\s*안|못\s*내)/,
    requireSymptom: false,
    category: "classroom",
    doc: { category: "teacher", slug: "course-activities" },
    steps: [{ heading: "숙제와 일일 과제 내기", pick: [4] }],
    intro:
      "마감을 늘렸는데 이미 '미제출'로 표시된 학생에게 제출 버튼이 안 보이면, 연장이 그 학생들에게까지 적용되는지는 공개 안내에 나와 있지 않아 단정하지 않을게요. 먼저 숙제 고급 설정을 봐 주세요.",
    branches: ["설정을 바꿔도 그 학생들 화면에 버튼이 없으면, 그 학생들만 다시 낼 수 있게 하는 방법을 아래 [실시간 상담 연결]에서 화면 기준으로 안내해 드릴게요."],
    handoff: true,
    suggestedQuestions: ["숙제 제출이 안 돼요", "숙제 다시 냈더니 점수가 사라졌어요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "exam-crash-retake",
    subject: /(?:시험|퀴즈).{0,40}(?:튕|꺼졌|끊겼|나갔).{0,40}(?:제출|재응시|다시\s*(?:풀|응시|보))|(?:재응시|다시\s*응시)/,
    requireSymptom: false,
    category: "classroom",
    doc: { category: "teacher", slug: "course-activities" },
    steps: [{ heading: "시험 만들기", pick: [7] }],
    intro:
      "앱이 튕긴 뒤 자동으로 제출 처리되는 게 기본 동작인지, 그 학생에게 재응시를 열어 줄 수 있는지는 공개 안내에 정리돼 있지 않아 단정하지 않을게요. 시험을 만들 때 정하는 제출 관련 설정은 이렇습니다.",
    branches: [
      "이번 학생은 아래 [실시간 상담 연결]로 시험 이름과 학생, 튕긴 시각을 알려 주시면 다시 응시하게 할 방법을 확인해 드릴게요.",
      "다음 시험 전에는 학생 기기를 최신 버전으로 올리고, 와이파이가 약하면 휴대폰 핫스팟을 준비하게 해 두세요.",
    ],
    handoff: true,
    suggestedQuestions: ["수업 중에 계속 튕겨요", "앱이 자꾸 멈춰요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "homework-zero-score",
    subject: /(?:숙제|과제|시험|퀴즈).{0,60}(?:0점|영점|빵점|0\s*점)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "student", slug: "course-grades" },
    steps: [{ heading: "점수가 안 보이거나 이상할 때", pick: [0, 2] }],
    intro:
      "다 풀었는데 0점으로 나오면 놀라셨죠. 아이가 잘못했다고 단정하기 전에, 먼저 제출이 끝났는지 봐 주세요. 숙제 화면에 초록색 [제출하기] 버튼이 그대로 있으면 아직 [초안 저장]만 된 상태예요. 제출됐다면 채점 상태를 확인합니다.",
    branches: ["제출 기록이 있는데도 0점이면 선생님께 채점 상태를 한 번 확인해 달라고 말씀해 주세요."],
    suggestedQuestions: ["숙제 제출이 안 돼요", "숙제 다시 냈더니 점수가 사라졌어요", "성적이 안 보여요"],
  },
  {
    id: "homework-duplicate",
    subject: /(?:숙제|과제).{0,20}(?:두\s*개|2개|두\s*번|두번|중복).{0,20}(?:올라|제출|냈)|(?:두\s*개|두\s*번).{0,10}(?:올라감|올라갔)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "student", slug: "course-submit-activity" },
    steps: [{ heading: "숙제 제출하기", pick: [4, 3] }],
    intro: "숙제를 두 번 냈으면 마지막에 낸 것만 남아요.",
    branches: ["어느 쪽이 남았는지 헷갈리면 선생님께 알려 주세요."],
    suggestedQuestions: ["숙제 제출이 안 돼요", "숙제 사진이 안 올라가요", "숙제 다시 냈더니 점수가 사라졌어요"],
  },
  {
    id: "speaking-private-view",
    subject:
      /(?:학생(?:들)?\s*끼리|서로).{0,20}(?:화면|얼굴|카메라).{0,10}(?:못\s*보|안\s*보이|안\s*보게|못\s*보게)|(?:저만|교사만|선생님만|나만).{0,10}(?:전체\s*)?학생.{0,10}(?:보|볼)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "teacher", slug: "lesson-option-concepts" },
    steps: [{ heading: "온스테이지와 스테이지 표시", pick: [1, 2, 3] }],
    intro:
      "학생끼리는 서로 못 보고 선생님만 모든 학생을 보는 설정은 공개 안내에 따로 없어서, 있다고 말씀드리지 않을게요. 대신 스테이지를 이렇게 쓰면 비슷하게 운영할 수 있어요.",
    branches: [
      "평가할 학생 한 명만 스테이지에 올려 말하게 하고, 끝나면 다음 학생으로 바꿔 올리면 그 학생 화면만 수업에 보여요. 스테이지 밖 학생은 카메라와 마이크가 꺼져 있습니다.",
    ],
    suggestedQuestions: ["학생을 무대에 올리는 방법 알려줘", "학생들 마이크를 처음부터 꺼 두고 싶어요", "학생 목소리가 안 들려요"],
  },
  {
    id: "breakout-groups",
    subject: /breakout|소그룹|분조|조별|그룹\s*(?:토론|나누|방)|(?:2명|두\s*명|짝)\s*(?:씩|끼리).{0,10}(?:대화|말|talk|토론)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "software", slug: "classroom-tools" },
    steps: [{ heading: "학생이 직접 풀고 답하게 하려면", pick: [4, 5] }],
    intro:
      "교실 도구에 조별로 나눠 활동하는 [그룹 토론]이 있어요. 두 명씩 나눠 말하게 하는 정확한 순서는 공개 안내에 그림으로 정리돼 있지 않아, 처음 쓰실 때는 수업 전에 교실에서 한 번 열어 보시길 권해요.",
    en: "Yes—use Group Discussion in the classroom tools for pair or small-group work. Try it once in an empty classroom before class; tap 상담원 연결 if you need step-by-step help.",
    suggestedQuestions: ["학생을 무대에 올리는 방법 알려줘", "개인 칠판은 어떻게 나눠 줘요?", "화면 공유가 안 돼요"],
  },
  {
    id: "share-board-notes",
    subject:
      /(?:판서|칠판(?:에\s*쓴|\s*내용)?|화면에\s*쓴\s*(?:거|것)).{0,30}(?:나눠\s*주|보내|공유|휴대폰으로\s*보|저장해서\s*주)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "hardware", slug: "board-writing-touch" },
    steps: [{ heading: "수업이 끝난 뒤 판서 넘기기", pick: [0, 1] }],
    intro: "종이로 뽑지 않아도 돼요. 칠판에 쓴 판서는 파일로 저장하거나 휴대폰으로 바로 받을 수 있어요.",
    suggestedQuestions: ["보고서는 어디서 봐요?", "드라이브에 자료가 안 올라가요", "전자칠판 터치가 안 돼요"],
  },
  {
    id: "chat-notification-off",
    subject: /(?:채팅|메시지|코스|반)\s*알림.{0,10}(?:끄|꺼|끌|안\s*오게|안\s*받)|알림\s*(?:끄는|끄기|끌|꺼)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "teacher", slug: "course-create" },
    steps: [{ heading: "모바일에서 설정을 바꾸거나 코스에서 나가려면", pick: [0, 1] }],
    intro: "코스(반)마다 알림을 끌 수 있어요.",
    branches: ["앱 알림 전체를 끄려면 휴대폰 설정 > 앱 > Classin > 알림에서 끄면 돼요. 다만 수업 시작 알림도 같이 안 오니 주의해 주세요."],
    suggestedQuestions: ["수업 알림이 안 와요", "선생님께 메시지 보내도 되나요?", "앱이 자꾸 멈춰요"],
  },
  {
    id: "notification-setup",
    subject: /(?:알림|알람).{0,20}(?:받을\s*수|받으려면|받고\s*싶|받는\s*법|켜는)|(?:일정|수업).{0,20}(?:알림|알람)\s*(?:으로)?\s*(?:받|오게)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "student", slug: "todo-calendar" },
    steps: [{ heading: "수업 알림이 안 올 때", pick: [0, 2, 1] }],
    intro:
      "학생으로 등록된 수업은 시작 10분 전에 클래스인 앱 알림이 와요. 알림은 클래스인에 로그인한 기기로 오니, 알림을 받을 휴대폰에서 아래 설정을 확인해 주세요.",
    branches: [
      "학부모님 휴대폰으로 따로 받는 기능이나 휴대폰 캘린더 연동은 공개 안내에 없어서 있다고 말씀드리지 않을게요. 학원에서 학부모 알림을 따로 보내는지 학원에 물어봐 주세요.",
    ],
    suggestedQuestions: ["수업 알림이 안 와요", "찾는 일정이 안 보여요", "다시보기는 어디서 봐요?"],
  },
  {
    id: "message-teacher",
    subject: /선생님(?:한테|께|에게).{0,30}(?:메시지|문자|채팅|연락|물어보).{0,30}(?:보내도|해도|되는지|돼요|될까|실례|괜찮)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "student", slug: "chat" },
    steps: [{ heading: "반 채팅방 열기", pick: [0, 1] }],
    intro:
      "궁금한 건 편하게 물어보셔도 돼요. 클래스인에는 코스마다 반 채팅방이 있어서, 숙제처럼 수업 관련 질문은 거기서 선생님께 남기면 됩니다.",
    branches: [
      "늦은 시간이라면 메시지를 남겨 두고 답은 선생님이 편한 때 받으시면 돼요. 급하지 않은 내용은 저녁 늦게보다 다음 날 낮에 보내는 편이 부담이 덜해요.",
      "선생님과 따로 연락하는 방식(개인 채팅 등)은 학원마다 정해 둔 규칙이 있을 수 있으니, 처음이라면 학원에 한 번 물어보세요.",
    ],
    suggestedQuestions: ["채팅 알림 끄는 법 알려줘", "숙제 제출이 안 돼요", "수업 알림이 안 와요"],
  },
  {
    id: "earphone-audio",
    subject: /이어폰.{0,30}(?:빼면|끼면|없으면|안\s*끼면).{0,30}(?:안\s*들|작|소리|목소리)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [
      { heading: "들어가기 전에 카메라·마이크·스피커 고르기", pick: [1, 2, 3] },
      { heading: "선생님이 내 목소리가 안 들린다고 할 때", pick: [2] },
    ],
    intro:
      "둘 다 해결할 수 있어요. 소리가 나오는 곳(스피커)과 소리를 받는 곳(마이크)을 따로 골라야 해서 생기는 일이에요. 이어폰을 뺐을 때 안 들리면 스피커가, 이어폰을 꼈을 때 목소리가 작으면 마이크가 맞게 골라졌는지 봐 주세요.",
    suggestedQuestions: ["선생님이 제 목소리가 안 들린대요", "선생님 목소리가 안 들려요", "소리가 울리고 하울링이 나요"],
  },
  {
    id: "my-voice-quiet",
    subject: /(?:내|제|my)\s*(?:목소리|소리|voice).{0,24}(?:작|안\s*들|너무\s*작|잘\s*안\s*들)|목소리\s*(?:가|이)?\s*(?:너무\s*)?작다/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "camera-mic-troubleshooting" },
    steps: [{ heading: "소리가 작거나 웅웅거릴 때", pick: [0, 2] }],
    intro:
      "볼륨을 최대로 올렸는데도 목소리가 작다면, 올린 게 스피커 볼륨일 수 있어요. 학생에게 가는 내 목소리는 마이크 입력 크기라 따로 맞춰야 합니다.",
    branches: ["노트북 내장 마이크는 소리를 잘 잡지 못할 때가 있어요. 줄 이어폰이나 외장 마이크를 연결하면 나아지는 경우가 많습니다."],
    en: "Max volume is usually the speaker volume. Raise the microphone input level instead (Settings > Device test > Mic check, or turn on auto mic volume), or use an external mic or wired earphones.",
    suggestedQuestions: ["선생님이 제 목소리가 안 들린대요", "마이크가 안 돼요", "소리가 울리고 하울링이 나요"],
  },
  {
    id: "device-overheat",
    subject: /(?:폰|휴대폰|핸드폰|태블릿|패드|기기|노트북).{0,20}(?:뜨거워|뜨겁|발열|열\s*(?:이|나))|(?:뜨거워|발열).{0,20}(?:꺼|꺼짐|꺼져|멈)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [{ heading: "화면이 깨지거나 느릴 때", pick: [0, 2] }],
    intro: "수업 중에 휴대폰이 뜨거워지고 꺼지면 기기에 부담이 큰 상태예요. 이렇게 줄여 보세요.",
    branches: [
      "충전하면서 오래 쓰면 더 뜨거워질 수 있어요. 수업 전에 충전해 두고, 화면 밝기도 조금 낮춰 주세요.",
      "계속 꺼지면 PC나 다른 기기로 들어가 보세요.",
    ],
    suggestedQuestions: ["수업 중에 계속 튕겨요", "앱이 자꾸 멈춰요", "화면이 이상하게 나와요"],
  },
  {
    id: "ai-feature-off",
    subject: /(?:ai|인공지능)\s*(?:기능|요약|첨삭|분석)?.{0,16}(?:끄|꺼|끌|비활성|사용\s*안|안\s*쓰)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "institution-settings" },
    steps: [{ heading: "부가가치 서비스", pick: [0] }],
    intro:
      "AI 기능은 관리자 대시보드에서 끕니다. [부가가치 서비스]의 AI 에이전트에 토글이 두 개 있는데, [기본 에이전트](수업 요약·AI 첨삭·시험 문제 자동 생성 등)와 [AI 강의 분석]을 모두 끄면 됩니다.",
    branches: ["끄면 이미 만들어진 AI 요약이나 분석 결과가 지워지는지는 공개 안내에 나와 있지 않아 단정하지 않을게요. 남겨 둬야 하는 결과가 있으면 끄기 전에 담당자에게 확인해 주세요."],
    suggestedQuestions: ["통계 파일은 어디서 받아요?", "실장님한테 관리자 권한 줄 수 있나요?", "담당자 상담으로 이어주세요"],
  },
  {
    id: "future-class-not-visible",
    subject: /(?:지난|예전)\s*수업.{0,20}(?:다\s*)?보이는데.{0,20}(?:다음|이번|새)\s*(?:주\s*)?수업.{0,10}(?:만\s*)?(?:안\s*보|안보|없)|(?:다음\s*주|이번\s*주)\s*수업.{0,8}만\s*(?:안\s*보|안보|없)|(?:월|화|수|목|금|토|일)요일\s*수업.{0,30}(?:학생|애들|명).{0,20}(?:빠져|빠졌|없|안\s*보)/,
    requireSymptom: false,
    overridesKnownIntent: true,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "course-activities" },
    steps: [{ heading: "게시 전에 정하는 것", pick: [1] }],
    intro:
      "같은 코스인데 어떤 수업에만 학생이 빠져 있다면, 그 수업(활동)의 게시 대상에 그 학생이 들어 있는지부터 봐 주세요. 게시 대상에서 빠진 학생에게는 그 활동이 가지 않아요. 학생이 코스에 들어오기 전에 만든 수업이라면 대상에서 빠졌을 수도 있어요.",
    branches: [
      "세 학생이 언제 코스에 들어왔는지는 관리자 대시보드 [코스 관리] > 그 코스 > [구성원]의 [코스 추가 시간]에서 봅니다. 목요일 수업을 만든 뒤에 들어온 학생이라면 그 수업 대상에서 빠졌을 가능성이 커요.",
      "이미 만든 수업의 설정은 관리자 대시보드 [코스 관리]에서 그 수업의 [조작] > [수업 편집]에서 고칩니다. 거기서 대상 학생을 바꿀 수 없으면, 학기 중간에 넣는 학생은 [기관 관리] > [코스 관리]의 코스 상세 화면에서 편입생으로 추가해요.",
      "수업 대상이 맞는데도 안 보이면 학생에게 새로고침이나 다시 로그인을 해 보게 하고, 그래도 같으면 상담원이 그 수업 설정을 확인해 드릴게요.",
    ],
    suggestedQuestions: ["학생 추가가 안 돼요", "학생 캘린더에 수업이 안 보여요", "초대 링크를 눌러도 코스에 못 들어가요"],
  },
  {
    id: "web-live-ppt",
    subject: /(?:웹\s*라이브|라이브|송출|중계).{0,40}(?:ppt|파워포인트|슬라이드).{0,40}(?:멈|안\s*움직|끊|버벅|정지)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [{ heading: "화면이 깨지거나 느릴 때", pick: [0, 2] }],
    intro:
      "교실 안 학생은 괜찮은데 웹 라이브 시청자 화면만 PPT에서 멈춘다면, 송출하는 쪽 부담이나 업로드 속도 문제일 수 있어요. 웹 라이브에서 PPT가 어떻게 송출되는지는 공개 안내에 정리돼 있지 않아 원인을 단정하지 않을게요.",
    branches: [
      "PPT를 PDF로 바꿔 자료로 올린 뒤 띄워 보면 PPT 파일 문제인지 비교할 수 있어요.",
      "송출하는 PC의 업로드 속도도 확인해 주세요. 참고로 현장 녹화는 업로드 3Mbps 이상을 권장합니다.",
      "같은 증상이 반복되면 아래 [실시간 상담 연결]로 수업 이름과 멈춘 시각을 알려 주세요.",
    ],
    handoff: true,
    suggestedQuestions: ["PPT 애니메이션이 학생에게 안 보여요", "웹 라이브 링크를 열면 방송이 시작되지 않았대요", "수업 중에 계속 튕겨요"],
  },
  {
    id: "dual-monitor-share",
    subject: /(?:듀얼|보조|두\s*번째|2번째)\s*모니터|모니터\s*(?:두|2)\s*개/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "먼저 확인할 것", pick: [0] }],
    intro:
      "듀얼 모니터에서 화면 공유가 어느 모니터를 잡는지, 공유할 화면을 고르는 순서는 공개 안내에 정리돼 있지 않아 단정하지 않을게요. 먼저 이렇게 비교해 보세요.",
    branches: [
      "Windows [디스플레이 설정]에서 클래스인을 띄울 모니터를 '주 디스플레이'로 바꾼 뒤 클래스인을 다시 켜고 공유해 보세요. 두 모니터의 배율(%)이 다르면 같게 맞춰 보는 것도 도움이 될 수 있어요.",
      "그래도 엉뚱한 모니터가 잡히면 아래 [실시간 상담 연결]로 Windows 버전과 모니터 구성을 알려 주세요.",
    ],
    handoff: true,
    suggestedQuestions: ["화면 공유가 안 돼요", "앱이 자꾸 멈춰요", "PPT 애니메이션이 학생에게 안 보여요"],
  },
  {
    id: "share-screen-privacy",
    subject: /(?:화면\s*공유|screen\s*share|공유).{0,30}(?:알림|notification|카톡|kakao|메시지).{0,20}(?:보여|보임|뜨|떠|나와)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "software", slug: "classroom-tools" },
    steps: [{ heading: "판서하고 자료를 보여 줄 때", pick: [6] }],
    intro:
      "많이 민망하셨겠어요. 화면 전체를 공유하면 그 위에 뜨는 메신저 알림도 학생에게 같이 보여요. 수업 전에 PC의 방해 금지(집중 지원) 모드를 켜고 카카오톡 같은 메신저를 끄거나 알림을 꺼 두면 막을 수 있어요. 참고로 화면 공유는 이런 때 쓰는 기능이에요.",
    branches: [
      "보여 줄 자료가 파일이면 화면 공유 대신 자료로 올려 띄우는 방법도 있어요. 특정 창만 고르는 방법은 공개 안내에 정리돼 있지 않아, 필요하면 상담원이 안내해 드릴게요.",
    ],
    en: "Sharing your whole screen also shows pop-up notifications. Turn on Do Not Disturb / Focus mode and quit KakaoTalk before class, or upload the file as class material instead of screen sharing.",
    suggestedQuestions: ["화면 공유가 안 돼요", "화면 공유할 때 소리가 안 나요", "PPT 애니메이션이 학생에게 안 보여요"],
  },
  {
    id: "ai-camera-coverage",
    subject: /ai\s*카메라.{0,40}(?:학생|몇\s*명|다\s*잡|자동으로\s*잡|20명|전체)/,
    requireSymptom: false,
    howto: true,
    category: "hardware",
    doc: { category: "hardware", slug: "board-ai-camera-mic" },
    steps: [{ heading: "AI 카메라가 하는 일", pick: [0, 1] }],
    intro:
      "먼저 바로잡아 드리면, 공개 안내 기준으로 AI 카메라는 학생을 하나씩 잡는 카메라가 아니라 교실 앞을 오가는 강사를 따라 찍는 카메라예요. 교실 전체는 파노라마 화면으로 함께 보여 줍니다.",
    branches: [
      "학생 20명이 다 화면에 들어오는지는 교실 크기와 설치 위치에 따라 달라 단정할 수 없어요. 학생 전체를 넓게 담는 용도로는 광각 카메라(S1)가 따로 있습니다.",
      "카메라를 더 달아야 하는지와 그 비용은 교실 구조를 보고 견적 상담에서 정해요. 아래 [도입 상담 남기기]로 교실 크기와 학생 수를 남겨 주세요.",
    ],
    suggestedQuestions: ["전자칠판 스펙 알려줘", "견적 구성이 어떻게 되나요?", "쇼룸 방문은 어떻게 예약해요?"],
  },
  // ─── 전자칠판(칠판 티비) ───────────────────────────────────────────
  {
    id: "board-display-lines",
    subject: /(?:칠판|티비|tv|보드|화면).{0,30}(?:줄이|줄\s*(?:이|가)?\s*(?:생|가|몇)|세로줄|가로줄|선이\s*생|얼룩|멍|깨진\s*것\s*같)/,
    exclude: /스펙|사양/,
    requireSymptom: false,
    category: "hardware",
    doc: { category: "hardware", slug: "board-basic-operation" },
    steps: [{ heading: "A/S를 접수할 때 보낼 것", pick: [0, 1, 2] }],
    intro:
      "화면에 줄이 생기면 먼저 보드를 완전히 껐다 켜 보시고, 입력(소스) 버튼으로 내장 컴퓨터(OPS)와 HDMI를 바꿔도 같은 자리에 줄이 남는지 봐 주세요. 그래도 줄이 남으면 화면 쪽 문제일 수 있어 A/S로 접수해야 해요. 접수할 때는 이것을 함께 보내 주세요.",
    branches: [
      "무상 A/S는 구매일부터 기본 1년(프로모션 적용 시 최대 2년)이라, 구매일을 함께 확인해 두시면 좋아요. 보드를 직접 열거나 분해하지는 마세요.",
      "아래 [실시간 상담 연결]로 바로 접수할 수 있어요. 보드 번호 같은 정보는 채팅창에 적지 말고 상담원 안내에 따라 전달해 주세요.",
    ],
    handoff: true,
    suggestedQuestions: ["전자칠판 보증 기간이 궁금해요", "전자칠판 터치가 안 돼요", "전자칠판 화면이 안 켜져요"],
  },
  {
    id: "board-auto-power",
    subject: /(?:칠판|티비|tv|보드).{0,30}(?:혼자|저절로|자동으로|밤새)\s*(?:켜져|켜지|켜있|켜\s*있)/,
    requireSymptom: false,
    category: "hardware",
    doc: { category: "hardware", slug: "board-basic-operation" },
    steps: [{ heading: "버튼은 화면 오른쪽 사이드 하단에 있습니다", pick: [0, 1] }],
    intro:
      "아침마다 혼자 켜져 있으면 전기세도 걱정되시죠. 보드에 켜짐 예약 같은 설정이 있는지는 공개 안내에 정리돼 있지 않아 단정하지 않을게요. 먼저 퇴근할 때 완전히 꺼졌는지부터 확인해 주세요.",
    branches: [
      "전원 버튼을 짧게 누르면 꺼진 게 아니라 대기 모드로 들어가거나 메뉴가 열릴 수 있어요. 완전히 끄려면 전원 버튼을 길게 눌러 종료해 주세요.",
      "완전히 껐는데도 다음 날 켜져 있으면 설치 담당자나 아래 [실시간 상담 연결]로 알려 주세요. 보드 설정을 확인해 드릴게요.",
    ],
    handoff: true,
    suggestedQuestions: ["전자칠판 화면이 안 켜져요", "전자칠판 보증 기간이 궁금해요", "전자칠판 밝기 줄이는 법 알려줘요"],
  },
  {
    id: "board-wall-or-stand",
    subject: /(?:벽|벽걸이).{0,30}(?:약하|약해|석고|못\s*걸|걸어도\s*되|버틸)|(?:스탠드|세워\s*두|이동형).{0,20}(?:바꾸|바꿔|전환|돈|비용)/,
    requireSymptom: false,
    howto: true,
    category: "hardware",
    doc: { category: "hardware", slug: "board-lineup-specs" },
    steps: [{ heading: "설치 조건과 무상 A/S", pick: [0, 1, 2] }],
    intro:
      "벽이 약하다는 말을 들으셨다면 걸기 전에 꼭 벽 재질부터 확인해야 해요. 보드는 75인치 기준 54kg으로 무거워서, 걸어도 괜찮다고 여기서 장담할 수는 없습니다.",
    branches: [
      "스탠드로 바꿀 수 있는지와 바꿀 때 비용이 드는지는 견적과 설치 조건을 보고 담당자가 안내해 드려요. 아래 [도입 상담 남기기]로 새 교실의 벽 재질과 보드 모델을 남겨 주세요.",
    ],
    suggestedQuestions: ["전자칠판 스펙 알려줘", "견적 구성이 어떻게 되나요?", "전자칠판 보증 기간이 궁금해요"],
  },
  // ─── 보안·계정 정리 ───────────────────────────────────────────────
  {
    id: "removed-teacher-access",
    subject:
      /(?:퇴사|그만둔|내보낸|제거한|삭제한|비활성화한|뺀).{0,30}(?:교사|강사|선생님|직원).{0,50}(?:접근|보이|보여|열리|열려|들어|쓸\s*수|로그)|(?:교사|강사|선생님|직원).{0,20}(?:제거|삭제|비활성화|뺐)\S*\s*(?:는데도|는데|했는데도)/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "강사가 그만둘 때", pick: [1, 2] }],
    intro:
      "로그로 확인하셨다면 가볍게 넘길 일이 아니에요. 교사 목록에서 뺀 것과 별개로 하위 계정 권한과 공유 드라이브 구성원은 따로 남아 있을 수 있어서, 세 곳을 모두 정리해야 합니다. 세션이 언제 만료되는지는 공개 안내에 없어 단정하지 않을게요.",
    branches: [
      "공유 드라이브는 관리자 대시보드 > [스토리지] > [공유 드라이브]에서 그 드라이브 오른쪽 더보기(···) > [구성원 관리]를 열어, 그 강사가 아직 구성원으로 남아 있는지 보고 빼 주세요.",
      "정리한 뒤에도 접근 기록이 이어지면 보안 문제일 수 있습니다. 확인한 로그 시각과 함께 아래 [실시간 상담 연결]로 기술지원에 바로 알려 주세요.",
    ],
    handoff: true,
    overridesKnownIntent: true,
    en: "Removing a teacher doesn't automatically clear their sub-account or shared-drive membership—check all three. If access continues afterwards, report it with the log times via 상담원 연결.",
    suggestedQuestions: ["공유 드라이브 권한 설정 방법 알려줘", "그만둔 선생님 계정 빼는 법 알려줘요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "teacher-leaving-materials",
    subject:
      /(?:퇴사|그만두|그만둘|이직|나가게\s*되).{0,40}(?:자료|시험지|교안|파일|드라이브|문제\s*은행)|(?:자료|시험지|교안).{0,30}(?:퇴사|그만두)/,
    exclude: /제거했|삭제했|접근\s*(?:되|돼|가능)|로그/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "강사가 그만둘 때", pick: [0, 2] }],
    intro:
      "퇴사할 때 자료가 어떻게 되는지는 자료가 어디에 있느냐에 따라 달라요. 학원 공유 드라이브와 학원 코스에 올린 자료는 학원이 함께 쓰는 자료라 학원에 남고, 내 드라이브는 강사 개인 공간입니다. 학원에서는 강사가 그만둘 때 보통 아래처럼 정리합니다.",
    branches: [
      "내 드라이브에 만든 시험지·자료를 개인 클라우드로 옮기려면 퇴사 전에 직접 내려받아 두세요.",
      "학원 공유 드라이브나 학원 코스의 자료를 가져가도 되는지는 학원 정책이라, 원장님(관리자)과 먼저 확인해 주세요.",
    ],
    suggestedQuestions: ["공유 드라이브 권한 설정 방법 알려줘", "그만둔 선생님 계정 빼는 법 알려줘요", "드라이브에 자료가 안 올라가요"],
  },
  {
    id: "verification-resubmit",
    subject:
      /(?:인증|서류|증명서|사업자\s*등록증).{0,20}(?:또|다시|재|새로)\s*(?:내|제출|올리|올려)|재\s*제출|(?:서류|인증).{0,10}(?:또|다시)\s*(?:내라|하라)|(?:학원|사업장)?\s*주소\s*(?:가|이)?\s*(?:바뀜|바뀌었|바꿨|변경|이전)/,
    exclude: /인증\s*(?:번호|코드|문자)|숙제|과제/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "admin", slug: "account-verification" },
    steps: [
      { heading: "인증 절차", pick: [1] },
      { heading: "인증이 반려되거나 늦어지는 경우", pick: [0, 1, 2] },
    ],
    intro:
      "서류를 다시 내라는 안내는 대개 올린 서류와 입력한 학원 정보가 맞지 않거나, 빠진 칸이 있거나, 이미지 형식이 맞지 않을 때 나옵니다. 메인 관리자 계정으로 지금 상태부터 확인해 주세요.",
    variants: [
      {
        when: /주소/,
        steps: [
          { heading: "인증이 반려되거나 늦어지는 경우", pick: [1] },
          { heading: "인증 절차", pick: [1] },
        ],
        intro:
          "학원 주소가 바뀌었다면 인증 자료의 소재지와 사업자등록증 주소가 같은지 봐 주세요. 서로 다르면 반려될 수 있어서, 사업자등록증 주소를 바꾸셨다면 인증 자료도 새 서류로 고쳐 올리는 게 안전해요. 꼭 다시 내야 하는지는 담당자에게 확인할 수 있어요.",
      },
    ],
    branches: [
      "무엇 때문에 다시 내야 하는지 화면에서 알 수 없으면, 상담 채널(홈페이지 하단 채팅)에 '인증 서류 재제출 사유 확인'이라고 남겨 주세요. 담당자가 확인해 드립니다.",
    ],
    suggestedQuestions: ["기관 인증이 안 돼요", "녹화가 안 돼요", "학생 추가가 안 돼요"],
  },
  {
    id: "classes-missing-other-account",
    subject:
      /(?:로그인|login).{0,40}(?:수업|코스|반|클래스|class|숙제|다시보기|기록).{0,16}(?:다\s*|전부\s*|모두\s*|도\s*)?(?:없어|없음|사라|안\s*보|안보|안\s*떠)|(?:수업|코스|반|my\s*수업|클래스).{0,8}(?:이|가)?\s*(?:다|전부|모두)\s*(?:없어|사라)|(?:새로|새)\s*(?:산\s*)?(?:태블릿|폰|휴대폰|기기|패드).{0,40}(?:없어|사라|안\s*보)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "수업이 안 보이거나 입장이 안 될 때", pick: [1, 2, 4] }],
    intro:
      "로그인은 되는데 수업이나 숙제가 안 보이면, 지워졌다기보다 다른 아이디로 로그인한 경우가 가장 흔해요. 지금 로그인한 아이디가 학원에 등록된 아이디인지부터 봐 주세요.",
    variants: [
      {
        when: /새로|새\s*(?:산\s*)?(?:태블릿|폰|휴대폰|기기|패드)/,
        steps: [{ heading: "수업이 안 보이거나 입장이 안 될 때", pick: [1, 2] }],
        intro:
          "속상하셨죠. 숙제와 다시보기는 기기가 아니라 계정을 따라가서, 새 태블릿에서도 예전과 같은 아이디로 로그인하면 그대로 보여요. 지금 로그인한 아이디가 예전 기기에서 쓰던 아이디와 같은지 먼저 봐 주세요.",
      },
    ],
    branches: [
      "학원에 등록된 아이디가 휴대폰 번호인데 이메일로 로그인했다면(또는 그 반대), 로그아웃하고 학원에 등록된 쪽으로 다시 로그인하면 수업이 다시 보여요.",
      "아이디가 맞는데도 수업이 없으면, 그 학원(기관)에서 아직 소속돼 있는지 학원에 확인해 주세요.",
    ],
    en: "Your classes are probably still there—you're likely signed in with a different account (e.g., email instead of your phone number). Check the account in your profile, log out, and sign in with the one your academy registered.",
    suggestedQuestions: ["로그인이 안 돼요", "초대 링크를 눌러도 코스에 못 들어가요", "다시보기는 어디서 봐요?"],
  },

  // ─── 관리자 운영 ─────────────────────────────────────────────────
  {
    id: "account-phone-change",
    subject:
      /(?:원장|관리자|메인|내|제|계정).{0,20}(?:폰\s*번호|휴대폰\s*번호|전화\s*번호|핸드폰\s*번호|번호).{0,24}(?:바뀜|바뀌었|바꿨|바꾸|변경|바뀐)|(?:번호|폰번호|휴대폰\s*번호)\s*(?:가|이)?\s*(?:바뀜|바뀌었|바뀌어서|바뀐|변경됐)/,
    exclude: /학생|대리\s*등록|국가\s*번호|비밀번호|2단계|2fa|정책/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "teacher", slug: "teacher-profile" },
    steps: [{ heading: "PC에서 바꾸기", pick: [0, 1] }],
    intro:
      "로그인 아이디로 쓰는 휴대폰 번호를 바꾸는 순서는 공개 안내에 정리돼 있지 않아요. 특히 원장(메인 관리자) 계정은 학원 인증과 결제에 연결돼 있어서, 담당자가 본인 확인을 거쳐 바꿔 드리는 게 안전합니다. 계정 정보 화면은 아래에서 열어 볼 수 있어요.",
    branches: [
      "번호를 바꾸기 전에는 지금 번호로 로그인이 되는 상태를 유지해 주세요. 바꿀 번호는 채팅에 적지 말고, 아래 [실시간 상담 연결]에서 상담원 안내에 따라 전달해 주세요.",
    ],
    handoff: true,
    suggestedQuestions: ["비밀번호를 잊어버렸어요", "로그인이 안 돼요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "sub-account-admin",
    subject:
      /(?:실장|직원|부원장|매니저|선생님|강사|교사|다른\s*사람|담당자).{0,14}(?:한테|에게|께)?\s*(?:관리자|관리\s*권한|어드민|대시보드\s*권한|운영\s*권한).{0,10}(?:주|줄|부여|드리|추가|넘기|나눠)|하위\s*계정|관리자\s*(?:권한|계정).{0,10}(?:추가|부여|나눠|여러\s*명|더\s*만들)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "코스를 직접 만드는 강사에게만 권한 더 주기", pick: [0, 1, 2, 4] }],
    intro:
      "네, 실장님 같은 다른 담당자에게는 하위 계정으로 관리자 메뉴 권한을 나눠 줄 수 있어요. 경로는 관리자 대시보드 > [계정 정보] > [권한 관리] > [하위 계정 추가]이고, 그분이 클래스인에 가입한 계정으로 추가합니다.",
    branches: [
      "하위 계정은 학원 데이터에 접근할 수 있으니 꼭 필요한 메뉴만 체크해 주세요. 계정 인증처럼 메인 관리자만 하는 일은 원장 계정으로 합니다.",
    ],
    suggestedQuestions: ["그만둔 선생님 계정 빼는 법 알려줘요", "기관 인증이 안 돼요", "학생 추가가 안 돼요"],
  },
  {
    id: "teacher-multi-course",
    subject:
      /(?:강사|선생님|교사|쌤)\s*(?:한\s*명|한명|1명|한\s*분)?.{0,12}(?:두|여러|2|세|몇)\s*(?:개\s*)?(?:반|코스|클래스).{0,16}(?:맡|담당|배정|걸|넣|지정)|(?:여러|두)\s*(?:반|코스).{0,8}(?:에\s*)?(?:같은\s*)?(?:강사|선생님|교사).{0,10}(?:배정|넣|걸|지정)|담당\s*(?:교사|강사)\s*(?:지정|배정)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "담당 코스에 배정하기", take: 3 }],
    intro: "네, 한 강사가 여러 반(코스)을 맡을 수 있어요. 반마다 아래처럼 그 강사를 교사로 넣어 주면 됩니다.",
    branches: [
      "코스에 넣을 수 있는 강사는 학원 대시보드에 교사로 등록된 계정뿐이에요. 목록에 안 보이면 [기관 관리] > [교사] > [교사 추가]로 먼저 등록해 주세요.",
    ],
    suggestedQuestions: ["그만둔 선생님 계정 빼는 법 알려줘요", "학생 추가가 안 돼요", "녹화가 안 돼요"],
  },
  {
    id: "stats-export",
    subject:
      /(?:통계|수업\s*(?:몇\s*)?시간|몇\s*시간\s*(?:했|수업)|출결|출석\s*(?:기록|현황)?).{0,30}(?:csv|엑셀|excel|내보내|내려받|다운로드|추출|뽑)|(?:csv|엑셀|excel).{0,20}(?:통계|뽑|추출|내보내)|통계\s*(?:파일|자료|데이터)?.{0,12}(?:어디서|받아|받을|받는)/,
    exclude: /학생\s*(?:등록|추가|명단)|업로드|올렸/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "statistics-data" },
    steps: [{ heading: "통계 파일 내려받기", take: 5 }],
    intro: "교사별 수업 시간은 관리자 대시보드에서 바로 내려받을 수 있어요. 공개 안내 기준으로 파일은 Excel로 받습니다.",
    branches: [
      {
        text: "API로 자체 시스템에 가져오는 방식은 [계정 정보]의 API 도킹 메뉴에서 다루는데, 쓸 수 있는 범위와 조건은 담당자와 먼저 확인해 주세요.",
        when: /api|연동|자동/,
      },
    ],
    suggestedQuestions: ["학생이 다시보기를 봤는지 어디서 봐요?", "그만둔 선생님 계정 빼는 법 알려줘요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "student-import-partial",
    subject:
      /(?:엑셀|excel|텍스트|명단|일괄).{0,30}\d+\s*명.{0,30}(?:만|빠|누락|안\s*들어|덜)|(?:엑셀|excel|일괄).{0,20}(?:등록|가져오기|업로드|올렸).{0,24}(?:일부|빠|누락|덜|몇\s*명)/,
    exclude: /대리\s*등록/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "admin", slug: "student-onboarding" },
    steps: [{ heading: "Excel로 한 번에 300명까지", pick: [2, 3] }],
    intro:
      "몇 명만 빠졌다면 대개 그 줄의 형식이나 가입 여부 문제예요. 실패 내역을 따로 모아 보여 주는 화면은 공개 안내에 없어서, 올린 명단과 [기관 관리] > [학생] 목록을 대조해 빠진 학생부터 찾는 게 가장 빠릅니다. 빠진 줄은 아래 기준으로 봐 주세요.",
    branches: [
      "아직 클래스인에 가입하지 않은 번호는 '등록되지 않은 전화번호·이메일' 안내와 함께 추가되지 않아요. 이런 학생은 한 명씩 추가하거나 텍스트로 가져올 때 [학생 대리 등록]을 체크해 다시 넣어 주세요.",
      "휴대폰 번호는 국가번호 +82에 010의 맨 앞 0을 뺀 10부터 적었는지, 같은 학생이 두 줄로 들어가 있지 않은지도 함께 봐 주세요.",
    ],
    suggestedQuestions: ["대리 등록했는데 문자가 안 가요", "학생 추가가 안 돼요", "기관 인증이 안 돼요"],
  },
  {
    id: "proxy-student-name-edit",
    subject:
      /(?:대리\s*등록|대신\s*가입|대신\s*등록).{0,40}(?:이름|닉네임|정보).{0,30}(?:오타|수정|고치|바꾸|틀|회색|막혀)|(?:학생\s*정보|학생\s*이름).{0,20}(?:수정\s*칸|수정이|편집).{0,20}(?:회색|막혀|안\s*(?:돼|되|눌))/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "student", slug: "student-profile" },
    steps: [{ heading: "PC에서 바꾸기", take: 4 }],
    intro:
      "권한 문제라기보다, 그 이름이 학생 본인 계정의 닉네임이라 학원 화면에서는 고칠 수 없게 막혀 있는 경우일 수 있어요. 대리 등록한 학생도 첫 로그인 뒤에는 학생이 아래처럼 직접 닉네임을 고칩니다.",
    branches: [
      "학원이 코스 닉네임을 가입 이름으로 맞춰 두는 곳이라면, 학생이 이름을 고친 뒤 코스에서 한 번 뺐다가 다시 넣어야 새 이름이 반영될 수 있어요.",
      "학원 화면에서 바로 고칠 방법이 꼭 필요하면 상담 채널로 문의해 주세요. 공개 안내에는 관리자 쪽 수정 순서가 따로 없습니다.",
    ],
    suggestedQuestions: ["대리 등록했는데 문자가 안 가요", "학생 이름이 전화번호로 보여요", "학생 추가가 안 돼요"],
  },
  {
    id: "shared-drive-not-visible",
    subject:
      /(?:공유\s*드라이브|같이\s*쓰는\s*드라이브|학원\s*드라이브|공용\s*드라이브).{0,40}(?:안\s*보|안보|안\s*떠|없|못\s*찾|안\s*나와|사라)|(?:원장|관리자|다른\s*선생님).{0,20}올리신?\s*(?:자료|파일).{0,30}(?:안\s*보|안보|없)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "admin", slug: "shared-drive" },
    steps: [{ heading: "공유 드라이브 만들기", pick: [4, 3] }],
    intro:
      "같은 기관 관리자라도 공유 드라이브는 드라이브마다 구성원과 권한을 따로 정해요. 그 드라이브 구성원에 내 계정이 들어 있는지, 지금 로그인한 계정이 구성원으로 등록된 계정과 같은지부터 봐 주세요.",
    branches: [
      "앱에서는 왼쪽 메뉴 [드라이브] > [공유 드라이브]에서 학원을 골라야 보여요.",
      "권한이 '감추기'로 돼 있으면 그 드라이브의 파일이 보이지 않아요. 드라이브를 만든 분(원장님)께 구성원 추가나 권한 변경을 요청해 주세요.",
    ],
    suggestedQuestions: ["공유 드라이브 권한 설정 방법 알려줘", "드라이브에 자료가 안 올라가요", "그만둔 선생님 계정 빼는 법 알려줘요"],
  },
  {
    id: "course-rename",
    subject: /(?:반|코스|클래스)\s*(?:이름|명).{0,16}(?:바꾸|바꿔|바꾸면|변경|수정|고치)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "teacher", slug: "course-create" },
    steps: [{ heading: "코스 설정에서 정할 것", pick: [0] }],
    intro:
      "반(코스) 이름을 바꾸는 정확한 메뉴 위치는 공개 안내에 순서가 따로 없어요. 코스 설정에서 먼저 찾아보시고, 거기에 이름 편집이 없으면 관리자 대시보드 [기관 관리] > [코스 관리]에서 그 코스를 열어 보세요.",
    branches: [
      "이름을 바꾸면 기존 수업 기록이 지워진다는 안내는 없어요. 다만 학생 화면에 언제 반영되는지는 공개 안내로 확인되지 않아 단정하지 않을게요. 바꾼 뒤 학생 한 명에게 새 이름이 보이는지 확인해 보시고, 걱정되시면 상담원이 확인해 드릴게요.",
    ],
    suggestedQuestions: ["학생 계정은 어떻게 초대하나요?", "학생 추가가 안 돼요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "schedule-time-shift",
    subject:
      /(?:반복|회차|일정|수업\s*시간).{0,40}(?:밀려|밀렸|밀림|틀어|당겨|한\s*시간씩|시간이\s*(?:달라|다르|바뀌))/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "lesson-option-concepts" },
    steps: [{ heading: "옵션이 안 보이거나 녹화가 안 될 때", pick: [4] }],
    intro:
      "반복 일정 중 일부 회차만 시간이 밀리는 원인은 공개 안내에 정리돼 있지 않아요. 우선 기기와 계정의 시간대가 한국(서울)으로 맞는지 보시고, 밀린 회차는 수업이 시작되기 전에 관리자 대시보드의 [수업 편집]에서 하나씩 고칠 수 있어요. 수업 편집 화면은 이렇게 엽니다.",
    branches: [
      "시간대가 맞는데도 같은 회차부터 계속 밀린다면 반복 생성 쪽 문제일 수 있어요. 아래 [실시간 상담 연결]로 코스 이름과 밀리기 시작한 회차를 알려 주시면 담당자가 확인해 드립니다.",
    ],
    handoff: true,
    suggestedQuestions: ["수업 알림이 안 와요", "학생 캘린더에 수업이 안 보여요", "담당자 상담으로 이어주세요"],
  },

  // ─── 녹화·다시보기 ────────────────────────────────────────────────
  {
    id: "field-recording-quality",
    subject:
      /(?:현장\s*녹화|교실\s*촬영|녹화(?:본)?).{0,30}(?:화질|해상도|뭉개|흐릿|흐려|안\s*읽|저화질|1080|720|4k)|(?:화질|해상도).{0,16}(?:녹화|현장)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "lesson-option-concepts" },
    steps: [{ heading: "수업 녹화와 현장 녹화", pick: [2, 5] }],
    intro:
      "녹화본 해상도를 직접 고르는 설정은 공개 안내에서 찾을 수 없어, 해상도가 제한되는지 단정하지 않을게요. 대신 화질에 영향을 주는 확인 사항은 이렇습니다.",
    branches: [
      "칠판 글씨를 또렷하게 남기는 게 목적이라면, 교실 뒤편 카메라보다 [수업 녹화](교실 화면 녹화)를 함께 켜 두는 편이 확실해요. 판서와 띄운 자료가 화면 그대로 남습니다.",
      "카메라는 칠판에 가깝고 정면에 가까운 자리에 두고, 창문이나 조명이 카메라 쪽을 비추는 자리는 피해 주세요.",
      "다 맞췄는데도 녹화본 해상도가 낮게 나오면 담당자에게 카메라 모델과 녹화본 예시를 보내 확인을 요청해 주세요.",
    ],
    suggestedQuestions: ["현장 녹화 카메라 설정 어떻게 해요?", "녹화가 중간에 끊겼어요", "녹화본에 소리가 없어요"],
  },
  {
    id: "recording-local-copy",
    subject:
      /(?:녹화|녹화본).{0,30}(?:제\s*컴퓨터|내\s*컴퓨터|pc|로컬|하드).{0,20}(?:동시|같이|함께|따로)?\s*(?:저장|보관|남기)|(?:동시에|같이)\s*(?:저장|녹화).{0,20}(?:컴퓨터|pc|로컬)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "teacher", slug: "recording-troubleshooting" },
    steps: [{ heading: "전자칠판 로컬 녹화 파일을 찾을 수 없을 때", pick: [0, 1, 3] }],
    intro:
      "녹화가 날아갈까 걱정되시는 마음 이해해요. 수업 녹화를 PC에 자동으로 동시에 저장하는 기능은 공개 안내에 없어요. 대신 이렇게 이중으로 남길 수 있습니다. 전자칠판에서는 도구 모음의 카메라 아이콘으로 하는 로컬 녹화가 교실 화면과 소리를 보드 안에 mp4 파일로 저장해요.",
    branches: [
      "클라우드에 남은 수업 녹화는 관리자 대시보드에서 내려받아 따로 보관할 수 있어요. 남겨야 할 수업은 [스토리지]에서 보호 잠금을 걸어 두면 정리할 때 함께 지워지지 않습니다.",
    ],
    suggestedQuestions: ["녹화 다운로드가 안 돼요", "녹화가 안 돼요", "녹화본이 안 보여요"],
  },
  {
    id: "recording-file-format",
    subject:
      /(?:녹화본|녹화\s*(?:파일|영상)|받은\s*(?:영상|파일)|내려받은\s*(?:영상|파일)).{0,40}(?:재생이?\s*안|재생\s*(?:이|가)?\s*안\s*(?:돼|되)|안\s*열|확장자|형식|포맷|코덱|플레이어)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "admin", slug: "recording-file-troubleshooting" },
    steps: [{ heading: "내려받기가 안 될 때", pick: [1, 0, 2] }],
    intro:
      "받은 녹화본이 컴퓨터에서 열리지 않으면 먼저 내려받기가 끝까지 됐는지 확인해 주세요. 받는 도중 끊기면 파일이 열리지 않을 수 있어요. 녹화본 확장자는 공개 안내에 정리돼 있지 않아 단정하지 않을게요. 다시 받을 때는 아래 방법을 써 보세요.",
    branches: [
      { text: "전자칠판 로컬 녹화로 저장한 파일은 mp4입니다. 저장할 때 형식을 mp4로 골랐는지도 확인해 주세요.", when: /전자칠판|로컬|보드/ },
      "다시 받은 파일도 안 열리면 파일 이름 끝의 확장자를 상담원에게 알려 주세요. 열 수 있는 방법을 확인해 드릴게요.",
    ],
    suggestedQuestions: ["녹화 다운로드가 안 돼요", "녹화본이 안 보여요", "녹화본에 소리가 없어요"],
  },
  {
    id: "replay-black-screen",
    subject:
      /(?:다시\s*보기|다시보기|지난\s*수업|녹화본|녹화\s*영상|녹화|틀어\s*보).{0,40}(?:시커멓|시꺼멓|검은\s*화면|까만\s*화면|까맣|검게|화면\s*(?:은|이)?\s*안\s*(?:나|보)|소리만)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "먼저 확인할 것", pick: [0, 1] }],
    intro:
      "영상은 안 나오고 소리만 나오면, 녹화 방식 때문인지 재생하는 기기·앱 때문인지 나눠서 보면 빨라요. 먼저 앱부터 정리해 주세요.",
    variants: [
      {
        when: /녹화\s*(?:됐|되었|된)|칠판에\s*쓴|판서|녹화했/,
        doc: { category: "teacher", slug: "recording-troubleshooting" },
        steps: [{ heading: "먼저 확인할 것", pick: [5, 2, 1] }],
        intro:
          "녹화됐다는 영상에 화면 없이 소리만 나오면, 처리 상태와 녹화 방식부터 확인해 주세요. 수업 화면 녹화는 판서와 자료가, 현장 녹화는 카메라가 비춘 교실이 나옵니다.",
      },
    ],
    branches: [
      "다시보기에 수업 화면 녹화와 현장 녹화가 함께 있으면 둘 중 무엇을 골랐는지 확인해 주세요. 칠판 내용은 수업 화면 녹화에 남습니다.",
      { text: UPDATE_FROM_STORE, unless: /녹화\s*(?:됐|되었|된)|판서/ },
      "다른 기기(PC나 다른 휴대폰)에서 같은 영상을 열어 보세요. 다른 기기에서는 화면이 나온다면 원래 기기의 앱 버전이나 성능 문제일 가능성이 커요.",
      { text: "와이파이가 약하면 영상이 늦게 뜰 수 있으니 공유기 가까이에서 다시 열어 보세요.", unless: /녹화\s*(?:됐|되었|된)|판서/ },
    ],
    suggestedQuestions: ["녹화본에 소리가 없어요", "다시보기는 어디서 봐요?", "앱이 자꾸 멈춰요"],
  },
  {
    id: "replay-playback-stops",
    subject:
      /(?:다시\s*보기|다시보기|녹화\s*수업|녹화본|지난\s*수업\s*영상).{0,24}(?:끝까지\s*(?:못|안)|(?:중간에|도중에|보다가|자꾸|계속)\s*(?:꺼|멈|끊|튕|나가))/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "먼저 확인할 것", pick: [0, 1] }],
    intro: "다시보기가 중간에 꺼지면 와이파이와 앱 버전부터 봐 주세요.",
    branches: [UPDATE_FROM_STORE, "같은 지점에서 계속 꺼지면 학원에 어느 수업인지 알려 주세요. 녹화본 쪽 문제인지 확인할 수 있어요."],
    suggestedQuestions: ["다시보기는 어디서 봐요?", "앱이 자꾸 멈춰요", "수업 중에 계속 튕겨요"],
  },
  {
    id: "playback-no-permission",
    subject:
      /(?:다시\s*보기|다시보기|플레이백|라이브).{0,30}(?:링크|주소).{0,50}(?:권한|로그인|비밀번호|안\s*열|못\s*들어|막혀)|(?:링크|주소).{0,30}(?:권한이\s*없|권한\s*없|로그인\s*하라)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "admin", slug: "web-live-playback" },
    steps: [
      { heading: "옵션이 안 보이거나 시청자가 못 들어올 때", pick: [2] },
      { heading: "누가 볼 수 있는지 정하기", pick: [0, 2, 4] },
    ],
    intro:
      "받은 분에게 '권한이 없습니다'가 뜨면, 대개 그 라이브·플레이백에 로그인 요구나 비밀번호 같은 시청 조건이 걸려 있는 경우예요. 라이브가 막 끝났다면 녹화본을 볼 수 있게 처리하는 데 시간이 걸리니 잠시 뒤 다시 열어 보게 해 주세요.",
    suggestedQuestions: ["웹 라이브 링크를 열면 방송이 시작되지 않았대요", "녹화본이 안 보여요", "웹 라이브 채팅이 학생에게 안 보여요"],
  },
  {
    id: "web-live-settings",
    subject:
      /(?:웹\s*라이브|라이브|중계|생방송|플레이백).{0,40}(?:채팅|댓글|시청자\s*수|시청\s*인원|몇\s*명|좋아요)|(?:채팅|댓글).{0,20}(?:웹\s*라이브|중계|시청자)/,
    exclude: /안\s*(?:보|떠|돼|되|나)|안보|안돼|안되|오류|에러/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "admin", slug: "web-live-playback" },
    steps: [{ heading: "누가 볼 수 있는지 정하기", pick: [0, 1, 2, 4] }],
    intro:
      "웹 라이브 시청자의 채팅은 강사 앱이 아니라 관리자 대시보드의 세부 설정에서 정해요(좋아요·채팅 권한). 화면에 따라 비로그인 시청자의 채팅 허용으로 보일 수 있어요.",
    branches: [
      "시청자 수는 라이브 중 링크로 연 시청 화면 아래쪽에 조회수·시청자 수·좋아요 수로 보여요. 끝난 뒤에는 대시보드 [라이브&플레이백] > [오퍼레이션] > [관리]에서 시청자 수와 동시 접속 최대 인원 같은 기록을 봅니다.",
      "모든 시청자의 채팅을 완전히 끄는 옵션이 화면에 없으면 상담원이 학원 설정을 보고 확인해 드릴게요.",
    ],
    suggestedQuestions: ["웹 라이브 링크를 열면 방송이 시작되지 않았대요", "웹 라이브 채팅이 학생에게 안 보여요", "녹화가 안 돼요"],
  },
  {
    id: "zoom-recording-import",
    subject:
      /(?:zoom|줌|다른\s*(?:프로그램|플랫폼|툴)|기존|예전).{0,24}(?:녹화본|녹화\s*영상|영상|녹화).{0,30}(?:옮기|옮길|이전|가져|올리|올릴|넘기)/,
    requireSymptom: false,
    howto: true,
    overridesKnownIntent: true,
    category: "classroom",
    doc: { category: "teacher", slug: "course-activities" },
    steps: [{ heading: "녹화 수업과 학습 자료 올리기", pick: [0, 1, 2] }],
    intro:
      "Zoom 녹화본을 ClassIn으로 자동으로 옮겨 주는 기능은 공개 안내에 없어요. 갖고 계신 영상 파일을 코스의 [녹화 수업] 활동으로 올리는 방식입니다.",
    branches: [
      "녹화본은 학원 스토리지 용량을 쓰니, 양이 많다면 올리기 전에 담당자와 용량과 이전 방법을 먼저 상의해 주세요.",
    ],
    suggestedQuestions: ["녹화본이 안 보여요", "스토리지가 꽉 찼다고 떠요", "도입 상담을 받아보고 싶습니다"],
  },

  // ─── 수업·교실 ───────────────────────────────────────────────────
  {
    id: "invite-link-expired",
    subject:
      /(?:초대|invite|가입)\s*(?:링크|link|qr|코드).{0,30}(?:만료|expire|유효|안\s*열|안열|기간|지났)|(?:링크|link).{0,12}(?:만료|expire)/,
    exclude: /녹화|다시\s*보기|다시보기|플레이백|재생/,
    requireSymptom: false,
    category: "classroom",
    doc: { category: "teacher", slug: "course-members" },
    steps: [
      { heading: "구성원 초대하기", pick: [0, 2] },
      { heading: "초대했는데 학생이 못 들어올 때", pick: [0, 4] },
    ],
    intro:
      "초대 링크가 만료됐다고 나오면 새 링크를 다시 복사해 보내 주세요. 링크가 얼마 동안 유효한지는 공개 안내에 기간이 나와 있지 않아 단정하지 않을게요.",
    en: "Copy a fresh invite link (Course > Members > Invite) and send it again; how long a link stays valid isn't documented. If it still fails, students can search the course ID instead.",
    suggestedQuestions: ["초대 링크를 눌러도 코스에 못 들어가요", "학생 계정은 어떻게 초대하나요?", "학생 추가가 안 돼요"],
  },
  {
    id: "board-writing-only-me",
    subject:
      /(?:판서|필기|칠판|쓴\s*(?:게|것|내용)).{0,30}(?:저만|나만|제\s*화면에만|저한테만|선생님만)\s*(?:보|보이)|(?:학생|애들|아이들).{0,12}(?:한테|에게|은|이|들이)?\s*(?:제\s*|내\s*)?(?:판서|필기).{0,10}(?:안\s*보|안보|못\s*봐)/,
    requireSymptom: false,
    category: "classroom",
    doc: { category: "software", slug: "classroom-tools" },
    steps: [
      { heading: "판서하고 자료를 보여 줄 때", pick: [0, 2] },
      { heading: "학생이 직접 풀고 답하게 하려면", pick: [1, 0] },
    ],
    intro:
      "학생에게 판서가 안 보이고 나만 보였다면, 지금 쓰던 곳이 학생과 함께 보는 본 칠판이었는지, 수업 전 준비실이었는지부터 나눠 봐 주세요. 칠판 영역은 이렇게 나뉩니다.",
    branches: [
      "수업 시간 전에 [수업 준비]로 들어간 수업 준비실에는 학생이 들어올 수 없어요. 수업 시간이 되면 실제 교실로 옮겨 수업해야 학생에게 판서가 보입니다.",
      "어느 칠판에 썼는데 어떻게 보였는지 확인이 어려우면, 다음 수업 전에 학생 한 명과 미리 들어가 화면을 맞춰 보시길 권해요. 원인이 계속 안 잡히면 상담원이 함께 확인해 드릴게요.",
    ],
    suggestedQuestions: ["학생을 무대에 올리는 방법 알려줘", "화면 공유가 안 돼요", "PPT 애니메이션이 학생에게 안 보여요"],
  },
  {
    id: "onstage-howto",
    subject:
      /(?:학생|student|아이).{0,20}(?:스테이지|stage|무대).{0,16}(?:올리|올려|올리는|세우|부르)|(?:스테이지|무대|stage)\s*(?:에|로|위로)?\s*(?:학생)?\s*(?:올리|올려)|온\s*스테이지\s*(?:하는|방법|어떻게|시키)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "teacher", slug: "lesson-option-concepts" },
    steps: [{ heading: "온스테이지와 스테이지 표시", pick: [1, 2, 3] }],
    intro:
      "말하기 연습을 시키려면 그 학생을 교실 위쪽 스테이지(무대)에 올리고 마이크 권한을 주면 돼요. 스테이지 밖 학생은 카메라와 마이크가 모두 꺼집니다. 한 번에 올릴 수 있는 인원은 수업을 만들 때 정한 온스테이지 인원수까지예요.",
    en: "Put the student on stage from the attendance list (or call up a student who raised a hand), then give them mic permission—on-stage alone doesn't turn the mic on. The on-stage limit is set when you create the class.",
    suggestedQuestions: ["학생 목소리가 안 들려요", "학생들 마이크를 처음부터 꺼 두고 싶어요", "화면 공유가 안 돼요"],
  },
  {
    id: "homework-feedback-hidden",
    subject:
      /(?:첨삭|피드백|코멘트|빨간\s*(?:펜|표시)|펜으로\s*표시).{0,24}(?:안\s*보|안보|안\s*나|안\s*떠|없|사라|못\s*봐|못\s*본)/,
    // "다시 냈더니 점수·피드백이 사라졌어요"는 재제출 주제(homework-score-lost)가 맡는다.
    exclude: /다시\s*(?:냈|내니|제출)|고쳐\s*(?:냈|제출)|재\s*제출/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "course-activities" },
    steps: [{ heading: "숙제와 일일 과제 내기", pick: [9, 8] }],
    intro:
      "점수는 보이는데 첨삭만 안 보인다면, 첨삭이 저장된 채로 채점이 끝났는지와 학생 앱 버전을 나눠서 봐 주세요. 피드백이 남는 방식은 이렇습니다.",
    branches: [
      "학생 화면에서는 빨간색 첨삭이 숙제 위에 직접 보이거나 피드백 칸의 코멘트로 보여요. 학생 앱이 오래된 버전이면 최신으로 업데이트한 뒤 숙제를 다시 열어 보게 해 주세요.",
      "첨삭한 뒤 학생이 숙제를 고쳐 다시 내면 점수와 피드백이 지워져요. 그런 경우라면 마지막 제출본에 다시 첨삭해야 합니다.",
      "한 학생만 계속 안 보이면 학생 화면 사진과 함께 상담 채널로 알려 주세요.",
    ],
    suggestedQuestions: ["숙제 다시 냈더니 점수가 사라졌어요", "숙제 제출이 안 돼요", "앱이 자꾸 멈춰요"],
  },
  {
    id: "teacher-screen-missing-student",
    subject:
      /(?:선생님|강사|교사)\s*(?:화면|카메라|얼굴).{0,20}(?:나만|저만|우리\s*애만|혼자)\s*(?:안\s*보|안보|안\s*나|안\s*떠)|(?:나만|저만|우리\s*애만)\s*(?:선생님\s*)?(?:화면)?\s*(?:이|가)?\s*(?:안\s*보|안보)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "수업 중에 튕기거나 끊길 때", pick: [0, 1, 2] }],
    intro:
      "다른 친구들은 보이는데 나만 선생님 화면이 안 보이면 내 기기 쪽 문제일 가능성이 커요. 먼저 교실에서 나갔다가 다시 들어와 보고, 그래도 안 보이면 아래를 해 보세요.",
    branches: ["앱이 오래된 버전이면 최신 버전으로 업데이트한 뒤 다시 들어가 보세요."],
    suggestedQuestions: ["수업 중에 계속 튕겨요", "선생님 목소리가 안 들려요", "앱이 자꾸 멈춰요"],
  },
  {
    id: "multi-device-login",
    subject:
      /(?:폰|휴대폰|핸드폰|패드|태블릿|아이패드|pc|컴퓨터|노트북).{0,12}(?:폰|휴대폰|핸드폰|패드|태블릿|아이패드|pc|컴퓨터|노트북).{0,12}(?:동시|같이|둘\s*다|함께).{0,10}(?:로그인|접속|들어)|동시\s*(?:로그인|접속)|(?:두|여러)\s*(?:기기|대)(?:에서|로)?\s*(?:동시\s*)?(?:로그인|접속)/,
    requireSymptom: false,
    howto: true,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [{ heading: "자꾸 끊기거나 교실에서 튕길 때", pick: [2] }],
    intro: "공개 안내 기준으로 답드리면, 수업에는 한 계정이 기기 1대로만 들어가요.",
    branches: [
      "수업이 아닐 때 두 기기에 로그인해 두는 것까지 막히는지는 공개 안내에 따로 나와 있지 않아요. 수업은 쓸 기기 하나로만 들어가 주세요.",
    ],
    en: "One account can join a class from only one device at a time—if you join on both phone and tablet, one of them gets signed out of the class.",
    suggestedQuestions: ["수업 중에 계속 튕겨요", "로그인이 안 돼요", "앱이 자꾸 멈춰요"],
  },
  {
    id: "first-class-tips",
    subject:
      /(?:첫\s*수업|first\s*(?:class|수업)|첫\s*강의|처음\s*(?:으로\s*)?(?:하는\s*)?수업).{0,40}(?:떨려|떨리|긴장|팁|tips?|준비|뭘\s*(?:해야|확인)|조언|어떻게\s*해야)|(?:떨려|떨리|긴장).{0,20}(?:첫\s*수업|first\s*(?:class|수업))/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "teacher", slug: "classroom-basic-setup" },
    steps: [{ heading: "입장 전 장비 테스트", pick: [0, 1, 2] }],
    intro:
      "첫 수업 축하드려요! 떨리는 게 당연해요. 강사는 수업 시작 20분 전부터 교실에 들어갈 수 있으니 조금 일찍 들어가 아래만 확인해 두면 한결 마음이 편해요.",
    branches: [
      "인터넷이 불안하면 휴대폰 핫스팟을 바로 켤 수 있게 준비해 두세요. 수업 중 문제가 생기면 여기서 '상담원 연결'이라고 쓰시면 바로 도와 드릴게요.",
    ],
    en: "Congrats on your first class! Join about 20 minutes early, check camera, mic and speaker on the device-test screen, and keep a phone hotspot ready as a network backup.",
    suggestedQuestions: ["녹화가 안 돼요", "학생 목소리가 안 들려요", "수업 중에 계속 튕겨요"],
  },

  // ─── 카메라·소리·화면 공유 ─────────────────────────────────────────
  {
    id: "camera-mirror",
    subject: /(?:카메라|화면|영상).{0,20}(?:거울처럼|거울\s*같|좌우\s*(?:반전|바뀌|뒤집)|반전|뒤집혀)|(?:글씨|글자).{0,10}(?:반대로|거꾸로|뒤집혀)\s*(?:보|나)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "classroom-basic-setup" },
    steps: [{ heading: "입장 전 장비 테스트", pick: [0] }],
    intro:
      "내 화면에서 글씨가 거울처럼 뒤집혀 보이는 건, 내 미리보기만 좌우를 뒤집어 보여 주는 경우일 수 있어요. 학생 화면에서는 바로 보일 수 있으니 먼저 학생 한 명에게 글씨가 제대로 보이는지 물어봐 주세요.",
    branches: [
      { text: "전자칠판에 연결된 T1·S1 카메라는 클래스인 안에 회전·반전 버튼이 없는 게 정상이고, 방향은 설치 담당자가 CMS에서 바꿉니다.", when: /칠판|보드|t1|s1|ai\s*카메라/ },
      "학생 화면에서도 뒤집혀 보이면, 반전을 바꾸는 버튼 위치는 공개 안내에 정리돼 있지 않아 아래 [실시간 상담 연결]에서 쓰는 기기에 맞춰 안내해 드릴게요.",
    ],
    handoff: true,
    en: "Your own preview may be mirrored while students see it correctly—ask one student first. If students also see it reversed, tap 상담원 연결 and we'll guide you for your device.",
    suggestedQuestions: ["카메라가 안 켜져요", "학생 목소리가 안 들려요", "화면 공유가 안 돼요"],
  },
  {
    id: "camera-front-back",
    subject:
      /(?:카메라).{0,24}(?:반대로\s*돌리|앞뒤|전면|후면|뒤\s*카메라|뒷\s*카메라|돌려서|방향\s*(?:바꾸|전환))|(?:공책|노트|교재|책).{0,20}(?:보여|비추|찍어\s*보여)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "software", slug: "classroom-tools" },
    steps: [{ heading: "실험·작도 도구와 보조 카메라", pick: [3] }],
    intro:
      "휴대폰 앱에서 앞뒤 카메라를 바꾸는 버튼 위치는 공개 안내에 그림으로 정리돼 있지 않아 정확히 짚어 드리기 어려워요. 공책을 보여 줘야 할 때 쓸 수 있는 방법은 이렇습니다.",
    branches: [
      "얼굴이 너무 크게 나오면 휴대폰을 조금 멀리 두고, 공책은 숙제처럼 사진을 찍어 올리는 방법도 있어요.",
      "수업 중에 카메라 전환이 꼭 필요하면 아래 [실시간 상담 연결]에서 쓰는 기기를 알려 주세요. 기기에 맞춰 안내해 드릴게요.",
    ],
    handoff: true,
    suggestedQuestions: ["카메라가 안 켜져요", "숙제 사진이 안 올라가요", "선생님이 제 목소리가 안 들린대요"],
  },
  {
    id: "screen-share-sound",
    subject:
      /(?:화면\s*공유|screen\s*share|공유).{0,30}(?:소리|사운드|sound|음성|오디오).{0,16}(?:안\s*(?:나|들|가)|안나|안들|없)|(?:유튜브|youtube|영상).{0,30}(?:소리|sound).{0,16}(?:안\s*(?:나|들|가)|안나|안들|없)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "software", slug: "classroom-tools" },
    steps: [{ heading: "판서하고 자료를 보여 줄 때", pick: [5, 6] }],
    intro:
      "화면 공유할 때 컴퓨터 소리(유튜브 소리)를 학생에게 함께 보내는 옵션은 공개 안내에 정리돼 있지 않아서, 있다고 단정하지 않을게요. 영상을 보여 줄 때 쓸 수 있는 도구는 이렇습니다.",
    branches: [
      "영상 소리가 꼭 필요하면, 유튜브는 교실 안 [브라우저]로 열어 보여 주는 방법을 먼저 해 보세요.",
      "그래도 학생에게 소리가 안 들리면 아래 [실시간 상담 연결]에서 쓰는 기기(PC·맥)를 알려 주세요. 소리까지 공유하는 방법을 확인해 드릴게요.",
    ],
    handoff: true,
    en: "A documented 'share computer sound' option isn't in our public guide. Try opening YouTube in the classroom's built-in browser; if students still can't hear it, tap 상담원 연결.",
    suggestedQuestions: ["화면 공유가 안 돼요", "학생 목소리가 안 들려요", "PPT 애니메이션이 학생에게 안 보여요"],
  },
  {
    id: "mobile-share-unsupported",
    subject:
      /(?:화면\s*공유|screen\s*share|미러링).{0,30}(?:지원되지\s*않|지원\s*안|지원하지\s*않|미지원|지원\s*(?:안\s*되|하지))|(?:지원되지\s*않는|지원\s*안\s*되는|미지원)\s*기기/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "휴대폰·태블릿: 스토어에서 업데이트하기", pick: [0, 1] }],
    intro:
      "'지원되지 않는 기기'가 뜨면, 그 기기·OS에서 화면 공유가 되는지는 공개 안내에 기기 목록이 없어 여기서 단정하기 어려워요. 먼저 앱을 최신 버전으로 올려 다시 해 보세요.",
    branches: [
      "급하면 PC로 같은 수업에 들어가 화면 공유를 쓰는 방법이 가장 확실해요. 한 계정은 수업에 기기 1대로만 들어가니, PC로 들어가기 전에 태블릿은 교실에서 나와 주세요.",
      "업데이트 뒤에도 같으면 아래 [실시간 상담 연결]로 기기 모델과 안드로이드 버전을 알려 주세요. 지원 여부를 확인해 드립니다.",
    ],
    handoff: true,
    en: "Our public guide doesn't list which devices support screen sharing. Update the app first; if it still says unsupported, join from a PC to share your screen, and tap 상담원 연결 so we can confirm.",
    suggestedQuestions: ["화면 공유가 안 돼요", "앱이 자꾸 멈춰요", "수업 중에 계속 튕겨요"],
  },
  {
    id: "network-latency-region",
    subject: /\brtt\b|핑\s*(?:이|가)?\s*(?:높|튀)|\bping\b|레이턴시|latency|지연\s*(?:시간|이\s*튀|이\s*커|이\s*심)|리전|\bregion\b|접속\s*서버|서버\s*(?:위치|선택|지역)/,
    requireSymptom: false,
    // "리전을 고를 수 있나요?"처럼 기능 문의 꼴로 많이 묻는다.
    howto: true,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [
      { heading: "자꾸 끊기거나 교실에서 튕길 때", pick: [1, 3] },
      { heading: "화면이 깨지거나 느릴 때", pick: [0] },
    ],
    intro:
      "접속 서버(리전)를 사용자가 직접 고르는 옵션은 공개 안내에 없어서, 있다고 말씀드리지 않을게요. 회선과 장비가 좋은데도 지연이 튀는 구간이 반복되면 기술지원이 수업 시간대와 접속 경로를 보고 확인해야 합니다. 그 전에 나눠 볼 수 있는 건 이렇습니다.",
    branches: [
      "기술지원에 넘길 때는 지연이 튄 날짜와 시각, 그때 들어간 수업 이름, 유선·무선 여부를 함께 알려 주세요. 아래 [실시간 상담 연결]로 바로 이어 드릴게요.",
    ],
    handoff: true,
    en: "There's no documented option to choose a server region. Note the dates/times of the RTT spikes, the class name and wired/Wi-Fi, and send them to tech support via 상담원 연결.",
    suggestedQuestions: ["수업 중에 계속 튕겨요", "학원 네트워크에서만 접속이 안 돼요", "담당자 상담으로 이어주세요"],
  },
  {
    id: "mac-update-permission",
    subject:
      /(?:mac|맥|macos|맥북|아이맥).{0,30}(?:업데이트|업그레이드).{0,30}(?:권한|실패|안\s*(?:돼|되)|안돼|안되|막|오류)|(?:업데이트|설치).{0,20}권한\s*(?:부족|없|오류)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "pc-install" },
    steps: [{ heading: "맥에 설치하기", pick: [0, 1, 2, 3, 4] }],
    intro:
      "앱 안의 업데이트가 '권한 부족'으로 실패하면, [응용 프로그램] 폴더의 ClassIn을 휴지통으로 옮긴 뒤 공식 홈페이지 설치 파일로 다시 까는 쪽이 확실해요. 다시 설치할 때는 이 순서예요.",
    branches: [
      "새로 받은 파일이 열리지 않으면 맥 보안 설정이 막는 경우일 수 있어요. 시스템 설정의 [개인정보 보호 및 보안]에 클래스인 차단 안내가 떴는지 확인해 주세요.",
    ],
    suggestedQuestions: ["설치했는데 클래스인이 안 켜져요", "앱이 자꾸 멈춰요", "업데이트하고 나서 안 열려요"],
  },

  // ─── 전자칠판(칠판 티비) ───────────────────────────────────────────
  {
    id: "board-warranty",
    subject:
      /보증\s*(?:기간|기한|됐|되나|남|이\s*남)|무상\s*(?:(?<![a-z])a\s*\/?\s*s(?![a-z])|수리|점검)|(?:칠판|보드|티비|tv).{0,30}(?:고장\s*(?:나면|났|시)|(?<![a-z])a\s*\/?\s*s(?![a-z])|수리\s*(?:는|받|접수))|(?<![a-z])a\s*\/?\s*s\s*(?:기간|접수|센터|연락|전화|신청)|고장\s*나면.{0,20}(?:어디|전화|연락)/,
    requireSymptom: false,
    category: "hardware",
    doc: { category: "hardware", slug: "board-lineup-specs" },
    steps: [{ heading: "설치 조건과 무상 A/S", pick: [3] }],
    intro:
      "작년에 사신 보드가 아직 무상 A/S 기간인지는 구매일과 적용된 프로모션에 따라 달라서 여기서 단정할 수 없어요. 기준은 이렇습니다.",
    branches: [
      "정확한 기간은 구매 계약서나 거래명세서의 구매일로 확인하시고, A/S 접수는 아래 [실시간 상담 연결]이나 홈페이지 상담 채널로 하시면 돼요. 접수할 때 구매일과 증상이 처음 생긴 날을 알려 주시면 빨라요.",
      "접수할 때 필요한 보드 번호는 오른쪽 전원 버튼을 누른 뒤 [Setting] > [about]에서 볼 수 있어요. 채팅창에는 적지 말고 상담원 안내에 따라 전달해 주세요.",
      "보드를 직접 열거나 분해하지는 마세요. 조치 방법은 접수 뒤 안내해 드립니다.",
    ],
    handoff: true,
    suggestedQuestions: ["전자칠판 터치가 안 돼요", "전자칠판 화면이 안 켜져요", "미러링이 안 돼요"],
  },
  {
    id: "board-brightness",
    subject:
      /(?:칠판|티비|tv|보드|화면).{0,20}(?:밝기|눈부|눈이\s*부|너무\s*밝)|밝기.{0,10}(?:줄이|낮추|조절|올리|바꾸)|눈\s*보호\s*모드/,
    exclude: /스펙|사양|규격|cd\s*\/?\s*m/,
    requireSymptom: false,
    howto: true,
    category: "hardware",
    doc: { category: "hardware", slug: "board-s-series-safe-use" },
    steps: [{ heading: "대형 화면 제어 메뉴", pick: [1, 4] }],
    intro: "밝기는 리모컨보다 칠판 화면 오른쪽 아래의 전원·설정 버튼으로 여는 '대형 화면 제어 메뉴'에서 바꾸는 게 쉬워요.",
    branches: [
      "메뉴가 열리면 [밝기]를 눌러 낮춰 주세요. 눈이 부시면 같은 메뉴의 [눈 보호]도 함께 켜 보세요.",
      "리모컨 버튼 배치는 공개 안내에 정리돼 있지 않아서, 리모컨으로 하시려면 상담원이 모델에 맞춰 알려 드릴게요.",
    ],
    suggestedQuestions: ["전자칠판 터치가 안 돼요", "미러링이 안 돼요", "전자칠판 화면이 안 켜져요"],
  },
  {
    id: "board-aspect",
    subject:
      /(?:칠판|티비|tv|보드|화면).{0,30}(?:늘어났|늘어나|늘어져|뚱뚱|찌그러|비율|옆으로\s*길|가로로\s*길|잘려\s*(?:보|나)|꽉\s*안\s*차)/,
    exclude: /스펙|사양|규격|몇\s*인치|화면\s*비율\s*(?:이|가)?\s*(?:몇|어떻게\s*되)/,
    requireSymptom: false,
    category: "hardware",
    doc: { category: "hardware", slug: "board-basic-operation" },
    steps: [{ heading: "HDMI 입력으로 전환하기", pick: [1, 2, 5] }],
    intro:
      "화면이 옆으로 늘어나 글씨가 뚱뚱해 보이면, 보드 고장보다는 지금 보고 있는 입력(내장 컴퓨터인지, 노트북을 꽂은 HDMI인지)과 그 기기의 화면 설정이 맞지 않는 경우일 수 있어요. 먼저 어떤 입력을 보고 있는지 확인해 주세요.",
    branches: [
      "노트북을 연결해 쓰는 중이면 노트북의 화면(디스플레이) 설정에서 해상도를 '권장'으로 바꿔 보세요. 보드는 16:9 화면이라 노트북도 1920×1080 같은 16:9 해상도로 맞추면 늘어나지 않아요.",
      "내장 컴퓨터(OPS) 화면인데도 늘어나 보이면 보드를 껐다 켜 보시고, 그래도 같으면 화면 사진을 찍어 A/S로 접수해 주세요.",
    ],
    suggestedQuestions: ["HDMI 연결했는데 화면이 안 나와요", "전자칠판 터치가 안 돼요", "전자칠판 화면이 안 켜져요"],
  },
  {
    id: "board-app-white",
    subject:
      /(?:칠판|티비|tv|보드|전자\s*칠판).{0,40}(?:프로그램|앱|어플|클래스인|classin|그림).{0,30}(?:안\s*열|안열|하얀|흰\s*화면|하얗|꺼져|꺼지|튕|안\s*켜|안켜|멈)|(?:칠판|보드|티비).{0,20}(?:하얀|흰)\s*화면/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [
      { heading: "먼저 확인할 것", pick: [0, 1] },
      { heading: "그래도 안 되면 지우고 다시 설치하기", pick: [1, 3, 4] },
    ],
    intro:
      "칠판(전자칠판)에 깔린 수업 프로그램은 클래스인 X(ClassIn X)예요. 그림을 누르면 하얀 화면만 나오다 꺼지면 아래 순서로 해 보세요. 재설치는 학원 관리 담당자와 함께 하시면 더 편해요.",
    branches: [
      "앱이 잠깐이라도 열리면 먼저 화면 아래 톱니바퀴 > [설정 더 보기] > [소프트웨어 정보]에서 최신 버전으로 올려 보세요. 그래도 같으면 다시 설치합니다.",
      "다시 설치하면 로그인을 새로 해야 하니 로그인 정보를 미리 챙겨 두세요.",
    ],
    suggestedQuestions: ["전자칠판 화면이 안 켜져요", "전자칠판 터치가 안 돼요", "업데이트하고 나서 안 열려요"],
  },
]
