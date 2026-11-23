/** 키워드 성과 비교 — 백엔드 OpenAPI 에서 생성된 타입을 가리킨다.
 *
 *  예전에는 백엔드가 `-> dict` 로 열려 있어 이 구조를 손으로 적어 두고 있었다.
 *  백엔드에 Pydantic 계약을 세워, 이제 어긋나면 타입 검사에서 걸린다.
 */

import type { components } from '@/types/api.generated';

type S = components['schemas'];

export type CompareRow = S['CompareRow'];
export type RowStatus = CompareRow['status'];
export type SheetSummary = S['SheetSummary'];
export type CompareSheet = S['CompareSheet'];
export type SkippedSheet = S['SkippedSheet'];
export type CompareResult = S['CompareResult'];
