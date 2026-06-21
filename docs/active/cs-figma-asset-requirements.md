# CS Figma Asset Requirements

이 문서는 Figma `CS용 캡쳐 모음` 기반 가이드에 연결해야 할 이미지 파일 목록입니다.

## Summary

- Source capture refs: 118/118 linked
- Unique required assets: 112/112 linked
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
| - | All required assets are linked. | - |

