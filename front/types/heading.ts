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

export type HeadingLoadingState = 'idle' | 'compressing' | 'analyzing';
