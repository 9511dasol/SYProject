export interface ImageDimensions {
  width: number;
  height: number;
}

export type OutputFormat = 'jpeg' | 'png' | 'webp';

export interface ResizeFormState {
  targetWidth: string;
  targetHeight: string;
  keepAspectRatio: boolean;
  outputFormat: OutputFormat;
  useAiUpscale: boolean;
}

export interface DropZoneProps {
  file: File | null;
  previewUrl: string | null;
  originalDimensions: ImageDimensions | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}

export interface DimensionInputsProps {
  targetWidth: string;
  targetHeight: string;
  keepAspectRatio: boolean;
  originalDimensions: ImageDimensions;
  onWidthChange: (value: string) => void;
  onHeightChange: (value: string) => void;
  onToggleAspectRatio: () => void;
  disabled?: boolean;
}

export interface FormatSelectorProps {
  value: OutputFormat;
  onChange: (format: OutputFormat) => void;
  disabled?: boolean;
}

export interface FormatOption {
  value: OutputFormat;
  label: string;
  description: string;
  icon: string;
}

/** 매체 규격 프리셋 — GET /api/image-resize/presets 응답 한 줄 */
export interface MediaPreset {
  key: string;
  media: string;   // Meta | Google | YouTube | Naver | Kakao
  label: string;   // "피드 1:1" 등
  width: number;
  height: number;
}
