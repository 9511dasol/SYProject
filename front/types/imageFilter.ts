import type { ImageDimensions, OutputFormat, ResizeFormState } from './imageResize';

export type { ImageDimensions, OutputFormat };

/** 이미지 편집 폼 상태 (리사이즈 폼 + 편집 프롬프트) */
export interface FilterFormState extends ResizeFormState {
  prompt: string;
}

/** 클라이언트 처리 단계 */
export type FilterProcessingState = 'idle' | 'compressing' | 'editing' | 'resizing';

/** AI 편집 결과 */
export interface AiResult {
  /** 실제 호출된 AI 모델명 (예: "Gemini (gemini-2.5-flash-image)") */
  provider: string;
}

/** 요소 분석 — 0~1 비율 좌표 (CSS 퍼센트로 바로 쓴다) */
export interface ElementBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 이미지에서 검출된 편집 가능 요소 */
export interface ImageElement {
  id: number;
  label: string;     // "헤드라인 문구", "브랜드 로고" 등
  category: string;  // text | logo | product | person | background | graphic | other
  box: ElementBox;
}

/** 배경 시안 1종 — image_base64 는 data URL 본문 (프리픽스 없음) */
export interface BackgroundVariant {
  style: string;
  label: string;         // "스튜디오 화이트" 등
  image_base64: string;
  mime: string;
}
