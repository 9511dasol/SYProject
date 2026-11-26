import type { OutputFormat } from '@/types/imageFilter';

/**
 * 작성 중이던 편집 지시를 브라우저에 남겨 둔다.
 *
 * 모달의 자동 저장은 "세션 안에서"의 보호일 뿐이다 — 새로고침하거나 실수로 뒤로
 * 가면 500자짜리 지시 몇 건이 통째로 사라졌다. 지시는 사람이 공들여 쓴 글이라
 * 재입력 비용이 가장 큰 자산이다.
 *
 * **이미지는 저장하지 않는다.** 화면이 "이미지는 서버에 저장되지 않아요"라고
 * 약속하고 있으므로 로컬에도 남기지 않는다. 용량 문제도 함께 피한다(수 MB 이미지를
 * localStorage 에 넣으면 금방 쿼터가 찬다).
 */

const KEY = 'imageFilter:draft:v1';
const TTL_MS = 24 * 60 * 60 * 1000;
/** 쿼터를 지키기 위한 상한 — 실사용에서 이 이상 쌓이는 일은 없다 */
const MAX_INSTRUCTIONS = 50;

/** 복구할 지시 한 건 — id·상태는 복구할 때 새로 매긴다 */
export interface StoredInstruction {
  text: string;
  /** 저장 당시 가리키던 요소 이름 — 복구 후 "무엇에 쓰던 지시였는지" 안내에만 쓴다 */
  targetHint?: string;
}

export interface StoredSession {
  savedAt: number;
  /** 어떤 이미지에 쓰던 지시인지 알려 주기 위한 파일명 */
  imageName: string | null;
  outputFormat: OutputFormat;
  keepAspectRatio: boolean;
  instructions: StoredInstruction[];
}

/* 한 번 읽은 값을 모듈에 들고 있는다 — useSyncExternalStore 의 getSnapshot 은
   호출마다 같은 참조를 돌려줘야 한다(매번 JSON.parse 하면 무한 렌더가 된다). */
let cache: StoredSession | null | undefined;

function read(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.instructions?.length) return null;
    // 하루가 지난 초안은 되살리지 않는다 — 맥락을 잊은 지시가 되살아나면
    // 반가운 복구가 아니라 "이게 뭐지" 가 된다
    if (!parsed.savedAt || Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    // 손상된 값·접근 불가 환경 — 복구는 부가 기능이므로 조용히 포기한다
    return null;
  }
}

/** 저장된 세션 (없으면 null). 같은 참조를 유지한다 */
export function peekSession(): StoredSession | null {
  if (cache === undefined) cache = read();
  return cache;
}

/** 저장된 값은 우리 쪽 동작으로만 바뀌고 그때 화면도 같이 갱신된다 — 구독은 비워 둔다 */
export function subscribeSession(): () => void {
  return () => {};
}

/** 저장할 내용 — 저장 시각은 saveSession 이 찍는다 */
export type StoredDraft = Omit<StoredSession, 'savedAt'>;

/**
 * 받은 내용을 그대로 저장한다 (비어 있으면 지운다).
 *
 * 무엇을 저장할지 고르는 일은 호출부가 한다 — 그래야 호출부가 "저장할 내용"
 * 하나만 바라보면 되고, 저장 대상 필드가 늘어나도 변경 감지를 따로 챙길 일이 없다.
 */
export function saveSession(draft: StoredDraft): void {
  if (typeof window === 'undefined') return;

  // 쿼터를 지키기 위한 상한. 내용 정리는 호출부가 끝낸 상태로 들어온다.
  const kept = draft.instructions.slice(0, MAX_INSTRUCTIONS);

  try {
    if (!kept.length) {
      localStorage.removeItem(KEY);
      cache = null;
      return;
    }
    const payload: StoredSession = { ...draft, instructions: kept, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
    cache = payload;
  } catch {
    // 쿼터 초과·사생활 보호 모드 — 저장 실패가 편집을 막아서는 안 된다
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
  cache = null;
}
