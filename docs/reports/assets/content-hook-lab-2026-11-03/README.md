# 콘텐츠 후킹 루프 블로그 초안 이미지 (2026-11-03)

[명확성 라운드 보고서](../../content-hook-lab/2026-11-03-clarity.md)에서 초안으로 지정한 블로그 4편에 들어간 최종 이미지다. 운영 블로그에는 같은 파일이 `blog-images` 스토리지에 올라가 있고, 이 폴더는 보관·수정용 원본이다.

| 글 | 대표 이미지 | 인포그래픽 |
| --- | --- | --- |
| 탑1 · 강사가 그만두면, 그 반 교안은 어디 있나요? | `hero-tofu1-teacher-leaves.jpg` | `info-tofu1-teacher-leaves.png` |
| 탑2 · 결석생 보강, 강사가 매번 다시 설명하나요? | `hero-tofu2-makeup-reexplain.jpg` | `info-tofu2-absent-makeup.png` |
| 미들1 · 전자칠판 사실 때 꼭 고려해야 할 3가지 | `hero-mofu1-board-3-checks.jpg` | `info-mofu1-board-3-checks.png` |
| 미들2 · 보강을 녹화로 바꾸면 줄어드는 강사 시간 | `hero-mofu2-replay-at-home.jpg` | `info-mofu2-makeup-compare.png` |

- 대표 이미지: Figma 이미지 생성(GPT Image 2.5)으로 만든 애니메이션 풍 일러스트. 탑은 스탠드형, 미들1은 벽걸이형(칠판 왼쪽 위 클래스인 카메라·천장 마이크) 칠판을 그렸다. 타사 로고·가짜 로고·틀린 판서는 후처리로 지웠다.
- 인포그래픽: 한글 문구가 정확하도록 HTML로 그려 PNG로 렌더했다. 문구를 고치려면 `infographic-source/build.py`를 수정한 뒤 같은 폴더에서 `python3 build.py`, `node render.js a-tofu1-teacher-leaves b-tofu2-absent-makeup c-mofu1-board-3things d-mofu2-makeup-compare`를 실행한다(Playwright 필요, 글꼴은 Pretendard 웹폰트). 렌더 결과 파일명은 이 폴더의 `info-*` 이름과 다르니 복사할 때 맞춘다.
