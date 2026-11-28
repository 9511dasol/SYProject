import type { ImageDimensions, OutputFormat, ResizeFormState } from './imageResize';

export type { ImageDimensions, OutputFormat };

/**
 * 이미지 편집 폼 상태 (출력 설정).
 *
 * 지시문은 여기 두지 않는다 — 여러 건을 따로 켜고 끄고 지우므로 `Instruction[]` 로 분리했다.
 *
 * 리사이저와 공유하는 `ResizeFormState` 에 장수를 직접 넣지 않고 확장하는 이유 —
 * 시안 장수는 AI 편집에만 있는 개념이다. 공유 타입에 넣으면 리사이저 폼이
 * 쓰지도 않는 필드를 들고 다니게 된다.
 */
export interface FilterFormState extends ResizeFormState {
  /** 한 번에 만들 편집 시안 장수 — 한 장이 이미지 생성 1회(=과금 1회)다 */
  variantCount: number;
}

/** 지시문 한 건의 글자 수 상한 */
export const MAX_INSTRUCTION_LENGTH = 500;

/**
 * 편집 지시 한 건.
 *
 * 예전에는 `Record<요소id, string>` 이었다. 그 구조가 네 가지를 막고 있었다 —
 * 요소 하나에 지시 2건을 못 쓰고, 순서를 못 정하고, 일부만 전송할 수 없고,
 * 전송 실패 시 되살리는 로직을 호출부가 직접 들고 있어야 했다.
 *
 * 특히 "일부만 전송"이 없던 게 문제였다. 써 두고 잊은 지시가 다음 전송에 조용히
 * 끼어들어 AI 호출 비용과 결과물이 예상과 달라졌는데, 그걸 알려주는 단서가
 * 입력창 위 11px 안내문 한 줄뿐이었다.
 */
export interface Instruction {
  id: string;
  /** 수정 대상 요소. null 이면 이미지 전체에 대한 지시 */
  targetElementId: number | null;
  text: string;
  /** 전송에 포함할지 — 체크를 끄면 목록에 남아 있되 보내지 않는다 */
  enabled: boolean;
  /**
   * 직전 전송 결과. 'failed' 는 카드에 재시도 안내를 띄우는 용도로만 쓴다
   * (전송에 성공한 지시는 목록에서 빠지고 그 버전의 기록으로 옮겨간다).
   */
  status: 'draft' | 'failed';
  /**
   * 대상을 다시 골라야 하는 상태 — 저장소에서 복구된, 원래 특정 요소를 가리키던 지시.
   *
   * 요소 id 는 분석할 때마다 새로 매겨지므로 복구 시 그대로 쓸 수 없다. 그렇다고
   * 조용히 "이미지 전체"로 바꾸면 안 된다 — "로고를 지워줘"가 이미지 전체 지시가
   * 되는 순간 결과물이 완전히 달라진다. 대상을 고를 때까지 전송에서 뺀다.
   */
  needsTarget?: boolean;
  /** 복구 전 가리키던 요소 이름 — 어떤 대상을 다시 골라야 하는지 알려 준다 */
  targetHint?: string;
}

/** 지시 생성 — id 는 호출부가 세는 카운터로 넘긴다 (Math.random 은 쓰지 않는다) */
export function makeInstruction(seq: number, targetElementId: number | null, text = ''): Instruction {
  return { id: `ins-${seq}`, targetElementId, text, enabled: true, status: 'draft' };
}

/** 버전 한 장의 출처 */
export type VersionKind = 'original' | 'edited' | 'background';

/**
 * 작업 중인 이미지 한 장.
 *
 * 예전 화면은 결과를 채팅 버블로 쌓아 두고, 그 결과를 이어서 편집하려면 버블의
 * 버튼으로 "현재 첨부 파일" 자리에 밀어 넣었다. 그래서 지금 보고 있는 이미지가
 * 어디서 갈라져 나온 것인지 추적할 방법이 없었다. `parentId` 로 계보를 들고 있으면
 * 하단 레일이 그걸 그대로 보여 줄 수 있다.
 *
 * `file` 을 들고 있는 이유 — 편집·요소 분석 API가 모두 File 을 받으므로, 결과를
 * 바로 다음 입력으로 쓰려면 Blob 이 아니라 File 이어야 한다.
 */
export interface ImageVersion {
  id: string;
  kind: VersionKind;
  /** 이 버전을 만들어 낸 버전 — 원본은 null */
  parentId: string | null;
  file: File;
  /** 미리보기 objectURL — 해제는 useImageVersions 가 맡는다 */
  url: string;
  /** 치수는 비동기로 측정된다 — 측정 전에는 null */
  dimensions: ImageDimensions | null;
  /** 레일에 표시할 짧은 이름 — '원본' · 'v1' · '스튜디오 화이트' */
  label: string;
  /** 편집 결과라면 응답 헤더의 모델명 */
  provider?: string;
  /** 서버가 내려준 파일명 — 다운로드에 쓴다 */
  filename: string;
  /** 이 버전을 만든 지시 요약 (사람이 읽는 문장) */
  note?: string;
  /** 같은 요청 1회로 함께 만들어진 장들의 묶음 번호 — 대화에서 답 하나로 묶는다 */
  batch?: number;
}

/** 클라이언트 처리 단계 */
export type FilterProcessingState = 'idle' | 'compressing' | 'editing';

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

/**
 * 직접 입력 배경의 상한 — 서버(`image_background_service`)와 같은 값이어야 한다.
 *
 * 서버도 같은 한도로 막는다. 여기 값은 "보내기 전에 알려 주기" 용도일 뿐이고,
 * 실제 방어선은 서버다 (화면만 막으면 요청을 직접 만드는 경로가 열려 있다).
 */
export const MAX_CUSTOM_BACKGROUNDS = 3;
export const MAX_CUSTOM_BACKGROUND_LENGTH = 80;

/** 배경 시안 1종 — image_base64 는 data URL 본문 (프리픽스 없음) */
export interface BackgroundVariant {
  style: string;
  label: string;         // "스튜디오 화이트" 등
  image_base64: string;
  mime: string;
}

/**
 * 편집 시안 장수 — 서버(`image_filter_service`)와 같은 값이어야 한다.
 *
 * 한 장이 이미지 생성 1회다. 즉 장수가 그대로 토큰 배수이므로, 올릴 때 비용이
 * 함께 오른다는 사실을 화면에서 보여 준다. 서버도 같은 한도로 막는다 —
 * 여기 값은 "보내기 전에 알려 주기" 용도이고 실제 방어선은 서버다.
 */
export const DEFAULT_EDIT_VARIANTS = 4;
export const MAX_EDIT_VARIANTS = 6;

/** 편집 시안 1장 — image_base64 는 data URL 본문 (프리픽스 없음) */
export interface EditVariant {
  image_base64: string;
  mime: string;
  filename: string;
}

/** 내가 과거에 보낸 편집 전송 1회의 기록 — 결과 이미지가 보관돼 있을 수 있다 */
export interface EditPromptRecord {
  id: number;
  prompt: string;
  image_filename: string;
  /** 대화(스레드) id — 이 값이 생기기 전 기록은 null 이고, 그때는 파일명으로 묶는다 */
  thread_id?: string | null;
  created_at: string;
  /** 생성 당시 시안 장수 — 만료돼도 "시안 4장 (만료)" 로 보여야 한다 */
  variant_count: number;
  /** false 면 보관 기간이 지나 이미지가 삭제된 것 — 프롬프트만 남는다 */
  images_available: boolean;
  /** 실제 보관된 장수 — 업로드 일부 실패 시 variant_count 보다 적을 수 있다 */
  image_count: number;
}
