# 프론트엔드 (Next.js 16)

마케팅 AI 분석기의 웹 클라이언트입니다. Next.js 16 App Router 기반이며, **브라우저가 FastAPI를 직접 호출하지 않고 Next.js Route Handler를 거치는 BFF(Backend for Frontend) 구조**입니다.

> ⚠️ 이 프로젝트는 **Next.js 16**을 씁니다. `middleware.ts`가 `proxy.ts`로 바뀌는 등 이전 버전과 규칙이 다릅니다. 코드를 수정하기 전 [AGENTS.md](AGENTS.md)를 먼저 읽으세요.

---

## 1. 요구 사항

| 항목 | 버전 | 비고 |
|---|---|---|
| Node.js | **20.9 이상** | Next.js 16 최소 요구 버전 |
| npm | 10 이상 | `package-lock.json` 기준 |
| 백엔드 | FastAPI 실행 중 | 로그인·데이터 조회 전부 백엔드가 필요합니다 |

---

## 2. 환경 변수

루트에 `.env.local` 파일을 만듭니다.

```bash
# FastAPI 주소 — 서버(Route Handler · BFF 프록시)에서만 사용
API_URL=http://127.0.0.1:8000

# 위 값의 폴백. 이름은 NEXT_PUBLIC_ 이지만 지금은 브라우저 코드가 읽지 않으므로
# 클라이언트 번들에 실리지 않습니다. API_URL 만 있으면 생략해도 됩니다.
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000

# Auth.js 세션 암호화 키 (필수)
AUTH_SECRET=여기에_랜덤_문자열
```

`AUTH_SECRET` 생성:

```bash
npx auth secret
# 또는
openssl rand -base64 32
```

**`localhost` 대신 `127.0.0.1`을 권장합니다.** Node가 `localhost`를 IPv6(`::1`)로 해석해 IPv4로 listen 중인 uvicorn에 연결하지 못하는 경우가 있습니다 — [publicApi.ts](lib/api/publicApi.ts)에 같은 주석이 있습니다.

---

## 3. 실행

```bash
npm install

npm run dev      # 개발 서버 (Turbopack) → http://localhost:3000
npm run build    # 프로덕션 빌드
npm run start    # 빌드 결과 실행
npm run lint     # ESLint
```

**백엔드를 먼저 띄우세요.** 백엔드가 없으면 로그인 시 `[auth] FastAPI 연결 실패` 로그와 함께 로그인이 실패합니다.

```bash
# 터미널 1 — 백엔드
cd back && uv run uvicorn app.main:app --reload

# 터미널 2 — 프론트엔드
cd front && npm run dev
```

첫 계정은 로그인 화면의 **회원가입** 탭에서 만들 수 있습니다. 관리자 권한은 DB에서 `users.role`을 `admin`으로 바꿔야 부여됩니다.

---

## 4. 라우트 구조

| 경로 | 접근 권한 | 설명 |
|---|---|---|
| `/` | **공개** | 제품 소개(랜딩) 페이지. 사이드바 없이 전체 화면 |
| `/login` | **공개** | 로그인 · 회원가입 |
| `/dashboard` | 로그인 | SA 광고 대시보드 (업로드 · 리포트 조회 · Excel 내보내기) |
| `/report-email` | 로그인 | AI 코멘트 생성 및 리포트 메일 발송 |
| `/keyword-compare` | 로그인 | 키워드 성과 기간 비교 |
| `/image-filter` | 로그인 | AI 이미지 정제 |
| `/image-resize` | 로그인 | 이미지 리사이즈 · AI 업스케일 |
| `/heading-suggest` | 로그인 | AI 헤딩 문구 추천 |
| `/heading-history` | 로그인 | 생성한 헤딩 문구 기록 |
| `/profile` | 로그인 | 프로필 · 비밀번호 변경 |
| `/admin/*` | **관리자** | 기능 플래그 · 사용자 · AI 사용 이력 · 발송 로그 · 업로드 데이터 관리 |

경로 보호는 [proxy.ts](proxy.ts)가 담당합니다.

- 세션이 없으면 → `/`로 리다이렉트
- 로그인 상태로 `/login` 접근 시 → 관리자는 `/admin/settings`, 일반 사용자는 `/dashboard`
- 관리자가 아닌 사용자가 `/admin/*` 접근 시 → `/dashboard`

> proxy의 검사는 **쿠키만 보는 낙관적(optimistic) 검사**입니다. 실제 권한 검증은 각 Route Handler와 FastAPI가 다시 수행합니다.

---

## 5. 아키텍처 — BFF 패턴

브라우저는 FastAPI를 직접 호출하지 않습니다. `/api/**` Route Handler가 세션에서 accessToken을 꺼내 대신 호출합니다.

```
브라우저  ──fetch('/api/...')──▶  Next.js Route Handler  ──Bearer 토큰──▶  FastAPI
                                  (app/api/**)
```

**이 구조를 쓰는 이유** — accessToken이 브라우저 자바스크립트에 노출되지 않습니다. 토큰은 HttpOnly 세션 쿠키 안에만 있고, 서버에서만 꺼내 씁니다.
덤으로 **브라우저는 백엔드 주소도 모릅니다** — `NEXT_PUBLIC_API_URL`을 읽는 클라이언트 코드가 없으므로 그 값이 클라이언트 번들에 실리지 않습니다.

### 새 BFF 라우트는 [proxyToBackend](lib/server/bffProxy.ts) 한 줄로 씁니다

```ts
// app/api/admin/foo/route.ts
export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendPath: '/api/admin/foo' });
}
```

이게 세션 검사 · Bearer 토큰 주입 · 쿼리스트링 전달 · multipart · binary 응답 ·
백엔드 연결 실패 시 502 · 비-JSON 응답 방어를 전부 처리합니다.

예전에는 라우트 18개가 이 일을 `auth()` + axios + `isAxiosError` 로 손수 반복했습니다(526줄).
그중 어느 것도 502·비-JSON 방어가 없었고, 세션 검사 기준도 `!session` 이라 **토큰 갱신이
실패해 accessToken 이 사라진 세션을 통과시켜** Authorization 헤더 없는 요청을 백엔드로
보냈습니다. `proxyToBackend` 는 `!session?.accessToken` 으로 막습니다.

### HTTP 클라이언트 — 용도가 다릅니다

| 파일 | 실행 위치 | 인증 | 용도 |
|---|---|---|---|
| [lib/server/bffProxy.ts](lib/server/bffProxy.ts) | 서버 | 세션 토큰 자동 주입 | **BFF 라우트의 기본** — 위 참조 |
| [lib/api/publicApi.ts](lib/api/publicApi.ts) | 서버 | 없음 | 토큰 발급 **전** 호출 (로그인 · 회원가입 · 기능 플래그) |
| [lib/api/authFetch.ts](lib/api/authFetch.ts) | 브라우저 | 세션 쿠키 | `fetchJson` · `sendJson` 으로 `/api/**` 호출. 401 시 자동 로그아웃 |
| [lib/api/browserApi.ts](lib/api/browserApi.ts) | 브라우저 | 세션 쿠키 | axios 기반. `marketingClient` 등 기존 3개 모듈이 씁니다 |

브라우저에서는 **`fetchJson`/`sendJson` 을 쓰세요.** 응답 파싱과 에러 메시지 추출이 들어 있습니다:

```ts
const users = await fetchJson<AdminUserItem[]>('/api/admin/users', undefined, '계정 조회 실패');
const updated = await sendJson<AdminUserItem>(`/api/admin/users/${id}/role`, 'PATCH', { role });
```

에러 봉투가 두 가지(FastAPI는 `detail`, BFF는 `message`)인데 화면마다 한쪽만 읽어서
백엔드가 준 실제 사유를 잃는 일이 많았습니다. 이 함수들은 둘 다 봅니다.

`browserApi`(axios)는 파일 업로드·blob 다운로드를 다루는 기존 3개 모듈에 남아 있습니다.
새 코드에는 쓰지 마세요.

### 인증·토큰 갱신 흐름

```
로그인 → FastAPI가 access(60분) + refresh(14일) 토큰 발급
       → Auth.js JWT 콜백이 세션 쿠키에 저장
       → 세션 조회 시마다 만료 60초 전이면 자동으로 /api/auth/refresh 호출
       → 갱신 실패 시 session.error = 'RefreshAccessTokenError'
       → AuthProvider가 감지해 자동 로그아웃 → '/'로 이동
```

구현: [auth.ts](auth.ts), [components/providers/AuthProvider.tsx](components/providers/AuthProvider.tsx)

---

## 6. 상태 관리 규칙

**서버에서 온 데이터는 전부 TanStack Query가 갖습니다.** `useEffect` + `useState` 로 직접
가져오지 마세요 — 그 방식은 로딩·에러 플래그를 손으로 관리해야 하고, 무엇보다 **다른 화면이
바꾼 값을 갱신할 방법이 없습니다.** (관리자가 기능 플래그를 토글해도 사용자 화면이 새로고침
전까지 예전 상태로 남던 버그가 그래서 생겼습니다.)

| 대상 | 도구 | 위치 |
|---|---|---|
| 서버 데이터 전부 (기간·리포트·로그·계정·플래그·프로필) | **TanStack Query v5** | 키는 [lib/queryKeys.ts](lib/queryKeys.ts)에 모아둡니다 |
| 로그인 사용자 정보 | **next-auth 세션** | `useSession()` 을 그대로 읽습니다 |
| 기능 플래그 | **TanStack Query** | [hooks/useFeatureFlags.ts](hooks/useFeatureFlags.ts) — `useFeatureEnabled(key)` |
| 불러온 Excel 리포트 | **IndexedDB** | [lib/reportStorage.ts](lib/reportStorage.ts) — 새로고침해도 탭이 유지됩니다 |
| 백그라운드 작업 진행률 | **TanStack Query 폴링** | `refetchInterval`이 종료 상태에서 스스로 멈춥니다. 진행률 UI는 [components/ui/BottomTaskBar.tsx](components/ui/BottomTaskBar.tsx) |

쿼리 키를 새로 만들 때는 반드시 `queryKeys.ts`에 추가하세요. 문자열을 컴포넌트에 직접 쓰면 무효화 대상에서 누락됩니다.

> zustand 는 제거했습니다. 두 스토어가 각각 next-auth 세션의 복사본과 플래그 캐시였는데,
> 값의 출처를 둘로 갈라놓기만 하고 얻는 게 없었습니다.

### 폼 값은 서버 값에서 **파생**시키세요

조회 결과를 `useState` 로 복사해 두면 백그라운드 재조회가 입력 중인 값을 덮어씁니다.
사용자가 손댄 뒤부터만 draft 를 쓰는 방식이 안전합니다:

```tsx
const [draft, setDraft] = useState<string | null>(null);
const value = draft ?? serverValue;   // 손대기 전에는 서버 값을 그대로 보여준다
// 저장 성공 후 setDraft(null) → 다시 서버 값에서 파생
```

---

## 7. 기능 플래그

관리자가 `/admin/settings`에서 기능을 끄면 해당 페이지는 점검 안내로 바뀝니다.

```tsx
<FeatureGate flag="is_dashboard_enabled">
  <DashboardClient />
</FeatureGate>
```

플래그 키의 **기본값은 백엔드**([back/app/main.py](../back/app/main.py)의 `_DEFAULT_FEATURE_FLAGS`)에 정의돼 있습니다. 새 기능을 추가하면 백엔드에도 키를 등록해야 관리자 화면에 노출됩니다.

---

## 8. 리포트 화면의 구조

[ReportView](components/marketing/ReportView.tsx)는 껍데기입니다. 한 파일에 794줄로 있던 것을
역할별로 나눠 두었으니, 고칠 곳을 먼저 찾으세요.

| 무엇을 고치려면 | 어디를 |
|---|---|
| 편집·삭제·복원·DB 저장 동작 | [hooks/usePendingRows.ts](hooks/usePendingRows.ts) |
| CTR · CPC · 전환율 · ROAS 계산식 | [lib/marketingMetrics.ts](lib/marketingMetrics.ts) |
| 표 모양 | [report/SummaryTable](components/marketing/report/SummaryTable.tsx) · [report/DailyTable](components/marketing/report/DailyTable.tsx) |
| 행 상세 모달 | [report/RowDetailModal](components/marketing/report/RowDetailModal.tsx) |
| 배지 · KPI 카드 | [report/Badges.tsx](components/marketing/report/Badges.tsx) |
| 차트 모양 | [components/charts/](components/charts) |
| 차트에 넣을 값 계산 | [lib/chartData.ts](lib/chartData.ts) |

### 미저장 편집은 `usePendingRows` 가 전부 관리합니다

사용자는 여러 매체·여러 날짜를 고치다가 마지막에 한 번 DB에 반영합니다. 그동안의 변경은
`pending` 에만 있고 화면에는 원본 위에 겹쳐 그립니다.

**DB 반영은 성공한 것만 pending 에서 빠집니다.** 예전에는 중첩 for 안에서 순차로 await 하다
하나가 던지면 그 자리에서 멈췄는데, pending 은 전혀 건드리지 않아서 **DB는 절반만 반영됐는데
화면은 "아직 다 미저장"** 으로 보였습니다. 다시 누르면 이미 저장된 행까지 또 보냈습니다.

### 업로드는 확장자에 따라 아예 다른 흐름입니다

[UploadPanel](components/marketing/UploadPanel.tsx)은 파일을 고르는 데까지만 담당하고,
[CsvUploadFlow](components/marketing/upload/CsvUploadFlow.tsx) 또는
[ExcelUploadFlow](components/marketing/upload/ExcelUploadFlow.tsx) 로 넘깁니다.
둘은 엔드포인트도 절차도 다릅니다 — CSV 는 서버가 분석해 바로 저장하고, 엑셀은 담긴 기간을
먼저 읽어 저장할 달·방식·코멘트 여부를 고릅니다.

### 차트는 직접 그린 SVG 입니다 — 차트 라이브러리가 없습니다

요약 탭의 **일별 추이**·**매체별 비중**, 매체 탭의 **일별 추이**가 전부입니다. 선 하나와 눈금
정도라 recharts(gzip 약 100KB)를 얹을 이유가 없었습니다.

| 컴포넌트 | 무엇 |
|---|---|
| [`TrendChart`](components/charts/TrendChart.tsx) | 일별 추이 (면적 + 선, 지표 토글, 호버 툴팁) |
| [`MediaShareBars`](components/charts/MediaShareBars.tsx) | 매체별 비중 가로 막대 — SVG 가 아니라 `div` 입니다 |
| [`ChartCard`](components/charts/ChartCard.tsx) | 제목 · 도구 · 빈 상태 껍데기 |
| [`MetricToggle`](components/charts/MetricToggle.tsx) | 지표 선택 알약 버튼 (`radiogroup`) |

`TrendChart` 의 SVG 는 `viewBox="0 0 100 100"` + `preserveAspectRatio="none"` 입니다. 좌표를
그대로 퍼센트로 쓰고 컨테이너 폭에 알아서 맞춰지지만, **가로세로가 다른 비율로 늘어납니다.**
그래서 SVG 안에는 찌그러져도 되는 것(선·면적)만 두고 선 굵기는 `vector-effect="non-scaling-stroke"`
로 고정합니다. 글자·점·툴팁은 SVG 밖에서 HTML 로 그리고 `%` 로 얹습니다 — 이 구조 덕분에
ResizeObserver 로 폭을 재지 않아도 첫 렌더부터 정확합니다.

**요약 탭 차트는 미저장 편집을 반영하지 않습니다.** 옆의 매체별 현황 표(`by_media`)와 같은
서버 원본을 보기 때문입니다. 매체 탭 차트는 표와 같은 `mergedRows` 를 쓰되 삭제 예정 행만 뺍니다.

---

## 9. 스타일 시스템

- **Tailwind CSS v4** — 설정 파일 없이 [app/globals.css](app/globals.css)에서 `@theme inline`으로 토큰을 등록합니다.
- **다크모드는 class 전략** — `next-themes`가 `<html>`에 `.dark`를 붙이고, `@variant dark (&:where(.dark, .dark *))`로 연결됩니다.
- 색은 `bg-slate-900` 같은 원색 대신 **의미 토큰**(`bg-surface`, `text-fg-muted`, `border-border`)을 쓰세요. 라이트/다크 대비가 WCAG AA 기준으로 맞춰져 있습니다.
  `dark:` 변형을 붙이고 있다면 대개 토큰을 안 쓰고 있다는 신호입니다 — 토큰은 모드에 따라 알아서 바뀝니다.

- 차트 색은 `--chart-1` … `--chart-7`(시리즈) · `--chart-grid` · `--chart-label` 입니다.
  축·격자처럼 색이 고정된 부분은 `stroke-chart-grid` · `text-chart-label` 유틸리티로 칠하고,
  **매체 인덱스처럼 JS 가 골라야 하는 색만** [`useChartTheme()`](hooks/useChartTheme.ts) 이 `var(--chart-N)` 문자열로 넘깁니다.
  훅이 hex 를 들고 있으면 안 됩니다 — 예전 구현이 그랬고, 다크 툴팁 배경이 토큰과 이미 어긋나 있었습니다.
- 테이블은 `.data-table`, 배지는 `.badge badge-success` 같은 공용 클래스가 준비돼 있습니다.
- **그림자는 `shadow-card` · `shadow-raised` · `shadow-overlay`** 를 쓰세요. Tailwind 기본 `shadow-sm/md/lg`는 값이 빌드 시점에 박혀서 다크모드에 반응하지 않습니다.
  (기본 그림자는 `shadow-blue-600/30` 처럼 색상 유틸리티와 조합할 때만 쓰세요.)
- 상태 배지 색은 `bg-badge-danger-bg` / `text-badge-warn-fg` / `border-badge-info-bdr` 형태로 노출돼 있습니다. 에러 배너처럼 배지가 아닌 곳에도 그대로 쓸 수 있습니다.
- **z-index는 스케일을 쓰세요** — `z-[var(--z-sticky)]`(20) · `--z-drawer`(40) · `--z-popover`(60) · `--z-modal`(100) · `--z-toast`(200).
  숫자를 직접 붙이면 층이 어긋납니다. 예전에 공용 Modal(z-50)이 손으로 만든 모달(z-300/z-400) 아래에 깔리고, 토스트가 그 모달에 가려지는 버그가 있었습니다.
  (Tailwind v4에는 z-index 테마 네임스페이스가 없어서 `@theme` 대신 평범한 CSS 변수로 둡니다.)

### 하이브리드는 쓰지 마세요 — 라이트만 원색, 다크만 토큰

```tsx
❌ text-slate-500 dark:text-fg-muted     // 같은 색을 두 체계로 두 번 적는다
❌ bg-white       dark:bg-surface
✅ text-fg-muted                         // 한 번만 적으면 모드 전환은 CSS 가 한다
✅ bg-surface
```

화면 260곳이 이 모양이었습니다. 두 번 적으니 값이 어긋나기 시작했고(라이트는 `slate-500`,
같은 토큰의 라이트 값은 `slate-600`), 색 하나를 바꾸려면 두 군데를 고쳐야 했습니다.

무채색을 고를 때는 **다크 쪽에 적혀 있던 토큰 이름**을 그대로 쓰면 됩니다. 원래 그게 의도였고,
라이트 값도 토큰 쪽이 대비가 더 좋습니다.

| 텍스트 | 라이트 · 다크 | | 면 · 테두리 | 라이트 · 다크 |
|---|---|---|---|---|
| `text-fg` | 900 · 100 | | `bg-bg` 페이지 바탕 | 50 · 950 |
| `text-fg-body` | 800 · 200 | | `bg-surface` 카드 | white · 900 |
| `text-fg-muted` | 600 · 400 | | `bg-surface-2` 카드 위 패널 · 입력칸 | 100 · 800 |
| `text-fg-subtle` | 500 · 500 | | `bg-surface-3` 칩 · 트랙 | 200 · 700 |
| `text-fg-disabled` | 400 · 600 | | `border-border` · `border-border-soft` | 200 · 800 |

**`dark:` 를 남겨도 되는 경우**는 세 가지뿐입니다.

1. **포인트 색** — `bg-amber-100 dark:bg-amber-900/40` 처럼 토큰이 없는 유채색.
   (상태를 뜻하는 색이면 먼저 `badge-*` 토큰이 있는지 보세요)
2. **모드마다 농도가 달라야 할 때** — `bg-primary-soft/50 dark:bg-primary-soft/15`.
   색은 하나고 알파만 다릅니다.
3. **모드와 무관하게 늘 어두운 것** — 다운로드 진행 토스트, `BottomTaskBar` 의 칩.
   여기서는 `text-white` · `bg-white/20` 이 맞습니다.

### 공용 UI 컴포넌트를 먼저 찾으세요 — [components/ui/](components/ui)

새 화면을 만들 때 입력칸·모달·버튼을 처음부터 짜지 마세요. 예전에는 입력칸 42개가 17개 파일에
흩어져 각자 스타일링됐고, 모달 구현이 3가지, 토스트가 2가지 공존했습니다.

| 컴포넌트 | 쓰는 이유 |
|---|---|
| [`Input` · `Select` · `Textarea`](components/ui/Field.tsx) | `useId`로 `label htmlFor` ↔ `id` 를 자동 연결합니다. `error` 를 주면 `aria-invalid` + `role="alert"` 까지 붙습니다. 눈에 보이는 레이블을 호출부가 직접 그려야 하면 `srOnlyLabel` 을 쓰세요 |
| [`Modal`](components/ui/Modal.tsx) | `role="dialog"` · `aria-modal` · 제목 연결 · **포커스 트랩 · 포커스 복원 · 배경 스크롤 잠금 · Escape** 가 들어 있습니다. `footer` 로 스크롤되지 않는 액션 영역을, `busy` 로 작업 중 닫힘 방지를 처리합니다 |
| [`Button`](components/ui/Button.tsx) | `size`(sm·md·lg) 와 `tone`(brand·danger·success·amber·indigo·violet) 이 있습니다. **`className` 에 `px-3!` 처럼 `!important` 로 덮어쓰지 마세요** — prop 이 없어서 그러던 것이고, 지금은 있습니다 |
| [`Alert`](components/ui/Alert.tsx) | 인라인 오류·안내 배너. 같은 클래스 뭉치가 6개 파일에 11번 복붙돼 있었습니다 |
| [`DataTable`](components/ui/DataTable.tsx) | 목록 표. 로딩·빈 상태·좁은 화면 스크롤 안내를 다 갖고 있습니다. **컬럼 정의 하나로 데스크톱 표와 모바일 카드 목록을 함께 그립니다** |
| [`Pagination`](components/ui/Pagination.tsx) | offset 기반 페이지 이동. 한 페이지뿐이면 아무것도 그리지 않습니다 |
| [`EmptyState`](components/ui/EmptyState.tsx) | "아직 없음" 자리. `description`·`action` 으로 다음 행동을 안내하세요 |
| [`ScrollableTable`](components/ui/ScrollableTable.tsx) | 표를 직접 짤 때의 스크롤 컨테이너. 넘칠 때만 안내와 끝단 그라디언트를 보여 줍니다 — **`overflow-x-auto` 를 손으로 쓰지 마세요**(스크롤할 수 있다는 단서가 없어서 표가 잘린 채로 보입니다) |

**관리자 화면은 [`AdminGate`](components/ui/AdminGate.tsx) 를 `page.tsx` 에서 감싸세요.** 로딩·권한없음
처리가 그 안에 있어서, 클라이언트 컴포넌트는 "이미 관리자"라고 가정하고 `isAdmin` 계산 없이
바로 조회하면 됩니다. 이 블록이 관리자 5개 화면에 복붙돼 있었습니다.

```tsx
export default function AdminFooPage() {
  return <AdminGate><AdminFooClient /></AdminGate>;
}
```

토스트는 컴포넌트가 아니라 **훅**입니다. 화면마다 상태를 만들지 마세요:

```tsx
const { toast } = useToast();          // components/providers/ToastProvider
toast('success', '저장했습니다.');
toast('success', message, { label: '되돌리기', onClick: undo });   // 액션 버튼
```

### 포맷 함수는 [lib/format.ts](lib/format.ts) 하나만 쓰세요

날짜·숫자 포맷 함수를 화면마다 다시 정의하지 마세요. 예전에 날짜 포맷터만 이름이 다른 사본이
6개(`formatDate` · `formatDateTime` · `formatUpdatedAt` · `fmtDate` …) 있었고, 그중 하나는
`toLocaleDateString`에 시각 옵션을 넘기는 버그를 갖고 있었습니다.

`formatDateTime` · `formatDate` · `formatNumber` · `formatCount` · `formatWon` · `formatPercent` ·
`formatDecimal` · `formatCompact` · `formatSigned` · `formatPercentChange` · `formatFileSize`

매체 표시 이름과 탭 순서는 [lib/marketingMeta.ts](lib/marketingMeta.ts)(`MEDIA_ORDER`, `mediaLabel`,
`orderedMediaKeys`)가 단일 소스입니다. 이 상수가 두 화면에 복사돼 있어서 한쪽만 고치면 탭 순서가
조용히 어긋나던 문제가 있었습니다.

---

## 10. 디렉터리 구조

```
front/
├── app/
│   ├── page.tsx              공개 랜딩 페이지
│   ├── dashboard/            SA 광고 대시보드
│   ├── admin/                관리자 전용 페이지
│   ├── api/                  BFF Route Handler (FastAPI 프록시)
│   ├── layout.tsx            루트 레이아웃 (프로바이더 조립)
│   └── globals.css           디자인 토큰 · 공용 유틸리티
├── components/
│   ├── layout/               AppShell · Sidebar · Header
│   ├── landing/              랜딩 페이지 전용
│   ├── charts/               직접 그린 SVG 차트 (라이브러리 없음)
│   ├── marketing/            대시보드 · 업로드 · 리포트
│   │   ├── report/           ReportView 를 이루는 표 · 모달 · 배지
│   │   └── upload/           CSV · Excel 두 업로드 흐름
│   ├── providers/            Theme · Auth · Query · FeatureFlag · Toast
│   └── ui/                   Field · Modal · Button · Alert · DataTable 등 공용
├── hooks/                    useFeatureFlags · usePendingRows · useChartTheme
├── lib/
│   ├── api/                  HTTP 클라이언트 (authFetch · browserApi · publicApi)
│   ├── chartData.ts          리포트 데이터 → 차트 좌표 (일별 합계 · 매체 비중)
│   ├── format.ts             날짜 · 숫자 표시 포맷 (단일 소스)
│   ├── marketingMeta.ts      매체 표시 이름 · 탭 순서 (단일 소스)
│   ├── marketingMetrics.ts   CTR · CPC · 전환율 · ROAS 계산 (단일 소스)
│   ├── queryKeys.ts          TanStack Query 키 (단일 소스)
│   ├── server/bffProxy.ts    BFF 라우트 공용 프록시 — 새 라우트는 이걸 씁니다
│   └── *Client.ts            기능별 API 호출 함수
├── config/navigation.ts      사이드바 메뉴 정의 (단일 소스)
├── types/                    API 응답 타입
├── auth.ts                   Auth.js 설정 (JWT · 토큰 갱신)
└── proxy.ts                  경로 보호 (Next 16의 middleware)
```

메뉴를 추가할 때는 [config/navigation.ts](config/navigation.ts)만 고치면 사이드바와 헤더 브레드크럼에 동시에 반영됩니다.

---

## 11. 자주 겪는 문제

| 증상 | 원인 · 해결 |
|---|---|
| 로그인 시 `[auth] FastAPI 연결 실패 (ECONNREFUSED)` | 백엔드가 안 떠 있거나 `API_URL` 포트가 실제 uvicorn 포트와 다릅니다 |
| 로그인은 되는데 데이터 요청이 전부 401 | `SECRET_KEY`(백엔드)를 바꾼 뒤 기존 세션 쿠키가 남은 경우입니다. 로그아웃 후 재로그인하세요 |
| `AUTH_SECRET` 관련 오류로 기동 실패 | `.env.local`에 `AUTH_SECRET`이 없습니다 |
| 페이지가 "현재 점검 중입니다"로만 보임 | 해당 기능 플래그가 꺼져 있습니다. `/admin/settings`에서 켜세요 |
| 대시보드에 이전 세션의 Excel 탭이 남아 있음 | IndexedDB에 저장된 리포트입니다. 탭의 X 버튼으로 삭제됩니다 |
| `middleware.ts`를 만들었는데 동작하지 않음 | Next 16에서는 **`proxy.ts`**입니다 |
