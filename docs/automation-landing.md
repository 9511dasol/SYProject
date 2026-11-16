# /automation — 광고 상담 랜딩

Meta 유료 광고 트래픽을 받는 판매 페이지. `/` 의 제품 소개 랜딩과는 다른 페이지다.
그쪽은 사내 사용자에게 마케팅 AI 를 소개하고, 이쪽은 외부 방문자를 상담 폼으로 보낸다.

## 구성

| 파일 | 역할 |
|---|---|
| `front/app/automation/page.tsx` | 페이지 — metadata · viewport · 콘텐츠 배열 · 섹션 |
| `front/components/automation/AutomationHeader.tsx` | 전용 상단 바 |
| `front/components/automation/HeroVisual.tsx` | 히어로 일러스트 (인라인 SVG) |
| `front/components/automation/LeadForm.tsx` | 구글 폼 임베드 + UTM 전달 |
| `front/config/landing.ts` | 환경변수 · 추적 파라미터 정의 |
| `front/public/automation-og.png` | 링크 미리보기 썸네일 (1733×907) |

경로 등록 두 곳을 같이 봐야 한다.

- `front/proxy.ts` 의 `PUBLIC_PATHS` — **여기 없으면 광고 방문자가 전원 `/` 로 튕긴다.**
  로그인 전 방문자가 100% 이므로 가장 먼저 깨지는 지점이다.
- `front/components/layout/AppShell.tsx` 의 `FULL_BLEED_PATHS` — 사이드바·헤더를 씌우지 않는다.

## 색을 디자인 토큰으로 쓰지 않은 이유

이 페이지만 `bg-bg` · `text-fg` 같은 토큰 대신 아이보리(`#faf7f1`) · 네이비(`#0b1f3a`) ·
코발트(`#2563eb`) 를 직접 박았다. 토큰을 쓰면 next-themes 가 다크로 뒤집을 때 페이지가
광고 소재와 전혀 다른 색이 된다. 광고를 클릭한 사람이 기대한 화면은 아이보리 쪽이고,
광고와 랜딩의 색·문구가 어긋나면 "잘못 눌렀나" 싶어 바로 뒤로 간다.

같은 이유로 이 페이지에는 ThemeToggle 이 없다.

## 배포 전 체크리스트

### 1. 환경변수 — `front/.env.local`

`.env.example` 은 `.gitignore` 의 `.env*` 에 걸려 커밋되지 않는다. 각 값의 설명은
`front/config/landing.ts` 의 JSDoc 에 있다.

```
NEXT_PUBLIC_SITE_URL=https://실제도메인
NEXT_PUBLIC_LEAD_FORM_URL=
NEXT_PUBLIC_LEAD_FORM_UTM_ENTRY=
NEXT_PUBLIC_LEAD_CONTACT_EMAIL=
```

`NEXT_PUBLIC_SITE_URL` 을 비우면 `og:image` 가 `localhost` 로 잡혀 **페이스북·카카오
링크 미리보기에 썸네일이 안 뜬다.** 넷 다 빌드 타임에 번들로 박히므로 값을 바꾸면
다시 배포해야 한다.

### 2. 구글 폼 만들기

1. 질문에 **단답형 "유입경로(자동)"** 를 하나 넣는다. 응답자가 채우는 항목이 아니라
   UTM 을 담을 자리다.
2. `보내기 → 링크` 에서 `/viewform` 으로 끝나는 주소 → `NEXT_PUBLIC_LEAD_FORM_URL`.
3. `⋮ → 미리 채워진 링크 가져오기` → "유입경로" 에 아무 값이나 넣고 링크 복사 →
   주소 안의 `entry.1234567890` 에서 **숫자만** → `NEXT_PUBLIC_LEAD_FORM_UTM_ENTRY`.

설정이 비어 있어도 페이지는 정상으로 뜨고 폼 자리에만 안내가 나온다.

### 3. 법적 필수 두 가지

- **개인정보 수집·이용 동의** 를 구글 폼 안에 필수 체크 항목으로 넣는다. 이름·연락처를
  받으면 개인정보보호법상 필요하다. `page.tsx` 하단의 안내 문구는 안내일 뿐 동의를
  대신하지 않는다.
- **사업자 정보**(상호·대표자·사업자등록번호·주소·연락처)를 푸터에 채운다. `page.tsx`
  푸터에 주석으로 자리를 비워 뒀다. 국내 광고 심사에서 사업자 정보가 없는 랜딩은
  반려될 수 있다.

### 4. 약속이 되는 문구 검토

아래 네 문장은 사실이면 두고, 아니면 고친다.

- "읽어 보고 **영업일 기준 2일** 안에 연락드립니다"
- "어떤 일을 반복하고 계신지 듣습니다. **30분**이면 충분합니다"
- "사내 서버 안에만 두고 밖으로 나가지 않는 **구성도 가능합니다**"
- "맞지 않는다고 판단되면 **그렇게 말씀드립니다**"

### 5. 배포 후

[페이스북 공유 디버거](https://developers.facebook.com/tools/debug/)에서 `Scrape Again`
을 눌러 미리보기 캐시를 비운다.

## UTM 이 흐르는 경로

광고에 넣는 URL 은 `https://도메인/automation` 하나다. UTM 은 Meta 광고 편집 화면 맨
아래 **URL 매개변수** 칸에서 자동으로 붙는다.

```
utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&utm_placement={{placement}}&utm_site={{site_source_name}}
```

`LeadForm` 이 `TRACKED_PARAMS` 에 있는 것만 골라 한 줄로 묶어 구글 폼의 "유입경로"
질문에 미리 채운다. 응답 스프레드시트에는 이렇게 쌓인다.

```
utm_source=facebook | utm_medium=paid_social | utm_campaign=cmp_marketingai_20261001 | utm_term=adset_agency_25_54_auto | utm_content=ad_halfday_report_v1
```

값만 잇지 않고 키를 같이 적는 이유: 파라미터 하나가 비면 자리가 밀려 어느 값이 무엇인지
알 수 없게 된다.

**광고 이름은 ASCII 소문자 + 언더스코어로 짓는다.** 한글·공백·대괄호를 쓰면
`{{campaign.name}}` 이 퍼센트 인코딩된 채 들어와 스프레드시트가 읽기 어려워진다.

## 광고 소재와의 관계

헤드라인은 Meta 광고 소재와 **글자까지 같아야 한다**(메시지 매치). 광고를 클릭한 사람이
같은 문장을 다시 보는 것이 전환율에 가장 크게 작용한다. 소재 문구를 바꾸면
`page.tsx` 의 `<h1>` 과 `metadata.title` 도 같이 바꾼다.

소재 이미지 자체를 페이지에 얹지는 않았다. 그 이미지는 헤드라인과 CTA 버튼이 이미 그려진
완성된 광고라, 랜딩에 올리면 광고 안에 광고가 들어간 꼴이 되고 헤드라인이 화면에 두 번
나온다. 색과 은유만 가져와 `HeroVisual` 에서 SVG 로 다시 그렸다.

소재 원본과 생성 프롬프트는 adledger 레포의 `output/imagegen/` 에 있다.
