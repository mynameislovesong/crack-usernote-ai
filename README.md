# Crack 유저노트 AI 정리·압축기

Crack 유저노트 내부에서 Gemini API 또는 Firebase AI Logic을 이용해 프롬프트를 작성·압축하고 별도 모델로 검토하는 Tampermonkey 사용자 스크립트입니다.

## 설치

1. 브라우저에 [Tampermonkey](https://www.tampermonkey.net/)를 설치합니다.
2. [사용자 스크립트 설치](https://raw.githubusercontent.com/mynameislovesong/crack-usernote-ai/main/crack-usernote-ai.user.js)를 누릅니다.
3. Tampermonkey 설치 화면에서 **설치**를 누른 뒤 `https://crack.wrtn.ai/`를 새로고침합니다.

## 주요 기능

- 유저노트 내부 버튼으로만 AI 팝업 열기
- 압축 강도 `하·중·상·최상`
- 작성/압축 모델과 검토 모델을 별도로 선택
- 모델별 추론 강도 `하·중·상` 선택, 기본값 `중`
- 작성/압축 권장: Gemini 3.6 Flash, 3.5 Flash
- 검토 권장: Gemini 3.1 Pro
- Firebase 기본 백엔드: Vertex AI Gemini API
- 검토 결과를 별도 팝업으로 표시

## 보안 참고

API 키와 Firebase 설정은 Tampermonkey 스크립트 저장소에 보관됩니다. 개인 환경에서만 사용하세요.

