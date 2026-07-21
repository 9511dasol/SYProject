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
