import { CS_FIGMA_DIGEST_GUIDES } from "@/lib/cs-figma-guides.generated"
import { CS_FIGMA_GUIDE_ALIASES } from "@/lib/cs-figma-guide-aliases"
import { getCsFigmaEnrichment } from "@/lib/cs-figma-enrichments"

export type CsFigmaGuideCategory = "classroom" | "admin" | "troubleshooting" | "onboarding"
export type CsFigmaGuideDocCategory = "teacher" | "admin" | "student" | "start"

export interface CsFigmaGuide {
  slug: string
  docSlug: string
  docCategory: CsFigmaGuideDocCategory
  category: CsFigmaGuideCategory
  title: string
  audience: string
  summary: string
  keywords: string[]
  steps: string[]
  deepDive: {
    level: "1단계" | "2단계" | "3단계"
    title: string
    body: string
    checks: string[]
  }[]
  sourceImageFiles: string[]
  sourceDigestLineHint: string
  // 사람이 다시 쓴 큐레이션 가이드의 공개 문서 갱신일. 없으면 캡처 판독 시점으로 계산한다.
  updatedAt?: string
}

export const CURATED_CS_FIGMA_GUIDES: CsFigmaGuide[] = [
  {
    slug: "field-recording-camera-setup",
    docSlug: "cs-field-recording-camera-setup",
    docCategory: "teacher",
    category: "classroom",
    title: "현장 녹화 카메라 설정",
    audience: "강사, 학원 운영자",
    summary:
      "교실에서 하는 수업을 카메라로 녹화하려는 강사를 위한 순서입니다. 수업을 만들 때 현장 녹화를 켜 두고, 교실에 들어가 녹화할 카메라를 고른 뒤 초록색 녹화 아이콘이 뜨는 것까지 확인합니다.",
    keywords: [
      "현장 녹화",
      "카메라 설정",
      "녹화 카메라",
      "1V0",
      "수업 녹화",
      "교실 입장",
      "바로 녹화하기",
      "초록색 아이콘",
      "녹화 끊김",
      "녹화 초반만",
      "화면 녹화 안 됨",
      "녹화 멈춤",
      "녹화 켜기",
      "녹화 끄기",
      "녹화 중지",
    ],
    steps: [
      "수업할 코스에 들어갑니다.",
      "오른쪽 위 [새로 만들기]를 누르고 학습 활동 유형에서 [수업]을 선택합니다.",
      "수업 시간을 정하고, 수업 옵션에서 온스테이지 인원수를 1V0으로 바꾼 뒤 [현장 녹화] 토글을 켜고 [등록]을 누릅니다.",
      "수업이 만들어지면 그 수업의 [교실 입장]을 누릅니다. 강사는 수업 시작 20분 전부터 들어갈 수 있습니다.",
      "장비 테스트 화면에서 카메라, 마이크, 스피커가 실제로 쓸 장치로 잡혀 있는지 보고 [수업 입장]을 누릅니다.",
      "현장 녹화 알림이 뜨면 [확인]을 누르고, 이어서 나오는 현장 녹화 창 위쪽 톱니바퀴에서 녹화할 카메라를 고릅니다.",
      "[바로 녹화하기]를 누릅니다.",
      "녹화가 시작되면 초록색 녹화 아이콘이 뜹니다. PC는 화면 오른쪽 위, 전자칠판은 화면 아래쪽을 보면 됩니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "수업을 만들 때 정할 것",
        body: "현장 녹화는 수업을 만드는 단계에서 켭니다. 온스테이지 인원수 1V0은 학생 카메라를 화면에 띄우지 않는 설정입니다. 녹화 옵션마다 옆의 (?) 아이콘을 누르면 설명이 나옵니다. 녹화는 강사로 등록된 계정에서 쓰는 기능이고, 유료 요금제를 쓰면서 계정 인증을 마친 계정이어야 합니다.",
        checks: [
          "학습 활동 유형이 [수업]입니다.",
          "온스테이지 인원수가 1V0입니다.",
          "[현장 녹화] 토글이 켜져 있습니다.",
        ],
      },
      {
        level: "2단계",
        title: "녹화가 시작되기까지",
        body: "알림에서 [확인]을 누르면 10분 동안 수업 준비 시간이 주어지고, 그 시간이 지나면 녹화가 자동으로 시작됩니다. 준비가 끝났다면 기다리지 말고 [바로 녹화하기]를 누르세요.",
        checks: [
          "녹화할 카메라가 교실을 비추는 카메라입니다.",
          "마이크가 [사용 안 함]이 아닙니다. 마이크가 꺼져 있으면 영상에 소리가 담기지 않을 수 있습니다.",
          "초록색 녹화 아이콘이 떠 있습니다.",
        ],
      },
      {
        level: "3단계",
        title: "녹화가 끊기거나 화질이 떨어질 때",
        body: "녹화는 강사 계정에 연결돼 진행됩니다. 강사가 교실에서 나가거나, 기기를 끄고 다른 기기로 다시 들어오면 녹화가 멈춰 다시 시작해야 할 수 있습니다. 다른 수업으로 옮겨 가도 원래 수업의 녹화는 멈춥니다. 수업 중 네트워크 연결이 끊겨도 녹화가 멈출 수 있습니다. 현장 녹화는 1920×1080 고화질로 저장되는데, 이 화질을 유지하려면 녹화하는 PC가 아래 조건을 갖춰야 합니다. 녹화를 끝내려면 오른쪽 위 [x]에서 [수업 종료]를 누르면 됩니다.",
        checks: [
          "수업 중에 강사가 교실을 나가거나 기기를 바꾸지 않았습니다.",
          "녹화하는 기기의 네트워크가 안정적이고, 업로드 속도가 3Mbps 이상입니다.",
          "CPU가 6세대 Intel i5 이상입니다.",
          "수업이 끝난 직후 녹화본이 안 보이면 잠시 뒤 다시 확인합니다. 녹화본을 앱에서 볼 수 있게 처리하는 데 시간이 걸립니다.",
          "칠판에서 재생한 영상 소리가 녹화에 담기지 않으면 앱을 최신 버전으로 업데이트하고, 캐시 파일과 데이터 파일을 지운 뒤 다시 확인합니다.",
        ],
      },
    ],
    sourceImageFiles: [
      "12/17 실시간 수업 생성 ~ 현장 녹화 확인(PC).png",
      "12/17 실시간 수업 생성 ~ 현장 녹화 확인(IFP).png",
    ],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:47",
    updatedAt: "2026-10-29",
  },
  {
    slug: "recording-download-share",
    docSlug: "cs-recording-download-share",
    docCategory: "admin",
    category: "admin",
    title: "수업 녹화 데이터 다운로드와 공유",
    audience: "학원 관리자, 강사",
    summary:
      "지난 수업 녹화본을 PC에 저장하거나 링크로 보내야 할 때 따라 하세요. 관리자 대시보드 [수업 리소스]에서 녹화 파일을 찾아 내려받고, 재생 링크를 복사해 공유합니다.",
    keywords: [
      "수업 녹화 데이터",
      "녹화 다운로드",
      "녹화 공유",
      "수업 리소스",
      "녹화된 수업 비디오",
      "플레이백",
      "녹화 영상 저장 위치",
      "녹화 내 컴퓨터로",
      "녹화 옮기기",
      "녹화 삭제",
      "다른 코스로 녹화",
      "녹화 다시 올리기",
      "학원에서만 보기",
    ],
    steps: [
      "관리자 대시보드 왼쪽 메뉴 [스토리지] 아래의 [수업 리소스]를 엽니다.",
      "녹화된 수업 행에서 [녹화된 수업 비디오]를 누릅니다.",
      "수업 녹화 데이터 화면에서 클립 목록과 파일 상태를 확인합니다.",
      "받을 클립 행의 [다운로드]를 누릅니다. 바로 저장되지 않으면 [다운로드]를 마우스 오른쪽 버튼으로 누르고 [다른 이름으로 저장]을 고릅니다.",
      "영상 플레이어에서 받을 때는 오른쪽 아래 점 세 개 메뉴를 열고 [다운로드]를 누릅니다.",
      "공유하려면 브라우저 주소창의 재생 링크를 복사해 보냅니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "파일이 여러 개로 나뉘어 있다면",
        body: "한 수업의 녹화가 여러 클립으로 저장될 수 있습니다. 수업을 만들 때 수업 녹화와 현장 녹화를 둘 다 켰다면 교실 화면 녹화와 카메라 녹화가 따로 남고, 둘 다 내려받을 수 있습니다. 생성 방법과 영상 길이를 보고 필요한 클립을 고르세요.",
        checks: ["수업 이름과 날짜가 맞습니다.", "받을 클립의 영상 길이와 파일 크기를 확인했습니다."],
      },
      {
        level: "2단계",
        title: "링크를 보내기 전에",
        body: "주소창의 재생 링크는 로그인하지 않아도 열립니다. 받은 사람이 다른 사람에게 다시 보낼 수도 있으니, 학생 얼굴이나 개인정보가 담긴 영상은 보낼 대상을 먼저 정하세요.",
        checks: ["링크를 받을 사람이 정해져 있습니다.", "영상에 학생 얼굴이나 개인정보가 담겼는지 확인했습니다."],
      },
      {
        level: "3단계",
        title: "녹화를 다른 코스로 옮기거나 지우려면",
        body: "앱에서 녹화를 다른 코스로 바로 옮기는 기능은 없습니다. 다른 코스에서 보여 주려면 내려받은 영상을 그 코스에 [녹화 수업] 활동으로 올리세요. 올린 파일은 순서대로 나열되니, 교실 화면과 카메라 영상 중 한 종류만 올리는 편이 보기 쉽습니다. 관리자 페이지에서 녹화를 지우면 녹화만 볼 수 없게 되고, 수업 페이지와 진행 기록은 그대로 남습니다.",
        checks: [
          "다시 올릴 때는 [실시간 수업]이 아니라 [녹화 수업]으로 올립니다.",
          "학원 안에서만 보게 하는 지역이나 IP 제한 기능은 없습니다.",
        ],
      },
    ],
    sourceImageFiles: ["대시보드 수업 내용 다운로드 및 공유.png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:157",
    updatedAt: "2026-10-29",
  },
  {
    slug: "web-live-create",
    docSlug: "cs-web-live-create",
    docCategory: "teacher",
    category: "classroom",
    title: "웹 라이브 생성 방법",
    audience: "강사, 학원 관리자",
    summary:
      "설명회처럼 많은 사람에게 한 번에 수업을 보여 줄 때 쓰는 웹 라이브를 여는 순서입니다. 수업을 만들 때 녹화 옵션을 켜야 라이브를 고를 수 있고, 게시한 뒤 수업 메뉴에서 참여 링크를 복사해 보냅니다.",
    keywords: ["웹 라이브", "생방송", "수업 링크", "다시보기", "라이브", "실시간 채팅", "플레이어"],
    steps: [
      "코스에 들어가 [새로 만들기]에서 수업을 만듭니다.",
      "수업 옵션에서 [Classin 수업 녹화]나 [현장 녹화] 중 하나 이상을 켭니다. 그래야 아래에 [라이브]와 [플레이백]이 나타나고, 여기서 [라이브]를 고릅니다.",
      "게시 설정을 확인하고 [게시]를 누릅니다.",
      "만든 수업의 점 세 개 메뉴에서 [생방송 리플레이]와 [코스 다시보기] 링크를 확인합니다.",
      "참여자에게 보낼 링크를 복사합니다. 이 수업만 보여 주려면 생방송 리플레이 링크를, 코스의 모든 수업 다시보기를 열어 주려면 코스 다시보기 링크를 보냅니다.",
      "수업 중에는 [수업 도구]에서 [실시간 채팅]을 열어 시청자 채팅을 보고 답합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "송출이 시작되는 시점",
        body: "교실에 들어가 [수업 녹화]를 누르는 순간부터 웹 라이브가 나갑니다. 그 전에 수업 자료와 카메라를 준비해 두세요.",
        checks: ["수업 자료를 미리 열어 두었습니다.", "카메라와 마이크를 확인했습니다."],
      },
      {
        level: "2단계",
        title: "링크가 안 보이거나 시청을 제한하려면",
        body: "수업 메뉴에 링크가 없으면 관리자 대시보드 [라이브&플레이백]의 [웹 페이지 링크]에서 찾습니다. 로그인 요구, 시청 비밀번호, 좋아요와 채팅 권한도 대시보드에서만 바꿀 수 있습니다. 코스 시간표나 수업 관리에서 그 수업의 [관리] → [웹 라이브 및 다시 보기 관리]를 열고 [웹 라이브 설정] 탭에서 바꿉니다.",
        checks: ["시청 비밀번호를 걸었다면 링크와 함께 비밀번호도 보냈습니다."],
      },
      {
        level: "3단계",
        title: "실시간 채팅이 학생 화면에 안 보일 때",
        body: "실시간 채팅 창은 학생 화면에 보이지 않고, 수업 녹화에도 담기지 않습니다.",
        checks: ["채팅 내용을 학생에게 보여 줘야 하면 화면을 이미지로 저장해 따로 전달합니다."],
      },
    ],
    sourceImageFiles: ["웹 라이브 생성 방법 (앱).png", "웹 라이브 생성 방법 (대시보드).png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:383",
    updatedAt: "2026-10-29",
  },
  {
    slug: "microphone-camera-check",
    docSlug: "cs-microphone-camera-check",
    docCategory: "teacher",
    category: "troubleshooting",
    title: "교실 내 카메라와 마이크 설정 확인",
    audience: "강사, 학원 운영자",
    summary:
      "수업 직전이나 수업 중에 카메라 화면이 안 나오거나 소리가 안 들릴 때 보는 순서입니다. 장비 테스트 화면과 수업 중 설정 창에서 장치를 다시 고르고, 마이크가 꺼져 있다는 알림이 뜨면 마이크 입력부터 바꿉니다.",
    keywords: [
      "마이크 설정",
      "카메라 설정",
      "소리 없음",
      "장비 테스트",
      "수업 입장",
      "마이크 안됨",
      "카메라 안됨",
      "소리가 작아요",
      "목소리 안 들려요",
      "학생 소리 안 들림",
      "마이크 감지 안 됨",
      "웅웅거려요",
      "외장 마이크",
      "이어폰",
      "마이크 권한",
      "기기 테스트",
      "마이크 검사",
      "마이크 테스트",
      "태블릿 기기 테스트",
      "모바일 마이크 테스트",
    ],
    steps: [
      "수업에 들어가기 전 장비 테스트 화면에서 카메라, 마이크, 스피커가 실제로 쓸 장치로 선택돼 있는지 봅니다.",
      "수업 중에는 오른쪽 위 마이크 아이콘 옆 화살표를 눌러 메뉴를 펴고, 맨 아래 톱니바퀴 모양 [설정]을 눌러 설정 창을 엽니다. 이 메뉴에서 마이크와 스피커를 바로 고를 수도 있습니다.",
      "설정 창 왼쪽 [카메라]에서 미리 보기 화면을 보며 쓸 카메라를 고릅니다.",
      "왼쪽 [마이크]에서 마이크가 [사용 안 함]으로 되어 있으면 실제로 쓸 마이크로 바꾸고, 말할 때 아래 소리 막대가 초록색으로 움직이는지 봅니다.",
      "화면 아래 독의 마이크와 카메라 아이콘으로 켜고 끈 상태를 확인합니다. 마이크 아이콘이 초록색이면 켜진 상태이고, 사선이 그어져 있으면 꺼진 상태입니다.",
      "소리가 없다는 알림이 계속 뜨면 기기의 마이크 권한과 입력 장치를 다시 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "들어가기 전에",
        body: "PC에 카메라나 마이크가 두 개 이상 연결돼 있으면 쓰려던 장치가 아닌 다른 장치가 잡힐 수 있습니다. 장비 테스트 화면에서 미리 골라 두세요. PC에서는 수업 전에 왼쪽 아래 프로필 → [계정 및 설정] → [기기 테스트] → [마이크 검사]에서 마이크를 시험하고 볼륨을 맞춰 둘 수 있습니다. 휴대폰이나 태블릿은 수업에 들어가기 직전의 기기 체크 화면에서 확인합니다. 교실 안에서는 마이크 아이콘 오른쪽 삼각형을 눌러 연결된 장치를 바꿀 수 있고, 말할 때 카메라 화면 왼쪽 아래에 볼륨이 움직이면 소리가 잡히는 것입니다.",
        checks: [
          "카메라 미리보기에 교실 화면이 보입니다.",
          "마이크에 말했을 때 입력이 잡힙니다.",
          "스피커로 소리가 나옵니다.",
        ],
      },
      {
        level: "2단계",
        title: "수업에서만 학생 소리가 안 들리거나 작을 때",
        body: "장비 테스트에서는 괜찮았는데 수업에서 학생 소리가 안 들린다면 먼저 스테이지를 보세요. 학생은 교실 위쪽 스테이지에 올라와야 카메라와 마이크를 쓸 수 있고, 스테이지에 없으면 둘 다 꺼집니다. 스테이지에 올린 뒤에도 강사나 조교가 마이크 권한을 주지 않으면 마이크는 꺼져 있습니다. 마이크가 꺼져 있다는 알림이 뜨면 알림의 [알림 설정]을 눌러 마이크 목록에서 쓸 마이크를 고르면 됩니다.\n\n소리가 작거나 자주 끊긴다면 기기와 인터넷을 봅니다. 노트북에 달린 마이크와 스피커는 소리를 잘 잡지 못할 수 있어, 줄 이어폰이나 무선 이어폰처럼 따로 연결하는 기기를 쓰면 나아지는 경우가 많습니다. 안드로이드 휴대폰과 태블릿은 앱 안에서 마이크 입력 크기를 조절할 수 없습니다. 볼륨을 최대로 올렸는데도 작다면 스피커 볼륨을 올린 것일 수 있습니다. 소리가 웅웅거리거나 교재 음원이 한쪽에만 안 들리면 앱이 오래된 버전일 수 있으니 최신 버전으로 업데이트하세요.",
        checks: [
          "학생이 스테이지에 올라와 있고, 마이크 권한을 받았습니다.",
          "노트북 내장 마이크 대신 이어폰이나 외장 마이크를 씁니다.",
          "기기를 와이파이 공유기 가까이 두고, 공유기를 껐다 켜 봅니다.",
          "다른 인터넷이나 4G 이상의 모바일 데이터로 바꿔 봅니다.",
          "클래스인 말고 다른 프로그램은 닫아 둡니다.",
          "앱이 최신 버전입니다.",
        ],
      },
      {
        level: "3단계",
        title: "그래도 안 될 때",
        body: "같은 문제가 반복되면 아래 내용을 적어 상담 채널로 보내 주세요. 상담원이 그 수업의 기록으로 원인을 확인합니다. 문제를 겪은 사람의 계정을 모르면 원인을 찾기 어렵습니다.",
        checks: [
          "관리자 페이지에 보이는 그대로의 수업 이름",
          "문제를 겪은 사람의 계정",
          "수업이 시작된 날짜와 시각",
          "문제가 보이는 화면의 사진이나 영상",
        ],
      },
    ],
    sourceImageFiles: ["클래스인 '마이크' 설정.png", "클래스인 교실 내 카메라/ 마이크 설정 확인.png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:433",
    updatedAt: "2026-10-29",
  },
  {
    slug: "bulk-exam-upload",
    docSlug: "cs-bulk-exam-upload",
    docCategory: "teacher",
    category: "classroom",
    title: "시험 문제 대량 업로드와 시험 추가",
    audience: "강사",
    summary:
      "시험 문제를 하나씩 입력하지 않고 워드나 엑셀 파일로 한 번에 올리는 순서입니다. 템플릿에 문제를 적어 올리고, 인식에 실패한 문제를 고친 뒤 시험을 게시합니다.",
    keywords: [
      "시험 문제 대량 업로드",
      "시험 추가",
      "템플릿 다운로드",
      "템플릿 업로드",
      "문제 은행",
      "게시",
      "Word",
      "Excel",
      "시험지 업로드",
      "문제 은행에서 불러오기",
      "점수 일괄 입력",
      "성적 상호 열람",
      "다른 학생 성적 안 보이게",
    ],
    steps: [
      "코스 화면에서 [새로 만들기]를 누르고 [시험]을 선택합니다.",
      "새 시험 추가 화면에서 [시험 문제 대량 추가]를 누릅니다.",
      "[템플릿 다운로드]에서 워드 또는 엑셀 템플릿을 내려받습니다.",
      "템플릿 형식에 맞춰 문제를 적은 뒤 [템플릿 업로드]를 누릅니다.",
      "올라간 문제 텍스트를 확인하고 [다음]을 누릅니다.",
      "문제 인식 성공과 실패 결과를 보고, 실패한 문제를 고칩니다.",
      "필요하면 [내 문제 은행에도 저장하기]를 체크합니다.",
      "[확인]을 눌러 문제를 넣고, 시험 세부 설정을 마친 뒤 [게시]를 누릅니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "템플릿을 쓸 때",
        body: "문제 유형마다 템플릿에 정해진 형식이 있습니다. Answer와 Explanation 표기를 살려 정답과 해설을 적으세요. 파일 대신 문제 텍스트를 입력란에 바로 붙여 넣거나, 워드나 엑셀 파일을 끌어다 놓아도 됩니다.",
        checks: ["객관식 보기를 템플릿 형식대로 적었습니다.", "정답과 해설을 Answer, Explanation 표기에 맞춰 적었습니다."],
      },
      {
        level: "2단계",
        title: "게시하기 전에",
        body: "편집 화면에서 초록 동그라미는 인식 성공, 빨간 동그라미는 인식 실패입니다. 실패한 문제와 미확인 문제를 모두 고친 뒤 [확인]을 누르세요. 바로 공개하지 않으려면 [게시] 대신 [초안 저장]을 누릅니다.",
        checks: [
          "인식 실패나 미확인 문제가 남아 있지 않습니다.",
          "문제 수와 만점이 맞습니다.",
          "게시 대상, 교사, 과정을 확인했습니다.",
        ],
      },
      {
        level: "3단계",
        title: "시험지를 모아 두고 다시 쓰거나 성적 공개를 정하려면",
        body: "자주 쓰는 시험지는 [드라이브] → [문제 은행] → [+시험지 추가]에서 문제를 넣고 [시험 문제 저장]을 눌러 보관합니다. 문제를 넣은 뒤 [계속 추가하기]를 누르면 이어서 추가할 수 있습니다. 보관한 시험지는 시험을 만들 때 [+문제 은행에서 불러오기] → [시험 문제 장바구니에 넣기]로 불러옵니다.\n\n학생끼리 성적을 볼 수 있는지는 [시험] → [설정] → [설정 더 보기] → [숙제 내용, 성적 상호 열람 허용]에서 정합니다. 끄면 학생은 자기 성적만 봅니다. 켜면 학생 제출 후, 교사 채점 후, 마감일 이후 중 서로 볼 수 있게 되는 시점을 고릅니다.",
        checks: [
          "시험 점수를 한꺼번에 입력하는 기능은 없습니다.",
          "오프라인으로 본 시험 점수를 한꺼번에 올리는 기능도 없습니다.",
        ],
      },
    ],
    sourceImageFiles: ["문제 은행 가이드.png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:2171",
    updatedAt: "2026-09-24",
  },
  {
    slug: "homework-upload-mobile",
    docSlug: "cs-homework-upload-mobile",
    docCategory: "student",
    category: "classroom",
    title: "숙제 업로드 모바일",
    audience: "학생, 강사",
    summary:
      "학생이 휴대폰으로 숙제 사진을 찍어 내는 순서입니다. 코스에서 숙제를 열어 [제출하기]를 누르고, 사진을 붙인 뒤 [숙제 제출]까지 눌러야 제출이 끝납니다.",
    keywords: [
      "숙제 업로드",
      "숙제 제출",
      "모바일",
      "사진 첨부",
      "제출하기",
      "학생",
      "숙제 화면 밀림",
      "숙제 줄간격",
      "숙제 표시 오류",
      "숙제 다시 제출",
    ],
    steps: [
      "모바일 앱에서 숙제가 있는 코스를 엽니다.",
      "숙제 행의 [제출하기]를 누릅니다.",
      "숙제 화면 가운데 나의 숙제 영역의 [제출하기]를 눌러 작성을 시작합니다.",
      "화면 아래 사진 아이콘을 눌러 사진을 붙입니다.",
      "붙인 사진을 확인하고 [숙제 제출]을 누릅니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "사진 말고 다른 것도 낼 때",
        body: "사진 아이콘과 같은 줄에서 음성, 파일, 동영상, 링크도 붙일 수 있습니다. 다 쓰지 못했다면 [초안 저장]으로 저장해 두고 나중에 이어서 쓰세요.",
        checks: ["사진 속 글씨가 잘리지 않고 읽힙니다."],
      },
      {
        level: "2단계",
        title: "제출이 됐는지 확인하려면",
        body: "계속 미제출로 보이면 숙제 화면에 다시 들어가 [숙제 제출]까지 눌렀는지 확인하세요. 학생에게는 이렇게 안내하면 됩니다.\n\n> 숙제는 클래스인 앱에서 내 주세요. 코스를 열고 숙제의 [제출하기]를 누른 뒤 사진을 붙이고, 마지막에 [숙제 제출]까지 눌러야 제출됩니다.",
        checks: [
          "마감 시간이 지나지 않았습니다.",
          "제출한 뒤 내용을 고치면 이미 받은 점수와 피드백이 지워집니다.",
          "여러 번 내면 마지막에 낸 것만 남고, 이전 제출본은 볼 수 없습니다.",
        ],
      },
      {
        level: "3단계",
        title: "앱에서 숙제 화면이 밀려 보일 때",
        body: "휴대폰 앱에서 숙제 내용이 뒤로 밀리거나 줄 간격이 넓게 보이면 강사와 학생 모두 앱을 최신 버전으로 업데이트한 뒤 다시 확인합니다. 그래도 같으면 활동 이름, 담당 강사 계정, 학생 계정과 화면 사진이나 영상을 상담 채널로 보내 주세요.",
        checks: ["강사와 학생 모두 앱이 최신 버전입니다."],
      },
    ],
    sourceImageFiles: ["숙제 업로드_모바일.png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:2227",
    updatedAt: "2026-09-24",
  },
  {
    slug: "cache-update-pc",
    docSlug: "cs-cache-update-pc",
    docCategory: "teacher",
    category: "troubleshooting",
    title: "클래스인 캐시 삭제와 PC 업데이트",
    audience: "강사, 학원 관리자",
    summary:
      "PC 앱이 느려지거나 같은 오류가 반복될 때 먼저 해 볼 두 가지입니다. [계정 및 설정]에서 캐시 파일을 지우고, [소프트웨어 정보]에서 최신 버전으로 업그레이드합니다. 오래된 버전을 쓰면 소리, 화면, 입장 문제가 생길 수 있어서 강사와 학생 모두 최신 버전을 쓰는 것이 먼저입니다.",
    keywords: [
      "캐시 삭제",
      "업데이트",
      "PC",
      "업그레이드",
      "파일 관리",
      "계정 및 설정",
      "느려요",
      "오류",
      "최신 버전",
      "데이터 파일 삭제",
      "버전 확인",
      "구버전",
    ],
    steps: [
      "PC 앱 왼쪽 아래 프로필을 누릅니다.",
      "[계정 및 설정]을 엽니다.",
      "[파일 전송]으로 들어가 파일 관리 화면을 엽니다.",
      "캐시 파일 항목의 [내용 삭제]를 누릅니다.",
      "코스나 수업이 제대로 보이지 않을 때, 또는 상담에서 데이터 파일까지 지우라는 안내를 받았을 때는 바로 아래 데이터 파일의 [내용 삭제]도 누릅니다.",
      "다시 [계정 및 설정]에서 [소프트웨어 정보]를 엽니다.",
      "현재 버전과 최신 버전을 비교하고, 다르면 [업그레이드]를 누릅니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "이런 증상이면 먼저 업데이트하세요",
        body: "아래 증상은 앱이 오래된 버전일 때 자주 생기고, 최신 버전으로 업데이트해서 해결되는 경우가 많습니다. 한 사람만 겪더라도 강사와 학생 모두 최신 버전인지 확인하세요. [소프트웨어 정보]에 현재 버전과 최신 버전 번호가 함께 나오고, 두 번호가 같으면 이미 최신 버전입니다. [업데이트 검사]를 눌러 다시 확인할 수도 있습니다.",
        checks: [
          "소리가 웅웅거리거나 교재 음원이 강사에게만 안 들립니다.",
          "수업에 들어가자마자 튕기거나, 수업이 목록에 보이지 않습니다.",
          "수업 화면 일부가 깨져 보이거나 앱에서 숙제 화면이 밀려 보입니다.",
        ],
      },
      {
        level: "2단계",
        title: "수업이 안 보인다면 로그인한 계정부터",
        body: "자동 로그인을 켜 두었으면 코스에 등록된 계정이 아닌 다른 계정으로 들어가 있을 수 있습니다. 프로필에서 지금 로그인한 계정이 코스에 등록된 휴대폰 번호나 이메일과 같은지 먼저 보세요. 다르면 로그아웃한 뒤 맞는 계정으로 다시 로그인합니다.",
        checks: ["로그인한 계정이 코스에 등록된 계정과 같습니다."],
      },
      {
        level: "3단계",
        title: "그래도 같은 오류가 나면",
        body: "다시 로그인한 뒤 같은 동작을 해 봅니다. 그래도 반복되면 아래 내용을 적어 상담 채널로 보내 주세요. 상담원이 그 수업의 기록으로 원인을 확인합니다.",
        checks: [
          "관리자 페이지에 보이는 그대로의 수업 이름",
          "문제를 겪은 사람의 계정",
          "수업이 시작된 날짜와 시각",
          "오류 화면의 사진이나 영상",
        ],
      },
    ],
    sourceImageFiles: ["클래스인 캐시 삭제/업데이트 (PC).png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:1852",
    updatedAt: "2026-09-24",
  },
  {
    slug: "ai-disable-admin",
    docSlug: "cs-ai-disable-admin",
    docCategory: "admin",
    category: "admin",
    title: "Classin AI 비활성화 안내",
    audience: "학원 관리자",
    summary:
      "학원에서 AI 기능을 쓰지 않기로 했을 때 관리자가 한 번에 끄는 방법입니다. 관리자 대시보드 [일반 설정]의 [부가가치 서비스] 탭에서 AI 에이전트 항목의 기본 에이전트와 AI 강의 분석을 끕니다.",
    keywords: ["AI 비활성화", "AI 에이전트", "AI 강의 분석", "스마트 담임", "부가가치 서비스", "관리자 대시보드"],
    steps: [
      "관리자 계정으로 관리자 대시보드에 접속합니다.",
      "왼쪽 메뉴 [계정 정보] 아래의 [일반 설정]을 엽니다.",
      "위쪽 탭에서 [부가가치 서비스]를 누릅니다.",
      "AI 에이전트 영역에서 기본 에이전트와 AI 강의 분석 토글을 찾습니다.",
      "쓰지 않을 AI 기능의 토글을 끕니다.",
      "바꾼 뒤 실제 코스나 수업 화면에서 AI 메뉴가 보이지 않는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "끄면 멈추는 기능",
        body: "기본 에이전트에는 수업 요약, AI 첨삭, 시험 문제 자동 생성, 답안지 생성, AI 말하기 연습 자동 추가가 들어 있습니다. AI 강의 분석은 수업 녹화 영상으로 강사의 수업을 분석하는 기능입니다. 토글을 끄면 코스와 수업에서 이 기능들을 쓸 수 없습니다.",
        checks: ["기본 에이전트 토글이 꺼져 있습니다.", "AI 강의 분석 토글이 꺼져 있습니다."],
      },
      {
        level: "2단계",
        title: "같은 탭에 있는 AI가 아닌 항목",
        body: "하이브리드 수업 기능과 스마트 담임 교사는 AI 기능이 아닙니다. 스마트 담임 교사는 문자로 수업 알림을 보내는 기능이라, AI를 끄면서 함께 끄면 수업 알림도 멈춥니다.",
        checks: ["스마트 담임 교사는 수업 알림을 계속 쓸지에 따라 따로 정합니다."],
      },
      {
        level: "3단계",
        title: "적용됐는지 확인하기",
        body: "설정을 바꾼 뒤 강사 화면과 학생 화면에서 AI 메뉴가 보이는지 각각 확인합니다.",
        checks: ["강사 계정에서 확인했습니다.", "학생 계정에서 확인했습니다."],
      },
    ],
    sourceImageFiles: ["Classin AI 비활성화 안내.png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:759",
    updatedAt: "2026-09-24",
  },
  {
    slug: "classin-app-download",
    docSlug: "cs-classin-app-download",
    docCategory: "start",
    category: "onboarding",
    title: "클래스인 앱 다운로드와 설치",
    audience: "학생, 학부모, 강사, 학원 관리자",
    summary:
      "클래스인을 처음 설치할 때 보는 순서입니다. Windows와 Mac은 클래스인 공식 홈페이지의 다운로드 페이지에서, 휴대폰과 태블릿은 Play 스토어나 App Store에서 받습니다. 학생과 강사는 홈페이지가 아니라 설치한 앱에서 로그인합니다.",
    keywords: [
      "클래스인 다운로드",
      "클래스인 설치",
      "Windows 설치",
      "윈도우 설치",
      "Mac 설치",
      "안드로이드 설치",
      "아이폰 설치",
      "앱스토어",
      "플레이 스토어",
      "앱 설치",
      "프로그램 설치",
      "홈페이지 말고 앱",
      "설치했는데 안 켜져요",
      "설치 후 실행 안 됨",
      "맥북 설치",
      "애플 실리콘",
      "설치 파일 어디",
    ],
    steps: [
      "PC에서는 클래스인 공식 홈페이지의 다운로드 페이지를 엽니다.",
      "Windows는 Windows용 [다운로드]를 눌러 설치 파일을 받은 뒤 실행합니다. 받은 파일은 브라우저 오른쪽 위 다운로드 목록에서 열 수 있습니다.",
      "Windows 설치 창이 열리면 약관 동의 항목에 체크돼 있는지 보고 [설치하기]를 누릅니다. 설치가 끝나면 [시작하기]를 눌러 실행합니다.",
      "Mac은 칩에 맞는 설치 파일을 받습니다. 인텔 칩이면 인텔 프로세서 버전, M1·M2·M3 같은 Apple 칩이면 Apple Silicon 버전입니다. 칩 종류는 화면 왼쪽 위 사과 메뉴에서 확인합니다.",
      "Mac에서 설치 창이 열리면 [Classin]을 [Applications] 폴더로 끌어다 놓아야 설치됩니다.",
      "Android 휴대폰과 태블릿은 Play 스토어에서 ClassIn을 검색하고, 개발사가 EEO Education Ltd.인지 확인한 뒤 [설치]를 누릅니다.",
      "iPhone과 iPad는 App Store에서 ClassIn을 검색하고, 개발사가 EEO Education Ltd.인지 확인한 뒤 [받기]를 누릅니다.",
      "설치가 끝나면 앱을 열고 로그인합니다. 계정이 없으면 [회원 가입]부터 합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "홈페이지에서 로그인하면 안 되는 이유",
        body: "클래스인 공식 홈페이지의 로그인은 기관 관리자와 일부 강사가 쓰는 관리자 페이지입니다. 학생과 강사가 여기로 로그인하면 요금제를 고르는 화면이 뜨거나 [계정 및 보안] 같은 메뉴가 보이지 않습니다. 가입과 로그인은 기기에 설치한 앱에서 하세요. 학생에게는 이렇게 보내면 됩니다.\n\n> 클래스인은 홈페이지가 아니라 앱에서 로그인합니다. 컴퓨터는 클래스인 공식 홈페이지에서 프로그램을 받아 설치하고, 휴대폰과 태블릿은 Play 스토어나 App Store에서 ClassIn을 설치한 뒤 로그인해 주세요.",
        checks: ["학생과 강사가 홈페이지가 아니라 설치한 앱에서 로그인합니다."],
      },
      {
        level: "2단계",
        title: "설치했는데 안 켜질 때",
        body: "먼저 기기에 맞는 설치 파일인지 봅니다. Windows는 Windows용, Mac은 칩에 맞는 파일이어야 합니다. 파일이 맞는데도 실행되지 않으면 보안 기능을 켜는 다른 프로그램이 클래스인의 카메라·마이크 권한을 막고 있을 수 있습니다. 백신, 회사나 보험사 메신저의 보안 앱, 인강 재생용 보안 플레이어가 그런 예입니다. 이런 프로그램을 지우면 해결되는 경우가 많습니다. 인강 플레이어처럼 꼭 필요한 프로그램이라 지울 수 없다면 클래스인은 휴대폰이나 태블릿에서 쓰는 방법도 있습니다.",
        checks: [
          "기기에 맞는 설치 파일을 받았습니다.",
          "백신이나 보안 앱, 인강 재생용 보안 플레이어가 설치돼 있는지 확인했습니다.",
          "저장 공간과 인터넷 연결에 문제가 없습니다.",
          "그래도 안 되면 상담 채널로 문의합니다.",
        ],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
    updatedAt: "2026-10-29",
  },
  {
    slug: "classin-account-signup",
    docSlug: "cs-classin-account-signup",
    docCategory: "start",
    category: "onboarding",
    title: "클래스인 회원가입",
    audience: "학생, 학부모, 강사",
    summary:
      "클래스인을 처음 쓸 때 계정을 만드는 순서입니다. 설치한 앱에서 이메일이나 휴대폰 번호를 입력하고, 약관에 동의한 뒤 인증 코드를 받아 가입합니다.",
    keywords: [
      "클래스인 회원가입",
      "회원가입 방법",
      "신규 가입",
      "본인 인증",
      "인증 코드",
      "계정 만들기",
      "프로필 설정",
      "가입 오류",
      "인증코드 안 와요",
      "인증 코드가 안 와요",
      "국가번호",
      "010 대신 10",
      "잘못된 계정 또는 비밀번호",
      "가입이 안 됐어요",
      "계정이 없대요",
      "홈페이지에서 가입",
      "비즈니스 체험판이 떠요",
      "아이디 변경",
      "가입한 이메일 모름",
      "계정 위반",
    ],
    steps: [
      "클래스인 앱을 열고 첫 화면에서 [회원 가입]을 누릅니다. 휴대폰 앱은 오른쪽 위에 있습니다.",
      "가입에 쓸 방식을 고릅니다. 휴대폰 앱은 이메일 입력 화면이 먼저 열리고, 휴대폰 번호로 가입하려면 아래 [전화 번호로 등록하기]를 누릅니다. 이메일로 돌아가려면 [이메일로 등록하기]를 누릅니다.",
      "이메일 주소나 휴대폰 번호를 입력합니다. 휴대폰 번호는 국가 번호를 +82로 고르고, 010의 맨 앞 0을 빼고 10부터 입력합니다. 휴대폰 번호 화면은 국가 번호가 +1로 먼저 잡혀 있을 수 있으니 눌러서 바꿉니다.",
      "입력칸 아래 약관 동의에 체크하고 [인증코드 받기]를 누릅니다. 약관에 체크해야 버튼이 눌립니다.",
      "받은 인증 코드를 입력합니다. 휴대폰으로 받은 코드는 4자리입니다.",
      "비밀번호를 정해 가입을 마칩니다. 비밀번호는 6~20자로 영문과 숫자를 모두 넣어야 하고, 특수문자, 한글, 공백은 쓸 수 없습니다.",
      "가입한 계정으로 로그인해 봅니다. 첫 로그인 때 프로필(닉네임)을 정할 수 있습니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "인증 코드가 오지 않을 때",
        body: "입력한 이메일 주소나 번호가 맞는지 먼저 봅니다. 휴대폰 번호는 +82를 고르고 10부터 입력해야 합니다. 문자가 오지 않으면 스팸함을 확인하세요. 통신사 설정이나 해외 발신 문자 차단 서비스 때문에 인증 문자가 막히기도 합니다. 화면의 재전송 타이머가 끝나면 다시 보낼 수 있고, 그래도 오지 않으면 클래스인 공식 홈페이지 아래쪽 채팅으로 인증 코드를 요청하세요. 코드를 넣지 않고 멈추면 계정이 만들어지지 않습니다. 가입한 줄 알았는데 로그인할 때 계정이 없다고 나온다면 인증 코드 단계에서 멈춘 것이니 가입을 처음부터 다시 하세요.",
        checks: ["국가 번호가 +82이고, 번호를 10부터 입력했습니다.", "스팸함과 해외 문자 차단 설정을 확인했습니다."],
      },
      {
        level: "2단계",
        title: "로그인이 안 될 때",
        body: "번호와 비밀번호가 맞는데 잘못된 계정이나 비밀번호라고 나오면 국가 번호와 번호 형식부터 다시 보세요. 가입할 때 쓴 번호나 이메일로 로그인해야 합니다. 휴대폰 앱은 비밀번호 입력란 아래 [약관 동의]에 체크해야 로그인됩니다. 클래스인 공식 홈페이지의 로그인은 관리자용 페이지라서, 학생과 강사는 여기서 가입하거나 로그인하지 말고 설치한 앱을 쓰세요. 홈페이지에서 가입해 요금제를 고르는 화면이 뜬다면 상담 채널로 문의해 주세요.",
        checks: ["가입할 때 쓴 번호나 이메일로 로그인합니다.", "휴대폰 앱에서 [약관 동의]에 체크했습니다."],
      },
      {
        level: "3단계",
        title: "가입한 뒤 막히는 경우",
        body: "로그인 아이디를 이메일에서 휴대폰 번호로, 또는 그 반대로 바꿀 수는 없습니다. 꼭 바꿔야 하면 탈퇴한 뒤 새로 가입합니다. 어떤 이메일로 가입했는지 모르겠다면 앱 [회원 가입]에서 그 이메일을 넣고 [인증코드 받기]를 눌러 보세요. 이미 가입된 이메일이면 가입이 막히니, 그 이메일로 로그인 화면의 [비밀번호를 잊으셨나요?]에서 비밀번호를 다시 정하면 됩니다. 가입 직후에는 메시지 보내기 같은 일부 기능이 잠시 제한될 수 있습니다. 계정이 정지된 것은 아니고 로그인과 수업 참여는 그대로 됩니다.",
        checks: [
          "이메일 아이디와 휴대폰 아이디는 서로 바꿀 수 없습니다.",
          "가입 직후 메시지가 안 보내지면 잠시 뒤 다시 보내 보고, 계속 막히면 상담 채널로 문의합니다.",
        ],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
    updatedAt: "2026-10-29",
  },
  {
    slug: "classin-account-delete",
    docSlug: "cs-classin-account-delete",
    docCategory: "start",
    category: "onboarding",
    title: "클래스인 계정 삭제와 회원 탈퇴",
    audience: "학생, 학부모, 강사",
    summary:
      "휴대폰이나 태블릿의 클래스인 앱 [계정 및 보안]에서 본인 인증을 거쳐 계정을 지우는 순서입니다. PC에서는 계정 삭제 메뉴가 없습니다. 지운 계정은 되돌리기 어려우니 필요한 수업 자료와 기록부터 챙기세요.",
    keywords: [
      "계정 삭제",
      "회원 탈퇴",
      "클래스인 탈퇴",
      "계정 및 보안",
      "계정 지우기",
      "탈퇴 방법",
      "본인 확인",
      "탈퇴가 안 돼요",
      "계정 삭제 버튼 없음",
      "탈퇴 인증 문자",
      "delete account",
      "remove profile",
      "관리자 계정 탈퇴",
    ],
    steps: [
      "휴대폰이나 태블릿의 모바일 앱에 로그인하고 왼쪽 위 프로필 이미지를 누릅니다. 설정 화면이 열립니다.",
      "[계정 및 보안]을 누릅니다.",
      "[계정 삭제]를 누르고 삭제 안내와 주의사항을 끝까지 읽습니다.",
      "삭제에 동의한다는 항목에 체크하고 [다음]을 누릅니다.",
      "화면 안내에 따라 본인 인증을 합니다.",
      "마지막으로 삭제를 확인하면 로그아웃됩니다. 같은 계정으로 다시 로그인되지 않으면 삭제가 끝난 것입니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "지우기 전에",
        body: "계정을 지우면 되돌리기 어렵습니다. 다시 봐야 할 수업 자료나 기록이 있으면 먼저 내려받아 두세요. 학원 코스에 참여하고 있다면 학원에도 미리 알려 주세요.",
        checks: ["보관할 수업 자료를 내려받았습니다.", "참여 중인 코스의 학원에 알렸습니다."],
      },
      {
        level: "2단계",
        title: "삭제 메뉴가 없거나 인증 문자가 안 올 때",
        body: "PC에서는 계정 삭제와 탈퇴가 막혀 있어 메뉴가 보이지 않습니다. 휴대폰이나 태블릿에 앱을 설치해 로그인한 뒤 진행하세요. 탈퇴 단계에서 인증 문자가 오지 않거나 코드를 넣어도 안 되면 코드가 만료됐을 수 있으니 인증을 처음부터 다시 합니다. 그래도 안 되면 상담 채널로 문의해 주세요.",
        checks: ["휴대폰이나 태블릿 앱에서 진행하고 있습니다.", "인증을 다시 받아 새 코드를 넣었습니다."],
      },
      {
        level: "3단계",
        title: "관리자 계정은 바로 지워지지 않습니다",
        body: "학원 전체를 관리하는 관리자 계정으로 바뀐 계정은 기관 자료와 개인정보를 보호하기 위해 별도 절차를 거쳐야 하고, 바로 삭제되지 않습니다. 관리자 계정을 지워야 한다면 상담 채널로 문의해 주세요.",
        checks: ["관리자 계정이라면 상담 채널로 삭제를 요청합니다."],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
    updatedAt: "2026-10-29",
  },
  {
    slug: "transfer-student-registration",
    docSlug: "cs-transfer-student-registration",
    docCategory: "admin",
    category: "admin",
    title: "편입생(참관생) 등록",
    audience: "학원 관리자",
    summary:
      "관리자 대시보드에서 코스에 편입생(참관생)을 넣는 순서입니다. [코스 관리]에서 코스 상세를 열어 편입생을 추가하고, 목록에 제대로 들어갔는지 확인합니다.",
    keywords: [
      "편입생 등록",
      "참관생 등록",
      "편입생 추가",
      "참관생 추가",
      "코스 관리",
      "코스 상세",
      "학생 검색",
    ],
    steps: [
      "관리자 대시보드에 로그인한 뒤 [기관 관리]의 [코스 관리]로 이동합니다.",
      "편입생을 넣을 코스 이름을 눌러 코스 상세 화면을 엽니다.",
      "코스 상세 화면에서 [편입생] 항목을 선택하고 [추가]를 누릅니다.",
      "학생 이름으로 검색하거나 아래 목록에서 학생을 찾습니다.",
      "학생 왼쪽 체크박스를 선택하고 [확인]을 누릅니다.",
      "코스 상세 화면의 편입생 목록에 그 학생이 보이는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "이름이 같은 학생이 있을 때",
        body: "이름이 같은 학생이 여럿이면 다른 학생을 고르기 쉽습니다. 체크하기 전에 학생 정보를 한 번 더 보고, 추가한 뒤에는 편입생 목록에서 다시 확인하세요.",
        checks: ["추가한 학생이 편입생 목록에 있습니다.", "이름이 같은 다른 학생을 고르지 않았습니다."],
      },
      {
        level: "2단계",
        title: "이전 수업 다시보기도 봐야 한다면",
        body: "코스에 나중에 들어온 학생은 설정에 따라 이전 수업 다시보기가 보이지 않을 수 있습니다. 관리자 대시보드 [계정 정보] → [일반 설정]의 [수업 다시보기] 탭에서 새로 참여한 학생의 이전 수업 열람이 허용돼 있는지 확인하세요.",
        checks: ["새로 참여한 학생의 이전 수업 열람 옵션을 확인했습니다."],
      },
      {
        level: "3단계",
        title: "아직 가입하지 않은 학생이라면",
        body: "클래스인에 가입하지 않은 번호나 이메일로는 학생을 바로 추가할 수 없습니다. 이럴 때는 학생 대리 등록으로 계정을 먼저 만듭니다. 코스 상세의 [구성원]에서 [코스 내 학생을 설정하기] → [학생 추가]를 누르고, 아래쪽 [학생 대리 등록]을 체크한 뒤 학생의 휴대폰 번호나 이메일과 이름을 입력합니다. 대리 등록 메뉴는 기관 인증을 마친 뒤에 보입니다. 대리 등록을 하면 학생이 휴대폰 번호 아이디면 문자로, 이메일 아이디면 메일로 초기 비밀번호를 받습니다. 통신사 설정이나 해외 발신 문자 차단 서비스 때문에 문자가 가지 않을 수 있으니, 학생이 받지 못했다면 스팸함을 먼저 보고 그래도 없으면 상담 채널로 문의해 주세요. 학생에게는 홈페이지가 아니라 앱에서 로그인하라고 함께 알려 주세요.",
        checks: [
          "대리 등록 메뉴가 안 보이면 기관 인증이 끝났는지 확인합니다.",
          "학생이 초기 비밀번호를 받았는지 확인합니다.",
        ],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
    updatedAt: "2026-10-29",
  },
  {
    slug: "course-member-management",
    docSlug: "cs-course-member-management",
    docCategory: "admin",
    category: "admin",
    title: "코스 구성원 추가와 삭제",
    audience: "강사, 학원 관리자",
    summary:
      "코스에 강사나 학생을 넣고 빼는 순서입니다. 직접 추가하거나 QR 코드와 초대 링크를 보내 들어오게 하고, 그만둔 사람은 구성원 목록에서 [멤버 삭제]로 정리합니다.",
    keywords: [
      "코스 구성원 추가",
      "코스 구성원 삭제",
      "코스 멤버 추가",
      "코스 멤버 삭제",
      "구성원 및 그룹 구성",
      "코스 초대 링크",
      "QR 초대",
      "전화번호로 표시",
      "이름이 번호로 나와요",
      "코스 추가 시간",
      "어떤 계정으로 수강",
    ],
    steps: [
      "코스에 들어가 코스 설정을 엽니다. PC 앱은 왼쪽 위 코스 이름을, 모바일 앱은 코스 화면 위쪽 코스 이름 옆 [>]를 누릅니다.",
      "[코스 구성원 및 그룹 구성]을 누릅니다. 모바일 앱에서는 [코스 멤버]입니다.",
      "직접 넣을 때는 구성원 사진 옆 추가(+) 버튼을 누르고, 넣을 사람과 역할을 확인한 뒤 저장합니다.",
      "구성원이 직접 들어오게 하려면 코스 설정의 [코스 QR 코드 및 링크]에서 QR 코드나 초대 링크를 보냅니다.",
      "뺄 때는 구성원 목록에서 그 사람 오른쪽의 더보기(···)를 누르고 [멤버 삭제]를 고릅니다. 같은 메뉴에 [교사로 설정]과 [채팅 금지]도 있으니 잘 보고 누르세요.",
      "추가하거나 삭제한 뒤 구성원 수와 역할이 맞는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "초대 링크로 들어오게 할 때",
        body: "링크와 QR 코드는 [복사하기]로 복사해 보내면 됩니다. 링크를 복사하면 코스 ID도 함께 복사되어, 받은 사람이 이 ID로 코스를 검색해 들어올 수도 있습니다. 링크로 들어오지 못한다면 [코스 관리]에서 [코스 가입 허용]이 켜져 있는지 보세요.",
        checks: ["[코스 가입 허용]이 켜져 있습니다."],
      },
      {
        level: "2단계",
        title: "빼기 전에",
        body: "삭제하기 전에 이름과 역할을 한 번 더 확인하세요. 역할만 바꿀 거라면 삭제하지 말고 같은 메뉴의 [교사로 설정]을 쓰면 됩니다. 코스에 수업이 있으면 학생이 스스로 코스를 나가지 못할 수 있어서, 그만둔 학생은 강사나 관리자가 [멤버 삭제]로 빼 줍니다.",
        checks: ["뺄 사람의 이름과 역할을 확인했습니다.", "담임 교사나 수업을 맡은 강사가 아닌지 확인했습니다."],
      },
      {
        level: "3단계",
        title: "학생이 코스가 안 보인다고 하거나 이름이 번호로 보일 때",
        body: "학생이 코스나 수업이 안 보인다고 하면 관리자 대시보드 [코스 관리]에서 코스 이름을 누르고 [구성원]을 봅니다. 학생이 어떤 계정으로 코스에 들어가 있는지, [코스 추가 시간]에서 언제 들어왔는지 확인할 수 있습니다. 자동 로그인 때문에 학생이 다른 계정으로 로그인해 있거나, 로그인한 뒤 코스 초대를 누르지 않아 코스가 안 보이는 경우가 있습니다.\n\n수업에서 학생 이름 대신 전화번호가 보이면 관리자 페이지의 클래스 닉네임 동기화 옵션이 꺼져 있는 것입니다. 기관 관리자가 이 옵션을 켠 뒤 그 학생을 코스에서 내보냈다가 다시 추가하면 됩니다. 그 전까지는 강사가 앱에서 그 학생의 코스 닉네임을 실명으로 바꾸거나, 학생에게 직접 바꾸도록 안내합니다.",
        checks: [
          "구성원 목록의 계정과 학생이 로그인한 계정이 같습니다.",
          "학생이 코스 초대를 눌러 코스에 들어왔습니다.",
        ],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
    updatedAt: "2026-10-29",
  },
  {
    slug: "course-wide-chat-control",
    docSlug: "cs-course-wide-chat-control",
    docCategory: "admin",
    category: "admin",
    title: "코스 전체 학생 채팅 활성화와 비활성화",
    audience: "강사, 학원 관리자",
    summary:
      "학생끼리 코스 채팅을 못 하게 막거나 다시 여는 방법입니다. [코스 관리]의 [전체 학생 채팅 금지] 옵션을 켜고 끄는 것으로 바꿉니다.",
    keywords: [
      "코스 전체 채팅",
      "전체 학생 채팅 금지",
      "학생 채팅 비활성화",
      "학생 채팅 활성화",
      "코스 채팅 제한",
      "채팅 금지",
      "코스 관리",
      "학생 채팅 금지",
      "채팅창 못 쓰게",
      "학생끼리 채팅",
    ],
    steps: [
      "채팅을 바꿀 코스로 들어갑니다.",
      "왼쪽 위 코스 이름을 누르고 [코스 관리]를 선택합니다.",
      "코스 관리 옵션에서 [전체 학생 채팅 금지]를 찾습니다.",
      "학생 채팅을 막으려면 옵션을 켭니다.",
      "다시 허용하려면 옵션을 끕니다.",
      "학생 계정으로 채팅이 막혔는지, 또는 다시 열렸는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "켜고 끄는 방향이 헷갈릴 때",
        body: "옵션 이름이 '금지'라서 켜면 막히고 끄면 열립니다. 바꾼 뒤에는 학생 계정으로 한 번 확인하세요.",
        checks: ["옵션을 켜면 학생 전체 채팅이 막힙니다.", "옵션을 끄면 학생이 다시 채팅할 수 있습니다."],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
    updatedAt: "2026-09-24",
  },
  {
    slug: "course-create-and-close",
    docSlug: "cs-course-create-and-close",
    docCategory: "admin",
    category: "admin",
    title: "코스 생성과 종료",
    audience: "강사, 학원 관리자",
    summary:
      "새 반을 열 때 코스를 만들고, 운영이 끝나면 코스를 종료하는 순서입니다. 코스 하나가 반 하나라고 생각하면 됩니다.",
    keywords: [
      "코스 생성",
      "코스 만들기",
      "새 코스",
      "코스 삭제",
      "코스 종료",
      "코스 관리",
      "코스 설정",
      "폐강",
      "코스 삭제 안 됨",
      "지난 수업 정리",
      "휴지통 단원",
      "수업 목록 숨기기",
    ],
    steps: [
      "앱 [홈] 화면 위쪽의 [코스 만들기]를 누릅니다.",
      "코스 이름과 기간 등 화면에 나오는 필수 정보를 입력하고 코스를 만듭니다.",
      "만든 코스에 들어가 코스 설정을 엽니다. PC 앱은 왼쪽 위 코스 이름을, 모바일 앱은 코스 화면 위쪽 코스 이름 옆 [>]를 누릅니다.",
      "운영이 끝난 코스는 코스 설정 맨 아래의 빨간 글씨 [코스 종료]를 누릅니다.",
      "종료 안내를 읽고, 종료 뒤에도 학생이 자료를 볼 수 있게 할지 같은 옵션을 정합니다.",
      "확인란에 코스 이름을 그대로 입력하거나 [자동 입력]을 누른 뒤 [확인]을 누릅니다.",
      "코스 목록에서 상태가 종료됨으로 바뀌었는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "코스를 만들기 전에",
        body: "코스 하나가 반 하나입니다. 실시간 수업, 숙제, 시험을 모두 그 코스 안에서 만들고, 학생도 코스 단위로 초대합니다. 학원 설정에 따라 강사가 직접 코스를 만들지 못할 수도 있습니다.",
        checks: ["[코스 만들기]가 보이지 않으면 학원 관리자에게 권한을 확인합니다."],
      },
      {
        level: "2단계",
        title: "종료하기 전에",
        body: "코스를 종료하기 전에 두 가지만 확인하세요. 학생이 다시 봐야 할 자료가 남아 있는지, 학생들에게 종료를 미리 알렸는지입니다. 자동 삭제 작업을 따로 만들지 않았다면 코스를 끝내도 판서, 스크린샷, 녹화 같은 수업 내용은 지워지지 않습니다.",
        checks: ["종료 뒤 학생이 자료를 볼 수 있게 할지 정했습니다.", "학생들에게 종료 일정을 알렸습니다."],
      },
      {
        level: "3단계",
        title: "지난 수업이나 코스가 지워지지 않을 때",
        body: "이미 진행했거나 끝난 수업의 목록은 앱에서 지울 수 없습니다. 목록을 정리하려면 코스 안에 '휴지통' 같은 이름의 단원을 하나 만들고 지난 수업을 그 단원으로 옮겨 두세요. 수업 데이터 자체를 지우는 일은 관리자 대시보드에서 합니다.",
        checks: ["정리용 단원을 만들어 지난 수업을 옮겼습니다.", "수업 데이터 삭제는 관리자 대시보드에서 합니다."],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
    updatedAt: "2026-10-29",
  },
]

// 생성 가이드(캡처 판독본) 중 사내 전용 화면(직원 계정 비밀번호 재설정, 사용자 수업 이력·품질 진단), 번역 작업 화면,
// 충전·결제 금액과 계정 잔액이 찍힌 캡처, 예시 학원명이 제목인 대응 메모, 빈 캡처는 공개 문서와 챗봇 답변 어디에도 내보내지 않는다.
// (생성 파일은 스크립트가 다시 만들므로 여기서 거른다.) 이 가이드들의 원본 캡처 파일은 URL 로도 열리지 않도록
// public/docs/files/cs-figma/ 에서 뺐다(2026-10-29). 다시 내보낼 때도 이 화면들은 공개 폴더에 넣지 않는다.
const INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS = new Set([
  "cs-figma-digest-881",
  "cs-figma-digest-1385",
  "cs-figma-digest-1402",
  "cs-figma-digest-1895",
  "cs-figma-digest-1914",
  "cs-figma-digest-1936",
  "cs-figma-digest-1960",
  "cs-figma-digest-757",
  "cs-figma-digest-1492",
  "cs-figma-digest-689",
  "cs-figma-digest-2256",
  "cs-figma-digest-1988",
  "cs-figma-digest-2017",
])

// 남은 생성 가이드 텍스트에서 직원 이름·테스트 계정·예시 학원명·계정 잔액·내부 표현을 문서와 챗봇 공통으로 걷어 낸다.
// 이미지 매핑에 쓰는 slug·docSlug·sourceImageFiles 는 건드리지 않는다.
export function scrubCsFigmaCaptureText(value: string): string {
  return value
    .replace(/EEO[-_ ]?TEST[-_ ]?[A-Za-z0-9_-]*(?:\s+KIM\b)?/gi, "예시 계정")
    .replace(/Classin(?:\s*[-_]\s*|\s)(?:Liz|Hope)\b/g, "예시 계정")
    .replace(/Minjae(?:[ ._]?(?:Kim|sub))?(?:\s?\d+)?(?:\s*\(minjae\.kim\))?/gi, "예시 사용자")
    .replace(/Wayne\s+Kim|zhangsan\d*/gi, "예시 사용자")
    .replace(/\s*\(?EEO\d{4,}\)?/g, "")
    .replace(/학원[A-Z](?![A-Za-z])\s*(?=학원용)/g, "")
    .replace(/학원[A-Z](?![A-Za-z])/g, "예시 학원")
    .replace(/[,，·]?\s*계정\s*잔액\s*\(?\s*[¥₩$]\s*-?\s*\d+(?:[.,]\d+)*\s*\)?/g, "")
    .replace(/\s*(?:\(₩\s?[\d,.]+\)|₩\s?[\d,.]+)/g, "")
    .replace(
      /[,，·]?\s*(?:스토리지|사용된\s*저장\s*용량)\s*(?:\(\s*[\d.]+\s*G\s*\/\s*[\d.]+\s*G\s*\)|[\d.]+\s*G\s*\/\s*[\d.]+\s*G)/g,
      ""
    )
    .replace(/월별\s*무료\s*수업\s*\d+\s*회\s*[,，]?\s*/g, "")
    .replace(/\s*\((?:CNY|KRW|USD)\)/g, "")
    .replace(/CS\s*주의사항/g, "주의사항")
    .replace(/\(\s*\)/g, "")
}

function scrubCsFigmaCaptureGuide(guide: CsFigmaGuide): CsFigmaGuide {
  return {
    ...guide,
    title: scrubCsFigmaCaptureText(guide.title),
    audience: scrubCsFigmaCaptureText(guide.audience),
    summary: scrubCsFigmaCaptureText(guide.summary),
    keywords: guide.keywords.map(scrubCsFigmaCaptureText),
    steps: guide.steps.map(scrubCsFigmaCaptureText),
    deepDive: guide.deepDive.map((item) => ({
      ...item,
      title: scrubCsFigmaCaptureText(item.title),
      body: scrubCsFigmaCaptureText(item.body),
      checks: item.checks.map(scrubCsFigmaCaptureText),
    })),
  }
}

export const CS_FIGMA_GUIDES = [
  ...CURATED_CS_FIGMA_GUIDES,
  ...CS_FIGMA_DIGEST_GUIDES.filter((guide) => !INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS.has(guide.docSlug)).map(
    scrubCsFigmaCaptureGuide
  ),
] satisfies CsFigmaGuide[]

function normalizeGuideText(value: string) {
  return value
    .toLowerCase()
    .replace(/설졍/g, "설정")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// 한국어 조사 제거 — "마이크가"→"마이크", "옵션을"→"옵션"처럼 토큰이 haystack과 매칭되도록 한다.
const JOSA_SUFFIX_PATTERN =
  /(으로서|으로써|에서는|에게서|으로|에서|에게|한테|까지|부터|이나|라도|마저|조차|이라|에는|에도|보다|처럼|만큼|을|를|이|가|은|는|와|과|의|도|만|로|나|랑|에|께)$/
function stripJosa(token: string) {
  const stripped = token.replace(JOSA_SUFFIX_PATTERN, "")
  return stripped.length >= 2 ? stripped : token
}

function normalizeGuideTitleAliases(title: string) {
  const normalizedTitle = normalizeGuideText(title)
  const titleWithoutLeadingNumber = normalizedTitle.replace(/^\d+\s+/, "")
  return [...new Set([normalizedTitle, titleWithoutLeadingNumber])].filter(Boolean)
}

const CURATED_CS_FIGMA_GUIDE_SLUGS = new Set(CURATED_CS_FIGMA_GUIDES.map((guide) => guide.slug))

const CS_FIGMA_GUIDE_INDEX = CS_FIGMA_GUIDES.map((guide) => {
  const aliasKeywords = CS_FIGMA_GUIDE_ALIASES[guide.slug] ?? []
  const allKeywords = aliasKeywords.length > 0 ? [...guide.keywords, ...aliasKeywords] : guide.keywords
  return {
    guide,
    haystack: normalizeGuideText(
      [guide.title, guide.summary, allKeywords.join(" "), guide.steps.join(" ")].join(" ")
    ),
    isCurated: CURATED_CS_FIGMA_GUIDE_SLUGS.has(guide.slug),
    normalizedKeywords: allKeywords.map(normalizeGuideText).filter(Boolean),
    normalizedTitle: normalizeGuideText(guide.title),
    normalizedTitleAliases: normalizeGuideTitleAliases(guide.title),
  }
})

const PROCEDURE_INTENT_PATTERN =
  /어떻게|방법|순서|가이드|하는 법|어디|어느|위치|설정|업로드|다운로드|제출|삭제|업데이트|클릭|누르|선택|켜|끄|만들|생성|추가|확인|비활성화|활성화|첨부|바꾸|변경|등록|스캔|초대|가입/

const TROUBLE_SYMPTOM_PATTERN =
  /안\s*돼|안됨|끊|나가|튕|오류|문제\s*(있|발생|생기)|불가|실패|느려|꺼짐|안\s*켜|켜지지|안\s*나|안\s*들|안\s*보|안\s*떠|안\s*뜬|못\s*보|못\s*봐/

const BILLING_OR_PURCHASE_PATTERN =
  /요금|가격|비용|견적|결제|정기|단가|유료|무료|환불|계약|플랜|과금|수납|구매처|구매/

const HARDWARE_PRODUCT_INFO_PATTERN =
  /전자칠판|클래스인\s*보드|classin\s*board|\bboard\b|사이즈|크기|인치|모델|라인업|스펙|사양|무게|소비\s*전력|해상도|밝기|터치|ops|스탠드|벽걸이/

const KNOWLEDGE_DOC_QUERY_PATTERN =
  /도입|온보딩|전환|90일|22\s*가지|확인해야\s*할|확인\s*질문|얼마나\s*걸|기간|뭐부터|사례|후기|기능\s*전체|흔한\s*고민/

const POLICY_BOUNDARY_PATTERN =
  /권한|누가|정책|스토리지|용량|소유권|개인정보|서버|약관|저장\s*관리|관리할|관리\s*가능/

const POLICY_OR_CAPABILITY_QUESTION_PATTERN =
  /정책|가능(?:한가|해|한지|여부)?|되나|되나요|될까요|지원(?:하|되|여부)|누가|관리할|관리\s*가능|소유권|개인정보|서버|약관|용량|요금제|플랜|시청\s*제한|시청\s*횟수|플레이바|api|sdk|연동|crm|lms|라이브\s*&\s*플레이백|라이브\s*플레이백/

const RAW_CAPTURE_QUERY_PATTERN = /ai\s*board|new\s*course|빈\s*이미지/

const WEAK_GUIDE_KEYWORDS = new Set([
  "pc",
  "word",
  "excel",
  "학생",
  "모바일",
  "게시",
  "오류",
  "라이브",
  "플레이어",
  "업데이트",
])

const TOKEN_STOPWORDS = new Set([
  "수업",
  "학생",
  "교사",
  "강사",
  "관리자",
  "코스",
  "화면",
  "방법",
  "순서",
  "안내",
  "설정",
  "확인",
  "앱",
  "pc",
])

function isStrongGuideKeyword(normalizedKeyword: string) {
  if (!normalizedKeyword || WEAK_GUIDE_KEYWORDS.has(normalizedKeyword)) return false
  return normalizedKeyword.includes(" ") || normalizedKeyword.length >= 4
}

function hasQrInviteActivationIntent(normalizedQuestion: string) {
  const asksAboutInvite = /초대|링크|link|qr/.test(normalizedQuestion)
  const asksToEnable = /켜|활성화|허용|어디|설정|가능/.test(normalizedQuestion)
  return asksAboutInvite && asksToEnable
}

function isQrInviteActivationGuide(haystack: string) {
  return haystack.includes("코스 가입 허용") || haystack.includes("초대 활성화") || haystack.includes("초대 링크")
}

function isStudentQrScanGuide(haystack: string) {
  return haystack.includes("qr 코드 스캔") || haystack.includes("스캔으로 코스 가입")
}

function isGeneratedGuide(guide: CsFigmaGuide) {
  return guide.slug.startsWith("cs-figma-digest-")
}

function isDirectAnswerEligibleGuide(indexedGuide: (typeof CS_FIGMA_GUIDE_INDEX)[number]) {
  const { guide, haystack, normalizedTitle } = indexedGuide
  if (!isGeneratedGuide(guide)) return true
  if (normalizedTitle === "ai board" || normalizedTitle === "new course") return false
  if (normalizedTitle.includes("빈 이미지")) return false
  if (/^(frame|group|image)\s+\d+$/.test(normalizedTitle)) return false
  return !(
    haystack.includes("순수 ui 스크린샷") ||
    haystack.includes("별도의 안내 문구") ||
    haystack.includes("별도의 안내 설명") ||
    haystack.includes("단계별 설명 텍스트") ||
    haystack.includes("원본 화면을 확인합니다")
  )
}

function hasRecordingDownloadIntent(normalizedQuestion: string) {
  return /녹화|녹화본/.test(normalizedQuestion) && /다운로드|받|공유|링크/.test(normalizedQuestion)
}

function hasAppDownloadIntent(normalizedQuestion: string) {
  const asksDownload = /다운로드|설치|내려받/.test(normalizedQuestion)
  const asksApp = /클래스인|classin|앱|pc|windows|윈도우/.test(normalizedQuestion)
  const asksRecording = /녹화|녹화본|수업자료|pdf|리소스/.test(normalizedQuestion)
  return asksDownload && asksApp && !asksRecording
}

function hasAccountSignupProcedureIntent(normalizedQuestion: string) {
  const asksAboutSignup = /회원\s*가입|계정\s*만들|신규\s*가입/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|진행|완료|인증|가입/.test(normalizedQuestion)
  const asksRequiredPersonalInfo = /필요|개인정보|전화번호나|이메일만/.test(normalizedQuestion)
  return asksAboutSignup && asksProcedure && !asksRequiredPersonalInfo
}

function hasAccountDeletionProcedureIntent(normalizedQuestion: string) {
  const asksAboutAccount = /계정|회원/.test(normalizedQuestion)
  const asksAboutDeletion = /삭제|탈퇴|지우/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|진행|삭제|탈퇴/.test(normalizedQuestion)
  return asksAboutAccount && asksAboutDeletion && asksProcedure
}

function hasTransferStudentRegistrationIntent(normalizedQuestion: string) {
  const asksAboutTransferStudent = /편입생|참관생/.test(normalizedQuestion)
  const asksProcedure = /등록|추가|방법|순서|어디|선택/.test(normalizedQuestion)
  return asksAboutTransferStudent && asksProcedure
}

function hasCourseMemberManagementIntent(normalizedQuestion: string) {
  const asksAboutCourseMember = /코스\s*(구성원|멤버)|구성원\s*(추가|삭제)|멤버\s*(추가|삭제)/.test(
    normalizedQuestion
  )
  const asksProcedure = /추가|삭제|초대|방법|순서|어디|관리/.test(normalizedQuestion)
  return asksAboutCourseMember && asksProcedure
}

function hasCourseWideChatControlIntent(normalizedQuestion: string) {
  const asksAboutCourseChat = /코스.*채팅|전체\s*학생\s*채팅|학생\s*채팅/.test(normalizedQuestion)
  const asksAboutControl = /활성|비활성|금지|제한|허용|켜|끄|설정|방법|어디/.test(normalizedQuestion)
  return asksAboutCourseChat && asksAboutControl
}

function hasCourseCreateOrCloseIntent(normalizedQuestion: string) {
  const asksAboutCourse = /코스/.test(normalizedQuestion)
  const asksAboutLifecycle = /생성|만들|종료|삭제/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|생성|만들|종료|삭제/.test(normalizedQuestion)
  return asksAboutCourse && asksAboutLifecycle && asksProcedure
}

function hasLessonDeletionProcedureIntent(normalizedQuestion: string) {
  if (/수업\s*교사|담임\s*교사|교사\s*설정/.test(normalizedQuestion)) return false
  const asksAboutLessonDeletion =
    /수업\s*(일괄\s*)?삭제|삭제할\s*수업|수업\s*리소스.*삭제|수업\s*데이터.*삭제/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|리소스|데이터|삭제/.test(normalizedQuestion)
  return asksAboutLessonDeletion && asksProcedure
}

function hasDashboardWebLiveCreateProcedureIntent(normalizedQuestion: string) {
  const asksAboutWebLive = /웹\s*라이브|웹\s*생방송|생방송/.test(normalizedQuestion)
  const asksAboutDashboard = /대시보드|dashboard/.test(normalizedQuestion)
  const asksProcedure = /생성|만들|설정|방법|순서|게시|녹화/.test(normalizedQuestion)
  return asksAboutWebLive && asksAboutDashboard && asksProcedure
}

function hasElectronicBoardLocalRecordingProcedureIntent(normalizedQuestion: string) {
  const asksAboutElectronicBoard = /전자칠판|ifp|classin\s*board|클래스인\s*보드/.test(normalizedQuestion)
  const asksAboutLocalRecording = /로컬\s*녹화|현장\s*녹화/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|시작|종료|사용|녹화|안내/.test(normalizedQuestion)
  return asksAboutElectronicBoard && asksAboutLocalRecording && asksProcedure
}

function hasReplayValidityProcedureIntent(normalizedQuestion: string) {
  const asksAboutReplay = /다시보기|다시\s*보기|리플레이|플레이백/.test(normalizedQuestion)
  const asksAboutValidity = /유효|기간/.test(normalizedQuestion)
  const asksProcedure = /설정|방법|어디|변경|바꾸|선택/.test(normalizedQuestion)
  return asksAboutReplay && asksAboutValidity && asksProcedure
}

function hasReplayAnalyticsProcedureIntent(normalizedQuestion: string) {
  const asksAboutReplay = /다시보기|다시\s*보기|리플레이|플레이백/.test(normalizedQuestion)
  const asksAboutAnalytics =
    /시청\s*기록|시청\s*시간|시청\s*횟수|진도|학습\s*데이터|학습\s*분석|수업\s*데이터|표\s*사용자\s*정의\s*지표|대시보드/.test(normalizedQuestion)
  const asksProcedure = /확인|방법|어디|선택|지표|횟수|시간/.test(normalizedQuestion)
  return asksAboutReplay && asksAboutAnalytics && asksProcedure
}

function hasSharedDrivePermissionProcedureIntent(normalizedQuestion: string) {
  const asksAboutSharedDrive = /공유\s*드라이브/.test(normalizedQuestion)
  const asksAboutPermission = /권한|접근|구성원|초대|읽기\s*전용|부여/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|설정|부여|추가|초대|선택|활성화|허용/.test(normalizedQuestion)
  return asksAboutSharedDrive && asksAboutPermission && asksProcedure
}

function hasSubAccountSettingsProcedureIntent(normalizedQuestion: string) {
  const asksAboutSubAccount = /하위\s*계정|권한\s*관리/.test(normalizedQuestion)
  const asksProcedure = /설정|추가|권한|방법|등록|생성|편집|삭제/.test(normalizedQuestion)
  return asksAboutSubAccount && asksProcedure
}

function hasStorageDeletionProcedureIntent(normalizedQuestion: string) {
  const asksAboutStorage = /스토리지|저장\s*공간|리소스/.test(normalizedQuestion)
  const asksAboutDeletion = /삭제|자동\s*삭제|정리/.test(normalizedQuestion)
  const asksProcedure = /방법|안내|설정|활성화|삭제|어디|순서/.test(normalizedQuestion)
  return asksAboutStorage && asksAboutDeletion && asksProcedure
}

function hasAccountUsageDetailProcedureIntent(normalizedQuestion: string) {
  const asksAboutAccount = /계정/.test(normalizedQuestion)
  const asksAboutUsageDetail = /세부\s*사용\s*내역|사용\s*내역|상세\s*내역/.test(normalizedQuestion)
  const asksProcedure = /확인|방법|어디|조회|보기/.test(normalizedQuestion)
  return asksAboutAccount && asksAboutUsageDetail && asksProcedure
}

function hasLessonTeacherSettingsProcedureIntent(normalizedQuestion: string) {
  const asksAboutLessonTeacher = /수업\s*교사|교사\s*설정|교사로\s*설정/.test(normalizedQuestion)
  const asksProcedure = /설정|삭제|변경|방법|순서|대량\s*작업/.test(normalizedQuestion)
  return asksAboutLessonTeacher && asksProcedure
}

function hasCourseTeacherChangeProcedureIntent(normalizedQuestion: string) {
  if (/수업\s*교사/.test(normalizedQuestion)) return false
  const asksAboutCourse = /코스|담임\s*교사|교사로\s*설정/.test(normalizedQuestion)
  const asksAboutTeacherChange = /교사.*변경|변경.*교사|담임\s*교사|교사로\s*설정/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|변경|설정|추가|선택/.test(normalizedQuestion)
  return asksAboutCourse && asksAboutTeacherChange && asksProcedure
}

function hasStudentNicknameSyncProcedureIntent(normalizedQuestion: string) {
  const asksAboutStudent = /학생|사용자/.test(normalizedQuestion)
  const asksAboutNickname = /닉네임|실명|본명/.test(normalizedQuestion)
  const asksAboutSync = /동기화|동일|맞추|추가|활성화|설정/.test(normalizedQuestion)
  return asksAboutStudent && asksAboutNickname && asksAboutSync
}

function hasCourseNicknameOptionIntent(normalizedQuestion: string) {
  const asksAboutCourse = /코스|수업|클래스/.test(normalizedQuestion)
  const asksAboutNickname = /닉네임/.test(normalizedQuestion)
  const asksAboutOption = /옵션|허용|활성|비활성|켜|끄|수정|변경/.test(normalizedQuestion)
  return asksAboutCourse && asksAboutNickname && asksAboutOption
}

function hasElectronicBoardLogReportProcedureIntent(normalizedQuestion: string) {
  const asksAboutElectronicBoard = /전자칠판|ifp|classin\s*board/.test(normalizedQuestion)
  const asksAboutLogReport = /데이터\s*로그|로그\s*보고|소프트웨어\s*로그|보고/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|보고|제출|전송|첨부/.test(normalizedQuestion)
  return asksAboutElectronicBoard && asksAboutLogReport && asksProcedure
}

function hasClassinXReinstallProcedureIntent(normalizedQuestion: string) {
  const asksAboutClassinX = /classinx|클래스인x|강의실용/.test(normalizedQuestion)
  const asksAboutReinstall = /삭제|재설치|제거|설치/.test(normalizedQuestion)
  return asksAboutClassinX && asksAboutReinstall
}

function hasKnownWebLiveChatVisibilityIntent(normalizedQuestion: string) {
  const asksAboutWebLive = /웹\s*라이브|생방송/.test(normalizedQuestion)
  const asksAboutChat = /채팅|메시지|메세지|실시간/.test(normalizedQuestion)
  const asksAboutVisibility = /안\s*보|보이|보여|노출|표시|학생/.test(normalizedQuestion)
  return asksAboutWebLive && asksAboutChat && asksAboutVisibility
}

function hasLateJoinedStudentReplayIntent(normalizedQuestion: string) {
  const asksAboutReplay = /다시보기|녹화본|리플레이/.test(normalizedQuestion)
  const mentionsSpecificPreviousLesson =
    /이전\s*수업|과거\s*수업|지난\s*수업|지난\s*강의|1강|첫\s*수업/.test(normalizedQuestion)
  const mentionsAffectedStudent = /학생|수강생|편입생|참관생/.test(normalizedQuestion)
  const mentionsLateJoin =
    /수업\s*(?:후|끝나고|종료.*후).*가입|나중에\s*(?:가입|들어)|뒤늦게\s*(?:가입|등록|합류)|새로\s*(?:가입|참여|들어)|중간\s*(?:합류|등록)|가입.*(?:후|뒤).*이전|편입.*이전/.test(
      normalizedQuestion
    )
  const asksAboutAccess = /안\s*(?:떠|뜬|보|나)|못\s*(?:보|봐)|시청|권한|허용|설정|보이|볼\s*수/.test(
    normalizedQuestion
  )
  const explicitLateJoinAccess = mentionsLateJoin && asksAboutAccess
  const specificReplaySymptom =
    mentionsAffectedStudent && mentionsSpecificPreviousLesson && (asksAboutReplay || asksAboutAccess)
  return explicitLateJoinAccess || specificReplaySymptom
}

function findKnownCsFigmaIntentSlug(normalizedQuestion: string) {
  if (hasAccountSignupProcedureIntent(normalizedQuestion)) return "classin-account-signup"
  if (hasAccountDeletionProcedureIntent(normalizedQuestion)) return "classin-account-delete"
  if (hasTransferStudentRegistrationIntent(normalizedQuestion)) return "transfer-student-registration"
  if (hasCourseMemberManagementIntent(normalizedQuestion)) return "course-member-management"
  if (hasCourseWideChatControlIntent(normalizedQuestion)) return "course-wide-chat-control"
  if (hasCourseCreateOrCloseIntent(normalizedQuestion)) return "course-create-and-close"
  if (hasLateJoinedStudentReplayIntent(normalizedQuestion)) return "cs-figma-digest-1054"
  if (hasKnownWebLiveChatVisibilityIntent(normalizedQuestion)) return "web-live-create"
  if (hasDashboardWebLiveCreateProcedureIntent(normalizedQuestion)) return "cs-figma-digest-350"
  if (hasElectronicBoardLocalRecordingProcedureIntent(normalizedQuestion)) return "cs-figma-digest-449"
  if (hasReplayValidityProcedureIntent(normalizedQuestion)) return "cs-figma-digest-982"
  if (hasReplayAnalyticsProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1558"
  if (hasSharedDrivePermissionProcedureIntent(normalizedQuestion)) return "cs-figma-digest-940"
  if (hasSubAccountSettingsProcedureIntent(normalizedQuestion)) return "cs-figma-digest-919"
  if (hasStorageDeletionProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1294"
  if (hasAccountUsageDetailProcedureIntent(normalizedQuestion)) return "cs-figma-digest-633"
  if (hasLessonTeacherSettingsProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1004"
  if (hasCourseTeacherChangeProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1035"
  if (hasStudentNicknameSyncProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1102"
  if (hasCourseNicknameOptionIntent(normalizedQuestion)) return "cs-figma-digest-1131"
  if (hasLessonDeletionProcedureIntent(normalizedQuestion)) return "cs-figma-digest-655"
  if (hasElectronicBoardLogReportProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1516"
  if (hasClassinXReinstallProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1863"
  return null
}

const POLICY_BOUNDARY_ALLOWED_KNOWN_INTENT_SLUGS = new Set([
  "cs-figma-digest-919",
  "cs-figma-digest-940",
  "cs-figma-digest-1294",
])

export function findCsFigmaGuideForQuestion(question: string): CsFigmaGuide | null {
  const normalized = normalizeGuideText(question)
  if (!normalized) return null

  const hasProcedureIntent = PROCEDURE_INTENT_PATTERN.test(normalized)
  const hasInviteActivationIntent = hasQrInviteActivationIntent(normalized)
  const hasRecordingDownload = hasRecordingDownloadIntent(normalized)
  const hasAppDownload = hasAppDownloadIntent(normalized)
  const knownIntentSlug = findKnownCsFigmaIntentSlug(normalized)
  if (RAW_CAPTURE_QUERY_PATTERN.test(normalized)) return null
  if (BILLING_OR_PURCHASE_PATTERN.test(normalized)) return null
  if (POLICY_OR_CAPABILITY_QUESTION_PATTERN.test(normalized)) return null
  if (HARDWARE_PRODUCT_INFO_PATTERN.test(normalized) && !knownIntentSlug) return null
  if (KNOWLEDGE_DOC_QUERY_PATTERN.test(normalized) && !knownIntentSlug) return null
  if (
    POLICY_BOUNDARY_PATTERN.test(normalized) &&
    !POLICY_BOUNDARY_ALLOWED_KNOWN_INTENT_SLUGS.has(knownIntentSlug ?? "")
  ) {
    return null
  }
  // 증상형 질문("안 돼요/안 켜져요/오류")도 관련 how-to 가이드로 매칭하되, 답변에서 상담 연결을 함께 제안한다.
  const hasSymptomIntent = TROUBLE_SYMPTOM_PATTERN.test(normalized)

  const tokens = [...new Set(
    normalized
      .split(" ")
      .filter((token) => token.length >= 2 && !TOKEN_STOPWORDS.has(token))
      .flatMap((token) => {
        const stripped = stripJosa(token)
        return stripped !== token && !TOKEN_STOPWORDS.has(stripped) ? [token, stripped] : [token]
      })
  )]
  const scored = CS_FIGMA_GUIDE_INDEX.filter(isDirectAnswerEligibleGuide).map(({ guide, haystack, isCurated, normalizedKeywords, normalizedTitleAliases }) => {
    let score = 0
    let strongKeywordHits = 0
    let weakKeywordHits = 0
    let tokenHits = 0
    const matchedKeywords = new Set<string>()

    for (const normalizedKeyword of normalizedKeywords) {
      if (!normalized.includes(normalizedKeyword)) continue
      if (matchedKeywords.has(normalizedKeyword)) continue
      matchedKeywords.add(normalizedKeyword)

      if (isStrongGuideKeyword(normalizedKeyword)) {
        score += 12
        strongKeywordHits += 1
      } else if (hasProcedureIntent || hasSymptomIntent) {
        score += 4
        weakKeywordHits += 1
      }
    }

    const titleMatched = normalizedTitleAliases.some((titleAlias) => normalized.includes(titleAlias))
    if (titleMatched) score += 24

    for (const token of tokens) {
      if (haystack.includes(token)) tokenHits += 1
    }
    score += Math.min(tokenHits, 6)

    if (hasProcedureIntent || hasSymptomIntent) score += 4
    if (isCurated && (titleMatched || strongKeywordHits > 0 || tokenHits >= 1)) score += 8
    const inviteActivationMatched =
      hasInviteActivationIntent &&
      guide.slug !== "course-member-management" &&
      isQrInviteActivationGuide(haystack)
    if (hasInviteActivationIntent) {
      if (inviteActivationMatched) score += 16
      if (guide.slug === "course-member-management") score -= 16
      if (!normalized.includes("스캔") && isStudentQrScanGuide(haystack)) score -= 12
    }
    if (hasRecordingDownload && guide.slug === "recording-download-share") score += 24
    if (hasAppDownload) {
      if (guide.slug === "classin-app-download") score += 36
      if (guide.slug === "cs-figma-digest-1602") score += 12
      if (haystack.includes("수업 녹화 데이터") || haystack.includes("녹화본 다운로드")) score -= 16
    }
    const knownIntentMatched = knownIntentSlug === guide.slug
    if (knownIntentMatched) score += 36

    return {
      guide,
      score,
      strongKeywordHits,
      weakKeywordHits,
      titleMatched,
      tokenHits,
      inviteActivationMatched,
      knownIntentMatched,
    }
  }).sort((left, right) => right.score - left.score)

  const top = scored[0]
  if (!top || top.score < 16) return null
  if (!hasProcedureIntent && !hasSymptomIntent && !knownIntentSlug) return null
  if (
    !top.titleMatched &&
    top.strongKeywordHits === 0 &&
    top.weakKeywordHits < 2 &&
    !top.inviteActivationMatched &&
    !top.knownIntentMatched &&
    top.tokenHits < 3
  ) {
    return null
  }
  return top.guide
}

// 증상형 질문 여부 — service에서 fast-path 답변에 상담 연결 제안을 붙일지 판단할 때 사용한다.
export function isCsFigmaSymptomQuestion(question: string) {
  const normalized = normalizeGuideText(question)
  if (!normalized) return false
  return TROUBLE_SYMPTOM_PATTERN.test(normalized)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function sanitizeGuideAnswerText(value: string, hiddenTerms: string[] = []) {
  let sanitized = value
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/https?:\/\/\S+/gi, "링크")
    .replace(/\s+/g, " ")
    .trim()

  for (const term of hiddenTerms) {
    const normalizedTerm = term.replace(/\s+/g, " ").trim()
    if (!normalizedTerm) continue
    sanitized = sanitized.replace(new RegExp(escapeRegExp(normalizedTerm), "g"), "").trim()
  }

  return sanitized.replace(/\s+/g, " ").trim()
}

function compactGuideAnswerText(value: string, hiddenTerms: string[], maxLength = 120) {
  const sanitized = sanitizeGuideAnswerText(value, hiddenTerms)
  if (sanitized.length <= maxLength) return sanitized
  return `${sanitized.slice(0, maxLength - 3).trim()}...`
}

// 캡처 제작·검수 과정에서만 의미가 있는 메타데이터. 생성형 가이드의 deepDive에
// 이런 메모가 섞여 있어도 공개 CS 답변에는 절대 노출하지 않는다.
export const INTERNAL_GUIDE_PRODUCTION_NOTE_RE =
  /원본\s*(?:이미지|캡처|화면|파일)|회색\s*(?:빈\s*)?(?:플레이스홀더|박스|영역)|플레이스홀더|export(?:되지|되지\s*않|에서|\s*상태)|스크린샷\s*(?:자리|영역|상태)|스텝\s*\d+\s*스크린샷|\d+\s*단계\s*스크린샷|프로필\s*\(\s*블러|실제\s*화면\s*캡처|캡션만|이미지\s*(?:없음|누락)|source\s*digest|cs\s*주의사항/i

function isPublicGuideText(value: string) {
  return Boolean(value.trim()) && !INTERNAL_GUIDE_PRODUCTION_NOTE_RE.test(value)
}

// 단계/팁 텍스트에서 화면 주석("(…빨간 박스/화살표/표시…)"), 예시 식별자("예: 1026165787"),
// 전화/계정 숫자, 피그마/캡처 표현을 제거해 소비자용으로 정리한다.
export function sanitizeGuideStep(value: string, hiddenTerms: string[] = []) {
  const sanitized = sanitizeGuideAnswerText(value, hiddenTerms)
    .replace(/\([^)]*(?:빨간|박스|화살표|주석|강조)[^)]*표시[^)]*\)/g, "")
    .replace(/\([^)]*(?:빨간\s*박스|화살표|주석|강조|표시)[^)]*\)/g, "")
    .replace(/[,，]?\s*예\s*[:：]\s*[\d\s-]{3,}/g, "")
    .replace(/\d{7,}/g, "")
    .replace(/Figma\s*CS\s*캡처\s*보드/gi, "안내 화면")
    .replace(/Figma\s*CS\s*캡처/gi, "안내 화면")
    .replace(/CS\s*캡처/gi, "안내 화면")
    .replace(/Figma\s*(?:보드|캡처|캡쳐)/gi, "안내 화면")
    .replace(/원본\s*캡처/gi, "안내 화면")
    .replace(/\bFigma\b/gi, "안내 화면")
    .replace(/\(\s*[,，]?\s*\)/g, "")
    .replace(/\s+([.,)])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
  return sanitized
}

// enrichment 단계 본문(마크다운)을 챗봇 한 줄용 평문으로 평탄화한다.
function flattenEnrichmentBody(body: string, hiddenTerms: string[] = []) {
  const plain = body
    .replace(/\*\*/g, "")
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
  return sanitizeGuideStep(plain, hiddenTerms)
}

export function formatCsFigmaGuideAnswer(guide: CsFigmaGuide) {
  const hiddenTerms = guide.sourceImageFiles
  const enrichment = getCsFigmaEnrichment(guide.docSlug)

  // 소비자용 보강이 있으면 문서 페이지와 동일한 정리된 단계/톤을 그대로 쓴다.
  if (enrichment) {
    const stepLines = enrichment.stages.map((stage, index) => {
      const title = stage.title.replace(/^\d+\.\s*/, "").trim()
      const body = flattenEnrichmentBody(stage.body, hiddenTerms)
      return body ? `${index + 1}. ${title} — ${body}` : `${index + 1}. ${title}`
    })
    const blocks = [enrichment.intro, stepLines.join("\n")]
    if (enrichment.tips && enrichment.tips.length > 0) {
      const tipLines = enrichment.tips.map((tip) => `- ${flattenEnrichmentBody(tip, hiddenTerms)}`)
      blocks.push(`알아두면 좋은 점\n${tipLines.join("\n")}`)
    }
    return blocks.join("\n\n")
  }

  const publicSteps = guide.steps
    .map((step) => sanitizeGuideStep(step, hiddenTerms))
    .filter(isPublicGuideText)
  const stepLines = publicSteps.map((step, index) => `${index + 1}. ${step}`)
  const deepDiveLines = guide.deepDive
    .filter((item) => !/순서\s*그대로\s*안내/.test(item.title))
    .flatMap((item) => {
      const title = sanitizeGuideStep(item.title, hiddenTerms)
      if (!isPublicGuideText(title)) return []
      const checks = item.checks
        .slice(0, 2)
        .map((check) => compactGuideAnswerText(sanitizeGuideStep(check, hiddenTerms), hiddenTerms, 88))
        .filter(isPublicGuideText)
        .join(" / ")
      if (!checks) return []
      return [`- ${item.level} ${title}: ${checks}`]
    })

  return [
    "아래 순서대로 따라 하시면 됩니다.",
    stepLines.join("\n"),
    deepDiveLines.length > 0 ? `함께 확인할 것\n${deepDiveLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

const SUGGESTION_KEYWORD_BLOCKLIST = new Set([
  "pc",
  "word",
  "excel",
  "qr",
  "설정 옵션",
  "link 등",
])

function isUsefulSuggestionKeyword(keyword: string, guide: CsFigmaGuide) {
  const normalizedKeyword = normalizeGuideText(keyword)
  if (!normalizedKeyword) return false
  if (normalizeGuideText(guide.title) === normalizedKeyword) return false
  if (SUGGESTION_KEYWORD_BLOCKLIST.has(normalizedKeyword)) return false
  if (WEAK_GUIDE_KEYWORDS.has(normalizedKeyword)) return false
  if (!isStrongGuideKeyword(normalizedKeyword)) return false
  if (/^\d/.test(normalizedKeyword)) return false
  if (/\.(png|jpe?g|webp)$/i.test(keyword)) return false
  return true
}

export function buildCsFigmaGuideSuggestedQuestions(guide: CsFigmaGuide) {
  const candidates = [
    `${guide.title} 순서 알려줘`,
    ...guide.keywords
      .filter((keyword) => isUsefulSuggestionKeyword(keyword, guide))
      .map((keyword) => `${keyword} 방법 알려줘`),
  ]
  const seen = new Set<string>()

  return candidates
    .filter((question) => {
      const normalizedQuestion = normalizeGuideText(question)
      if (!normalizedQuestion || seen.has(normalizedQuestion)) return false
      seen.add(normalizedQuestion)
      return true
    })
    .slice(0, 3)
}

export function getCsFigmaGuideDocPath(guide: CsFigmaGuide) {
  return `/docs/${guide.docCategory}/${guide.docSlug}`
}
