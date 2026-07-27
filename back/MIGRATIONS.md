# DB 마이그레이션 가이드 (Alembic)

DB 스키마는 **Alembic**으로 버전 관리한다. 예전처럼 `app/main.py` 에서
`create_all` 이나 인라인 `ALTER TABLE` 로 스키마를 만들지 않는다.

- 설정: [`alembic.ini`](alembic.ini) (DB URL은 여기 두지 않음)
- 실행 환경: [`migrations/env.py`](migrations/env.py) — `.env` 의 `DATABASE_URL` 을 그대로 사용
- 리비전: [`migrations/versions/`](migrations/versions/)
- 앱 시작 시 [`app/main.py`](app/main.py) 의 `_run_migrations()` 가 자동으로 `alembic upgrade head` 를 실행한다.

모든 명령은 `back/` 디렉토리에서 실행한다.

## 현재 상태로 처음 도입할 때

`0001_baseline` 리비전은 **멱등(idempotent)** 하게 작성돼 있다:

- `CREATE EXTENSION IF NOT EXISTS vector`
- `Base.metadata.create_all(checkfirst=True)` → 없는 테이블만 생성
- 구버전 DB용 누락 컬럼 보정 `ALTER ... IF NOT EXISTS`

따라서 **신규 DB든 기존 운영 DB(이미 create_all 로 테이블이 있는 상태)든**
아래 한 줄이 안전하게 동작한다(기존 DB에서는 `alembic_version` 테이블만 추가되고 나머지는 no-op):

```bash
uv run alembic upgrade head
```

> 앱을 그냥 실행(`fastapi run app/main.py`)해도 시작 시 자동으로 위가 수행되므로,
> 별도 수동 실행 없이 배포/기동만으로 스키마가 맞춰진다.

## 앞으로 스키마를 바꿀 때 (표준 흐름)

1. `app/models/` 의 모델을 수정한다.
2. 자동으로 diff 를 떠서 새 리비전을 만든다:
   ```bash
   uv run alembic revision --autogenerate -m "설명"
   ```
3. `migrations/versions/` 에 생성된 파일의 `upgrade()`/`downgrade()` 를 **반드시 검토**한다.
   - autogenerate 가 놓치는 것: 인덱스 이름 변경, 컬럼 타입 미세 변경, 서버 기본값,
     `pgvector` 관련 DDL 등. 필요하면 손으로 보정한다.
4. 적용:
   ```bash
   uv run alembic upgrade head
   ```

## 자주 쓰는 명령

```bash
uv run alembic current          # 현재 DB가 어느 리비전인지
uv run alembic history          # 리비전 이력
uv run alembic downgrade -1     # 한 단계 되돌리기
uv run alembic upgrade head --sql   # 실제 적용 없이 SQL만 출력 (리뷰용)
```

## 주의

- `alembic.ini` 는 **ASCII 로만** 작성한다. configparser 가 Windows 로케일 인코딩
  (cp949)으로 읽어서 한글 주석이 있으면 `UnicodeDecodeError` 가 난다.
  (`env.py` 등 파이썬 파일은 UTF-8 이라 한글 주석 OK)
- 여러 인스턴스가 동시에 콜드스타트하면 `upgrade` 가 경쟁할 수 있다. 현재는 소규모
  단일 인스턴스 전제라 문제없지만, 인스턴스를 늘릴 경우 마이그레이션을 배포 단계
  (예: Cloud Build/별도 job)로 분리하는 것을 권장한다.
