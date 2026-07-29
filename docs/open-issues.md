# 미해결 · 미확인 항목

확인이 필요하거나 알면서 남겨둔 것들을 모아둔다. 해결되면 해당 항목을 지우고,
새로 발견하면 아래에 덧붙인다.

최종 갱신: 2026-07-29

---

## 1. Excel "복구하시겠습니까?" 대화상자 — 미확인 (해소됐을 가능성 큼)

**증상**: 내려받은 파일을 열면 *"'파일명'의 내용에 문제가 있습니다. 이 통합 문서의 내용을
최대한 복구하시겠습니까?"* 가 뜬다.

**상태**: 원인 미특정. 정적 분석으로 아래를 전부 확인했지만 모두 정상이었다.

- 패키지 관계(rels) 끊김 없음, `[Content_Types].xml` 일치
- 스타일 인덱스 범위 정상 (최대 505 / cellXfs 506)
- 셀 순서·중복·행번호 불일치 없음
- 계산 설정 정상 (`fullCalcOnLoad="1"`)
- 기간 시트 삭제로 인한 끊어진 참조 0건

Excel COM 자동화로 직접 열어 확인하려 했으나 개발 환경에서 COM 호출이 막혀 실패했고,
LibreOffice도 없어 검증 오라클이 없었다.

**그 뒤 바뀐 것** (2026-07-29): 템플릿을 빈 파일로 만들면서 유력한 용의자 두 가지가
사라졌다 — 외부 통합문서 링크(`externalReferences` 파트 자체가 없어짐)와
`copy_worksheet()` 기반 시트 복사(아래 3번이 이것 때문이었다). 출력물에
`calcChain.xml` 도 없어 수식과 어긋날 여지가 없다.

**다음 단계**: **먼저 재현되는지 확인할 것.** 여전히 뜬다면 [예]를 눌렀을 때
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

## 3. summary '전월' 행의 '광고비(vat, markup)' 는 빈칸

DB에 markup 광고비 항목이 없다. summary 8행(전월)은 파생 지표까지 값으로 넣는
유일한 행이라, 이 칸만 모르는 값으로 남아 빈칸이 된다(`_PREV_COL_MARKUP`).

매체 시트의 markup 칸은 문제가 아니다 — 구글·파워컨텐츠는 템플릿 수식
(`=(G8*10%)+G8`)이 광고비에서 계산하고, 나머지 매체는 그 칸 자체가 없다.

---

## 4. 새 템플릿 구조를 실제 Excel에서 열어 확인하지 못했다

2026-07-29에 템플릿을 값이 없는 빈 파일로 바꾸고, 시트 복사 대신 시트 이름의
PERIOD 토큰을 치환하는 방식으로 전환했다. 셀 값·수식·조건부 서식·병합셀·패키지 구조는
전부 정적으로 검증했지만(테스트 `test_excel_service_prev_month.py`), **Excel이 실제로
재계산한 결과는 확인하지 못했다** — 개발 환경에 Excel도 LibreOffice도 없다.

배포 후 한 달치를 뽑아 아래를 눈으로 확인할 것:

- 예산소진율 · 달성비율 · 잔여광고비 · 잔여일예산 (매체별 예산이 들어갔는지)
- WoW 행 (기준일을 =TODAY() 대신 summary D1 참조로 바꾼 부분)
- MOM · YOY 행 (매체 시트 8·9행을 DB 값으로 채우는 부분)
- 조건부 서식이 실제로 보이는지

---

## 5. 저장 대화상자에서 취소해도 앱이 알 수 없다

엑셀 저장 경로를 브라우저 기본 다운로드 하나로 단일화하면서(대화상자를 항상 한 번만
띄우기 위해) 취소 감지 신호가 사라졌다. 사용자가 저장 대화상자를 취소해도 토스트는
"저장했습니다"로 닫히고, 서버의 결과 파일은 1회용이라 **다운로드를 다시 실행해야 한다.**

신경 쓰이면 저장 후 토스트를 자동으로 닫지 않고 사용자가 직접 닫게 바꾸면 된다.

---

## 6. 엑셀 이메일 발송 — 화면에서 제거됨, API는 남아 있음

DB 엑셀을 메일로 받는 버튼을 대시보드(`DbDashboard`)에서 걷어냈다(2026-07-29).
필요 없다는 판단이었고, 그때 `RecipientPopover` 와 `components/ui/EmailRecipientInput.tsx`
도 함께 지웠다 — 되살리려면 git 에서 꺼내면 된다.

백엔드 경로(`export-db-task?deliver_by=email`)는 그대로 있고 여전히 막혀 있다
(`marketing_router.py` → `EXPORT_EMAIL_UNDER_MAINTENANCE = True`). 화면을 다시 붙일 때
이 값도 함께 `False` 로 돌려야 한다 — 안 그러면 API가 503을 돌려준다.

코멘트 기반 리포트 메일(`/report-email`, `/api/report-mail`)은 별개이며 영향받지 않는다.

---

## 7. 매체별 예산은 '입력한 기간부터 앞으로만' 적용된다

예산은 `marketing_period_meta.media_budgets` 에 기간별로 저장하고, 그 기간에 값이 없으면
**그 이전에 입력한 가장 최근 기간의 값을 이어받는다**(`get_media_budgets`). 그래서 예산을
처음 입력한 기간보다 **더 이전 기간**을 나중에 업로드하면 그 달만 예산이 0으로 남는다.

마이그레이션 `0006_seed_media_budgets` 가 배포 시점의 가장 오래된 데이터 기간에 기본값을
심어 두므로 지금 있는 기간은 전부 덮인다. 그보다 앞선 달을 추가로 올릴 일이 생기면
그 달의 예산을 화면에서 직접 넣을 것.

---

## 참고 — 배포 파이프라인

push하면 Cloud Build가 `빌드 → 푸시 → 마이그레이션 → 배포` 순서로 실행한다.
마이그레이션 단계는 Cloud Build 서비스 계정에 `DATABASE_URL` 시크릿의
`roles/secretmanager.secretAccessor` 권한이 있어야 한다(부여 완료).

자세한 내용은 `back/TODO_DEPLOY.md` 참고.
