import ScrollableTable from '@/components/ui/ScrollableTable';
import type { ComparePeriod, MediaSummary } from '@/types/marketing';
import { DeltaChip } from './Badges';
import { COMPARE_METRICS, metricDelta, type MetricMeta } from './compare';
import { NUM_CELL, STICKY_CELL, fmt } from './shared';

function cell(meta: MetricMeta, row: MediaSummary): string {
  return fmt[meta.format](row[meta.key]);
}

/**
 * 요약 탭의 기간 비교 표 — 전년동월·전월·당월을 지표별로 나란히 놓고 증감을 보여준다.
 * 비교 기간이 하나도 없으면(과거 데이터 미업로드) 호출부에서 아예 그리지 않는다.
 */
export default function PeriodCompareTable({
  current,
  currentLabel,
  mom,
  yoy,
}: {
  current: MediaSummary;
  currentLabel: string;
  mom?: ComparePeriod | null;
  yoy?: ComparePeriod | null;
}) {
  return (
    <ScrollableTable hint="옆으로 밀어서 나머지 기간을 볼 수 있어요">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th scope="col" className={`px-3 py-2 text-xs font-medium whitespace-nowrap text-left ${STICKY_CELL}`}>
              지표
            </th>
            {yoy && (
              <th scope="col" className="px-3 py-2 text-xs font-medium whitespace-nowrap text-right">
                {yoy.label} <span className="text-fg-subtle font-normal">(전년동월)</span>
              </th>
            )}
            {mom && (
              <th scope="col" className="px-3 py-2 text-xs font-medium whitespace-nowrap text-right">
                {mom.label} <span className="text-fg-subtle font-normal">(전월)</span>
              </th>
            )}
            <th scope="col" className="px-3 py-2 text-xs font-medium whitespace-nowrap text-right">
              {currentLabel} <span className="text-fg-subtle font-normal">(당월)</span>
            </th>
            {yoy && (
              <th scope="col" className="px-3 py-2 text-xs font-medium whitespace-nowrap text-right">
                전년比
              </th>
            )}
            {mom && (
              <th scope="col" className="px-3 py-2 text-xs font-medium whitespace-nowrap text-right">
                전월比
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {COMPARE_METRICS.map((meta, i) => (
            <tr key={meta.key} className={i % 2 === 0 ? 'tr-even' : 'tr-odd'}>
              <td className={`px-3 py-2 font-medium whitespace-nowrap ${STICKY_CELL}`}>{meta.label}</td>
              {yoy && <td className={NUM_CELL}>{cell(meta, yoy.total)}</td>}
              {mom && <td className={NUM_CELL}>{cell(meta, mom.total)}</td>}
              <td className={`${NUM_CELL} font-semibold`}>{cell(meta, current)}</td>
              {yoy && (
                <td className={NUM_CELL}>
                  <DeltaChip
                    delta={metricDelta(current[meta.key], yoy.total[meta.key], meta.dir, meta.isRate)}
                  />
                </td>
              )}
              {mom && (
                <td className={NUM_CELL}>
                  <DeltaChip
                    delta={metricDelta(current[meta.key], mom.total[meta.key], meta.dir, meta.isRate)}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTable>
  );
}
