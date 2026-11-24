/**
 * 매체(campaign_type) 표시 규칙 — 단일 소스.
 *
 * 이 두 상수가 ReportView와 ExcelReportView에 각각 복사돼 있었다. 둘 다
 * 화면의 매체 탭 순서를 결정하기 때문에, 한쪽만 고치면 같은 데이터인데
 * 탭 순서가 화면마다 다르게 보이는 상태가 조용히 만들어진다.
 */

/**
 * DB campaign_type 키 기준 정렬 순서 (파워컨텐츠 시트는 '네이버PSA'로 저장됨)
 *
 * 앞 5개는 검색·브랜드검색 계열(SA/BS/PSA)이고, 뒤 3개는 대행사 주간 리포트에서
 * 들어오는 DA(디스플레이·배너·영상)다. DA 는 원본 플랫폼이 17종(google_p-max,
 * kakao_bizboard, criteo, tving …)이라 그대로 쓰면 범례가 22줄이 되므로 집행 규모
 * 기준 세 그룹으로 묶어 저장한다 — 백엔드 weekly_raw_reader_service 의
 * DA_PLATFORM_GROUPS 와 같은 기준이다.
 */
export const MEDIA_ORDER: string[] = [
  '네이버SA', '네이버BS', '카카오SA', '구글SA', '네이버PSA',
  '구글DA', '카카오DA', '기타DA',
];

/** DB 키와 사람이 읽는 이름이 다른 경우만 등록한다 */
const MEDIA_DISPLAY: Record<string, string> = {
  '네이버PSA': '파워컨텐츠',
};

/** 탭·헤더에 표시할 이름. 등록되지 않은 키는 그대로 쓴다 */
export function mediaLabel(key: string): string {
  return MEDIA_DISPLAY[key] ?? key;
}

/**
 * 데이터가 실제로 있는 매체만 MEDIA_ORDER 순서로 돌려준다.
 * `present`에는 매체 키를 가진 객체(리포트의 daily·media dict)를 그대로 넘긴다.
 */
export function orderedMediaKeys(present: Record<string, unknown>): string[] {
  return MEDIA_ORDER.filter((key) => key in present);
}
