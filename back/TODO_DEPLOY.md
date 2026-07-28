# 배포 후 남은 작업

## DB 마이그레이션 — 앱 기동과 분리해서 실행 (적용됨)

운영(`ENVIRONMENT=production`)에서는 앱이 기동할 때 `alembic upgrade head`를
**자동 실행하지 않는다**. 대신 스키마 상태만 확인해 어긋나 있으면 ERROR 로그를 남기고
정상 기동한다. 기동 중에 마이그레이션이 실패하면 포트를 열지 못해 Cloud Run에는
"컨테이너가 PORT에서 리슨하지 못했다"로만 보이고 원인이 드러나지 않기 때문이다.
(실제로 DB에만 있고 코드에는 없는 리비전 때문에 서비스가 통째로 뜨지 못한 적이 있다.)

- 개발에서는 기본으로 자동 적용된다. `RUN_MIGRATIONS_ON_STARTUP`로 환경과 무관하게 강제 지정 가능.

### 배포 순서

1. **마이그레이션 먼저 적용** (실패하면 여기서 멈추고 새 리비전을 내보내지 않는다)
   ```powershell
   gcloud run jobs deploy back-api-migrate `
     --source=. --region=asia-northeast3 --project=syproject-20260612 `
     --command=python --args=scripts/migrate.py,upgrade `
     --set-secrets="DATABASE_URL=DATABASE_URL:latest" `
     --set-env-vars="ENVIRONMENT=production" `
     --max-retries=0 --task-timeout=10m

   gcloud run jobs execute back-api-migrate --region=asia-northeast3 --project=syproject-20260612 --wait
   ```
2. **서비스 배포**
   ```powershell
   gcloud run deploy back-api --source=. --region=asia-northeast3 --project=syproject-20260612
   ```

Job은 한 번 만들어두면 이후에는 `--source=.`로 다시 배포해 최신 코드로 갱신하면 된다.

### 상태 확인

```powershell
python scripts/migrate.py check    # exit 0 = 최신, exit 1 = 불일치
```

`ENVIRONMENT=production`은 `SECRET_KEY`·`CORS_ORIGINS`도 함께 검증하므로, Job에는
`DATABASE_URL`만 주고 `ENVIRONMENT`를 빼도 된다(그 경우 개발 기본값으로 동작).

### 브랜치 간 DB 공유 주의

feature 브랜치에서 마이그레이션을 만들어 **공용 Supabase DB**에 적용하면, 그 리비전을
모르는 main/운영 배포가 즉시 죽는다. 마이그레이션이 있는 브랜치는 별도 DB를 쓰거나,
브랜치를 main에 머지한 뒤에 적용할 것.

## APScheduler 월간 리포트 (보류)
- Cloud Run은 트래픽 없으면 인스턴스를 0개로 줄여서 `back/app/main.py`의
  `AsyncIOScheduler` 기반 월간 리포트 발송(매월 1일 9시)이 실행되지 않을 수 있음.
- 선택 가능한 해결책:
  1. **`--min-instances=1`** 설정 (코드 변경 없음, 항상 인스턴스 1개 유지로 약간의 비용 발생)
     ```powershell
     gcloud run services update back-api --region=asia-northeast3 --project=syproject-20260612 --min-instances=1
     ```
  2. **Cloud Scheduler + 보호된 HTTP 엔드포인트** (Cloud Run 권장 방식)
     - `main.py`의 내부 `AsyncIOScheduler` 제거
     - 리포트 발송 로직을 호출하는 보호된 엔드포인트 추가 (예: `POST /internal/monthly-report`, 인증 토큰 또는 OIDC 확인)
     - `gcloud scheduler jobs create http`로 매월 1일 9시 호출 작업 생성

## OPENAI_API_KEY / ANTHROPIC_API_KEY 등록 (보류)
- 현재 Cloud Run 배포에는 포함하지 않음 → LLM 관련 기능(리포트 생성, 임베딩 등) 비활성 상태
- 진행 방법:
  1. `.env`에 실제 키 값 채우기
  2. Secret Manager에 등록:
     ```powershell
     [System.IO.File]::WriteAllText("$env:TEMP\openai_key.txt", "<OPENAI_API_KEY 값>")
     gcloud secrets create OPENAI_API_KEY --data-file="$env:TEMP\openai_key.txt" --project=syproject-20260612
     Remove-Item "$env:TEMP\openai_key.txt"

     [System.IO.File]::WriteAllText("$env:TEMP\anthropic_key.txt", "<ANTHROPIC_API_KEY 값>")
     gcloud secrets create ANTHROPIC_API_KEY --data-file="$env:TEMP\anthropic_key.txt" --project=syproject-20260612
     Remove-Item "$env:TEMP\anthropic_key.txt"
     ```
  3. 서비스 계정에 접근 권한 부여:
     ```powershell
     gcloud secrets add-iam-policy-binding OPENAI_API_KEY --member="serviceAccount:388899786674-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor" --project=syproject-20260612
     gcloud secrets add-iam-policy-binding ANTHROPIC_API_KEY --member="serviceAccount:388899786674-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor" --project=syproject-20260612
     ```
  4. `gcloud run services update back-api --region=asia-northeast3 --project=syproject-20260612 --update-secrets="OPENAI_API_KEY=OPENAI_API_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest"`


리포트 발송 로그 — ReportLog 조회 + 실패 건 수동 재발송 버튼
업로드 데이터 관리 — MarketingPeriodMeta 목록 조회 및 삭제