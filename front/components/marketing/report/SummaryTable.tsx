import ScrollableTable from '@/components/ui/ScrollableTable';
import type { MediaSummary } from '@/types/marketing';
import { NUM_CELL, STICKY_CELL, fmt } from './shared';

const HEADERS = [
  '매체', '노출', '클릭', 'CTR', 'CPC', '광고비',
  '전환수', '전환율', '회원가입', '구매완료', 'ROAS',
];

/** 요약 탭의 매체별 현황 표 */
export default function SummaryTable({ rows }: { rows: MediaSummary[] }) {
  return (
    <ScrollableTable hint="옆으로 밀어서 나머지 지표를 볼 수 있어요">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            {HEADERS.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap ${
                  i === 0 ? `${STICKY_CELL} text-left` : 'text-right'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className={i % 2 === 0 ? 'tr-even' : 'tr-odd'}>
              <td className={`px-3 py-2 font-medium whitespace-nowrap ${STICKY_CELL}`}>{r.label}</td>
              <td className={NUM_CELL}>{fmt.num(r.impressions)}</td>
              <td className={NUM_CELL}>{fmt.num(r.clicks)}</td>
              <td className={NUM_CELL}>{fmt.pct(r.ctr)}</td>
              {/* CPC 는 이 표에서 '원' 없이 숫자만 보여 왔다 — 요약 KPI 카드와 표기가
                  다르지만, 표시를 바꾸는 건 분해와 별개 결정이라 원래대로 둔다 */}
              <td className={NUM_CELL}>{fmt.num(r.cpc)}</td>
              <td className={NUM_CELL}>{fmt.won(r.cost)}</td>
              <td className={NUM_CELL}>{fmt.dec(r.total_conv)}</td>
              {/* 0으로 나누는 것을 막는 가드 — 분모가 clicks 이므로 clicks 를 봐야 한다.
                  ctr 을 보고 있었는데, ctr 이 0 이 아니면서 clicks 가 0 인 데이터가 오면
                  Infinity 가 그대로 화면에 찍힌다. */}
              <td className={NUM_CELL}>{fmt.pct(r.clicks > 0 ? r.total_conv / r.clicks : 0)}</td>
              <td className={NUM_CELL}>{fmt.dec(r.signup)}</td>
              <td className={NUM_CELL}>{fmt.dec(r.purchase)}</td>
              <td className={NUM_CELL}>{fmt.pct(r.roas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTable>
  );
}
