"""엑셀 업로드가 summary B32 코멘트까지 DB에 반영하는지.

엑셀 내보내기는 marketing_period_meta.comment 를 summary B32 에 써 넣는다. 그런데
업로드 쪽은 파일에서 그 값을 읽기만 하고 저장하지 않아서, 업로드 → 내보내기를 한 바퀴
돌 때마다 코멘트가 사라졌다.

시트 이름의 기간 라벨은 연도가 빠져 있기도 해서("3월"), 코멘트를 어느 연월에 붙일지는
매체 시트의 날짜 값에서 정해야 한다 — 그 부분을 특히 확인한다.
"""

from datetime import datetime

import pytest

from app.routers import marketing_router
from app.routers.marketing_router import _excel_to_df, _save_period_comments


def _period_cells(label: str, year: int, month: int, comment: str | None):
    """summary + 매체 시트 한 쌍. comment 가 None 이면 B32 를 비워 둔다."""
    summary = {
        (3, 2): 1, (3, 3): 2, (3, 4): 3,
        (70, 2): datetime(year, month, 1), (70, 3): 100, (70, 4): 10,
    }
    if comment is not None:
        summary[(32, 2)] = comment

    return {
        f"summary_{label}": summary,
        f"네이버SA_{label}": {
            (21, 2): "날짜", (21, 3): "노출수", (21, 4): "클릭수",
            (21, 5): "광고비(VAT)", (21, 6): "총전환수",
            (23, 2): f"{year}-{month:02d}-01", (23, 3): 100, (23, 4): 10,
            (23, 5): 5000, (23, 6): 1,
        },
    }


class TestExcelToDfComments:
    def test_comment_is_collected_per_period(self, make_report_xlsx):
        xlsx = make_report_xlsx(period="", cells=_period_cells("26년 6월", 2026, 6, "6월 코멘트"))

        _, _, comments = _excel_to_df(xlsx, None)

        assert comments == {(2026, 6): "6월 코멘트"}

    def test_year_comes_from_the_data_not_the_sheet_name(self, make_report_xlsx):
        """시트 이름이 '7월'뿐이어도 2025년 데이터면 2025-07 에 붙어야 한다."""
        xlsx = make_report_xlsx(period="", cells=_period_cells("7월", 2025, 7, "지난해 7월"))

        _, _, comments = _excel_to_df(xlsx, None)

        assert comments == {(2025, 7): "지난해 7월"}

    def test_multiple_periods_keep_their_own_comment(self, make_report_xlsx):
        xlsx = make_report_xlsx(
            period="",
            cells={
                **_period_cells("26년 5월", 2026, 5, "5월 코멘트"),
                **_period_cells("26년 6월", 2026, 6, "6월 코멘트"),
            },
        )

        _, _, comments = _excel_to_df(xlsx, None)

        assert comments == {(2026, 5): "5월 코멘트", (2026, 6): "6월 코멘트"}

    def test_blank_comment_is_not_collected(self, make_report_xlsx):
        """빈 코멘트를 담아 오면 이미 저장된 코멘트를 지우게 된다 — 아예 싣지 않는다."""
        xlsx = make_report_xlsx(
            period="",
            cells={
                **_period_cells("26년 5월", 2026, 5, "   "),
                **_period_cells("26년 6월", 2026, 6, None),
            },
        )

        _, _, comments = _excel_to_df(xlsx, None)

        assert comments == {}

    def test_data_is_still_returned_alongside_comments(self, make_report_xlsx):
        xlsx = make_report_xlsx(period="", cells=_period_cells("26년 6월", 2026, 6, "코멘트"))

        df, periods, _ = _excel_to_df(xlsx, None)

        assert len(df) == 1
        assert periods == ["26년 6월"]
        assert df.iloc[0]["campaign_type"] == "네이버SA"


class TestSavePeriodComments:
    def test_nothing_to_save_does_not_touch_the_db(self, mocker):
        session = mocker.patch.object(marketing_router, "SessionLocal")

        assert _save_period_comments({}) == 0
        assert _save_period_comments({(2026, 6): "  "}) == 0
        session.assert_not_called()

    def test_saves_each_period_and_commits(self, mocker):
        db = mocker.MagicMock()
        mocker.patch.object(marketing_router, "SessionLocal", return_value=db)
        repo = mocker.patch.object(marketing_router, "MarketingRepository").return_value

        saved = _save_period_comments({(2026, 5): "5월", (2026, 6): " 6월 "})

        assert saved == 2
        repo.upsert_period_meta.assert_any_call(2026, 5, comment="5월")
        repo.upsert_period_meta.assert_any_call(2026, 6, comment="6월")  # 앞뒤 공백 제거
        db.commit.assert_called_once()
        db.close.assert_called_once()

    def test_failure_rolls_back(self, mocker):
        db = mocker.MagicMock()
        mocker.patch.object(marketing_router, "SessionLocal", return_value=db)
        repo = mocker.patch.object(marketing_router, "MarketingRepository").return_value
        repo.upsert_period_meta.side_effect = RuntimeError("db down")

        with pytest.raises(RuntimeError):
            _save_period_comments({(2026, 6): "코멘트"})

        db.rollback.assert_called_once()
        db.commit.assert_not_called()
        db.close.assert_called_once()
