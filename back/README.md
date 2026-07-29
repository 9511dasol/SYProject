# 백엔드 (FastAPI)

마케팅 AI 분석기의 API 서버입니다. 광고 데이터 집계, AI 코멘트 생성, 리포트 메일 발송, 이미지·문구 AI 도구를 제공합니다.

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | FastAPI (Python 3.14), uvicorn |
| ORM · 마이그레이션 | SQLAlchemy 2.0 (sync 세션), Alembic |
| 데이터베이스 | PostgreSQL (Supabase) + pgvector |
| 데이터 처리 | pandas, openpyxl |
| AI | OpenAI · Anthropic Claude · Google Gemini (교체 가능 구조) |
| 메일 | Resend / SMTP |
| 스케줄러 | APScheduler |
| 인증 | JWT (PyJWT) + bcrypt |
| 테스트 · 린트 | pytest, ruff |

---

## 1. 요구 사항

| 항목 | 버전 | 비고 |
|---|---|---|
| Python | **3.14 이상** | `pyproject.toml`의 `requires-python` |
| [uv](https://docs.astral.sh/uv/) | 최신 | 의존성·가상환경 관리 |
| PostgreSQL | 14 이상 | `vector` 확장 사용 |

---

## 2. 빠른 시작

```bash
cd back

# 1) 의존성 설치 (.venv 자동 생성)
uv sync

# 2) 환경 변수 파일 작성
#    아래 3절을 참고해 .env 생성

# 3) 개발 서버 실행 → http://127.0.0.1:8000
uv run uvicorn app.main:app --reload
```

- API 문서: http://127.0.0.1:8000/docs
- 헬스체크: http://127.0.0.1:8000/healthz

개발 환경에서는 기동 시 **Alembic 마이그레이션이 자동 적용**됩니다(`RUN_MIGRATIONS_ON_STARTUP` 기본값이 `개발=true / 운영=false`). 즉 DB만 준비돼 있으면 위 세 줄로 테이블까지 만들어집니다.

### 기동 로그 읽는 법

```
기동 1/2: DB 마이그레이션 적용 (alembic upgrade head)
기동 1/2 완료: 마이그레이션 적용됨 (0.8s)
기동 2/2 완료 — 이제 포트를 엽니다
APScheduler started
```

`기동 1/2`에서 멈춘다면 `DATABASE_URL` 접속 문제입니다. 포트가 열리기 **전에** 실패하므로, 이 로그가 원인을 알려주는 유일한 단서입니다.

---

## 3. 환경 변수

`back/.env`에 작성합니다. (`app/core/settings.py`가 단일 정의처입니다)

### 필수

| 키 | 설명 |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg2://user:pass@host:5432/dbname` |
| `SECRET_KEY` | JWT 서명 키. **운영에서는 32자 이상 강제** (`openssl rand -base64 32`) |
| `CORS_ORIGINS` | 허용 오리진, 쉼표 구분 (기본 `http://localhost:3000`) |

### AI

| 키 | 기본값 | 설명 |
|---|---|---|
| `LLM_PROVIDER` | `openai` | `openai` · `claude` · `gemini` 중 선택 — **리포트 코멘트 생성에 쓸 모델** |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | / `gpt-4o-mini` | |
| `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` | / `claude-opus-4-8` | |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | / `gemini-2.5-flash` | 헤딩 문구 추천에 사용 |
| `GEMINI_IMAGE_MODEL` | `gemini-2.5-flash-image` | 이미지 정제 · AI 업스케일에 사용 |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | 임베딩 적재 스크립트용 (9절 참고) |

### 메일 · 자동 발송

| 키 | 기본값 | 설명 |
|---|---|---|
| `MAIL_ENABLED` | `true` | `false`면 메일 라우터와 월간 크론이 아예 등록되지 않습니다 |
| `MAIL_PROVIDER` | `smtp` | `resend` 또는 `smtp` |
| `RESEND_API_KEY` / `RESEND_FROM` | | Resend 사용 시 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM` | `smtp.gmail.com` / `465` | SMTP 사용 시 |
| `REPORT_CRON_DAY` / `REPORT_CRON_HOUR` | `1` / `9` | 매월 1일 09시 자동 발송 |
| `REPORT_AUTO_RECIPIENTS` | | 쉼표 구분. 비어 있으면 자동 발송을 건너뜁니다 |

### 스토리지 · 보안 · 제한

| 키 | 기본값 | 설명 |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` | / / `marketing-reports` | 엑셀 원본 저장 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` | `60` / `14` | |
| `LOGIN_MAX_FAILED_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | `5` / `15` | 연속 실패 시 계정 잠금 |
| `RATE_LIMIT_ENABLED` / `RATE_LIMIT_LOGIN` / `RATE_LIMIT_AI` | `true` / `10/minute` / `30/hour` | |
| `MAX_DATA_UPLOAD_MB` / `MAX_REQUEST_MB` | `50` / `100` | |
| `ENVIRONMENT` | `development` | `production`이면 기동 시 설정 검증이 강화됩니다 |
| `RUN_MIGRATIONS_ON_STARTUP` | (자동) | 미지정 시 개발=true, 운영=false |

> `ENVIRONMENT=production`으로 기동하면 `SECRET_KEY` 길이, `DATABASE_URL`이 localhost인지, `CORS_ORIGINS` 설정 여부를 검사하고 문제가 있으면 **기동을 거부**합니다.

---

## 4. 마이그레이션

```bash
uv run alembic upgrade head              # 최신 스키마로 적용
uv run alembic revision --autogenerate -m "설명"   # 새 리비전 생성
uv run python scripts/migrate.py upgrade # 배포 파이프라인용 엔트리포인트
uv run python scripts/migrate.py check   # 적용 없이 상태만 점검
```

`0001_baseline`은 멱등하게 작성돼 있어 신규 DB와 기존 운영 DB 모두에 안전하게 적용됩니다. 자세한 규칙은 **[MIGRATIONS.md](MIGRATIONS.md)** 를 참고하세요.

---

## 5. 테스트

```bash
uv run pytest                    # 전체 (테스트 모듈 23개)
uv run pytest tests/test_analysis_service.py -v
uv run pytest --cov              # 커버리지
uv run ruff check .              # 린트
```

`asyncio_mode = "auto"`라 `async def` 테스트에 마커가 필요 없습니다.

---

## 6. 레이어 구조

```
routers/       HTTP 경계 — 검증 · 권한 · 응답 스키마
   ↓
services/      비즈니스 로직 — 집계 · AI 호출 · 메일 · 엑셀
   ↓
repositories/  데이터 접근 — 쿼리를 여기에 가둡니다
   ↓
models/        SQLAlchemy 모델
```

`core/`에는 횡단 관심사가 모여 있습니다 — 설정(`settings.py`), 인증(`security.py`), 기능 플래그(`feature_flags.py`), AI 예산(`ai_budget.py`), 레이트 리밋(`rate_limit.py`), 업로드 제한(`uploads.py`).

라우터는 15개 파일, 엔드포인트는 약 56개입니다.

---

## 7. 처리 파이프라인

### 7.1 데이터 업로드 → KPI 집계

`POST /api/marketing/upload` — [marketing_service.py](app/services/marketing_service.py)

```
CSV 업로드 (여러 개 동시 가능)
   ↓ 인코딩·헤더 자동 감지 (네이버 보고서는 1행이 제목이라 건너뜀)
   ↓ 파일 성격 자동 분류: 매체 실적 / 전환 데이터
   ↓ 매체 판별 — 캠페인유형 컬럼으로 매핑
   │    파워링크 → 네이버SA
   │    브랜드검색/신제품검색 → 네이버BS
   │    파워컨텐츠 → 네이버PSA
   │    검색 → 구글SA
   │    (매핑에 없는 유형 → 카카오SA로 집계)
   ↓ 일자×매체 단위 KPI 계산 (노출·클릭·비용·전환·매출 → CTR·CPC·CPA·ROAS)
   ↓ 매체 실적 + 전환 데이터 병합
   ↓ 업로드 직전 상태를 undo 스냅샷으로 저장
   ↓ DB upsert (연·월 단위)
```

- 업로드는 **백그라운드 태스크**로 실행되고 `task_id`를 즉시 반환합니다 (7.6절).
- `POST /api/marketing/undo/{undo_id}`로 업로드 직전 상태로 되돌립니다.
- 엑셀 원본은 Postgres가 아니라 **Supabase Storage**에 올립니다 — 큰 바이너리를 커넥션 풀러로 보내면 메시지 크기 제한에 걸려 연결이 끊기기 때문입니다.

### 7.2 리포트 메일 파이프라인 (LLM 체인) ⭐

이 프로젝트의 핵심 체인입니다. 조립은 [report_factory.py](app/services/report_factory.py), 실행은 [report_orchestrator.py](app/services/report_orchestrator.py)가 담당합니다.

```mermaid
flowchart TD
    A[요청: 당월 · 전월 지정] --> B[AnalysisService.compare<br/>SQL 집계]
    B --> C[PeriodComparison<br/>매체별 KPI · 변화율 · 3개월 추세]
    C --> D[Jinja2 렌더<br/>prompts/monthly_report.j2]
    D --> E[AbstractLLMClient.generate_with_usage<br/>Claude / Gemini / OpenAI]
    E --> F[코멘트 텍스트 + 토큰 사용량]
    F --> G[AI 사용량 즉시 기록<br/>ai_tool_usage_logs]
    F --> H[ReportBuilderService<br/>HTML 조립]
    H --> I[AbstractMailSender<br/>Resend / SMTP]
    I --> J[ReportLog 저장<br/>성공·실패 무관하게 기록]
```

**단계별 설계 의도**

| 단계 | 파일 | 설계 포인트 |
|---|---|---|
| 집계 | [analysis_service.py](app/services/analysis_service.py) | 수치 계산은 **전부 SQL·파이썬**이 합니다. LLM에게 계산을 시키지 않아 숫자가 틀릴 여지를 없앴습니다 |
| 추세 판정 | 〃 | 3개월 데이터가 있으면 `2개월 연속 증가` · `반등` · `조정` 같은 **추세 라벨을 코드가 먼저 붙입니다** |
| 프롬프트 | [prompts/monthly_report.j2](app/templates/prompts/monthly_report.j2) | 표 형태로 수치를 주입하고, *"주어진 데이터에 없는 수치는 만들지 마세요"* 로 환각을 차단합니다 |
| LLM 호출 | [llm/](app/services/llm/) | `AbstractLLMClient` 인터페이스 + `build_llm()` 팩토리 → **환경변수 하나로 제공사 교체** |
| 사용량 기록 | [ai_usage.py](app/services/ai_usage.py) | 메일 발송보다 **먼저** 기록합니다. 발송이 실패해도 토큰은 이미 소모됐기 때문입니다 |
| 로그 | `finally` 블록 | 성공·실패 모두 `ReportLog`에 남아 관리자 화면에서 재발송할 수 있습니다 |

### 7.3 헤딩 문구 추천 (Vision 체인)

[heading_service.py](app/services/heading_service.py)

```
원본 이미지
   ↓ Pillow로 512×512 JPEG 썸네일 (메모리 내) — 토큰·지연 절감
   ↓ Gemini Vision 호출
   │    system_instruction: 플랫폼별 스타일 가이드
   │      Instagram 4개(20자 이내·이모지) / Blog 3개(SEO·20~40자) / YouTube 3개(호기심 유발·20~35자)
   │    response_mime_type: application/json  ← JSON 강제
   ↓ 마크다운 코드블록 제거 → JSON 파싱 → Pydantic 검증
   ↓ 10개 미달이거나 파싱 실패 시 최대 2회 재시도 (best-of 채택)
   ↓ 히스토리 저장 (썸네일 포함) + 토큰 사용량 기록
```

전량 실패는 모든 시도에서 파싱조차 되지 않은 경우에만 발생합니다. 부분 성공 시에는 **가장 많이 얻은 결과를 반환**합니다.

### 7.4 이미지 정제 · AI 업스케일

[image_ai_edit_service.py](app/services/image_ai_edit_service.py) — Gemini 이미지 모델(`GEMINI_IMAGE_MODEL`)에 원본 이미지와 사용자 프롬프트를 함께 전달해 편집 결과 이미지를 받습니다. 업스케일은 고정 프롬프트를 쓰는 같은 경로입니다.
리사이즈 자체([image_resize_service.py](app/services/image_resize_service.py))는 Pillow 기반이라 AI를 쓰지 않습니다.

### 7.5 키워드 성과 비교 — **AI를 쓰지 않습니다**

[keyword_compare_service.py](app/services/keyword_compare_service.py)는 업로드된 엑셀 시트에서 헤더 위치를 자동 탐지하고, 기간을 파싱해 이번/이전 구간을 pandas로 대조한 뒤 행 단위 상태(증가·감소·신규·이탈)를 **규칙으로** 판정합니다. 결정적인 계산이라 LLM을 끼우지 않았습니다.

### 7.6 백그라운드 작업 파이프라인

[task_store.py](app/services/task_store.py) — 상태를 메모리가 아니라 **DB(`background_tasks`)에 저장**합니다. Cloud Run처럼 인스턴스가 여러 개이거나 재시작되는 환경에서 메모리 큐는 진행률을 잃기 때문입니다.

```
POST /upload → task_id 즉시 반환
   ↓ 워커가 진행률(update_task)을 주기적으로 기록
   ↓ 클라이언트는 GET /status/{task_id} 폴링
   ↓ 완료 시 결과 파일은 result blob으로 보관 → 1회 다운로드 후 소멸
   ↓ 취소 지원 (is_cancelled 확인 지점마다 중단)
   ↓ 만료 행은 1시간마다 APScheduler가 정리
```

### 7.7 월간 자동 리포트 크론

[main.py](app/main.py) — `MAIL_ENABLED=true`일 때만 등록됩니다. 매월 `REPORT_CRON_DAY`일 `REPORT_CRON_HOUR`시에 전월/전전월을 자동으로 계산해 7.2의 파이프라인을 그대로 실행합니다. 실행 주체가 사람이 아니므로 AI 사용량 로그의 `user`는 `None`으로 남습니다.

---

## 8. AI 비용·안전장치

| 장치 | 위치 | 동작 |
|---|---|---|
| 월간 토큰 예산 | [core/ai_budget.py](app/core/ai_budget.py) | 이번 달 누적 토큰이 예산 이상이면 **429로 차단**. 예산 0 이하는 미설정으로 간주 |
| 사용량 로깅 | [services/ai_usage.py](app/services/ai_usage.py) | 도구·사용자·라벨·토큰 단위로 `ai_tool_usage_logs`에 기록 |
| 레이트 리밋 | [core/rate_limit.py](app/core/rate_limit.py) | 로그인 `10/minute`, AI 엔드포인트 `30/hour` (slowapi) |
| 기능 플래그 | [core/feature_flags.py](app/core/feature_flags.py) | 관리자가 기능별로 차단 |

> 토큰 수는 호출 **후에야** 알 수 있어 정확한 선차감이 불가능합니다. 마지막 한 건은 예산을 조금 넘길 수 있습니다 — 의도된 동작이며 코드 주석에도 명시돼 있습니다.

---

## 9. 벡터 검색(RAG) 현황 — **적재까지만 구현, 검색은 미연결**

오해를 막기 위해 현재 상태를 그대로 적습니다.

### 구현되어 있는 것

| 구성 요소 | 위치 | 내용 |
|---|---|---|
| pgvector 확장 | [migrations/…_baseline.py](migrations/versions/) | `CREATE EXTENSION IF NOT EXISTS vector` |
| 임베딩 테이블 | [models/embedding_model.py](app/models/embedding_model.py) | `document_embedding` — `source_type` · `source_id` · `content` · `embedding Vector(1536)` |
| 적재 스크립트 | [init_vectordb.py](init_vectordb.py) | `marketing_period_meta`의 월간 코멘트를 OpenAI `text-embedding-3-small`로 임베딩해 저장 (중복 건너뜀) |

```bash
uv run python init_vectordb.py   # 확장 활성화 + 테이블 생성 + 기존 코멘트 임베딩 적재
```

### 아직 없는 것

- **검색(retrieval) 단계가 없습니다.** 코드 어디에서도 벡터 유사도 질의(`cosine_distance` / `l2_distance` / `max_inner_product`)를 하지 않으며, `DocumentEmbedding`을 읽는 곳은 위 적재 스크립트뿐입니다.
- **RAG 체인 · RAG 그래프가 없습니다.** `langgraph`가 `pyproject.toml`에 선언돼 있지만 `app/` 어디에서도 import하지 않습니다. 그래프 오케스트레이션은 사용하지 않습니다.

### 그래서 현재 코멘트 생성 방식은

RAG가 아니라 **구조화된 컨텍스트 주입(structured context injection)** 입니다. 검색으로 관련 문서를 찾아오는 대신, 필요한 수치를 SQL로 결정적으로 집계해 프롬프트 표에 직접 채워 넣습니다(7.2절).

리포트 코멘트처럼 **필요한 컨텍스트가 무엇인지 미리 확정돼 있는** 작업에서는 이 방식이 검색보다 안전합니다. 검색이 엉뚱한 달을 가져올 위험도, 임베딩 비용도 없습니다.

### RAG를 완성하려면

과거 코멘트의 논조·표현을 참고하게 만들고 싶다면 다음 세 가지가 추가로 필요합니다.

1. **Retriever** — 질의 텍스트를 임베딩해 `document_embedding`에서 상위 N건을 찾는 함수 (pgvector 연산자 사용)
2. **컨텍스트 주입** — [monthly_report.j2](app/templates/prompts/monthly_report.j2)에 "과거 유사 기간 코멘트" 블록을 추가하고 검색 결과를 렌더
3. **증분 적재** — 코멘트가 저장·수정될 때 임베딩을 갱신 (현재는 수동 스크립트 1회 실행)

---

## 10. 배포

Cloud Build → Artifact Registry → Cloud Run(asia-northeast3) 순서로 나갑니다. [cloudbuild.yaml](cloudbuild.yaml) 기준 4단계입니다.

```
1. Docker 이미지 빌드 (uv 기반, 의존성 레이어 캐시)
2. Artifact Registry에 푸시
3. ★ 방금 빌드한 이미지로 마이그레이션 실행 (scripts/migrate.py upgrade)
4. Cloud Run 배포
```

**3번이 4번보다 먼저인 것이 핵심입니다.** 마이그레이션이 실패하면 파이프라인이 여기서 멈춰 새 리비전이 나가지 않습니다. 앱 기동 중에 마이그레이션을 돌리면 같은 실패가 Cloud Run에는 *"컨테이너가 PORT에서 리슨하지 못했다"* 로만 보여 원인을 찾을 수 없습니다.

`DATABASE_URL`은 Google Secret Manager에서 주입됩니다. 배포 관련 미완 항목은 [TODO_DEPLOY.md](TODO_DEPLOY.md)를 참고하세요.

---

## 11. 디렉터리 구조

```
back/
├── app/
│   ├── main.py            앱 조립 · 기동 순서 · 기능 플래그 기본값 · 스케줄러
│   ├── routers/           15개 라우터 (marketing · auth · heading · admin 등)
│   ├── services/
│   │   ├── llm/           AbstractLLMClient + Claude · Gemini · OpenAI 구현
│   │   ├── mail/          AbstractMailSender + Resend · SMTP 구현
│   │   ├── analysis_service.py       KPI 집계 · 추세 판정
│   │   ├── comment_service.py        프롬프트 렌더 + LLM 호출
│   │   ├── report_orchestrator.py    분석→코멘트→HTML→발송 파이프라인
│   │   ├── marketing_service.py      CSV 파싱 · 매체 판별 · KPI 계산
│   │   ├── excel_service.py          리포트 엑셀 생성
│   │   └── task_store.py             DB 기반 백그라운드 작업 상태
│   ├── repositories/      쿼리 계층
│   ├── models/            SQLAlchemy 모델
│   ├── schemas/           Pydantic 요청·응답 스키마
│   ├── templates/
│   │   ├── prompts/       LLM 프롬프트 (Jinja2)
│   │   └── email/         리포트 메일 HTML
│   ├── assets/            리포트 엑셀 템플릿
│   └── core/              설정 · 보안 · 플래그 · 예산 · 리밋
├── migrations/            Alembic 리비전 7개
├── scripts/               migrate · 백필 · 템플릿 리셋
├── tests/                 pytest 모듈 23개
└── init_vectordb.py       pgvector 초기화 · 임베딩 적재 (9절)
```
