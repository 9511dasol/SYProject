import type { MediaSummary, ReportData } from '@/types/marketing';

/**
 * 지표 상태에 따른 권장 액션 룰 엔진.
 *
 * AI 코멘트와 달리 결정적(deterministic)이다 — 같은 수치면 항상 같은 제안이 나오고,
 * 토큰 비용 없이 리포트를 열 때마다 즉시 계산된다. "왜 이 제안이 나왔는지"를
 * evidence 로 함께 보여줘서 담당자가 근거를 바로 검증할 수 있게 한다.
 *
 * 임계값은 전부 아래 상수로 모아 둔다 — 운영하며 감도가 안 맞으면 여기만 조정한다.
 */

/** ROAS 손익분기 — 이 밑이면 광고비가 매출보다 크다 (비율값, 1.0 = 100%) */
const ROAS_BREAK_EVEN = 1.0;
/** ROAS가 전월 대비 이만큼(%p 기준 비율값) 떨어지면 경고 */
const ROAS_DROP_PP = 0.2;
/** CTR이 전월 대비 이만큼(%p 기준 비율값) 떨어지면 소재 피로 의심 */
const CTR_DROP_PP = 0.005;
/** CPC가 전월 대비 이 배율 이상이면 입찰 경쟁 심화 의심 */
const CPC_SPIKE_RATIO = 1.15;
/** 전환율이 전월 대비 이 비율 이상 상대 하락하면 전환 경로 점검 */
const CONV_RATE_DROP_RATIO = 0.15;
/** 매체 CTR이 계정 평균의 이 배율 미만이면 소재 점검 대상 */
const MEDIA_CTR_VS_AVG = 0.5;
/** 매체별 룰이 의미를 가지려면 최소 이만큼의 노출·클릭은 있어야 한다 */
const MEDIA_MIN_IMPRESSIONS = 1000;
const MEDIA_MIN_CLICKS = 30;

export type ActionSeverity = 'warn' | 'good';

export interface ActionSuggestion {
  severity: ActionSeverity;
  /** 어느 지표에서 나온 제안인지 — 화면 배지 */
  metric: string;
  title: string;
  /** 제안의 근거 수치 — "CTR 4.2% (전월 5.1%, -0.9%p)" 꼴 */
  evidence: string;
  actions: string[];
}

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const pp = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%p`;
const won = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`;

function convRate(s: MediaSummary): number {
  return s.clicks > 0 ? s.total_conv / s.clicks : 0;
}

/** 요약 탭 "액션 제안" — warn 먼저, 같은 심각도 안에서는 룰 정의 순서 */
export function buildActionSuggestions(data: ReportData): ActionSuggestion[] {
  const out: ActionSuggestion[] = [];
  const total = data.total;
  const mom = data.compare_mom?.total;

  // ── ROAS ──────────────────────────────────────────────────────────────────
  if (total.cost > 0 && total.roas < ROAS_BREAK_EVEN) {
    out.push({
      severity: 'warn',
      metric: 'ROAS',
      title: 'ROAS가 100% 미만 — 광고비가 매출보다 큽니다',
      evidence: `ROAS ${pct(total.roas)} (광고비 ${won(total.cost)} / 매출 ${won(total.revenue)})`,
      actions: ['키워드 입찰가 하향 검토', '저효율 키워드 제외', '효율 좋은 매체로 예산 재배분'],
    });
  } else if (mom && total.roas - mom.roas <= -ROAS_DROP_PP) {
    out.push({
      severity: 'warn',
      metric: 'ROAS',
      title: 'ROAS가 전월 대비 크게 하락했습니다',
      evidence: `ROAS ${pct(total.roas)} (전월 ${pct(mom.roas)}, ${pp(total.roas - mom.roas)})`,
      actions: ['키워드 입찰가 확인', '매출 상위 키워드에 예산 집중', '전환 매출 집계 누락 여부 확인'],
    });
  }

  // ── CTR ───────────────────────────────────────────────────────────────────
  if (mom && total.ctr - mom.ctr <= -CTR_DROP_PP) {
    out.push({
      severity: 'warn',
      metric: 'CTR',
      title: 'CTR 하락 — 소재 피로도가 의심됩니다',
      evidence: `CTR ${pct(total.ctr)} (전월 ${pct(mom.ctr)}, ${pp(total.ctr - mom.ctr)})`,
      actions: ['광고 소재 점검·교체', '신규 카피/이미지 A·B 테스트', '타겟·키워드와 소재 메시지 정합성 확인'],
    });
  }

  // ── CPC ───────────────────────────────────────────────────────────────────
  if (mom && mom.cpc > 0 && total.cpc >= mom.cpc * CPC_SPIKE_RATIO) {
    out.push({
      severity: 'warn',
      metric: 'CPC',
      title: 'CPC 급등 — 입찰 경쟁 심화가 의심됩니다',
      evidence: `CPC ${won(total.cpc)} (전월 ${won(mom.cpc)}, +${(((total.cpc - mom.cpc) / mom.cpc) * 100).toFixed(1)}%)`,
      actions: ['키워드 입찰가 확인', '품질지수(광고 적합도) 점검', '고단가 키워드 노출 전략 재검토'],
    });
  }

  // ── 전환율 ────────────────────────────────────────────────────────────────
  const cr = convRate(total);
  const momCr = mom ? convRate(mom) : null;
  if (momCr !== null && momCr > 0 && (momCr - cr) / momCr >= CONV_RATE_DROP_RATIO) {
    out.push({
      severity: 'warn',
      metric: '전환율',
      title: '클릭은 유지되는데 전환율이 떨어졌습니다',
      evidence: `전환율 ${pct(cr, 2)} (전월 ${pct(momCr, 2)})`,
      actions: ['랜딩페이지·전환 경로 점검', '프로모션/가격 변경 여부 확인', '전환 스크립트 정상 동작 확인'],
    });
  }

  // ── 매체별 ────────────────────────────────────────────────────────────────
  for (const m of data.by_media) {
    if (m.impressions < MEDIA_MIN_IMPRESSIONS || m.clicks < MEDIA_MIN_CLICKS) continue;

    if (m.cost > 0 && m.roas < ROAS_BREAK_EVEN && total.roas >= ROAS_BREAK_EVEN) {
      out.push({
        severity: 'warn',
        metric: 'ROAS',
        title: `${m.label} ROAS가 100% 미만입니다`,
        evidence: `${m.label} ROAS ${pct(m.roas)} (계정 전체 ${pct(total.roas)})`,
        actions: [`${m.label} 키워드 입찰가 확인`, `${m.label} 저효율 키워드 제외`, '효율 좋은 매체로 예산 이동 검토'],
      });
    }
    if (total.ctr > 0 && m.ctr < total.ctr * MEDIA_CTR_VS_AVG) {
      out.push({
        severity: 'warn',
        metric: 'CTR',
        title: `${m.label} CTR이 계정 평균의 절반 이하입니다`,
        evidence: `${m.label} CTR ${pct(m.ctr)} (계정 평균 ${pct(total.ctr)})`,
        actions: [`${m.label} 소재 점검·교체`, `${m.label} 타겟/키워드 매칭 재검토`],
      });
    }
  }

  // ── 긍정 신호 — 경고가 없을 때만이 아니라 함께 보여준다 (잘 되는 건 늘려야 하므로) ──
  if (mom && total.roas - mom.roas > 0 && total.ctr - mom.ctr > 0) {
    out.push({
      severity: 'good',
      metric: 'CTR·ROAS',
      title: '효율이 함께 개선되고 있습니다',
      evidence: `CTR ${pp(total.ctr - mom.ctr)} · ROAS ${pp(total.roas - mom.roas)} (전월 대비)`,
      actions: ['성과 상위 소재·키워드 예산 확대 고려', '잘 되는 소재의 변형(규격·카피) 추가 제작'],
    });
  }

  // warn 먼저
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1));
}
