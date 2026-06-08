import type { ImageDimensions, OutputFormat, ResizeFormState } from './imageResize';

export type { ImageDimensions, OutputFormat };

/** 이미지 정제 폼 상태 (리사이즈 폼 + 정제 조건) */
export interface FilterFormState extends ResizeFormState {
  condition: string;
}

/** 클라이언트 처리 단계 */
export type FilterProcessingState = 'idle' | 'compressing' | 'analyzing' | 'resizing';

/** AI 판별 결과 */
export interface AiResult {
  pass: boolean;
  reason: string;
  /** 실제 호출된 AI 모델명 (예: "GPT-4o-mini", "Claude Sonnet") */
  provider: string;
}

/** 조건 불일치 에러 (FilterRejectedError 대신 직렬화 가능한 순수 타입) */
export interface FilterRejected {
  type: 'rejected';
  reason: string;
}
