import type { MediaSummary } from '@/types/marketing';
import { KpiCard } from './Badges';
import { fmt } from './shared';

/** 요약 탭 맨 위의 지표 카드 묶음 */
export default function KpiGrid({ total }: { total: MediaSummary }) {
  const convRate = total.clicks > 0 ? total.total_conv / total.clicks : 0;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="총 노출" value={fmt.num(total.impressions)} />
        <KpiCard label="총 클릭" value={fmt.num(total.clicks)} />
        <KpiCard label="CTR" value={fmt.pct(total.ctr)} />
        <KpiCard label="CPC" value={fmt.won(total.cpc)} />
        <KpiCard label="총 광고비" value={fmt.won(total.cost)} />
        <KpiCard
          label="총 전환수"
          value={fmt.dec(total.total_conv)}
          sub={`전환율 ${fmt.pct(convRate)}`}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="회원가입" value={fmt.dec(total.signup)} />
        <KpiCard label="구매완료" value={fmt.dec(total.purchase)} />
        <KpiCard label="구매매출" value={fmt.won(total.revenue)} />
        <KpiCard label="ROAS" value={fmt.pct(total.roas)} />
      </div>
    </>
  );
}
