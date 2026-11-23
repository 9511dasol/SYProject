/** 리포트 발송 이력 — 백엔드 OpenAPI 에서 생성된 타입을 가리킨다. */

import type { components } from '@/types/api.generated';

type S = components['schemas'];

export type ReportLogItem = S['ReportLogOut'];
export type ReportLogStatus = ReportLogItem['status'];
export type ReportLogListResponse = S['ReportLogListResponse'];
export type ReportResendResponse = S['ReportResendResponse'];
