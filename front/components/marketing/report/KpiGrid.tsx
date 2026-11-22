import type { MediaSummary } from '@/types/marketing';
import { DeltaChip, KpiCard } from './Badges';
import { COMPARE_METRICS, metricDelta } from './compare';
import { fmt } from './shared';

/** 요약 탭 맨 위의 지표 카드 묶음 — 비교 기간(전월·전년동월)이 있으면 증감 칩이 붙는다 */
export default function KpiGrid({
  total,
  mom,
  yoy,
}: {
  total: MediaSummary;
  /** 전월 합계 — 그 달 데이터가 없으면 undefined */
  mom?: MediaSummary;
  /** 전년동월 합계 — 그 달 데이터가 없으면 undefined */
  yoy?: MediaSummary;
}) {
  const convRate = total.clicks > 0 ? total.total_conv / total.clicks : 0;

  // ROAS 손익분기 미달은 액션 제안(actions.ts)도 잡지만, 거기까지 스크롤하지 않는
  // 사람이 더 많다. 같은 임계값을 카드에서도 한 번 알린다.
  const roasWarning =
    total.cost > 0 && total.roas < 1 ? '광고비가 매출보다 큽니다' : undefined;

  const deltasOf = (key: (typeof COMPARE_METRICS)[number]['key']) => {
    if (!mom && !yoy) return undefined;
    const meta = COMPARE_METRICS.find((m) => m.key === key)!;
    return (
      <>
        {mom && <DeltaChip name="전월" delta={metricDelta(total[key], mom[key], meta.dir, meta.isRate)} />}
        {yoy && <DeltaChip name="전년" delta={metricDelta(total[key], yoy[key], meta.dir, meta.isRate)} />}
      </>
    );
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="총 노출" value={fmt.num(total.impressions)} deltas={deltasOf('impressions')} />
        <KpiCard label="총 클릭" value={fmt.num(total.clicks)} deltas={deltasOf('clicks')} />
        <KpiCard label="CTR" value={fmt.pct(total.ctr)} deltas={deltasOf('ctr')} />
        <KpiCard label="CPC" value={fmt.won(total.cpc)} deltas={deltasOf('cpc')} />
        <KpiCard label="총 광고비" value={fmt.won(total.cost)} deltas={deltasOf('cost')} />
        <KpiCard
          label="총 전환수"
          value={fmt.dec(total.total_conv)}
          sub={`전환율 ${fmt.pct(convRate)}`}
          deltas={deltasOf('total_conv')}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="회원가입" value={fmt.dec(total.signup)} deltas={deltasOf('signup')} />
        <KpiCard label="구매완료" value={fmt.dec(total.purchase)} deltas={deltasOf('purchase')} />
        <KpiCard label="구매매출" value={fmt.won(total.revenue)} deltas={deltasOf('revenue')} />
        <KpiCard
          label="ROAS"
          value={fmt.pct(total.roas)}
          deltas={deltasOf('roas')}
          warning={roasWarning}
        />
      </div>
    </>
  );
}
