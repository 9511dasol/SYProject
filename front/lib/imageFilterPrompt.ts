import type { ImageElement } from '@/types/imageFilter';

/**
 * 지시 묶음을 편집 모델에 보낼 문장으로 바꾸는 순수 함수들.
 *
 * 화면 컴포넌트 안에 있던 것들을 끌어냈다 — 문장 조합은 결과물의 품질을 직접
 * 좌우하는데, 900줄짜리 화면 파일 안에 있으면 레이아웃을 손볼 때마다 같이
 * 스크롤되고 눈에 띄지 않는다.
 */

/** 보낼 지시 한 건 — element 가 null 이면 이미지 전체에 대한 지시 */
export interface ResolvedInstruction {
  element: ImageElement | null;
  text: string;
}

/** 요소 박스를 "가로 12%~45%, 세로 30%~40% 영역" 같은 자연어로 */
export function boxText(el: ImageElement): string {
  const range = (start: number, size: number) =>
    `${Math.round(start * 100)}%~${Math.round((start + size) * 100)}%`;
  return `가로 ${range(el.box.x, el.box.w)}, 세로 ${range(el.box.y, el.box.h)} 영역`;
}

/**
 * 지시 묶음을 편집 모델에 보낼 한 덩어리 프롬프트로 만든다.
 *
 * 백엔드 편집 엔드포인트는 자유 프롬프트 하나만 받으므로, 요소별 지시를
 * 좌표 설명과 함께 번호 매겨 늘어놓는다. 요소 하나만 보낼 때는 기존에 쓰던
 * 문장 그대로 둔다 — 모델이 가장 잘 따르던 형태라 굳이 바꾸지 않는다.
 */
export function composeEditPrompt(parts: ResolvedInstruction[]): string {
  const general = parts
    .filter((part) => !part.element)
    .map((part) => part.text)
    .join('\n');
  const targeted = parts.filter((part) => part.element);

  if (!targeted.length) return general;

  if (targeted.length === 1 && !general) {
    const only = targeted[0];
    return (
      `이미지 속 "${only.element!.label}" 요소(${boxText(only.element!)})만 ` +
      `다음 지시대로 수정해주세요: ${only.text}. ` +
      `그 외 영역은 원본과 똑같이 유지해주세요.`
    );
  }

  const lines = targeted.map(
    (part, i) => `${i + 1}) "${part.element!.label}" 요소(${boxText(part.element!)}): ${part.text}`,
  );
  return [
    '이미지에서 아래 영역들을 각각 지시대로 수정해주세요.',
    ...lines,
    general && `전체 적용: ${general}`,
    '지시하지 않은 영역은 원본과 똑같이 유지해주세요.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 버전 기록에 남길 사람이 읽기 좋은 요약 (모델에 보내는 문장과 별개) */
export function describeInstructions(parts: ResolvedInstruction[]): string {
  return parts
    .map((part) => (part.element ? `${part.element.label} → ${part.text}` : part.text))
    .join('\n');
}

/**
 * 서버가 덧붙인 `_resized_640x400` 접미사를 걷어낸다.
 *
 * 편집 결과를 다시 입력으로 쓰면 서버가 그 이름 뒤에 또 붙이기 때문에,
 * 두세 번만 이어가도 `a_resized_640x400_resized_640x400...` 이 된다.
 * 배경 시안의 `_bg_<style>` 은 어느 시안에서 나왔는지 알려주므로 남긴다.
 */
export function stripResizeSuffix(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  const cleaned = stem.replace(/(?:_resized_\d+x\d+)+$/, '');
  return `${cleaned || stem}${ext}`;
}

/**
 * 사용량 로그에 남은 프롬프트를 읽기 좋게 다듬는다.
 *
 * 서버에 쌓이는 건 과금 원장이라 집계용 접두사(`[시안 3/4장]`)가 붙어 있다.
 * 사용자가 쓴 글이 아니므로 화면에서는 걷어낸다 — 원문은 로그에 그대로 남는다.
 */
export function readableLogPrompt(prompt: string): string {
  return prompt.replace(/^\[시안 \d+\/\d+장\]\s*/, '');
}

/* ── 예시 지시 ───────────────────────────────────────────────── */

/** 이미지를 아직 올리지 않은 첫 화면에서 보여 주는 예시 */
export const EXAMPLE_PROMPTS = [
  { icon: 'bx-landscape', text: '배경을 하얀색 배경으로 바꿔줘' },
  { icon: 'bx-adjust', text: '흑백 사진으로 변환해줘' },
  { icon: 'bx-eraser', text: '사진 속 워터마크나 텍스트를 제거해줘' },
  { icon: 'bx-sun', text: '더 화사하고 밝은 분위기로 보정해줘' },
  { icon: 'bx-aperture', text: '배경을 흐릿하게(아웃포커스) 처리해줘' },
  { icon: 'bx-film', text: '오래된 필름 사진 느낌으로 바꿔줘' },
] as const;

/**
 * 대상 요소의 종류에 맞는 지시 예시.
 *
 * 예전에는 예시가 빈 화면에만 6개 고정으로 떴다 — 막상 "헤드라인 문구"를 고른
 * 뒤에는 뭐라고 써야 할지 알려주는 게 없었다. 서버가 요소마다 내려주는
 * category 를 그대로 쓰면 고른 대상에 맞는 예시를 띄울 수 있다.
 */
const SUGGESTIONS: Record<string, string[]> = {
  text: ['문구를 "" 로 바꿔줘', '글씨를 더 굵게 해줘', '글자 색을 흰색으로 바꿔줘', '이 문구를 지워줘'],
  logo: ['로고를 더 크게 키워줘', '로고를 흰색 단색으로 바꿔줘', '로고를 지워줘'],
  product: ['제품을 더 선명하고 또렷하게 해줘', '제품 색을 바꿔줘', '제품에 그림자를 넣어줘'],
  person: ['피부톤을 자연스럽게 보정해줘', '표정이 밝아 보이게 해줘'],
  background: ['스튜디오 흰 배경으로 바꿔줘', '배경을 흐릿하게 처리해줘', '배경만 어둡게 깔아줘'],
  graphic: ['이 도형을 지워줘', '색을 브랜드 색으로 맞춰줘'],
};

const GENERAL_SUGGESTIONS = [
  '더 화사하고 밝은 분위기로 보정해줘',
  '배경을 하얀색 배경으로 바꿔줘',
  '워터마크나 불필요한 텍스트를 제거해줘',
  '전체적으로 선명하게 해줘',
];

/** 대상 요소(없으면 이미지 전체)에 맞는 예시 지시 목록 */
export function suggestionsFor(element: ImageElement | null): string[] {
  if (!element) return GENERAL_SUGGESTIONS;
  return SUGGESTIONS[element.category] ?? GENERAL_SUGGESTIONS;
}
