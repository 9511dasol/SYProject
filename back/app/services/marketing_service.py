import io
import math
import re
import pandas as pd
from app.repositories.marketing_repo import MarketingRepository

# (파일 바이트, 파일명) 튜플
FileEntry = tuple[bytes, str]

# 네이버 캠페인유형 → 매체 라벨
NAVER_CAMPAIGN_MAP: dict[str, str] = {
    "파워링크": "네이버SA",
    "브랜드검색/신제품검색": "네이버BS",
    "파워컨텐츠": "네이버PSA",
    "검색": "구글SA",
}


def _read_csv(content: bytes) -> pd.DataFrame:
    """CSV 형식·인코딩 자동 감지 후 파싱.

    네이버 보고서: 1행=보고서 제목(건너뜀), 2행=컬럼명
    그 외(카카오·구글 맞춤보고서 등): 1행=컬럼명
    구글 Ads 데이터 관리자 내보내기: UTF-16 BOM + 탭 구분자, 1행=제목·2행=기간·3행=컬럼명
    인코딩 우선순위: utf-8-sig → utf-8 → cp949 → euc-kr
    """
    # XLSX 바이너리 감지 (PK 시그니처)
    if content[:2] == b"PK":
        raise ValueError("Excel(.xlsx) 파일은 'Excel 불러오기' 탭을 이용해주세요.")

    # 구글 Ads 데이터 관리자 내보내기는 UTF-16(BOM)으로 저장되고 탭으로 구분되며,
    # 제목/기간 2줄을 건너뛴 3번째 줄이 실제 컬럼명이다. 다른 형식은 이 BOM을 쓰지 않으므로
    # 오탐 없이 분기 가능.
    if content[:2] in (b"\xff\xfe", b"\xfe\xff"):
        try:
            return pd.read_csv(io.BytesIO(content), encoding="utf-16", sep="\t", skiprows=2, header=0)
        except Exception as e:
            raise ValueError(f"CSV 파싱 실패: {e}")

    last_err: Exception = ValueError("알 수 없는 오류")
    for enc in ("utf-8-sig", "utf-8", "cp949", "euc-kr"):
        try:
            probe = pd.read_csv(io.BytesIO(content), nrows=0, encoding=enc)
            is_naver = "일별" not in probe.columns and "시작일" not in probe.columns
            return pd.read_csv(
                io.BytesIO(content),
                header=1 if is_naver else 0,
                encoding=enc,
            )
        except UnicodeDecodeError as e:
            last_err = e
            continue
        except Exception as e:
            last_err = e
            break
    raise ValueError(f"CSV 파싱 실패: {last_err}")


def _to_date(val) -> pd.Timestamp | None:
    """YYYY.MM.DD. / YYYY-MM-DD 양식 모두 파싱"""
    s = str(val).strip().rstrip(".")
    for fmt in ("%Y.%m.%d", "%Y-%m-%d"):
        try:
            return pd.to_datetime(s, format=fmt)
        except ValueError:
            continue
    return None


def _safe(val) -> float:
    """NaN·Inf → 0 변환"""
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return 0.0
    return float(val) if val is not None else 0.0


def _is_kakao(df: pd.DataFrame) -> bool:
    return "캠페인유형" not in df.columns and "시작일" in df.columns


def _is_google_campaign(df: pd.DataFrame) -> bool:
    """구글 Ads 데이터 관리자 '캠페인' 내보내기 판별 (일/캠페인 유형/노출수/클릭수/비용 계열)"""
    cols = set(df.columns)
    return {"일", "캠페인 유형", "노출수", "클릭수"} <= cols and any("비용" in c for c in cols)


def _is_google_conversion(df: pd.DataFrame) -> bool:
    """구글 Ads 데이터 관리자 '전환' 내보내기 판별 (일/캠페인 유형/전환 액션/전환)"""
    return {"일", "캠페인 유형", "전환 액션", "전환"} <= set(df.columns)


def _google_conv_subset(df_conv: pd.DataFrame | None) -> pd.DataFrame | None:
    """네이버·구글 전환 파일이 섞여 concat된 df_conv에서 구글(전환 액션 컬럼) 행만 추림"""
    if df_conv is None or df_conv.empty or "전환 액션" not in df_conv.columns:
        return None
    g = df_conv[df_conv["전환 액션"].notna()].copy()
    return g if not g.empty else None


# 구글 전환 액션 → 표시 카테고리 통합 규칙 (의뢰자 요청):
#   설명회신청 = 설명회신청 + 설명회신청완료_MO
#   구매완료   = 인강구매완료 + 인강구매완료_의약
#   회원가입   = 회원가입 (그대로)
GOOGLE_CONV_ACTION_MAP: dict[str, str] = {
    "설명회신청": "apply",
    "설명회신청완료_MO": "apply",
    "인강구매완료": "purchase",
    "인강구매완료_의약": "purchase",
    "회원가입": "signup",
}


def _is_conversion(df: pd.DataFrame) -> bool:
    """전환 데이터 판별 (네이버: 전환 유형 컬럼 / 구글: 전환 액션 컬럼)"""
    return "전환 유형" in df.columns or _is_google_conversion(df)


def _period_from_content(content: bytes) -> str | None:
    """CSV 제목/기간 행에서 기간(YY년 M월)을 추출.
    네이버: "(2026.06.01.~2026.06.12.)" / 구글 Ads: "2026년 6월 1일 - 2026년 6월 12일".
    구글 파일은 UTF-16이라 ASCII 바이트 사이에 널바이트가 끼어 raw 바이트 정규식으로는
    못 찾으므로, 실제 인코딩으로 디코딩한 뒤 탐색해야 한다."""
    if content[:2] in (b"\xff\xfe", b"\xfe\xff"):
        text_ = content[:2000].decode("utf-16", errors="ignore")
    else:
        text_ = content[:2000].decode("utf-8", errors="ignore")

    m = re.search(r"\((20\d{2})\.(\d{2})\.\d{2}\.?~", text_)
    if m:
        return f"{int(m.group(1)) % 100}년 {int(m.group(2))}월"

    m = re.search(r"(20\d{2})년\s*(\d{1,2})월", text_)
    if m:
        return f"{int(m.group(1)) % 100}년 {int(m.group(2))}월"

    return None


_SINGLE_MEDIA_COLUMNS = {"일별", "노출수", "클릭수", "총비용"}


def _is_single_media_daily(df: pd.DataFrame) -> bool:
    """캠페인유형 구분 없이 한 매체만 걸러서 내려받은 '일별' 리포트인지 판별.
    (예: 파워컨텐츠 단독 다운로드 — 일별/노출수/클릭수/총비용 4개 컬럼뿐)"""
    cols = set(df.columns)
    return _SINGLE_MEDIA_COLUMNS <= cols and "캠페인유형" not in cols


class MarketingService:
    def __init__(self, repo: MarketingRepository):
        self.repo = repo
        self.current_period = "26년 5월"

    def _extract_period(self, filename: str, content: bytes | None = None) -> None:
        # YYYYMMDD 형식 (예: 20260501) 우선 탐색
        m8 = re.search(r"20(\d{2})(\d{2})\d{2}", filename)
        if m8:
            self.current_period = f"{int(m8.group(1))}년 {int(m8.group(2))}월"
            return
        # YY.MM 또는 YY_MM 형식 (예: 26.05, 26_05)
        m2 = re.search(r"\b(\d{2})[._](\d{2})\b", filename)
        if m2:
            year, month = m2.groups()
            if 1 <= int(month) <= 12:
                self.current_period = f"{int(year)}년 {int(month)}월"
                return
        # 파일명에서 못 찾으면 CSV 제목/기간 행에서 탐색 (네이버: "(2026.06.01.~...)",
        # 구글 Ads: "2026년 6월 1일 - ..."). UTF-16(구글) 파일은 ASCII 바이트 사이에
        # 널바이트가 끼어 raw 바이트 매칭이 불가능하므로 실제 인코딩으로 디코딩 후 탐색한다.
        if content is not None:
            period = _period_from_content(content)
            if period is not None:
                self.current_period = period

    def _media_name(self, campaign_type: str) -> str:
        return NAVER_CAMPAIGN_MAP.get(str(campaign_type), "카카오SA")

    # ------------------------------------------------------------------ #
    # KPI 계산                                                             #
    # ------------------------------------------------------------------ #
    def _calc_kakao_kpis(self, df: pd.DataFrame) -> dict[str, pd.DataFrame]:
        """카카오 맞춤보고서 → 카카오SA 일별 KPI"""
        df = df.copy()
        df["date"] = df["시작일"].apply(_to_date)
        for col in ("노출수", "클릭수", "비용"):
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(",", ""), errors="coerce").fillna(0)
        daily = (
            df.groupby("date", as_index=False)
            .agg(impressions=("노출수", "sum"), clicks=("클릭수", "sum"), cost=("비용", "sum"))
        )
        for col in ("signup", "purchase", "revenue", "total_conv", "apply"):
            daily[col] = 0.0
        c_imp = daily["impressions"].replace(0, float("nan"))
        c_clk = daily["clicks"].replace(0, float("nan"))
        c_cst = daily["cost"].replace(0, float("nan"))
        daily["ctr"] = (daily["clicks"] / c_imp).fillna(0)
        daily["cpc"] = (daily["cost"] / c_clk).fillna(0)
        daily["conv_rate"] = 0.0
        daily["conv_cost"] = 0.0
        daily["roas"] = (daily["cost"] / c_cst).fillna(0)  # ROAS=0 since revenue=0
        daily = daily.fillna(0)
        return {"카카오SA": daily}

    def _calc_unknown_as_kakao(self, df_media: pd.DataFrame) -> dict[str, pd.DataFrame]:
        """NAVER_CAMPAIGN_MAP에 없는 캠페인유형 rows → 카카오SA로 집계"""
        known = set(NAVER_CAMPAIGN_MAP.keys())
        leftover = df_media[~df_media["캠페인유형"].isin(known)].copy()
        if leftover.empty:
            return {}
        leftover["date"] = leftover["일별"].apply(_to_date)
        cost_col = next((c for c in ("총비용", "비용") if c in leftover.columns), None)
        for col in ("노출수", "클릭수"):
            leftover[col] = pd.to_numeric(leftover[col].astype(str).str.replace(",", ""), errors="coerce").fillna(0)
        if cost_col:
            leftover[cost_col] = pd.to_numeric(leftover[cost_col].astype(str).str.replace(",", ""), errors="coerce").fillna(0)
        agg: dict = {"impressions": ("노출수", "sum"), "clicks": ("클릭수", "sum")}
        if cost_col:
            agg["cost"] = (cost_col, "sum")
        daily = leftover.groupby("date", as_index=False).agg(**agg).fillna(0)
        if "cost" not in daily.columns:
            daily["cost"] = 0.0
        for col in ("signup", "purchase", "revenue", "total_conv", "apply"):
            daily[col] = 0.0
        c_imp = daily["impressions"].replace(0, float("nan"))
        c_clk = daily["clicks"].replace(0, float("nan"))
        daily["ctr"] = (daily["clicks"] / c_imp).fillna(0)
        daily["cpc"] = (daily["cost"] / c_clk).fillna(0)
        daily["conv_rate"] = 0.0
        daily["conv_cost"] = 0.0
        daily["roas"] = 0.0
        return {"카카오SA": daily.fillna(0)}

    def _compute_kpi_ratios(self, daily: pd.DataFrame) -> pd.DataFrame:
        """purchase/signup/apply/revenue/impressions/clicks/cost가 채워진 daily df에
        CTR/CPC/전환율 등 파생 지표를 계산한다. 매체별 KPI 계산 공용 마무리 단계."""
        daily["total_conv"] = daily["purchase"] + daily["signup"] + daily["apply"]
        daily["total_conv_ex"] = daily["purchase"] + daily["signup"]

        c_imp = daily["impressions"].replace(0, float("nan"))
        c_clk = daily["clicks"].replace(0, float("nan"))
        c_cost = daily["cost"].replace(0, float("nan"))
        c_tc = daily["total_conv"].replace(0, float("nan"))
        c_tc_ex = daily["total_conv_ex"].replace(0, float("nan"))
        c_pur = daily["purchase"].replace(0, float("nan"))

        daily["ctr"] = (daily["clicks"] / c_imp).fillna(0)
        daily["cpc"] = (daily["cost"] / c_clk).fillna(0)
        daily["conv_rate"] = (daily["total_conv"] / c_clk).fillna(0)
        daily["conv_cost"] = (daily["cost"] / c_tc).fillna(0)
        daily["conv_rate_ex"] = (daily["total_conv_ex"] / c_clk).fillna(0)
        daily["conv_cost_ex"] = (daily["cost"] / c_tc_ex).fillna(0)
        daily["signup_rate"] = (daily["signup"] / c_clk).fillna(0)
        daily["purchase_rate"] = (daily["purchase"] / c_clk).fillna(0)
        daily["roas"] = (daily["revenue"] / c_cost).fillna(0)
        daily["revenue_per_purchase"] = (daily["revenue"] / c_pur).fillna(0)
        daily["apply_rate"] = (daily["apply"] / c_clk).fillna(0)
        return daily.fillna(0)

    def _finalize_daily_kpis(
        self,
        daily: pd.DataFrame,
        df_conv: pd.DataFrame | None,
        campaign_type: str,
    ) -> pd.DataFrame:
        """impressions/clicks/cost가 이미 일자별로 집계된 daily df에 네이버 전환 데이터를
        조인하고 파생 지표를 계산한다. _calc_kpis / _calc_single_media_kpis 공용."""
        # 전환 데이터 피벗 조인
        if df_conv is not None and not df_conv.empty:
            c = df_conv[df_conv["캠페인유형"] == campaign_type].copy()
            if not c.empty:
                c["date"] = c["일별"].apply(_to_date)
                pivot = (
                    c.pivot_table(
                        index="date",
                        columns="전환 유형",
                        values=["총 전환수", "총 전환매출액(원)"],
                        aggfunc="sum",
                        fill_value=0,
                    )
                    .reset_index()
                )
                pivot.columns = [
                    "_".join(filter(None, map(str, col))).strip()
                    for col in pivot.columns
                ]
                daily = daily.merge(pivot, on="date", how="left").fillna(0)

        def _col(prefix: str, name: str) -> pd.Series:
            key = f"{prefix}_{name}"
            return daily[key] if key in daily.columns else pd.Series(0, index=daily.index, dtype=float)

        daily["purchase"] = _col("총 전환수", "구매완료")
        daily["signup"] = _col("총 전환수", "회원가입")
        daily["apply"] = _col("총 전환수", "신청 완료")
        daily["revenue"] = _col("총 전환매출액(원)", "구매완료")
        return self._compute_kpi_ratios(daily)

    def _calc_google_kpis(
        self,
        df_campaign: pd.DataFrame,
        df_conv: pd.DataFrame | None,
    ) -> dict[str, pd.DataFrame]:
        """구글 Ads 데이터 관리자 내보내기(캠페인 + 전환) → 구글SA 일별 KPI.
        전환 액션 통합 규칙은 GOOGLE_CONV_ACTION_MAP 참고 (의뢰자 요청 사항)."""
        m = df_campaign.copy()
        m["date"] = m["일"].apply(_to_date)
        cost_col = next(c for c in m.columns if "비용" in c)
        for col in ("노출수", "클릭수", cost_col):
            m[col] = pd.to_numeric(m[col].astype(str).str.replace(",", ""), errors="coerce").fillna(0)
        daily = (
            m.groupby("date", as_index=False)
            .agg(impressions=("노출수", "sum"), clicks=("클릭수", "sum"), cost=(cost_col, "sum"))
        )

        if df_conv is not None and not df_conv.empty:
            c = df_conv.copy()
            c["date"] = c["일"].apply(_to_date)
            c["category"] = c["전환 액션"].map(GOOGLE_CONV_ACTION_MAP)
            c = c[c["category"].notna()].copy()
            if not c.empty:
                c["전환"] = pd.to_numeric(c["전환"].astype(str).str.replace(",", ""), errors="coerce").fillna(0)
                c["전환 가치"] = pd.to_numeric(c["전환 가치"].astype(str).str.replace(",", ""), errors="coerce").fillna(0)
                conv_pivot = (
                    c.pivot_table(index="date", columns="category", values="전환", aggfunc="sum", fill_value=0)
                    .reset_index()
                )
                daily = daily.merge(conv_pivot, on="date", how="left")
                revenue = (
                    c[c["category"] == "purchase"]
                    .groupby("date", as_index=False)["전환 가치"].sum()
                    .rename(columns={"전환 가치": "revenue"})
                )
                daily = daily.merge(revenue, on="date", how="left")

        for cat in ("purchase", "signup", "apply", "revenue"):
            if cat not in daily.columns:
                daily[cat] = 0.0
        daily = daily.fillna(0)

        return {"구글SA": self._compute_kpi_ratios(daily)}

    def _calc_google_conv_only_kpis(self, df_conv: pd.DataFrame) -> dict[str, pd.DataFrame]:
        """구글 전환 데이터만 업로드된 경우 (노출·클릭·비용 = 0)"""
        c = df_conv.copy()
        c["date"] = c["일"].apply(_to_date)
        c["category"] = c["전환 액션"].map(GOOGLE_CONV_ACTION_MAP)
        c = c[c["category"].notna()].copy()
        if c.empty:
            return {}
        c["전환"] = pd.to_numeric(c["전환"].astype(str).str.replace(",", ""), errors="coerce").fillna(0)
        c["전환 가치"] = pd.to_numeric(c["전환 가치"].astype(str).str.replace(",", ""), errors="coerce").fillna(0)

        daily = (
            c.pivot_table(index="date", columns="category", values="전환", aggfunc="sum", fill_value=0)
            .reset_index()
        )
        revenue = (
            c[c["category"] == "purchase"]
            .groupby("date", as_index=False)["전환 가치"].sum()
            .rename(columns={"전환 가치": "revenue"})
        )
        daily = daily.merge(revenue, on="date", how="left")
        for cat in ("purchase", "signup", "apply", "revenue"):
            if cat not in daily.columns:
                daily[cat] = 0.0
        daily["impressions"] = 0.0
        daily["clicks"] = 0.0
        daily["cost"] = 0.0
        daily = daily.fillna(0)

        return {"구글SA": self._compute_kpi_ratios(daily)}

    def _calc_kpis(
        self,
        df_media: pd.DataFrame,
        df_conv: pd.DataFrame | None,
    ) -> dict[str, pd.DataFrame]:
        """매체 유형별 일별 KPI DataFrame 반환"""
        results: dict[str, pd.DataFrame] = {}

        for campaign_type, media_label in NAVER_CAMPAIGN_MAP.items():
            m = df_media[df_media["캠페인유형"] == campaign_type].copy()
            if m.empty:
                continue

            m["date"] = m["일별"].apply(_to_date)
            daily = (
                m.groupby("date", as_index=False)
                .agg(impressions=("노출수", "sum"), clicks=("클릭수", "sum"), cost=("총비용", "sum"))
            )
            results[media_label] = self._finalize_daily_kpis(daily, df_conv, campaign_type)

        return results

    def _calc_single_media_kpis(
        self,
        df_media: pd.DataFrame,
        df_conv: pd.DataFrame | None,
    ) -> dict[str, pd.DataFrame]:
        """캠페인유형 구분 없이 한 매체만 걸러서 내려받은 '일별' 리포트 처리.
        지금까지는 파워컨텐츠(네이버PSA) 단독 다운로드에서만 이 형식이 확인됨 —
        다른 매체도 동일 형식으로 내려받게 되면 파일 내용만으로는 구분이 불가능하므로
        그때는 업로드 시 매체를 직접 지정하는 UI가 필요하다."""
        m = df_media.copy()
        m["date"] = m["일별"].apply(_to_date)
        daily = (
            m.groupby("date", as_index=False)
            .agg(impressions=("노출수", "sum"), clicks=("클릭수", "sum"), cost=("총비용", "sum"))
        )
        return {"네이버PSA": self._finalize_daily_kpis(daily, df_conv, "파워컨텐츠")}

    # ------------------------------------------------------------------ #
    # 내부 유틸                                                            #
    # ------------------------------------------------------------------ #
    def _classify(self, files: list[FileEntry]) -> tuple[list[FileEntry], list[FileEntry]]:
        """파일 목록을 전환/매체로 자동 분류"""
        conv, media = [], []
        for content, filename in files:
            df = _read_csv(content)
            if _is_conversion(df):
                conv.append((content, filename))
            else:
                media.append((content, filename))
        return conv, media

    def _calc_conv_only_kpis(self, df_conv: pd.DataFrame) -> dict[str, pd.DataFrame]:
        """전환 데이터만 있을 때 (date, campaign_type) 기준으로 집계 (노출·클릭·비용 = 0)"""
        results: dict[str, pd.DataFrame] = {}
        df = df_conv.copy()
        df["date"] = df["일별"].apply(_to_date)

        for campaign_type, media_label in NAVER_CAMPAIGN_MAP.items():
            c = df[df["캠페인유형"] == campaign_type].copy()
            if c.empty:
                continue
            pivot = (
                c.pivot_table(
                    index="date",
                    columns="전환 유형",
                    values=["총 전환수", "총 전환매출액(원)"],
                    aggfunc="sum",
                    fill_value=0,
                )
                .reset_index()
            )
            pivot.columns = [
                "_".join(filter(None, map(str, col))).strip() for col in pivot.columns
            ]

            def _col(prefix: str, name: str) -> pd.Series:
                key = f"{prefix}_{name}"
                return pivot[key] if key in pivot.columns else pd.Series(0, index=pivot.index, dtype=float)

            pivot["purchase"] = _col("총 전환수", "구매완료")
            pivot["signup"] = _col("총 전환수", "회원가입")
            pivot["apply"] = _col("총 전환수", "신청 완료")
            pivot["revenue"] = _col("총 전환매출액(원)", "구매완료")
            pivot["total_conv"] = pivot["purchase"] + pivot["signup"] + pivot["apply"]
            pivot["impressions"] = 0.0
            pivot["clicks"] = 0.0
            pivot["cost"] = 0.0
            results[media_label] = pivot.fillna(0)
        return results

    # ------------------------------------------------------------------ #
    # 공개 메서드                                                           #
    # ------------------------------------------------------------------ #
    async def process_and_analyze(
        self,
        conv_files: list[FileEntry],
        media_files: list[FileEntry],
    ) -> dict:
        """CSV 파싱 → DB 저장 + KPI 계산"""
        conv_dfs = [_read_csv(c) for c, _ in conv_files]
        df_conv = (
            pd.concat(conv_dfs, ignore_index=True).drop_duplicates()
            if conv_dfs
            else pd.DataFrame()
        )
        google_conv = _google_conv_subset(df_conv if not df_conv.empty else None)

        media_kpis: dict[str, pd.DataFrame] = {}
        # 이번 업로드에서 각 매체 라벨이 실제로 노출/클릭/비용(media) 또는 전환(conv)
        # 데이터를 받았는지 기록 — 파일을 하나씩 나눠 올릴 때 DB에 이미 저장된 값이
        # 이번에 빠진 쪽(예: 전환만 올리면서 media=0)으로 덮어써지는 걸 막기 위함.
        media_authority: dict[str, bool] = {}
        conv_authority: dict[str, bool] = {}

        def _merge_kpis(target: dict, new_kpis: dict, has_media: bool, has_conv: bool) -> None:
            for label, kpi_df in new_kpis.items():
                if label in target:
                    target[label] = (
                        pd.concat([target[label], kpi_df], ignore_index=True)
                        .groupby("date", as_index=False)
                        .sum()
                    )
                else:
                    target[label] = kpi_df
                media_authority[label] = media_authority.get(label, False) or has_media
                conv_authority[label] = conv_authority.get(label, False) or has_conv

        for content, filename in media_files:
            self._extract_period(filename, content)
            df_media = _read_csv(content)
            conv_arg = df_conv if not df_conv.empty else None
            if _is_kakao(df_media):
                _merge_kpis(media_kpis, self._calc_kakao_kpis(df_media), has_media=True, has_conv=False)
            elif _is_single_media_daily(df_media):
                _merge_kpis(
                    media_kpis, self._calc_single_media_kpis(df_media, conv_arg),
                    has_media=True, has_conv=conv_arg is not None,
                )
            elif _is_google_campaign(df_media):
                _merge_kpis(
                    media_kpis, self._calc_google_kpis(df_media, google_conv),
                    has_media=True, has_conv=google_conv is not None,
                )
            else:
                _merge_kpis(
                    media_kpis, self._calc_kpis(df_media, conv_arg),
                    has_media=True, has_conv=conv_arg is not None,
                )
                # 알 수 없는 캠페인유형 → 카카오SA 폴백
                _merge_kpis(media_kpis, self._calc_unknown_as_kakao(df_media), has_media=True, has_conv=False)

        # 전환 데이터만 업로드된 경우: 미디어 없이 전환만 DB 반영
        if not media_kpis and not df_conv.empty:
            for content, filename in conv_files:
                self._extract_period(filename, content)
                break
            if google_conv is not None:
                _merge_kpis(media_kpis, self._calc_google_conv_only_kpis(google_conv), has_media=False, has_conv=True)
            naver_conv = df_conv[df_conv["전환 유형"].notna()] if "전환 유형" in df_conv.columns else pd.DataFrame()
            if not naver_conv.empty:
                _merge_kpis(media_kpis, self._calc_conv_only_kpis(naver_conv), has_media=False, has_conv=True)

        rows_saved, diff, undo_id = self.repo.save_from_kpis(media_kpis, media_authority, conv_authority)

        return {
            "processed_rows": rows_saved,
            "ai_comment": "분석 완료",
            "media_kpis": media_kpis,
            "period": self.current_period,
            "diff": diff,
            "undo_id": undo_id,
        }

    async def process_for_export(
        self,
        conv_files: list[FileEntry],
        media_files: list[FileEntry],
    ) -> tuple[dict[str, pd.DataFrame], str]:
        """DB 저장 없이 KPI 계산만 수행 → Excel 내보내기용"""
        conv_dfs = [_read_csv(c) for c, _ in conv_files]
        df_conv = (
            pd.concat(conv_dfs, ignore_index=True).drop_duplicates()
            if conv_dfs
            else pd.DataFrame()
        )
        google_conv = _google_conv_subset(df_conv if not df_conv.empty else None)

        media_kpis: dict[str, pd.DataFrame] = {}

        def _merge(media_kpis: dict, new_kpis: dict) -> None:
            for label, kpi_df in new_kpis.items():
                if label in media_kpis:
                    media_kpis[label] = (
                        pd.concat([media_kpis[label], kpi_df], ignore_index=True)
                        .groupby("date", as_index=False)
                        .sum()
                    )
                else:
                    media_kpis[label] = kpi_df

        for content, filename in media_files:
            self._extract_period(filename, content)
            df_media = _read_csv(content)
            if _is_kakao(df_media):
                _merge(media_kpis, self._calc_kakao_kpis(df_media))
            elif _is_single_media_daily(df_media):
                _merge(media_kpis, self._calc_single_media_kpis(df_media, df_conv if not df_conv.empty else None))
            elif _is_google_campaign(df_media):
                _merge(media_kpis, self._calc_google_kpis(df_media, google_conv))
            else:
                _merge(media_kpis, self._calc_kpis(df_media, df_conv if not df_conv.empty else None))
                _merge(media_kpis, self._calc_unknown_as_kakao(df_media))

        return media_kpis, self.current_period
