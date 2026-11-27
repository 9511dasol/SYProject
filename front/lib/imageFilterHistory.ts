import { readableLogPrompt } from '@/lib/imageFilterPrompt';
import type { EditPromptRecord } from '@/types/imageFilter';

/** 대화 한 줄 — 전송 1회 (지시 + 보관된 결과 이미지) */
export interface HistoryEntry {
  recordId: number;
  text: string;
  at: number;
  /** 생성 당시 시안 장수 */
  variantCount: number;
  /** false 면 보관 기간(14일)이 지나 이미지가 삭제된 것 */
  imagesAvailable: boolean;
  /** 실제 보관된 장수 — 썸네일은 이 수만큼만 그린다 */
  imageCount: number;
}

/** 지난 작업 묶음 하나 — 같은 이미지에 보낸 지시들을 한 "대화"로 본다 */
export interface HistoryGroup {
  filename: string;
  latestAt: number;
  /** 최신순 — 화면 목록용. 대화(스레드)로 볼 때는 뒤집어 시간순으로 쓴다 */
  items: HistoryEntry[];
}

/**
 * 기록을 이미지(파일명)별로 묶는다.
 *
 * 한 이미지를 붙여 두고 지시를 거듭 보내는 것이 이 화면의 작업 단위라,
 * 파일명이 곧 "그때 그 작업"의 주제다. 결과를 이어서 편집한 경우 파일명이
 * `..._1` 처럼 갈라지는데, 억지로 합치지 않는다 — 어느 결과에서 이어 갔는지가
 * 오히려 정보다. 순서는 묶음·묶음 안 모두 최신이 먼저다(서버가 최신순을 준다).
 */
export function groupHistory(records: EditPromptRecord[]): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>();
  for (const record of records) {
    const key = record.image_filename || '(이름 없는 이미지)';
    const entry: HistoryEntry = {
      recordId: record.id,
      text: readableLogPrompt(record.prompt),
      at: Date.parse(record.created_at),
      variantCount: record.variant_count ?? 0,
      imagesAvailable: record.images_available ?? false,
      imageCount: record.image_count ?? 0,
    };
    const found = groups.get(key);
    if (found) found.items.push(entry);
    else groups.set(key, { filename: key, latestAt: entry.at, items: [entry] });
  }
  return [...groups.values()];
}

/** "3시간 전" 처럼 읽기 — 시각만 보여 주면 언제였는지 가늠이 안 된다 */
export function sinceText(savedAt: number): string {
  const minutes = Math.floor((Date.now() - savedAt) / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
