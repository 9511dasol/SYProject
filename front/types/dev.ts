/** dev(플랫폼 운영자) 화면 — 백엔드 OpenAPI 에서 생성된 타입을 가리킨다. */

import type { components } from '@/types/api.generated';

type S = components['schemas'];

export type DevCompany = S['CompanyOut'];
export type DevCompanyListResponse = S['CompanyListResponse'];
export type DevCompanyCreatePayload = S['CompanyCreate'];
export type DevAdminIssuePayload = S['AdminIssueRequest'];
export type DevUserItem = S['DevUserOut'];
export type DevUserCreatePayload = S['DevUserCreate'];
export type DevTrialCreatePayload = S['TrialCreate'];
export type DevTrialOut = S['TrialOut'];
export type DevAuditLog = S['AuditLogOut'];
export type DevAuditLogListResponse = S['AuditLogListResponse'];
