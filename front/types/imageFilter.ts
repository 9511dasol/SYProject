import type { ImageDimensions, OutputFormat, ResizeFormState } from './imageResize';

export type { ImageDimensions, OutputFormat };

/**
 * 이미지 편집 폼 상태 (리사이즈 설정).
 *
 * 프롬프트는 여기 두지 않는다 — 요소마다 따로 쓰고 있던 글을 보관해야 해서
 * `PromptDrafts` 로 분리했다.
 */
export type FilterFormState = ResizeFormState;

/**
 * 프롬프트 초안 모음 — 키는 선택한 요소의 id(문자열), 요소를 고르지 않은
 * "이미지 전체" 편집은 ALL_ELEMENTS_KEY.
 *
 * 요소를 바꿔 가며 지시를 적다 보면 직전에 쓰던 글이 사라지는 게 가장 거슬린다.
 * 요소별로 따로 들고 있다가 그 요소를 다시 고르면 그대로 돌려준다.
 */
export type PromptDrafts = Record<string, string>;

export const ALL_ELEMENTS_KEY = 'all';

/** 선택 상태 → 초안 키 */
export function draftKeyOf(elementId: number | null): string {
  return elementId === null ? ALL_ELEMENTS_KEY : String(elementId);
}

/** 클라이언트 처리 단계 */
export type FilterProcessingState = 'idle' | 'compressing' | 'editing' | 'resizing';

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

/** 고를 수 있는 배경 스타일 (서버 프리셋) */
export interface BackgroundStyle {
  key: string;
  label: string;
}

/** 배경 시안 1종 — image_base64 는 data URL 본문 (프리픽스 없음) */
export interface BackgroundVariant {
  style: string;
  label: string;         // "스튜디오 화이트" 등
  image_base64: string;
  mime: string;
}
