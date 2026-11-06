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
      /(?:인증|서류|증명서|사업자\s*등록증).{0,20}(?:또|다시|재)\s*(?:내|제출|올리|올려)|재\s*제출|(?:서류|인증).{0,10}(?:또|다시)\s*(?:내라|하라)/,
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
    branches: [
      "무엇 때문에 다시 내야 하는지 화면에서 알 수 없으면, 상담 채널(홈페이지 하단 채팅)에 '인증 서류 재제출 사유 확인'이라고 남겨 주세요. 담당자가 확인해 드립니다.",
    ],
    suggestedQuestions: ["기관 인증이 안 돼요", "녹화가 안 돼요", "학생 추가가 안 돼요"],
  },
  {
    id: "classes-missing-other-account",
    subject:
      /(?:로그인|login).{0,40}(?:수업|코스|반|클래스|class).{0,16}(?:다\s*|전부\s*|모두\s*)?(?:없어|사라|안\s*보|안보|안\s*떠)|(?:수업|코스|반|my\s*수업|클래스).{0,8}(?:이|가)?\s*(?:다|전부|모두)\s*(?:없어|사라)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "수업이 안 보이거나 입장이 안 될 때", pick: [1, 2, 4] }],
    intro:
      "어제는 있던 수업이 다 사라졌다면, 수업이 지워졌다기보다 다른 아이디로 로그인한 경우가 가장 흔해요. 지금 로그인한 아이디가 학원에 등록된 아이디인지부터 봐 주세요.",
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
    exclude: /학생|대리\s*등록|국가\s*번호/,
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
      /(?:통계|수업\s*시간|출결|출석\s*(?:기록|현황)?).{0,30}(?:csv|엑셀|excel|내보내|내려받|다운로드|추출|뽑)|(?:csv|엑셀|excel).{0,20}(?:통계|뽑|추출|내보내)/,
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
      "녹화 해상도를 직접 고르는 설정이나 해상도 상한은 공개 안내에 수치로 나와 있지 않아 단정하지 않을게요. 대신 화질에 영향을 주는 확인 사항은 이렇습니다.",
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
      { heading: "학생이 직접 풀고 답하게 하려면", pick: [1] },
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
    doc: { category: "software", slug: "classroom-tools" },
    steps: [{ heading: "학생을 무대에 올리고 권한 주기", pick: [0, 2, 3, 4] }],
    intro:
      "말하기 연습을 시키려면 그 학생을 교실 위쪽 무대(스테이지)에 올려야 해요. 스테이지 밖 학생은 목소리도 들리지 않습니다. 무대에 올릴 수 있는 인원은 수업을 만들 때 정해요.",
    branches: [
      "수업 중 학생 이름을 눌러 무대에 올리는 정확한 버튼 위치는 기기마다 달라 공개 안내에 그림으로 정리돼 있지 않아요. 찾기 어려우시면 상담원이 화면 기준으로 안내해 드릴게요.",
    ],
    en: "Put the student on stage (the camera row at the top of the classroom) so their camera and mic go live; the on-stage limit is set when you create the class. Give them permission (crown icon) if they should write on the board, then take it back.",
    suggestedQuestions: ["학생 목소리가 안 들려요", "학생들 마이크를 처음부터 꺼 두고 싶어요", "화면 공유가 안 돼요"],
  },
  {
    id: "homework-feedback-hidden",
    subject:
      /(?:첨삭|피드백|코멘트|빨간\s*(?:펜|표시)|펜으로\s*표시).{0,24}(?:안\s*보|안보|안\s*나|안\s*떠|없|사라|못\s*봐|못\s*본)/,
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
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "그래도 안 되면 지우고 다시 설치하기", pick: [5, 4] }],
    intro: "앱 안의 업데이트가 '권한 부족'으로 실패하면, 지금 앱을 지우고 공식 홈페이지 설치 파일로 다시 까는 쪽이 확실해요.",
    branches: [
      "새로 받은 파일이 열리지 않으면 맥 보안 설정이 막는 경우일 수 있어요. 시스템 설정의 [개인정보 보호 및 보안]에 클래스인 차단 안내가 떴는지 확인해 주세요.",
    ],
    suggestedQuestions: ["설치했는데 클래스인이 안 켜져요", "앱이 자꾸 멈춰요", "업데이트하고 나서 안 열려요"],
  },

  // ─── 전자칠판(칠판 티비) ───────────────────────────────────────────
  {
    id: "board-warranty",
    subject:
      /보증\s*(?:기간|기한|됐|되나|남|이\s*남)|무상\s*(?:a\s*\/?\s*s|as|수리|점검)|(?:칠판|보드|티비|tv).{0,30}(?:고장\s*(?:나면|났|시)|a\s*\/?\s*s|수리\s*(?:는|받|접수))|(?:a\s*\/?\s*s|as)\s*(?:기간|접수|센터|연락|전화|신청)|고장\s*나면.{0,20}(?:어디|전화|연락)/,
    requireSymptom: false,
    category: "hardware",
    doc: { category: "hardware", slug: "board-lineup-specs" },
    steps: [{ heading: "설치 조건과 무상 A/S", pick: [3] }],
    intro:
      "작년에 사신 보드가 아직 무상 A/S 기간인지는 구매일과 적용된 프로모션에 따라 달라서 여기서 단정할 수 없어요. 기준은 이렇습니다.",
    branches: [
      "정확한 기간은 구매 계약서나 거래명세서의 구매일로 확인하시고, A/S 접수는 아래 [실시간 상담 연결]이나 홈페이지 상담 채널로 하시면 돼요. 접수할 때 구매일과 증상이 처음 생긴 날을 알려 주시면 빨라요.",
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
    branches: ["다시 설치하면 로그인을 새로 해야 하니 로그인 정보를 미리 챙겨 두세요."],
    suggestedQuestions: ["전자칠판 화면이 안 켜져요", "전자칠판 터치가 안 돼요", "업데이트하고 나서 안 열려요"],
  },
]
