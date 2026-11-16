'use client';

import { useSyncExternalStore } from 'react';
import {
  LEAD_CONTACT_EMAIL,
  LEAD_FORM_URL,
  LEAD_FORM_UTM_ENTRY,
  TRACKED_PARAMS,
} from '@/config/landing';

/** 한 번 받은 페이지에서 쿼리스트링은 바뀌지 않는다 — 구독할 것이 없다. */
const noopSubscribe = () => () => {};

/**
 * 서버에는 쿼리스트링이 없다. 서버 스냅샷을 `null` 로 두면 하이드레이션 때는
 * 자리만 잡고, 그 뒤 클라이언트 값으로 한 번 다시 렌더링된다.
 *
 * `''`(파라미터 없음)과 "아직 모름"을 구분해야 폼이 UTM 없이 먼저 로드됐다가
 * 다시 로드되는 일이 없다. `useEffect` + `setState` 로 하지 않는 이유는 그게
 * 이펙트 안 setState 라 연쇄 렌더링을 부르기 때문이다.
 */
function useSearchString() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.search,
    () => null,
  );
}

/**
 * 구글 폼 임베드.
 *
 * 광고에서 넘어온 UTM 을 주소창에서 읽어 폼의 단답형 질문 하나에 미리 채워 넣는다.
 * 그래야 응답 스프레드시트에서 "이 상담 신청은 어느 광고 세트에서 왔는가" 가 보인다.
 * GA4 를 열지 않고도 소재별 성과를 아는 가장 싼 방법이다.
 */
export default function LeadForm() {
  const search = useSearchString();

  const src = buildFormSrc(search);

  if (!LEAD_FORM_URL) {
    return (
      <div className="rounded-2xl border border-dashed border-[#c7d2e4] bg-white/70 p-8 text-center">
        <p className="text-[15px] font-semibold text-[#0b1f3a]">문의 폼을 준비 중입니다.</p>
        {LEAD_CONTACT_EMAIL ? (
          <p className="mt-3 text-[15px] text-[#44597a]">
            그동안은 메일로 받습니다 —{' '}
            <a
              href={`mailto:${LEAD_CONTACT_EMAIL}?subject=${encodeURIComponent('업무 자동화 상담 문의')}`}
              className="font-semibold text-[#2563eb] underline underline-offset-4"
            >
              {LEAD_CONTACT_EMAIL}
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e3e0d6] bg-white shadow-[0_10px_40px_rgba(11,31,58,.08)]">
      {src ? (
        <iframe src={src} title="업무 자동화 상담 신청" className="h-[1100px] w-full" loading="lazy" />
      ) : (
        // 마운트 전 자리 높이를 미리 잡아 둔다 — 폼이 뜨면서 페이지가 덜컥 밀리지 않게.
        <div className="flex h-[1100px] w-full items-center justify-center text-[15px] text-[#5a6e8c]">
          문의 폼을 불러오는 중…
        </div>
      )}
    </div>
  );
}

/** 쿼리스트링에서 허용된 UTM 만 골라 구글 폼 미리채움 주소를 만든다. */
function buildFormSrc(search: string | null): string | null {
  if (!LEAD_FORM_URL || search === null) return null;

  // 값만 이어 붙이면 파라미터 하나가 비었을 때 자리가 밀려 스프레드시트에서
  // 어느 값이 무엇인지 알 수 없게 된다. 키를 같이 적는다.
  const incoming = new URLSearchParams(search);
  const trail = TRACKED_PARAMS.map((key) => {
    const value = incoming.get(key);
    return value ? `${key}=${value}` : null;
  })
    .filter((pair): pair is string => pair !== null)
    .join(' | ');

  const url = new URL(LEAD_FORM_URL);
  url.searchParams.set('embedded', 'true');
  if (LEAD_FORM_UTM_ENTRY && trail) {
    url.searchParams.set('usp', 'pp_url');
    url.searchParams.set(`entry.${LEAD_FORM_UTM_ENTRY}`, trail);
  }

  return url.toString();
}
