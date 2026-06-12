# 배포 후 남은 작업

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