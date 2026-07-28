# 미해결 · 미확인 항목

확인이 필요하거나 알면서 남겨둔 것들을 모아둔다. 해결되면 해당 항목을 지우고,
새로 발견하면 아래에 덧붙인다.

최종 갱신: 2026-07-28

---

## 1. Excel "복구하시겠습니까?" 대화상자 — 미확인

**증상**: 내려받은 파일을 열면 *"'파일명'의 내용에 문제가 있습니다. 이 통합 문서의 내용을
최대한 복구하시겠습니까?"* 가 뜬다.

**상태**: 원인 미특정. 정적 분석으로 아래를 전부 확인했지만 모두 정상이었다.

- 패키지 관계(rels) 끊김 없음, `[Content_Types].xml` 일치
- `externalReferences` 선언과 rels 일치, 외부 링크 시트명 121개 템플릿과 동일
- 스타일 인덱스 범위 정상 (최대 505 / cellXfs 506)
- 셀 순서·중복·행번호 불일치 없음
- 계산 설정 정상 (`fullCalcOnLoad="1"`)
- 기간 시트 삭제로 인한 끊어진 참조 0건

Excel COM 자동화로 직접 열어 확인하려 했으나 개발 환경에서 COM 호출이 막혀 실패했고,
LibreOffice도 없어 검증 오라클이 없었다.

**다음 단계**: 그 사이 외부 통합문서 링크를 완전히 제거했으므로(아래 3번 참고) 증상이
사라졌을 가능성이 있다. **먼저 재현되는지 확인할 것.** 여전히 뜬다면 [예]를 눌렀을 때
Excel이 보여주는 복구 로그(`복구된 레코드: /xl/worksheets/sheet1.xml 부분의 …`)를
확보하면 어느 파트의 무엇이 문제인지 바로 특정된다.

---

## 2. Secret Manager 값에 BOM — 코드로 우회 중, 값 자체는 오염

**증상**: 배포 환경 다운로드가 `파일 보관 실패: 'ascii' codec can't encode character
'\ufeff' in position 7` 로 실패했다. `"Bearer "` 가 정확히 7글자라 position 7은 키의
첫 글자다 — `SUPABASE_SERVICE_ROLE_KEY` 값 맨 앞에 UTF-8 BOM이 붙어 있고, 그게
Authorization 헤더로 들어가 터졌다. 로컬 `.env` 에는 BOM이 없어 운영에서만 재현됐다.

**상태**: `app/core/settings.py` 가 모든 문자열 설정값의 BOM과 앞뒤 공백을 제거하므로
앱은 정상 동작한다. **다만 시크릿 값 자체는 여전히 오염 상태**라, 이 값을 쓰는 다른
도구나 스크립트는 똑같이 깨진다.

**할 일**: 시크릿을 BOM 없이 다시 저장한다.

```powershell
$P = "syproject-20260612"
$S = "SUPABASE_SERVICE_ROLE_KEY"
$f = "$env:TEMP\secret.bin"

gcloud secrets versions access latest --secret=$S --project=$P --out-file=$f
$text = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($f)).TrimStart([char]0xFEFF).Trim()
[System.IO.File]::WriteAllText($f, $text, [System.Text.UTF8Encoding]::new($false))
gcloud secrets versions add $S --data-file=$f --project=$P
Remove-Item $f
```

`[System.Text.UTF8Encoding]::new($false)` 의 `$false` 가 "BOM 붙이지 마라"는 뜻이다.
PowerShell의 `Out-File`·`Set-Content` 는 UTF-8 **BOM 포함**으로 저장되므로 쓰지 말 것.

다른 시크릿도 오염됐을 수 있다. 점검용:

```powershell
$P = "syproject-20260612"; $f = "$env:TEMP\chk.bin"
foreach ($s in "DATABASE_URL","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","SECRET_KEY","GEMINI_API_KEY","SMTP_PASSWORD") {
  gcloud secrets versions access latest --secret=$s --project=$P --out-file=$f
  $b = [System.IO.File]::ReadAllBytes($f)
  $bom = ($b.Length -ge 3 -and $b[0] -eq 239 -and $b[1] -eq 187 -and $b[2] -eq 191)
  "{0,-28} BOM={1,-6} 끝바이트={2}" -f $s, $bom, $b[-1]
}
Remove-Item $f
```

`끝바이트=10`(LF) 또는 `13`(CR)이면 개행이 딸려 들어간 것이다.

시크릿을 갱신한 뒤에는 Cloud Run이 `latest` 를 다시 읽도록 새 리비전 배포가 필요하다.

---

## 3. 엑셀 출력에서 조건부 서식이 사라진다 — 알면서 남겨둔 것

템플릿은 시트당 조건부 서식을 2~3개 갖고 있는데, 결과물에는 하나도 없다.
openpyxl의 `copy_worksheet()` 가 조건부 서식을 복사하지 않기 때문이다.
템플릿에 없는 기간은 전부 시트 복사로 만들므로 모든 출력물이 영향을 받는다.

숫자와 수식은 정상이고 색·강조만 빠진다. 아직 요청받은 적이 없어 손대지 않았다.
필요해지면 복사 후 `ws.conditional_formatting` 을 원본에서 옮겨 붙이는 방식으로 해결한다.

---

## 4. 전년동월 '광고비(vat, markup)' 는 항상 0

DB에 markup 광고비 항목이 없다. 전월 행은 같은 이유로 빈칸으로 두는데(`_PREV_COL_MARKUP`),
전년동월 행은 "없으면 0" 요구에 맞춰 0으로 채운다. 두 행의 처리가 다르다는 점만 인지할 것.

---

## 5. 저장 대화상자에서 취소해도 앱이 알 수 없다

엑셀 저장 경로를 브라우저 기본 다운로드 하나로 단일화하면서(대화상자를 항상 한 번만
띄우기 위해) 취소 감지 신호가 사라졌다. 사용자가 저장 대화상자를 취소해도 토스트는
"저장했습니다"로 닫히고, 서버의 결과 파일은 1회용이라 **다운로드를 다시 실행해야 한다.**

신경 쓰이면 저장 후 토스트를 자동으로 닫지 않고 사용자가 직접 닫게 바꾸면 된다.

---

## 6. 엑셀 이메일 발송 차단 중 — 되돌리는 방법

DB 엑셀을 메일로 받는 경로(`export-db-task?deliver_by=email`)를 막아둔 상태다.
다운로드와 리포트 메일(`/api/report-mail`)은 영향받지 않는다.

다시 열려면 스위치 두 개를 함께 되돌린다:

- `back/app/routers/marketing_router.py` → `EXPORT_EMAIL_UNDER_MAINTENANCE = False`
- `front/components/marketing/DbDashboard.tsx` → `EXPORT_EMAIL_UNDER_MAINTENANCE = false`

백엔드만 풀면 버튼이 계속 비활성이고, 프론트만 풀면 API가 503을 돌려준다.

---

## 참고 — 배포 파이프라인

push하면 Cloud Build가 `빌드 → 푸시 → 마이그레이션 → 배포` 순서로 실행한다.
마이그레이션 단계는 Cloud Build 서비스 계정에 `DATABASE_URL` 시크릿의
`roles/secretmanager.secretAccessor` 권한이 있어야 한다(부여 완료).

자세한 내용은 `back/TODO_DEPLOY.md` 참고.
