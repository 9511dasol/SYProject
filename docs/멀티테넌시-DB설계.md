# 멀티테넌시 개편 — 2단계 DB 설계

- 작성일: 2026-11-25
- 상태: **구현 완료** (2026-11-25 — 리비전 0012~0014, 마이그레이션 테스트 10건 포함 전체 테스트 통과)
- 상위 문서: [멀티테넌시-개편-기획확정.md](멀티테넌시-개편-기획확정.md)
- 기준: 2026-11-25 현재 모델 전수 조사 (테이블 14종, Alembic head `0011_rank_api_collect`)

---

## 1. 한 줄 요약

신규 테이블 2종(`companies`, `audit_logs`)을 만들고, **테넌트 소속 테이블 11종 전부에 `company_id`를 직접 추가**하며, `users`는 역할 4종 체계로 전환합니다. 마이그레이션은 3개 리비전(0012~0014)으로 나누어 "생성 → 백필 → 제약 강제" 순서로 진행하므로 기존 데이터("sy" 귀속)와 로컬 SQLite 환경 모두 안전합니다.

## 2. 설계 원칙 3가지

1. **모든 테넌트 테이블은 `company_id`를 직접 보유합니다.** 조인으로 소속을 추적할 수 있는 테이블(예: `keyword_rank_snapshot` → `keyword_watch`)도 비정규화해서 직접 갖습니다. 이유: ⑥단계 RLS 정책을 조인 없는 단순 비교(`company_id = current_setting(...)`)로 유지해야 성능·정확성 모두 지킬 수 있고, 리포지토리 강제 스코핑도 테이블마다 같은 패턴이 됩니다.
2. **불변식은 코드가 아니라 DB 제약으로 강제합니다.** "기업당 admin 1개"(partial unique index), "dev만 무소속"(CHECK), "기업당 예산 1행"(unique) — 애플리케이션 버그로도 깨질 수 없게 합니다.
3. **파괴적 변경 없이 3단계(추가 → 백필 → 강제)로 갑니다.** 컬럼은 nullable로 먼저 추가하고, 기존 데이터를 sy로 백필한 뒤, NOT NULL·FK·인덱스를 겁니다. 각 리비전은 실패 시 독립적으로 재시도 가능합니다.

## 3. 신규 테이블

### 3.1 `companies`

| 컬럼 | 타입 | nullable | default | 비고 |
|---|---|---|---|---|
| id | Integer PK | N | autoincrement | |
| name | String(100) | N | — | **unique** |
| is_active | Boolean | N | `True` | `False`면 소속 계정 전원 로그인·refresh 차단 |
| is_trial | Boolean | N | `False` | 체험 샌드박스 기업 표시 |
| expires_at | DateTime(tz) | ✅ | — | trial 전용. 경과 시 로그인 차단 + 정리 잡이 물리 삭제 |
| created_at | DateTime(tz) | N | `func.now()` | |

- 인덱스: `(is_trial, expires_at)` — 정리 잡이 "만료된 trial"을 바로 찾는 용도.
- 실기업 삭제는 soft delete(`is_active=false`)가 기본입니다. 물리 삭제(DELETE)는 trial 정리 잡 전용이며, 하위 데이터는 FK CASCADE로 함께 소멸합니다(4.2장).

### 3.2 `audit_logs`

| 컬럼 | 타입 | nullable | default | 비고 |
|---|---|---|---|---|
| id | Integer PK | N | autoincrement | |
| actor_user_id | Integer | N | — | FK 없음 (계정 삭제 후에도 기록 보존) |
| actor_email | String(255) | N | `""` | 행위 시점 스냅샷 |
| actor_role | String(10) | N | — | 행위 시점 스냅샷 |
| action | String(50) | N | — | 예: `company.create`, `user.role_change`, `data.view_as_dev` |
| target_type | String(30) | N | `""` | 예: `company`, `user`, `budget` |
| target_id | String(64) | N | `""` | 문자열 통일 (`background_tasks`가 UUID PK라 Integer 불가) |
| company_id | Integer | ✅ | — | **대상** 기업. 전역 행위(플래그 변경 등)는 NULL. FK 없음 — 기업 삭제 후에도 감사 기록은 남김 |
| detail | PORTABLE_JSON | N | `{}` | 변경 전/후 값 등 |
| created_at | DateTime(tz) | N | `func.now()` | |

- 인덱스: `created_at`(DESC 조회), `(company_id, created_at)`, `actor_user_id`.
- **감사 로그는 불변(append-only)입니다** — UPDATE/DELETE API를 만들지 않습니다. dev의 기업 데이터 열람(`data.view_as_dev`)은 기획 확정 사항대로 필수 기록입니다.

## 4. 기존 테이블 변경

### 4.1 `users` — 역할 4종 전환

| 변경 | 내용 |
|---|---|
| `company_id` 추가 | Integer, FK → `companies.id` **ON DELETE CASCADE**, **dev만 NULL 허용** |
| `role` 값 체계 | `dev` \| `admin` \| `member` \| `trial` (기존 `user` → `member`로 데이터 변환, 기본값도 `member`로) |
| CHECK 제약 | `(role = 'dev') = (company_id IS NULL)` — dev는 무소속, 그 외는 반드시 소속 |
| **admin 1개 강제** | `CREATE UNIQUE INDEX uq_one_admin_per_company ON users (company_id) WHERE role = 'admin'` — partial unique index (Postgres·SQLite 모두 지원) |
| 인덱스 | `company_id` |

백필 규칙(0012 리비전 내 데이터 이행):
- 기존 전 계정 → sy 소속.
- 기존 `role='user'` → `member`.
- 기존 admin이 **여러 명이면 id가 가장 작은 1명만 admin 유지**, 나머지는 `member`로 강등 — 이렇게 해야 partial unique index가 실패 없이 걸립니다.
- **dev 계정 승격은 마이그레이션에 넣지 않습니다.** 특정 이메일 하드코딩은 마이그레이션의 결정성(어느 DB에서나 같은 결과)을 깨므로, 1회성 운영 스크립트(③단계에서 제공)로 분리합니다.

### 4.2 테넌트 컬럼 전파 — 11개 테이블

공통 사양: `company_id` Integer, **NOT NULL**(예외 1건 아래 명시), FK → `companies.id` **ON DELETE CASCADE**. CASCADE를 쓰는 이유: trial 기업 물리 삭제가 `DELETE FROM companies WHERE id=?` 1문으로 하위 데이터까지 완결되고, 실기업은 soft delete가 기본이라 CASCADE가 실행될 일이 없습니다.

| 테이블 | NOT NULL | 추가 인덱스 | 유니크 제약 변경 |
|---|---|---|---|
| `marketing_period_meta` | ✅ | `company_id` | `uq(year,month)` → **`uq(company_id,year,month)`** |
| `marketing_data` | ✅ | **`(company_id, report_date)`** | — |
| `ai_tool_usage_logs` | ✅ | **`(company_id, created_at)`** — 기업별 월 예산 합산 쿼리용 | — |
| `report_log` | ✅ | `(company_id, created_at)` | — |
| `heading_suggestions` | ✅ | `(company_id, created_at)` | — |
| `keyword_watch` | ✅ | `company_id` | `uq(keyword,device)` → **`uq(company_id,keyword,device)`** — 다른 기업이 같은 키워드 감시 가능해야 함 |
| `keyword_rank_snapshot` | ✅ | `company_id` | 기존 유지 (`watch_id`가 이미 기업 종속) |
| `rank_alert_log` | ✅ | `(company_id, created_at)` | — (watch가 SET NULL로 떨어져도 기업 귀속은 유지됨) |
| `undo_snapshots` | ✅ | `company_id` | — |
| `document_embedding` | ✅ | `company_id` | — |
| `background_tasks` | **✅ nullable** | `(company_id, created_at)` | — 기업 무관 전역 시스템 잡(크론 등)은 NULL, 사용자 발 작업은 반드시 기록 |

`system_settings`는 **변경 없음** — 전역 유지 결정(기획 확정 #4).

### 4.3 `ai_usage_budget` — 싱글턴 → 기업당 1행

| 변경 | 내용 |
|---|---|
| `company_id` 추가 | NOT NULL, **unique**, FK CASCADE — "기업당 예산 1행"을 DB가 강제 |
| `id` | autoincrement PK로 정상화 (기존 `default=1` 싱글턴 전제 제거) |
| 데이터 이행 | 기존 id=1 행이 있으면 그 `monthly_token_budget` 값을 sy 행으로 이전 |
| 운영 규칙 | trial 기업 발급 시 소액 기본 예산 행을 함께 생성 (수치는 구현 시 결정 — 기획 확정 10장) |

리포지토리는 `get(company_id)` 방식으로 바뀌며, `check_ai_budget`의 월 합산도 `(company_id, created_at)` 인덱스를 타는 기업 범위 쿼리가 됩니다 (구현은 ③단계).

## 5. 마이그레이션 계획 — 3개 리비전 (head: `0011_rank_api_collect`)

`back/MIGRATIONS.md` 규칙 준수: autogenerate 후 수동 검토 필수, 리비전 ID 32자 이내, 앱 기동 시 자동 `upgrade head`.

| 리비전 | 내용 | 핵심 주의점 |
|---|---|---|
| **`0012_companies_roles`** | ① `companies` 생성 + **sy 1건 시드** ② `users.company_id` nullable 추가 → 전원 sy 백필 ③ `user`→`member` 변환 + 중복 admin 강등 ④ CHECK·FK·partial unique index 적용 | 데이터 이행과 제약 적용 순서 엄수 (강등 후에만 unique index 가능) |
| **`0013_tenant_columns`** | 11개 테이블에 `company_id` nullable 추가 → sy 백필 → NOT NULL + FK + 인덱스 + 유니크 제약 교체 (`background_tasks`만 nullable 유지, 유니크 교체는 drop→create 순서) | SQLite는 ALTER 제약이 커서 **`batch_alter_table` 필수**. 유니크 교체 시 기존 제약명 명시적 drop |
| **`0014_audit_budget`** | ① `audit_logs` 생성 ② `ai_usage_budget`에 `company_id` unique 추가 + 기존 id=1 값 sy로 이전 | 예산 행이 없는 DB(신규 설치)에서도 멱등 동작 |

롤백(downgrade)은 각 리비전에 작성하되, 0013의 downgrade는 company_id 컬럼 제거이므로 **운영 DB에서는 사실상 전진 전용**임을 주석으로 명시합니다.

### SQLite(로컬 검증 환경) 호환 체크리스트

- `batch_alter_table`로 ADD CONSTRAINT/NOT NULL 전환 (SQLite는 직접 ALTER 불가)
- partial unique index: SQLite 3.8+ 지원 — 로컬에서도 동일하게 동작
- `PORTABLE_JSON`(JSONB↔JSON variant) 기존 패턴 그대로 사용
- pgvector(`document_embedding`)는 autogenerate가 놓치므로 수동 확인 (MIGRATIONS.md 기지 사항)

## 6. 이 설계가 미리 깔아두는 것 (후속 단계 연계)

- **③ 백엔드 가드**: 모든 테넌트 테이블이 같은 모양(`company_id` 직접 보유)이므로, `TenantContext` 주입 리포지토리가 단일 패턴(`WHERE company_id = :ctx`)으로 전 테이블을 커버합니다. JWT claim에는 `company_id`가 추가됩니다.
- **⑥ RLS**: 정책이 전 테이블 동일 형태가 됩니다 — `USING (company_id = current_setting('app.current_company_id')::int)`. 조인 기반 정책이 없어 성능 함정이 없습니다.
- **⑦ 격리 테스트**: "A기업 토큰으로 B기업 행 접근 → 404" 테스트가 테이블 목록(4.2장 표)을 그대로 순회하면 됩니다.

## 7. 확인 사항 — 전부 확정됨 (2026-11-25)

1. **dev 승격 대상**: `soluda1114` (로 시작하는 계정 — 스크립트가 정확한 이메일을 찾아 승격).
2. 0012~0014 **3개 리비전 분할**: 동의.
3. `background_tasks`만 company_id nullable 예외: 동의.

## 8. 구현 결과 (2026-11-25)

| 산출물 | 위치 |
|---|---|
| 신규 모델 | `back/app/models/company_model.py`, `audit_log_model.py` |
| 테넌트 컬럼 전파 | 기존 모델 11종 + `users` + `ai_usage_budget` 수정 |
| 마이그레이션 | `migrations/versions/20261125_*_0012~0014_*.py` |
| dev 승격 스크립트 | `back/scripts/promote_dev.py` — `python scripts/promote_dev.py soluda1114` |
| 마이그레이션 테스트 | `tests/test_multitenancy_migrations.py` (구 스키마 전환·admin 1개 강제·유니크 재범위·멱등 10건), `tests/test_rank_monitor_migrations.py` 체인 확장 |
| 최소 호환 수정 | 역할 리터럴 4종 전환(backend `UserRole`·front 라벨/옵션), `require_admin`이 dev 허용, `require_dev` 신설, 타입 코드젠 재생성 |

### 구현 노트 (설계와 다른 점·과도기 장치)

- **SQLite 방언에서는 FK 를 걸지 않습니다.** SQLite 는 `ALTER` 로 FK 를 더할 수 없고 FK 강제(PRAGMA)도 꺼진 로컬 전용 방언이라, 컬럼만 추가합니다. 운영(Postgres)은 설계대로 FK + CASCADE.
- **과도기 `server_default="1"`**: 기존 코드가 아직 company_id 를 전달하지 않으므로, 새 행이 자동으로 sy(id=1)에 귀속되게 해 앱이 중단 없이 돌아갑니다. ③단계(테넌트 스코핑)에서 전 경로가 명시 전달하게 되면 제거합니다. **sy 가 id=1 이라는 사실이 이 장치의 전제**입니다 (0012 가 명시 시드).
- 기존 admin 이 여러 명인 DB 는 id 최소 1명만 admin 으로 남고 나머지는 member 로 강등됩니다.
- dev 승격 시 해당 기업의 admin 자리가 비면 스크립트가 경고를 출력합니다 (partial unique 는 0명을 허용).
