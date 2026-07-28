export type Platform = 'Instagram' | 'Blog' | 'YouTube';
export type PlatformFilter = '전체' | Platform;

export interface HeadingItem {
  id: number;
  platform: Platform;
  text: string;
  desc: string;
}

export interface HeadingResponse {
  headings: HeadingItem[];
}

/** DB에 저장된 한 번의 문구 생성 기록 (사용자별 히스토리). */
export interface HeadingSuggestionRecord {
  id: number;
  image_filename: string;
  has_image: boolean; // 저장된 썸네일 이미지 존재 여부
  created_at: string; // ISO 8601
  headings: HeadingItem[];
}

export interface HeadingHistoryResponse {
  items: HeadingSuggestionRecord[];
  /** limit/offset 과 무관한 사용자별 전체 기록 수 */
  total: number;
}

export type HeadingLoadingState = 'idle' | 'compressing' | 'analyzing';
