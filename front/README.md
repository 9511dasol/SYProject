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
# FastAPI 주소 — 서버(Route Handler)에서 사용
API_URL=http://127.0.0.1:8000

# FastAPI 주소 — 브라우저에 노출되는 값 (API_URL 미설정 시 폴백으로도 쓰임)
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

**`localhost` 대신 `127.0.0.1`을 권장합니다.** Node가 `localhost`를 IPv6(`::1`)로 해석해 IPv4로 listen 중인 uvicorn에 연결하지 못하는 경우가 있습니다 — [privateApi.ts](lib/api/privateApi.ts)에 같은 주석이 있습니다.

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

### HTTP 클라이언트 4종 — 용도가 다릅니다

| 파일 | 실행 위치 | 인증 | 용도 |
|---|---|---|---|
| [lib/api/publicApi.ts](lib/api/publicApi.ts) | 서버 | 없음 | 로그인 · 회원가입 등 토큰 발급 전 호출 |
| [lib/api/privateApi.ts](lib/api/privateApi.ts) | 서버 | 세션 토큰 자동 주입 | Route Handler → FastAPI 호출 |
| [lib/api/browserApi.ts](lib/api/browserApi.ts) | 브라우저 | 세션 쿠키 | axios로 `/api/**` 호출, 401 시 자동 로그아웃 |
| [lib/api/authFetch.ts](lib/api/authFetch.ts) | 브라우저 | 세션 쿠키 | fetch로 `/api/**` 호출, 401 시 자동 로그아웃 |

새 API를 붙일 때는 이 넷 중 하나를 골라 쓰세요. 브라우저에서 FastAPI를 직접 부르면 토큰 노출과 CORS 문제가 동시에 생깁니다.

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

용도별로 저장소가 나뉘어 있습니다. 섞어 쓰면 캐시 무효화가 꼬입니다.

| 대상 | 도구 | 위치 |
|---|---|---|
| 서버 데이터 (기간 목록, 리포트, 로그) | **TanStack Query v5** | 키는 [lib/queryKeys.ts](lib/queryKeys.ts)에 모아둡니다 |
| 로그인 사용자 정보 | **Zustand** | [lib/store/useAuthStore.ts](lib/store/useAuthStore.ts) — 세션에서 동기화 |
| 기능 플래그 | **Zustand** | [lib/store/useFeatureFlagStore.ts](lib/store/useFeatureFlagStore.ts) — 앱 시작 시 1회 로드 |
| 불러온 Excel 리포트 | **IndexedDB** | [lib/reportStorage.ts](lib/reportStorage.ts) — 새로고침해도 탭이 유지됩니다 |
| 백그라운드 작업 ID | **쿠키** | [lib/taskCookieUtils.ts](lib/taskCookieUtils.ts) — SSR에서 읽어 위젯에 주입 |

쿼리 키를 새로 만들 때는 반드시 `queryKeys.ts`에 추가하세요. 문자열을 컴포넌트에 직접 쓰면 무효화 대상에서 누락됩니다.

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

## 8. 스타일 시스템

- **Tailwind CSS v4** — 설정 파일 없이 [app/globals.css](app/globals.css)에서 `@theme inline`으로 토큰을 등록합니다.
- **다크모드는 class 전략** — `next-themes`가 `<html>`에 `.dark`를 붙이고, `@variant dark (&:where(.dark, .dark *))`로 연결됩니다.
- 색은 `bg-slate-900` 같은 원색 대신 **의미 토큰**(`bg-surface`, `text-fg-muted`, `border-border`)을 쓰세요. 라이트/다크 대비가 WCAG AA 기준으로 맞춰져 있습니다.
- 테이블은 `.data-table`, 배지는 `.badge badge-success` 같은 공용 클래스가 준비돼 있습니다.

---

## 9. 디렉터리 구조

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
│   ├── marketing/            대시보드 · 업로드 · 리포트
│   ├── providers/            Theme · Auth · Query · FeatureFlag
│   ├── task-notification/    백그라운드 작업 진행률 위젯
│   └── ui/                   Modal · Toast · Button 등 공용
├── lib/
│   ├── api/                  HTTP 클라이언트 4종
│   ├── store/                Zustand 스토어
│   ├── server/bffProxy.ts    Route Handler 공용 프록시 헬퍼
│   └── *Client.ts            기능별 API 호출 함수
├── config/navigation.ts      사이드바 메뉴 정의 (단일 소스)
├── types/                    API 응답 타입
├── auth.ts                   Auth.js 설정 (JWT · 토큰 갱신)
└── proxy.ts                  경로 보호 (Next 16의 middleware)
```

메뉴를 추가할 때는 [config/navigation.ts](config/navigation.ts)만 고치면 사이드바와 헤더 브레드크럼에 동시에 반영됩니다.

---

## 10. 자주 겪는 문제

| 증상 | 원인 · 해결 |
|---|---|
| 로그인 시 `[auth] FastAPI 연결 실패 (ECONNREFUSED)` | 백엔드가 안 떠 있거나 `API_URL` 포트가 실제 uvicorn 포트와 다릅니다 |
| 로그인은 되는데 데이터 요청이 전부 401 | `SECRET_KEY`(백엔드)를 바꾼 뒤 기존 세션 쿠키가 남은 경우입니다. 로그아웃 후 재로그인하세요 |
| `AUTH_SECRET` 관련 오류로 기동 실패 | `.env.local`에 `AUTH_SECRET`이 없습니다 |
| 페이지가 "현재 점검 중입니다"로만 보임 | 해당 기능 플래그가 꺼져 있습니다. `/admin/settings`에서 켜세요 |
| 대시보드에 이전 세션의 Excel 탭이 남아 있음 | IndexedDB에 저장된 리포트입니다. 탭의 X 버튼으로 삭제됩니다 |
| `middleware.ts`를 만들었는데 동작하지 않음 | Next 16에서는 **`proxy.ts`**입니다 |
