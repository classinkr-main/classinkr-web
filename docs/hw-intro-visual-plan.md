# HW 페이지 도입부 — 배경·이미지 기획안

> `app/product/hw/page.tsx` 도입부 11개 섹션의 배경·이미지·자산 스펙 문서.
> 코드 구현은 `components/product/hw/` 에 완료되어 있고, 이 문서는 **자산 준비 가이드**.

---

## 공통 원칙

- **Classin Green `#084734`** 이 유일한 포화 컬러. 섬네일 오버레이·인포그래픽 라인·뱃지만 그린.
- **웜 뉴트럴 3톤 교차**: `#FAFAF8`(페이지), `#F6F5F4`(웜), `#ECFDF5`(그린 서피스), `#0D1A12`(다크).
- **이미지 형식**: 사진 JPG 품질 85 + WebP(`next/image` 자동). 인포그래픽은 SVG.
- **촬영 톤**: 자연광 위주, 채도 -10%, 콘트라스트 +5%. 차가운 형광등 금지. 따뜻한 3200~4000K.

---

## 섹션별 스펙

### 1. Hero
- **배경**: 현재 `from-[#FDFCF8] via-[#F0FFF7] to-[#FDFCF8]`
  → 권장 `from-[#FAFAF8] via-[#ECFDF5]/40 to-[#FAFAF8]` (DESIGN.md 톤 일치)
- **메인 이미지**: `hero-board-front.png` 1200×800 (사용 중)
- **교체 권장**: 교실 실내 촬영 컷. 보드 정면 원근 설치 + 강사가 프레임 밖에서 필기. 화면에 실제 수업 판서(예: 3차 함수). 16:9, 최소 2560px wide.

### 2. OpeningStatement
- **배경**: `#FAFAF8` → **`#F6F5F4`** 권장 (직전 Hero와 구분)
- **이미지**: 없음. 타이포 단독.
- **선택 장식**: 배경 좌상단·우하단에 거대 따옴표 글리프 (opacity 4%, 280px)

### 3. PainPointsV2
- **배경**: `#FFFFFF` (현재)
- **이미지**: 없음. 좌 오렌지 카드 vs 우 그린 카드 대비로 충분.
- **개선안**: 해결 카드 우상단에 부품 아이콘 SVG (OPS 칩·렌즈·터치 파형·렌즈 플레어·방울무늬), 24×24, stroke `#084734/60`

### 4. AllInOneStatement
- **배경**: `#0D1A12` 다크 (현재)
- **현재 시각**: SVG 분해도 스택
- **업그레이드**: `board-exploded-view.png` 1600×1600 정사각 투명 PNG. Blender/KeyShot 3D 렌더, 레이어 10°씩 분해: AG 코팅 → 디스플레이 → 터치 → OPS → 카메라 → 스피커
- **배경 장식**: `#084734/20` blur-3xl 글로우 좌상단·우하단 (유지)

### 5. BigBackdropImage ← **가장 중요한 시각**
- **배경**: 풀블리드
- **현재**: `/images/product/hw/board/board-bezel-detail.png`
- **촬영 스펙**:
  - 주제: 보드 우측 하단 코너 베젤 매크로
  - 구도: 좌측 상단에 베젤 엣지 대각선, 우하단에 화면 판서
  - 조명: 사이드 라이트로 매트 알루미늄 질감
  - 해상도: 3840×2160 (4K) 최소, sRGB
  - 후보정: 그림자 강조, 화면 부분 약간 밝게
- **오버레이**: `from-black/85 via-black/40 to-transparent` (유지)
- **대안 A/B**: A. 교실 풀샷(보드+학생 실루엣) / B. 손글씨 클로즈업(LatencyProof와 겹침 → A 추천)

### 6. ImpactNumbers
- 배경 `#0d1a12` (현재 유지)
- 숫자 항목 교체 권장: `i5/i7 OPS`·`AG/AF`·`4K AI` 추가 (별도 작업)

### 7. DesignDetails — 3카드 매크로

| 카드 | 파일명 | 촬영 지시 |
|---|---|---|
| Anti-Glare | `hw-detail-anti-glare.jpg` | 형광등 2개 켜진 강의실, 보드 정면 매크로. 손글씨 떠 있고 반사 없이 선명. 비교용 유리 모니터 반사 컷을 작게 삽입 가능. 1:1, 2000×2000 |
| Anti-Fingerprint | `hw-detail-anti-fingerprint.jpg` | 손가락 자국이 스친 후 흔적 없는 매크로. 측광으로 표면 질감. 일반 태블릿 지문 대비 컷. 1:1, 2000×2000 |
| Immersion Design | `hw-detail-immersion.jpg` | 교실 정면 와이드. 보드 외 시야에 거슬리는 것 없음. 미니멀 모델 룸. 1:1 또는 4:3, 2000×2000 |

- 자산 미준비: 그라디언트 + lucide 아이콘 유지
- 준비 후: `<Image fill object-cover>` + `bg-gradient-to-t from-black/20` 카피 가독성 확보

### 8. LatencyProof
- **현재**: 좌측 SVG "0.03" path drawing
- **업그레이드**: `board-latency-demo.mp4` 1920×1080 6~8초 루프. 보드 위에 수식이 한 글자씩 즉시 나타나는 실제 촬영. `<video autoPlay muted loop playsInline>`
- **배경**: 섹션 `#F6F5F4` 유지, 영상 컨테이너는 `#0D1A12` 베젤

### 9. AICameraSection
- **현재**: SVG 강의실 탑뷰 + 강사 점 애니메이션
- **업그레이드**: `ai-camera-tracking.mp4` 1600×1600 10초 루프. 강의실 천장 뷰(fisheye) 실영상 + 카메라 박스·시야각 그래픽 합성
- **추가 컷**(선택): 우하단 floating 카드에 강사 얼굴 bounding box 캡처
- **배경**: `#0D1A12` 유지

### 10. SizeChooser — 교실 실사 2종

| 카드 | 파일명 | 촬영 지시 |
|---|---|---|
| 75" | `room-75-compact.jpg` | 15~20평 소형. 보드 앞벽 중앙, 책상 6~8개. 따뜻한 톤, 빈 교실. 16:10, 2400×1500 |
| 86" | `room-86-standard.jpg` | 30~35평 표준. 책상 30~45개. 보드가 시야 가득. 같은 톤. 16:10, 2400×1500 |

- **두 사진 동일 조명·동일 톤 필수** (비교 카드라)
- 자산 미준비: 그라디언트 `from-[#ECFDF5] via-[#F6F5F4] to-[#FAFAF8]` 로 조정

### 11. ValueAnchor
- **배경**: `#0D1A12` + 그린 글로우 (현재)
- **이미지**: 없음. 체크리스트가 주인공.
- **선택 장식**: 카드 뒷면에 보드 실루엣 SVG 워터마크 opacity 3%

---

## 자산 준비 우선순위

| 순위 | 자산 | 섹션 | 대체 가능? |
|---|---|---|---|
| **P0** | 교실 실사 2종 (75"/86") | SizeChooser | 없음 — 비교 카드의 핵심 |
| **P0** | 베젤 매크로 4K | BigBackdropImage | 기존 자산으로 버티나 퀄리티 낮음 |
| **P1** | 디테일 매크로 3종 (AG/AF/immersion) | DesignDetails | 플레이스홀더 가능 |
| **P1** | 손글씨 지연 영상 mp4 | LatencyProof | SVG 애니메이션으로 가능 |
| **P2** | AI 카메라 트래킹 영상 | AICameraSection | SVG 가능 |
| **P2** | 보드 분해도 3D 렌더 | AllInOneStatement | SVG 스택 가능 |
| **P3** | Hero 교체 컷 | Hero | 기존 자산 쓸 만함 |

---

## 배경 교차 리듬

```
Hero                #FAFAF8
OpeningStatement    #F6F5F4  ← #FAFAF8에서 변경 권장
PainPointsV2        #FFFFFF
AllInOneStatement   #0D1A12  ← 1차 다크
BigBackdropImage    풀블리드 이미지
ImpactNumbers       #0d1a12
DesignDetails       #FFFFFF  ← 복귀
LatencyProof        #F6F5F4
AICameraSection     #0D1A12  ← 2차 다크
SizeChooser         #FFFFFF
ValueAnchor         #0D1A12  ← 3차 다크 (CTA)
```

---

## 즉시 적용 가능한 코드 개선 (자산 불필요)

1. OpeningStatement 배경 `#FAFAF8` → `#F6F5F4`
2. Hero 배경 그라디언트를 DESIGN.md 톤으로 교체
3. ValueAnchor 카드 워터마크 SVG 추가
4. OpeningStatement 따옴표 글리프 장식 옵션
5. ImpactNumbers 숫자 항목 교체 (OPS·AG/AF·4K AI)
