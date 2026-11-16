import type { Metadata, Viewport } from 'next';
import AutomationHeader from '@/components/automation/AutomationHeader';
import HeroVisual from '@/components/automation/HeroVisual';
import LeadForm from '@/components/automation/LeadForm';
import { SITE_URL } from '@/config/landing';

/**
 * 맞춤형 업무 자동화 개발 상담 랜딩.
 *
 * `/` 의 제품 소개 랜딩과 다른 페이지다. 그쪽은 사내 사용자에게 마케팅 AI 를
 * 소개하는 화면이고, 이쪽은 **Meta 유료 광고 트래픽을 받는 판매 페이지**다.
 *
 * 그래서 디자인 토큰(`bg-bg`, `text-fg`…)을 쓰지 않고 색을 직접 박았다. 토큰을
 * 쓰면 next-themes 가 다크로 뒤집을 때 페이지가 광고 소재와 전혀 다른 색이 되는데,
 * 광고를 클릭한 사람이 기대한 화면은 아이보리 쪽이다. 광고와 랜딩의 색·문구가
 * 어긋나면 "잘못 눌렀나" 싶어 바로 뒤로 간다. 같은 이유로 ThemeToggle 도 없다.
 *
 * 헤드라인은 Meta 광고 소재의 문구와 **글자까지 같아야 한다**(메시지 매치).
 * 소재 문구를 바꾸면 여기도 같이 바꾼다.
 */
export const metadata: Metadata = {
  // 레이아웃의 '%s | 마케팅 AI' 템플릿이 붙으면 광고 헤드라인이 흐려지므로 absolute 로 고정한다.
  title: { absolute: '반나절 걸리던 리포트, 이제 검토만 하세요' },
  description:
    '매체별 광고 데이터 수집부터 집계, 리포트 코멘트까지. 업무 요구사항에 맞춘 맞춤형 자동화를 개발합니다.',
  // 상대 경로 og:image 는 metadataBase 없이는 빌드가 깨진다.
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    title: '반나절 걸리던 리포트, 이제 검토만 하세요',
    description:
      '반복 업무는 자동화하고, 담당자는 검토에 집중하세요. 업무 요구사항에 맞춘 맞춤형 자동화 개발.',
    images: [{ url: '/automation-og.png', width: 1733, height: 907 }],
  },
};

/**
 * 모바일 브라우저 크롬을 아이보리로 맞춘다.
 *
 * 이 페이지 방문자는 대부분 페이스북·인스타 인앱 브라우저로 들어온다. 앱 전체는
 * 다크 테마를 지원하므로 `<body>` 가 slate-950 일 수 있는데, 그러면 주소창과
 * 오버스크롤 영역만 검게 남아 페이지와 따로 논다.
 */
export const viewport: Viewport = {
  themeColor: '#faf7f1',
};

// ── 콘텐츠 데이터 ─────────────────────────────────────────────────────────────
// `/` 랜딩과 같은 방식으로 페이지 안에 둔다. 고객에게 보이는 문구라 내부 설정
// (config/navigation.ts 등)과 섞지 않는다.

const PAINS = [
  {
    icon: 'bx-download',
    title: '매체마다 따로 내려받기',
    body: '네이버·카카오·구글·메타. 보고서 포맷이 전부 다르고, 매번 같은 클릭을 반복합니다.',
  },
  {
    icon: 'bx-spreadsheet',
    title: '엑셀에서 손으로 취합',
    body: '컬럼 이름이 조금씩 달라져 수식이 깨지고, 깨진 걸 찾는 데 또 시간을 씁니다.',
  },
  {
    icon: 'bx-copy',
    title: '숫자 옮겨 적기',
    body: '복사·붙여넣기 한 번만 어긋나도 보고서 전체가 틀립니다. 그리고 그건 나중에 발견됩니다.',
  },
  {
    icon: 'bx-edit-alt',
    title: '코멘트 다시 쓰기',
    body: '거의 같은 문장을 매주, 매달 처음부터 다시 씁니다.',
  },
] as const;

const STEPS = [
  {
    step: '01',
    title: '올립니다',
    body: '매체에서 받은 파일을 그대로 올립니다. 컬럼 이름이 달라도 규칙을 한 번 정해 두면 다음부터는 알아서 읽습니다.',
  },
  {
    step: '02',
    title: '집계합니다',
    body: '기간·매체·전환별 수치를 데이터베이스가 계산합니다. 사람이 더하거나 옮겨 적는 단계가 없습니다.',
  },
  {
    step: '03',
    title: '검토합니다',
    body: '성과 코멘트 초안까지 붙은 리포트를 확인하고, 보낼 준비가 되면 발송을 누릅니다.',
  },
] as const;

const CUSTOM_CASES = [
  {
    icon: 'bx-filter-alt',
    title: '흩어진 데이터 취합',
    body: '여러 시스템에서 각각 받은 파일을 하나의 기준으로 모읍니다.',
  },
  {
    icon: 'bx-file',
    title: '정기 보고서 생성',
    body: '주간·월간으로 반복되는 문서를 정해진 형식에 맞춰 자동으로 만듭니다.',
  },
  {
    icon: 'bx-bell',
    title: '반복 확인 작업',
    body: '사람이 매일 열어 보던 것을 조건에 걸어 알림으로 바꿉니다.',
  },
] as const;

const PROCESS = [
  { title: '상담', body: '어떤 일을 반복하고 계신지 듣습니다. 30분이면 충분합니다.' },
  { title: '범위 정리', body: '자동화할 것과 사람이 남길 것을 가릅니다. 여기서 일정과 비용이 나옵니다.' },
  { title: '개발 · 검수', body: '실제 데이터로 돌려 보며 만듭니다. 중간에 보여 드리고 고칩니다.' },
  { title: '인수 · 운영', body: '사용 방법을 함께 전달합니다. 이후 수정이 필요하면 다시 이야기합니다.' },
] as const;

const FAQS = [
  {
    q: '회사 데이터를 외부에 올려야 하나요?',
    a: '설치 위치는 상담에서 함께 정합니다. 사내 서버 안에만 두고 밖으로 나가지 않는 구성도 가능합니다.',
  },
  {
    q: '기간과 비용은 어느 정도인가요?',
    a: '업무 범위에 따라 다릅니다. 먼저 범위를 좁힌 뒤에 일정과 견적을 드립니다. 범위를 모른 채 금액부터 말씀드리지는 않습니다.',
  },
  {
    q: '우리 업무가 자동화에 맞는지 모르겠습니다.',
    a: '그걸 가리는 것이 상담의 목적입니다. 맞지 않는다고 판단되면 그렇게 말씀드립니다.',
  },
] as const;

// ── 페이지 ────────────────────────────────────────────────────────────────────

export default function AutomationLandingPage() {
  return (
    <div
      id="top"
      className="min-h-screen scroll-mt-20 bg-[#faf7f1] text-[#0b1f3a]
        [font-family:var(--font-geist-sans),-apple-system,'Apple_SD_Gothic_Neo','Noto_Sans_KR','Malgun_Gothic',sans-serif]"
    >
      <AutomationHeader />

      <main>
        {/* ── 히어로 ──────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <span className="inline-block rounded-full border border-[#cfd9ea] bg-white px-3.5 py-1.5 text-[13px] font-semibold text-[#2563eb]">
                맞춤형 업무 자동화 개발
              </span>

              <h1 className="mt-6 text-[2.6rem] leading-[1.18] font-black tracking-[-0.02em] sm:text-[3.4rem]">
                반나절 걸리던
                <br />
                리포트,
                <br />
                <span className="text-[#2563eb]">이제 검토만 하세요</span>
              </h1>

              <p className="mt-7 max-w-lg text-[17px] leading-relaxed text-[#44597a]">
                반복 업무는 자동화하고, 담당자는 검토에 집중하세요. 매체별 데이터 수집부터
                집계, 리포트 코멘트 초안까지 이어지는 흐름을 업무 요구사항에 맞춰 만들어
                드립니다.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a
                  href="#contact"
                  className="inline-flex items-center gap-2 rounded-full bg-[#2563eb] px-7 py-4
                    text-[16px] font-bold text-white shadow-[0_8px_24px_rgba(37,99,235,.28)]
                    transition-all hover:bg-[#1d4ed8] active:scale-[0.98]"
                >
                  우리 업무 자동화 상담
                  <i className="bx bx-right-arrow-alt text-xl" />
                </a>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 rounded-full border border-[#cfd9ea]
                    bg-white px-6 py-4 text-[16px] font-semibold text-[#0b1f3a]
                    transition-colors hover:bg-[#f1f5fd]"
                >
                  어떻게 동작하나요
                </a>
              </div>
            </div>

            <div className="rounded-3xl border border-[#eae5d9] bg-white/60 p-5 sm:p-8">
              <HeroVisual />
            </div>
          </div>
        </section>

        {/* ── 문제 ────────────────────────────────────────────────────────── */}
        <section className="border-y border-[#eae5d9] bg-white/55">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-[1.9rem] leading-snug font-black tracking-[-0.01em] sm:text-[2.3rem]">
              매달 이 순서를 반복하고 계신가요
            </h2>

            <div className="mt-11 grid gap-5 sm:grid-cols-2">
              {PAINS.map((pain) => (
                <div
                  key={pain.title}
                  className="rounded-2xl border border-[#eae5d9] bg-[#faf7f1] p-7"
                >
                  <i className={`bx ${pain.icon} text-[26px] text-[#2563eb]`} />
                  <h3 className="mt-3 text-[17px] font-bold">{pain.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#5a6e8c]">{pain.body}</p>
                </div>
              ))}
            </div>

            <p className="mt-10 text-[17px] leading-relaxed text-[#44597a]">
              문제는 난이도가 아니라 <strong className="font-bold text-[#0b1f3a]">빈도</strong>
              입니다. 어렵지 않은 일이지만, 매주 매달 똑같이 돌아옵니다.
            </p>
          </div>
        </section>

        {/* ── 작동 방식 ───────────────────────────────────────────────────── */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <h2 className="text-[1.9rem] leading-snug font-black tracking-[-0.01em] sm:text-[2.3rem]">
            올리고, 집계되고, 검토합니다
          </h2>

          <div className="mt-11 grid gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.step} className="rounded-2xl border border-[#eae5d9] bg-white p-8">
                <span className="text-[13px] font-black tracking-widest text-[#2563eb]">
                  {step.step}
                </span>
                <h3 className="mt-3 text-[19px] font-bold">{step.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[#5a6e8c]">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 신뢰: 숫자는 계산하고 AI 는 서술만 ──────────────────────────── */}
        <section className="bg-[#0b1f3a] text-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
              <div>
                <h2 className="text-[1.9rem] leading-snug font-black tracking-[-0.01em] sm:text-[2.3rem]">
                  숫자는 계산하고,
                  <br />
                  <span className="text-[#7eb0ff]">AI 는 서술만 합니다</span>
                </h2>
                <p className="mt-7 text-[16px] leading-relaxed text-[#c3d2e8]">
                  AI 에게 계산을 맡기면 그럴듯한 오답이 섞여 들어옵니다. 그래서 모든 수치는
                  데이터베이스 집계로 먼저 확정하고, 확정된 값을 표로 건넵니다. AI 가 하는
                  일은 이미 정해진 숫자를 문장으로 옮기는 것뿐입니다.
                </p>
              </div>

              <blockquote className="rounded-2xl border border-white/15 bg-white/5 p-8">
                <p className="text-[18px] leading-relaxed font-semibold">
                  &ldquo;리포트에 틀린 숫자가 들어갈 여지를 검수 절차가 아니라 구조에서
                  없앴습니다.&rdquo;
                </p>
                <footer className="mt-5 text-[14px] text-[#9fb6d6]">설계 원칙</footer>
              </blockquote>
            </div>
          </div>
        </section>

        {/* ── 맞춤 개발 ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-[1.9rem] leading-snug font-black tracking-[-0.01em] sm:text-[2.3rem]">
            광고 리포트는 그중 한 사례입니다
          </h2>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-[#44597a]">
            저희가 드리는 것은 이미 완성된 제품이 아니라, 그 팀의 반복 업무에 맞춘
            자동화입니다. 위에서 보신 광고 성과 리포트 도구도 그렇게 만들어진 결과물 중
            하나입니다.
          </p>

          <div className="mt-11 grid gap-6 md:grid-cols-3">
            {CUSTOM_CASES.map((item) => (
              <div key={item.title} className="rounded-2xl border border-[#eae5d9] bg-white p-8">
                <i className={`bx ${item.icon} text-[26px] text-[#2563eb]`} />
                <h3 className="mt-3 text-[17px] font-bold">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#5a6e8c]">{item.body}</p>
              </div>
            ))}
          </div>

          <p className="mt-9 rounded-2xl border border-[#e4ddcc] bg-[#f5f1e6] px-7 py-5 text-[15px] leading-relaxed text-[#5a6e8c]">
            모든 업무가 자동화 대상은 아닙니다. 판단 기준이 매번 달라지거나 예외가 대부분인
            일은 자동화해도 사람이 다시 손봐야 합니다. 상담에서 그것부터 가립니다.
          </p>
        </section>

        {/* ── 진행 절차 ───────────────────────────────────────────────────── */}
        <section className="border-y border-[#eae5d9] bg-white/55">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-[1.9rem] leading-snug font-black tracking-[-0.01em] sm:text-[2.3rem]">
              진행은 이렇게 합니다
            </h2>

            <ol className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PROCESS.map((phase, index) => (
                <li
                  key={phase.title}
                  className="rounded-2xl border border-[#eae5d9] bg-[#faf7f1] p-7"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2563eb] text-[14px] font-black text-white">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-[17px] font-bold">{phase.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#5a6e8c]">{phase.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-[1.9rem] leading-snug font-black tracking-[-0.01em] sm:text-[2.3rem]">
            자주 받는 질문
          </h2>

          <dl className="mt-10 divide-y divide-[#eae5d9] border-y border-[#eae5d9]">
            {FAQS.map((faq) => (
              <div key={faq.q} className="py-7">
                <dt className="text-[17px] font-bold">{faq.q}</dt>
                <dd className="mt-3 text-[15px] leading-relaxed text-[#5a6e8c]">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── 상담 신청 ───────────────────────────────────────────────────── */}
        <section id="contact" className="scroll-mt-20 bg-[#f3efe4]">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
            <h2 className="text-center text-[1.9rem] leading-snug font-black tracking-[-0.01em] sm:text-[2.3rem]">
              우리 업무 자동화 상담
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-center text-[16px] leading-relaxed text-[#44597a]">
              지금 어떤 일을 반복하고 계신지만 적어 주세요. 읽어 보고 영업일 기준 2일 안에
              연락드립니다.
            </p>

            <div className="mt-10">
              <LeadForm />
            </div>

            {/* 개인정보 수집·이용 **동의 항목 자체는 구글 폼 안에** 필수 체크로 넣어야 한다.
                이 문구는 안내일 뿐 동의를 대신하지 않는다. */}
            <p className="mt-5 text-center text-[13px] leading-relaxed text-[#5a6e8c]">
              입력하신 정보는 상담 응대 목적으로만 이용하며, 목적 달성 후 지체 없이 파기합니다.
            </p>
          </div>
        </section>
      </main>

      {/* ── 푸터 ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#eae5d9] bg-[#faf7f1]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <span className="text-lg font-black tracking-tight">adledger</span>
          <p className="mt-3 text-[13px] leading-relaxed text-[#7b8ca6]">
            업무 요구사항에 맞춘 맞춤형 자동화 개발
          </p>
          {/* 광고 집행 전에 사업자 정보를 여기 채운다. 상호 · 대표자 · 사업자등록번호 ·
              주소 · 연락처. 국내 온라인 광고 심사에서 사업자 정보가 없는 랜딩은 반려될 수 있다. */}
        </div>
      </footer>
    </div>
  );
}
