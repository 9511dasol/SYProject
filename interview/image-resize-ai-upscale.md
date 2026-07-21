# 이미지 리사이저 — AI 업스케일 파이프라인

## 문제

`/image-resize` 기능은 원본 이미지를 원하는 크기로 변환해주는 기능이다.
축소나 원본과 같은 크기로 변환할 때는 문제가 없었지만, **원본보다 큰 크기로
확대(업스케일)** 할 때 결과물이 흐릿하게 나온다는 이슈가 있었다.

## 원인

백엔드(`back/app/services/image_resize_service.py`)는 Pillow의
`Image.resize(..., Image.Resampling.LANCZOS)`로 리사이즈를 수행한다. LANCZOS는
이미지 리샘플링 알고리즘 중 화질이 가장 좋은 축에 속하지만, 어디까지나
**보간(interpolation)** 이다. 주변 픽셀 값을 수학적으로 섞어 새 픽셀을
계산할 뿐, 원본에 없던 디테일(엣지, 텍스처)을 만들어내지 못한다.

- 축소: 여러 픽셀 → 하나의 픽셀로 압축하는 것이라 정보 손실만 있고 화질
  저하가 두드러지지 않는다.
- 확대: 하나의 픽셀 → 여러 픽셀로 "추측"해서 채워야 하는데, LANCZOS는
  주변 픽셀을 부드럽게 이어 붙이기만 해서 결과물이 뭉개져 보인다.

즉, 알고리즘적 리샘플링만으로는 확대 시의 화질 저하를 근본적으로 해결할 수
없고, 없는 정보를 "그럴듯하게 생성"해줄 수 있는 생성형 AI 모델이 필요하다.

## 설계 방향

1. **분기 조건**: 목표 픽셀 수(`new_w * new_h`)가 원본 픽셀 수(`orig_w *
   orig_h`)보다 클 때만 "AI 업스케일" 옵션을 노출한다. 축소/동일 크기에는
   AI 호출이 의미가 없고 비용(토큰)만 낭비되므로 UI 자체에서 숨긴다
   (`ImageResizeClient.tsx`의 `isUpscaling` 플래그).
2. **옵트인(opt-in)**: 항상 AI를 태우지 않고 사용자가 체크박스로 선택했을
   때만 호출한다. AI 호출은 지연시간과 비용(Gemini API 토큰)이 들기
   때문에, 기본 동작은 기존 무료·빠른 LANCZOS 경로를 유지한다.
3. **실패 시 조용한 폴백**: AI 호출이 실패(API 키 미설정, 네트워크 오류,
   응답에 이미지 없음 등)해도 사용자 요청 자체를 실패시키지 않고, 기존
   LANCZOS 리사이즈로 넘어간다. 사용자 입장에서는 "AI 업스케일"이 그냥
   안 걸린 리사이즈 결과를 받는 것뿐이라 요청 자체가 실패하지 않는다.

## 파이프라인 흐름

```
[프론트] 파일 선택 → 목표 크기 입력
   │
   ├─ new_w * new_h > orig_w * orig_h ?
   │      └─ Yes → "AI로 디테일 보강" 체크박스 노출
   │
   ▼
[프론트] FormData(file, width, height, format, use_ai_upscale)
   │  POST /api/image-resize/resize
   ▼
[백엔드 라우터] image_resize_router.py
   │  → image_resize_service.resize_image(...)
   ▼
[백엔드 서비스] image_resize_service.py
   │
   │  1. 원본 로드 (Pillow), 목표 크기 계산
   │  2. use_ai_upscale=True AND 목표 픽셀수 > 원본 픽셀수 ?
   │        │
   │        ├─ Yes → image_ai_upscale_service.ai_upscale() 호출
   │        │         │
   │        │         ├─ 성공 → AI가 생성한 고해상도 이미지로 교체
   │        │         └─ 실패(예외/None) → 원본 이미지 그대로 유지 (폴백)
   │        │
   │        └─ No  → 원본 이미지 그대로 유지
   │
   │  3. (알파 채널 처리 등 포맷 변환)
   │  4. LANCZOS로 정확한 목표 크기(width x height)에 맞춰 최종 리사이즈
   │     ※ AI 모델이 반환하는 이미지 크기가 정확히 목표 크기와 일치한다는
   │       보장이 없어, 항상 마지막에 LANCZOS로 exact-fit 보정을 한다.
   │  5. 포맷별 저장 옵션(quality=95 등)으로 인코딩
   ▼
[백엔드 라우터] StreamingResponse + 헤더
   │  Content-Disposition: 다운로드 파일명
   │  X-AI-Upscale-Used: true | false   ← AI가 실제로 사용됐는지 프론트에 알림
   ▼
[프론트] 응답 헤더로 AI 사용 여부 확인 → 성공 메시지 분기
```

## 핵심 파일

| 파일 | 역할 |
|---|---|
| `front/components/image-resize/ImageResizeClient.tsx` | 확대 여부 판단(`isUpscaling`), AI 옵션 UI, 축소로 바뀌면 옵션 자동 해제 |
| `front/lib/imageResizeClient.ts` | `use_ai_upscale` 폼 필드 전송, 응답 헤더에서 `aiUpscaleUsed` 파싱 |
| `back/app/schemas/image_resize_schema.py` | `use_ai_upscale` 폼 파라미터 검증 |
| `back/app/services/image_ai_edit_service.py` | Gemini 이미지 생성 모델 호출 — 성공 시 바이트, 실패 시 `None` (`generate_image` 범용 함수 + `ai_upscale` 래퍼) |
| `back/app/services/image_resize_service.py` | AI 업스케일 → LANCZOS exact-fit → 인코딩까지의 전체 파이프라인 오케스트레이션 |
| `back/app/routers/image_resize_router.py` | `X-AI-Upscale-Used` 응답 헤더 추가 |

## 왜 Gemini 이미지 생성 모델을 썼나

프로젝트가 이미 `image_filter_graph.py`, `heading_service.py` 등에서
`GEMINI_API_KEY` / `google-genai` SDK를 공용으로 쓰고 있어서, 별도
프로바이더(예: Replicate의 Real-ESRGAN)를 새로 붙이는 대신 기존 인프라를
재사용했다. `gemini-2.5-flash-image` 모델에 원본 이미지 + "디테일을
보강해서 업스케일하되 구도/색상/내용은 바꾸지 말라"는 프롬프트를 함께
보내고, 응답의 `inline_data`에서 이미지 바이트를 꺼내는 방식이다.

## 트레이드오프

- **비용/지연시간**: AI 호출 1회당 토큰 비용 + 응답 시간(수 초)이 추가된다.
  그래서 "확대할 때만, 사용자가 원할 때만" 실행되도록 좁혀뒀다.
- **원본 보존 안 됨**: AI가 생성한 이미지는 원본 픽셀의 "재구성"이지
  원본 그 자체가 아니다. 완전히 동일한 원본 보존이 필요한 유스케이스라면
  적합하지 않고, 어디까지나 "확대 시 덜 흐릿하게 보이기 위한" 용도다.
- **결정성 없음**: 생성형 모델이라 같은 입력이라도 결과가 매번 조금씩
  달라질 수 있다. 재현 가능한 결정적 리사이즈가 필요하면 LANCZOS 경로를
  써야 한다.
