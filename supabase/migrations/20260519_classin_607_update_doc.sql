-- ClassIn 6.0.7 update guide
-- Public docs article + derived chatbot chunks + admin patch-note draft.

insert into public.docs_categories (id, title, description, order_index, is_visible)
values
  ('teacher', '[교사] 사용 가이드', '수업을 진행하는 강사를 위한 클래스인 사용 가이드입니다.', 3, true)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    order_index = excluded.order_index,
    is_visible = excluded.is_visible;

do $$
declare
  v_article_id uuid;
  v_version_id uuid;
  v_section record;
  v_steps text;
  v_chunk_content text;
  v_summary text := 'ClassIn 6.0.7은 2026년 5월 18일 그레이 배포, 2026년 5월 25일 정식 배포 예정인 비강제 업데이트입니다. 확장형 판서 영역과 매직펜은 기본 활성화되며, 개인 칠판 무제한 참여와 .edb 삽입은 6.0.7 이상 업데이트 후 담당 매니저를 통한 활성화 신청이 필요합니다. 신규 사용자 온보딩과 스타터 가이드 완료 시 Plus 1개월 혜택도 제공됩니다.';
  v_content_markdown text := $md$
# ClassIn 6.0.7 업데이트 안내

확장형 판서 영역, 매직펜, 개인 칠판 개선, 신규 사용자 온보딩과 스타터 가이드까지 ClassIn 6.0.7의 주요 변경 사항을 정리했습니다.

대상: 학원 관리자, 교사, 운영팀
업데이트: 2026-05-19

## 배포 일정과 적용 범위

6.0.7은 수업 중 판서 흐름을 끊지 않도록 돕는 수업 도구 개선과, 처음 사용하는 사용자가 더 쉽게 시작하도록 돕는 온보딩 개편을 함께 담은 업데이트입니다.

- 그레이 배포일은 2026년 5월 18일입니다.
- 정식 배포일은 2026년 5월 25일 예정입니다.
- 6.0.6과 동일하게 별도 알림 없는 비강제 업데이트이며, 사용자에게 강제 업데이트 팝업이 뜨지 않습니다.
- 주요 적용 플랫폼은 Android, iOS, PC, ClassIn X입니다.
- 일부 기능은 기본 비활성화 상태이므로 사용을 원하는 고객사는 담당 매니저에게 활성화를 요청해야 합니다.

## 이번 업데이트 한눈에 보기

이번 업데이트는 수업 도구 개선 4가지와 신규 사용자 첫 경험 개편 1가지로 나뉩니다.

- 확장형 판서 영역: Android, iOS, PC, ClassIn X에서 기본 활성화됩니다.
- 매직펜: Android, iOS, PC, ClassIn X에서 기본 활성화됩니다.
- 개인 칠판 인원 제한 해제: Android, iOS, PC, ClassIn X에서 지원되며 기본 비활성화 상태입니다.
- 개인 칠판에 .edb 파일 삽입: PC와 ClassIn X에서 지원되며 기본 비활성화 상태입니다.
- 신규 사용자 가이드와 스타터 가이드: Android, iOS, PC, ClassIn X에서 기본 활성화됩니다.

## 확장형 판서 영역

판서 공간이 부족할 때 화면을 넘기기보다 현재 판서 내용을 아래로 밀어 새 공간을 만들 수 있습니다. 수업 흐름을 유지한 채 칠판을 더 넓게 쓰는 기능입니다.

- 수업 중 칠판 판서 영역이 가득 차면 마우스 우클릭으로 가로선을 표시합니다.
- 선을 아래로 드래그하면 새 판서 영역이 추가됩니다.
- 선을 위로 드래그하면 이미 판서한 내용을 위로 끌어올릴 수 있습니다.
- 최대 50페이지 판서 제한은 그대로 적용됩니다.
- 별도 신청 없이 기본 활성화됩니다.

![확장형 판서 영역 예시 화면](/docs/files/classin-607-update/expandable-writing-space.png)
[확장형 판서 영역 시연 영상](/docs/files/classin-607-update/expandable-writing-space-demo.mp4)

## 매직펜

매직펜은 학생의 시선을 잠깐 유도할 때 쓰는 신규 펜 도구입니다. 작성한 획이 1초 후 자동으로 사라지므로 기존 칠판 내용을 지우거나 가리지 않고 핵심을 짚을 수 있습니다.

- 도구 모음에서 매직펜을 선택합니다.
- 강조하고 싶은 위치나 풀이 흐름을 짧게 표시합니다.
- 필기를 멈추면 1초 후 획이 자동으로 사라집니다.
- 기존 칠판 내용에는 영향을 주지 않습니다.
- 정답을 미리 노출하지 않고 특정 위치만 안내할 때 유용합니다.

![매직펜 도구 예시 화면](/docs/files/classin-607-update/magic-pen.png)
[매직펜 시연 영상](/docs/files/classin-607-update/magic-pen-demo.mp4)

## 개인 칠판 인원 제한 해제

기존에는 개인 칠판에 최대 75명까지 동시 참여할 수 있었지만, 6.0.7에서는 제한을 제거해 교실 내 모든 인원이 함께 협업할 수 있습니다.

- 교사와 학생 모두 6.0.7 이상으로 업데이트되어 있어야 합니다.
- Android, iOS, PC, ClassIn X에서 지원됩니다.
- 이 기능은 기본 비활성화 상태입니다.
- 사용을 원하는 고객사는 클래스인 코리아 담당 매니저에게 활성화 신청을 요청해야 합니다.

## 개인 칠판에 .edb 파일 삽입

교사가 로컬 칠판이나 수업 준비실에서 만든 개인 칠판 내용을 .edb 파일로 저장한 뒤, 온라인 수업 중 개인 칠판에 바로 삽입할 수 있습니다.

- 교사와 학생 모두 6.0.7 이상으로 업데이트되어 있어야 합니다.
- PC와 ClassIn X에서 지원되며 모바일에서는 지원되지 않습니다.
- 이 기능은 기본 비활성화 상태입니다.
- 사용을 원하는 고객사는 클래스인 코리아 담당 매니저에게 활성화 신청을 요청해야 합니다.

![개인 칠판에 edb 파일을 삽입하는 예시 화면](/docs/files/classin-607-update/edb-personal-whiteboard.png)

## 신규 사용자 가이드와 스타터 가이드

처음 클래스인을 켜는 사용자는 역할에 맞는 단계별 온보딩 안내와 핵심 기능을 빠르게 익히는 스타터 가이드를 보게 됩니다. 스타터 가이드를 완료하면 개인 Plus 요금제 1개월 혜택이 제공되며, 한국 고객사에도 적용됩니다.

- 신규 사용자는 첫 로그인 시 역할에 맞는 안내를 받습니다.
- 관리자는 기관 운영에 필요한 초기 설정과 할 일 영역을 확인합니다.
- 교사는 가상 학생이 있는 체험 교실에서 수업 도구를 연습합니다.
- 학생은 코스 확인, 수업 입장, 과제 제출, 공지 확인 흐름을 안내받습니다.
- 스타터 가이드 완료 시 개인 Plus 요금제 1개월 혜택이 지급됩니다.

## 관리자 온보딩 변화

관리자는 첫 로그인 시 기관 역할을 선택한 뒤 환영 배너와 핵심 기능 가이드를 거쳐 메인 홈으로 이동합니다. 할 일 영역에서 스타터 가이드 진행 상황을 확인하고, 코스 생성과 자료·권한 관리 등 기관 운영 항목을 차례로 점검할 수 있습니다.

![관리자 온보딩 첫 화면 예시](/docs/files/classin-607-update/onboarding-admin-1.png)
![관리자 스타터 가이드 진행 화면 예시](/docs/files/classin-607-update/onboarding-admin-2.png)

## 교사 온보딩 변화

교사는 첫 로그인 시 교사 역할을 선택하면 실제 수업 환경을 미리 체험하는 가이드로 안내됩니다. 데모 학생 3명이 미리 입장한 체험 교실에서 전자칠판 판서, 인터랙티브 교구, 수업 자료 불러오기를 연습할 수 있습니다.

- 데모 교실 체험, 코스 생성, 수업 생성, 학생 초대, 수업 1회 진행 흐름을 따라갑니다.
- 혼자서는 확인하기 어려운 발언 요청과 상호작용 기능을 데모 학생으로 연습할 수 있습니다.
- 스타터 가이드 완료 시 개인 Plus 요금제 1개월 혜택이 지급됩니다.

![교사 온보딩 체험 교실 예시](/docs/files/classin-607-update/onboarding-teacher-1.png)
![교사 스타터 가이드 예시](/docs/files/classin-607-update/onboarding-teacher-2.png)

## 학생 온보딩 변화

학생은 첫 로그인 시 학생 역할을 선택하면 학습에 필요한 기본 화면을 안내받습니다. 가입한 코스 확인, 수업 입장, 과제 제출, 교사 공지 확인 방법을 중심으로 첫 사용 흐름이 정리됩니다.

- 역할 선택 후 환영 배너를 거쳐 메인 홈으로 이동합니다.
- 가입한 코스가 있다면 수업 입장과 학습 활동 흐름을 안내받습니다.
- 가입한 코스가 없으면 홈에서 코스 생성 또는 참여 경로를 확인합니다.

![학생 온보딩 홈 화면 예시](/docs/files/classin-607-update/onboarding-student-1.png)
![학생 스타터 가이드 예시](/docs/files/classin-607-update/onboarding-student-2.png)
$md$;
  v_content_json jsonb := $json$
{
  "source": "6.07 update export",
  "readMinutes": 7,
  "updatedAt": "2026-05-19",
  "relatedSlugs": ["classroom-basic-setup", "course-units", "teacher-onboarding", "student-onboarding"],
  "resources": [],
  "sections": [
    {
      "heading": "배포 일정과 적용 범위",
      "body": "6.0.7은 수업 중 판서 흐름을 끊지 않도록 돕는 수업 도구 개선과, 처음 사용하는 사용자가 더 쉽게 시작하도록 돕는 온보딩 개편을 함께 담은 업데이트입니다.",
      "steps": [
        "그레이 배포일은 2026년 5월 18일입니다.",
        "정식 배포일은 2026년 5월 25일 예정입니다.",
        "6.0.6과 동일하게 별도 알림 없는 비강제 업데이트이며, 사용자에게 강제 업데이트 팝업이 뜨지 않습니다.",
        "주요 적용 플랫폼은 Android, iOS, PC, ClassIn X입니다.",
        "일부 기능은 기본 비활성화 상태이므로 사용을 원하는 고객사는 담당 매니저에게 활성화를 요청해야 합니다."
      ]
    },
    {
      "heading": "이번 업데이트 한눈에 보기",
      "body": "이번 업데이트는 수업 도구 개선 4가지와 신규 사용자 첫 경험 개편 1가지로 나뉩니다.",
      "steps": [
        "확장형 판서 영역: Android, iOS, PC, ClassIn X에서 기본 활성화됩니다.",
        "매직펜: Android, iOS, PC, ClassIn X에서 기본 활성화됩니다.",
        "개인 칠판 인원 제한 해제: Android, iOS, PC, ClassIn X에서 지원되며 기본 비활성화 상태입니다.",
        "개인 칠판에 .edb 파일 삽입: PC와 ClassIn X에서 지원되며 기본 비활성화 상태입니다.",
        "신규 사용자 가이드와 스타터 가이드: Android, iOS, PC, ClassIn X에서 기본 활성화됩니다."
      ]
    },
    {
      "heading": "확장형 판서 영역",
      "body": "판서 공간이 부족할 때 화면을 넘기기보다 현재 판서 내용을 아래로 밀어 새 공간을 만들 수 있습니다. 수업 흐름을 유지한 채 칠판을 더 넓게 쓰는 기능입니다.",
      "steps": [
        "수업 중 칠판 판서 영역이 가득 차면 마우스 우클릭으로 가로선을 표시합니다.",
        "선을 아래로 드래그하면 새 판서 영역이 추가됩니다.",
        "선을 위로 드래그하면 이미 판서한 내용을 위로 끌어올릴 수 있습니다.",
        "최대 50페이지 판서 제한은 그대로 적용됩니다.",
        "별도 신청 없이 기본 활성화됩니다."
      ],
      "media": [
        {
          "type": "image",
          "src": "/docs/files/classin-607-update/expandable-writing-space.png",
          "alt": "확장형 판서 영역 예시 화면",
          "caption": "판서 영역을 아래로 확장해 새 공간을 만드는 예시입니다.",
          "width": 2880,
          "height": 1704
        },
        {
          "type": "video",
          "src": "/docs/files/classin-607-update/expandable-writing-space-demo.mp4",
          "alt": "확장형 판서 영역 시연 영상",
          "caption": "확장형 판서 영역 사용 흐름입니다."
        }
      ]
    },
    {
      "heading": "매직펜",
      "body": "매직펜은 학생의 시선을 잠깐 유도할 때 쓰는 신규 펜 도구입니다. 작성한 획이 1초 후 자동으로 사라지므로 기존 칠판 내용을 지우거나 가리지 않고 핵심을 짚을 수 있습니다.",
      "steps": [
        "도구 모음에서 매직펜을 선택합니다.",
        "강조하고 싶은 위치나 풀이 흐름을 짧게 표시합니다.",
        "필기를 멈추면 1초 후 획이 자동으로 사라집니다.",
        "기존 칠판 내용에는 영향을 주지 않습니다.",
        "정답을 미리 노출하지 않고 특정 위치만 안내할 때 유용합니다."
      ],
      "media": [
        {
          "type": "image",
          "src": "/docs/files/classin-607-update/magic-pen.png",
          "alt": "매직펜 도구 예시 화면",
          "caption": "매직펜은 흔적을 남기지 않는 임시 강조 도구입니다.",
          "width": 421,
          "height": 810
        },
        {
          "type": "video",
          "src": "/docs/files/classin-607-update/magic-pen-demo.mp4",
          "alt": "매직펜 시연 영상",
          "caption": "매직펜으로 표시한 획이 자동으로 사라지는 흐름입니다."
        }
      ]
    },
    {
      "heading": "개인 칠판 인원 제한 해제",
      "body": "기존에는 개인 칠판에 최대 75명까지 동시 참여할 수 있었지만, 6.0.7에서는 제한을 제거해 교실 내 모든 인원이 함께 협업할 수 있습니다.",
      "steps": [
        "교사와 학생 모두 6.0.7 이상으로 업데이트되어 있어야 합니다.",
        "Android, iOS, PC, ClassIn X에서 지원됩니다.",
        "이 기능은 기본 비활성화 상태입니다.",
        "사용을 원하는 고객사는 클래스인 코리아 담당 매니저에게 활성화 신청을 요청해야 합니다."
      ]
    },
    {
      "heading": "개인 칠판에 .edb 파일 삽입",
      "body": "교사가 로컬 칠판이나 수업 준비실에서 만든 개인 칠판 내용을 .edb 파일로 저장한 뒤, 온라인 수업 중 개인 칠판에 바로 삽입할 수 있습니다.",
      "steps": [
        "교사와 학생 모두 6.0.7 이상으로 업데이트되어 있어야 합니다.",
        "PC와 ClassIn X에서 지원되며 모바일에서는 지원되지 않습니다.",
        "이 기능은 기본 비활성화 상태입니다.",
        "사용을 원하는 고객사는 클래스인 코리아 담당 매니저에게 활성화 신청을 요청해야 합니다."
      ],
      "media": [
        {
          "type": "image",
          "src": "/docs/files/classin-607-update/edb-personal-whiteboard.png",
          "alt": "개인 칠판에 edb 파일을 삽입하는 예시 화면",
          "caption": "저장해 둔 .edb 판서 파일을 개인 칠판에 삽입할 수 있습니다.",
          "width": 1376,
          "height": 775
        }
      ]
    },
    {
      "heading": "신규 사용자 가이드와 스타터 가이드",
      "body": "처음 클래스인을 켜는 사용자는 역할에 맞는 단계별 온보딩 안내와 핵심 기능을 빠르게 익히는 스타터 가이드를 보게 됩니다. 스타터 가이드를 완료하면 개인 Plus 요금제 1개월 혜택이 제공되며, 한국 고객사에도 적용됩니다.",
      "steps": [
        "신규 사용자는 첫 로그인 시 역할에 맞는 안내를 받습니다.",
        "관리자는 기관 운영에 필요한 초기 설정과 할 일 영역을 확인합니다.",
        "교사는 가상 학생이 있는 체험 교실에서 수업 도구를 연습합니다.",
        "학생은 코스 확인, 수업 입장, 과제 제출, 공지 확인 흐름을 안내받습니다.",
        "스타터 가이드 완료 시 개인 Plus 요금제 1개월 혜택이 지급됩니다."
      ]
    },
    {
      "heading": "관리자 온보딩 변화",
      "body": "관리자는 첫 로그인 시 기관 역할을 선택한 뒤 환영 배너와 핵심 기능 가이드를 거쳐 메인 홈으로 이동합니다. 할 일 영역에서 스타터 가이드 진행 상황을 확인하고, 코스 생성과 자료·권한 관리 등 기관 운영 항목을 차례로 점검할 수 있습니다.",
      "media": [
        {
          "type": "image",
          "src": "/docs/files/classin-607-update/onboarding-admin-1.png",
          "alt": "관리자 온보딩 첫 화면 예시",
          "width": 1356,
          "height": 756
        },
        {
          "type": "image",
          "src": "/docs/files/classin-607-update/onboarding-admin-2.png",
          "alt": "관리자 스타터 가이드 진행 화면 예시",
          "width": 1356,
          "height": 757
        }
      ]
    },
    {
      "heading": "교사 온보딩 변화",
      "body": "교사는 첫 로그인 시 교사 역할을 선택하면 실제 수업 환경을 미리 체험하는 가이드로 안내됩니다. 데모 학생 3명이 미리 입장한 체험 교실에서 전자칠판 판서, 인터랙티브 교구, 수업 자료 불러오기를 연습할 수 있습니다.",
      "steps": [
        "데모 교실 체험, 코스 생성, 수업 생성, 학생 초대, 수업 1회 진행 흐름을 따라갑니다.",
        "혼자서는 확인하기 어려운 발언 요청과 상호작용 기능을 데모 학생으로 연습할 수 있습니다.",
        "스타터 가이드 완료 시 개인 Plus 요금제 1개월 혜택이 지급됩니다."
      ],
      "media": [
        {
          "type": "image",
          "src": "/docs/files/classin-607-update/onboarding-teacher-1.png",
          "alt": "교사 온보딩 체험 교실 예시",
          "width": 1356,
          "height": 756
        },
        {
          "type": "image",
          "src": "/docs/files/classin-607-update/onboarding-teacher-2.png",
          "alt": "교사 스타터 가이드 예시",
          "width": 1920,
          "height": 1080
        }
      ]
    },
    {
      "heading": "학생 온보딩 변화",
      "body": "학생은 첫 로그인 시 학생 역할을 선택하면 학습에 필요한 기본 화면을 안내받습니다. 가입한 코스 확인, 수업 입장, 과제 제출, 교사 공지 확인 방법을 중심으로 첫 사용 흐름이 정리됩니다.",
      "steps": [
        "역할 선택 후 환영 배너를 거쳐 메인 홈으로 이동합니다.",
        "가입한 코스가 있다면 수업 입장과 학습 활동 흐름을 안내받습니다.",
        "가입한 코스가 없으면 홈에서 코스 생성 또는 참여 경로를 확인합니다."
      ],
      "media": [
        {
          "type": "image",
          "src": "/docs/files/classin-607-update/onboarding-student-1.png",
          "alt": "학생 온보딩 홈 화면 예시",
          "width": 1356,
          "height": 756
        },
        {
          "type": "image",
          "src": "/docs/files/classin-607-update/onboarding-student-2.png",
          "alt": "학생 스타터 가이드 예시",
          "width": 1356,
          "height": 756
        }
      ]
    }
  ]
}
$json$::jsonb;
begin
  insert into public.docs_articles (
    category_id,
    slug,
    title,
    description,
    audience,
    product_area,
    doc_type,
    difficulty,
    status,
    visibility,
    noindex,
    featured,
    order_index,
    tags,
    keywords,
    symptoms,
    chatbot_summary,
    content_markdown,
    content_json,
    seo_title,
    seo_description,
    canonical_path,
    published_at,
    last_reviewed_at,
    updated_by,
    created_by
  )
  values (
    'teacher',
    'classin-607-update',
    'ClassIn 6.0.7 업데이트 안내',
    '확장형 판서 영역, 매직펜, 개인 칠판 개선, 신규 사용자 온보딩과 스타터 가이드까지 ClassIn 6.0.7의 주요 변경 사항을 정리했습니다.',
    array['학원 관리자', '교사', '운영팀'],
    'classroom',
    'release_note',
    'beginner',
    'published',
    'public',
    false,
    true,
    300,
    array['업데이트', '6.0.7', '수업 도구', '판서', '온보딩'],
    array['ClassIn 6.0.7', '클래스인 업데이트', '확장형 판서 영역', '매직펜', '개인 칠판', 'edb 삽입', '스타터 가이드', 'Plus 1개월', '신규 사용자 가이드'],
    array[]::text[],
    v_summary,
    v_content_markdown,
    v_content_json,
    'ClassIn 6.0.7 업데이트 안내 | ClassIn 가이드',
    'ClassIn 6.0.7의 판서 도구, 개인 칠판, 신규 사용자 온보딩 개선 내용을 확인하세요.',
    '/docs/teacher/classin-607-update',
    '2026-05-19T00:00:00+09:00',
    '2026-05-19T00:00:00+09:00',
    'migration-20260519',
    'migration-20260519'
  )
  on conflict (category_id, slug) do update
  set title = excluded.title,
      description = excluded.description,
      audience = excluded.audience,
      product_area = excluded.product_area,
      doc_type = excluded.doc_type,
      difficulty = excluded.difficulty,
      status = excluded.status,
      visibility = excluded.visibility,
      noindex = excluded.noindex,
      featured = excluded.featured,
      order_index = excluded.order_index,
      tags = excluded.tags,
      keywords = excluded.keywords,
      symptoms = excluded.symptoms,
      chatbot_summary = excluded.chatbot_summary,
      content_markdown = excluded.content_markdown,
      content_json = excluded.content_json,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description,
      canonical_path = excluded.canonical_path,
      published_at = excluded.published_at,
      last_reviewed_at = excluded.last_reviewed_at,
      updated_by = excluded.updated_by
  returning id into v_article_id;

  insert into public.docs_article_versions (
    article_id,
    version_number,
    title,
    description,
    content_markdown,
    content_json,
    change_note,
    created_by
  )
  values (
    v_article_id,
    1,
    'ClassIn 6.0.7 업데이트 안내',
    '확장형 판서 영역, 매직펜, 개인 칠판 개선, 신규 사용자 온보딩과 스타터 가이드까지 ClassIn 6.0.7의 주요 변경 사항을 정리했습니다.',
    v_content_markdown,
    v_content_json,
    'Initial import from 6.0.7 update guide',
    'migration-20260519'
  )
  on conflict (article_id, version_number) do nothing;

  select id
    into v_version_id
  from public.docs_article_versions
  where article_id = v_article_id
    and version_number = 1
  limit 1;

  delete from public.docs_ai_chunks
  where article_id = v_article_id;

  insert into public.docs_ai_chunks (
    article_id,
    article_version_id,
    chunk_index,
    heading,
    content,
    content_hash,
    token_count,
    metadata,
    embedding_model,
    embedding,
    embedding_updated_at
  )
  values (
    v_article_id,
    v_version_id,
    0,
    '요약',
    v_summary,
    md5(v_summary),
    null,
    jsonb_build_object(
      'source', '6.07 update export',
      'path', '/docs/teacher/classin-607-update',
      'slug', 'classin-607-update',
      'category', 'teacher',
      'tags', array['업데이트', '6.0.7', '수업 도구', '판서', '온보딩'],
      'keywords', array['ClassIn 6.0.7', '클래스인 업데이트', '확장형 판서 영역', '매직펜', '개인 칠판', 'edb 삽입', '스타터 가이드', 'Plus 1개월', '신규 사용자 가이드'],
      'audience', '학원 관리자, 교사, 운영팀',
      'chunkType', 'summary'
    ),
    null,
    null,
    null
  );

  for v_section in
    select value as section, ordinality::integer as idx
    from jsonb_array_elements(v_content_json -> 'sections') with ordinality
  loop
    select string_agg('- ' || value, E'\n')
      into v_steps
    from jsonb_array_elements_text(coalesce(v_section.section -> 'steps', '[]'::jsonb));

    v_chunk_content := array_to_string(
      array_remove(
        array[
          '## ' || (v_section.section ->> 'heading'),
          v_section.section ->> 'body',
          v_steps
        ],
        null
      ),
      E'\n\n'
    );

    insert into public.docs_ai_chunks (
      article_id,
      article_version_id,
      chunk_index,
      heading,
      content,
      content_hash,
      token_count,
      metadata,
      embedding_model,
      embedding,
      embedding_updated_at
    )
    values (
      v_article_id,
      v_version_id,
      v_section.idx,
      v_section.section ->> 'heading',
      v_chunk_content,
      md5(v_chunk_content),
      null,
      jsonb_build_object(
        'source', '6.07 update export',
        'path', '/docs/teacher/classin-607-update',
        'slug', 'classin-607-update',
        'category', 'teacher',
        'tags', array['업데이트', '6.0.7', '수업 도구', '판서', '온보딩'],
        'keywords', array['ClassIn 6.0.7', '클래스인 업데이트', '확장형 판서 영역', '매직펜', '개인 칠판', 'edb 삽입', '스타터 가이드', 'Plus 1개월', '신규 사용자 가이드'],
        'audience', '학원 관리자, 교사, 운영팀',
        'chunkType', 'section',
        'sectionIndex', v_section.idx - 1
      ),
      null,
      null,
      null
    );
  end loop;
end $$;

create table if not exists public.patch_notes (
  id uuid default gen_random_uuid() primary key,
  version text not null,
  title text not null,
  date date not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  changes jsonb default '[]' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

insert into public.patch_notes (version, title, date, status, changes)
select
  '6.0.7',
  'ClassIn 6.0.7 업데이트',
  '2026-05-25',
  'draft',
  $changes$
[
  {"id":"pn_607_expandable_writing","type":"feat","text":"확장형 판서 영역이 추가되어 칠판 내용을 아래로 밀어 새 판서 공간을 만들 수 있습니다."},
  {"id":"pn_607_magic_pen","type":"feat","text":"1초 후 자동으로 사라지는 매직펜 도구가 추가되었습니다."},
  {"id":"pn_607_personal_whiteboard_unlimited","type":"improve","text":"개인 칠판 동시 참여 인원 제한 해제를 지원합니다. 기본 비활성화 기능으로 활성화 신청이 필요합니다."},
  {"id":"pn_607_edb_insert","type":"feat","text":"PC와 ClassIn X에서 개인 칠판에 .edb 파일 삽입을 지원합니다. 기본 비활성화 기능으로 활성화 신청이 필요합니다."},
  {"id":"pn_607_onboarding","type":"improve","text":"신규 사용자 온보딩과 스타터 가이드가 개편되었고, 스타터 가이드 완료 시 Plus 1개월 혜택이 제공됩니다."}
]
$changes$::jsonb
where not exists (
  select 1
  from public.patch_notes
  where version = '6.0.7'
    and date = '2026-05-25'
);
