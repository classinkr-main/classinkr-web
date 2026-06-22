# CS Figma Asset Requirements

이 문서는 Figma `CS용 캡쳐 모음` 기반 가이드에 연결해야 할 이미지 파일 목록입니다.

## Summary

- Source capture refs: 108/118 linked
- Unique required assets: 102/112 linked
- Public image files detected: 112

## How To Add Images

1. Figma 원본 캡처를 PNG/WebP/JPG로 export합니다.
2. export 폴더 파일명이 아래 라벨 또는 권장 파일명과 비슷하면 `npm run import:cs-figma-assets -- <export-folder>`로 자동 복사합니다.
3. Figma/browser가 붙인 `@2x`, `(1)`, `copy`, `복사본` suffix는 import 단계에서 자동으로 무시합니다.
4. 자동 매칭이 안 되는 파일은 아래 `Expected public path`와 같은 파일명으로 `public/docs/files/cs-figma/`에 저장합니다.
5. 필요하면 `npm run sync:cs-figma-assets`를 실행해 `lib/cs-figma-assets.generated.ts`를 갱신합니다.
6. `npm run check:cs-figma-assets`로 연결 수를 확인합니다.

## Missing Assets

| Expected public path | Source capture label | Used by docs |
| --- | --- | --- |
| `/docs/files/cs-figma/학원a-로컬-녹화-녹화수업-업로드.png` | 학원A - 로컬 녹화/녹화수업 업로드.png | `/docs/start/cs-figma-digest-194` |
| `/docs/files/cs-figma/학원a-수업개설-녹화-활성화-카메라-세팅.png` | 학원A - 수업개설/녹화 활성화/카메라 세팅 | `/docs/teacher/cs-figma-digest-220` |
| `/docs/files/cs-figma/학원a-클래스인-로컬-녹화-후-녹화-수업-생성하기.png` | 학원A _ 클래스인 [로컬 녹화] 후 [녹화 수업] 생성하기.png | `/docs/start/cs-figma-digest-245` |
| `/docs/files/cs-figma/학원a-클래스인-코스-입장-카메라-녹화-확인.png` | 학원A_클래스인_코스_입장_카메라_녹화_확인 | `/docs/start/cs-figma-digest-274` |
| `/docs/files/cs-figma/학원d-코스-학습-활동-다른-코스-과정에-복사하기.png` | 학원D_코스 학습 활동 다른 코스/과정에 복사하기 | `/docs/teacher/cs-figma-digest-328` |
| `/docs/files/cs-figma/학원b-현장-녹화-마이크-on-off.png` | 학원B - 현장 녹화 / 마이크 on·off | `/docs/teacher/cs-figma-digest-401` |
| `/docs/files/cs-figma/학원c-현장-녹화-확인.png` | 학원C - 현장 녹화 확인 | `/docs/start/cs-figma-digest-473` |
| `/docs/files/cs-figma/0114-학원f-omr-cs.png` | 0114 학원F OMR CS.png | `/docs/admin/cs-figma-digest-689` |
| `/docs/files/cs-figma/학원b-닉네임-동기화.png` | 학원B 닉네임 동기화 | `/docs/admin/cs-figma-digest-1102` |
| `/docs/files/cs-figma/클래스인-마이크-활성화-비활성화-학원e.png` | 클래스인 마이크 활성화/비활성화(학원E) | `/docs/admin/cs-figma-digest-1239` |

