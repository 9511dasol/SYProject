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
    인코딩 우선순위: utf-8-sig → utf-8 → cp949 → euc-kr
    """
    # XLSX 바이너리 감지 (PK 시그니처)
    if content[:2] == b"PK":
        raise ValueError("Excel(.xlsx) 파일은 'Excel 불러오기' 탭을 이용해주세요.")

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


def _is_conversion(df: pd.DataFrame) -> bool:
    """네이버 전환 데이터 판별 (전환 유형 컬럼 존재)"""
    return "전환 유형" in df.columns


class MarketingService:
    def __init__(self, repo: MarketingRepository):
        self.repo = repo
        self.current_period = "26년 5월"

    def _extract_period(self, filename: str) -> None:
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
            daily = daily.fillna(0)

            results[media_label] = daily

        return results

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

        media_kpis: dict[str, pd.DataFrame] = {}

        def _merge_kpis(target: dict, new_kpis: dict) -> None:
            for label, kpi_df in new_kpis.items():
                if label in target:
                    target[label] = (
                        pd.concat([target[label], kpi_df], ignore_index=True)
                        .groupby("date", as_index=False)
                        .sum()
                    )
                else:
                    target[label] = kpi_df

        for content, filename in media_files:
            self._extract_period(filename)
            df_media = _read_csv(content)
            if _is_kakao(df_media):
                _merge_kpis(media_kpis, self._calc_kakao_kpis(df_media))
            else:
                _merge_kpis(media_kpis, self._calc_kpis(df_media, df_conv if not df_conv.empty else None))
                # 알 수 없는 캠페인유형 → 카카오SA 폴백
                _merge_kpis(media_kpis, self._calc_unknown_as_kakao(df_media))

        # 전환 데이터만 업로드된 경우: 미디어 없이 전환만 DB 반영
        if not media_kpis and not df_conv.empty:
            for _, filename in conv_files:
                self._extract_period(filename)
                break
            _merge_kpis(media_kpis, self._calc_conv_only_kpis(df_conv))

        rows_saved, diff, undo_id = self.repo.save_from_kpis(media_kpis)

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
            self._extract_period(filename)
            df_media = _read_csv(content)
            if _is_kakao(df_media):
                _merge(media_kpis, self._calc_kakao_kpis(df_media))
            else:
                _merge(media_kpis, self._calc_kpis(df_media, df_conv if not df_conv.empty else None))
                _merge(media_kpis, self._calc_unknown_as_kakao(df_media))

        return media_kpis, self.current_period
