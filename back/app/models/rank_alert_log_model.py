"""순위 하락·회복 알림 발송 이력.

report_log 와 같은 역할을 순위 알림에서 한다 — 언제 무엇을 누구에게 알렸는지,
실패했다면 왜인지가 남아야 한다. 한 번의 다이제스트 메일이 여러 키워드를 담으므로
발송 1회가 키워드 수만큼의 행을 남긴다(이력은 키워드 단위로 읽히기 때문이다).

keyword 를 복사해 두는 이유: 감시를 지워도 "그때 이런 알림이 나갔다"는 기록은
남아야 하고, 목록을 그릴 때마다 조인하지 않아도 된다.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RankAlertLog(Base):
    __tablename__ = "rank_alert_log"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # 감시가 삭제되면 NULL 로 남는다 — 이력 자체는 지우지 않는다.
    watch_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("keyword_watch.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    keyword: Mapped[str] = mapped_column(String(100), default="")
    device: Mapped[str] = mapped_column(String(10), default="all")
    alert_type: Mapped[str] = mapped_column(String(12), default="drop")  # "drop" | "recovered"
    target_rank: Mapped[float] = mapped_column(default=0.0)
    # 알림 시점의 순위와 그 직전 순위. None 은 노출 없음.
    curr_rank: Mapped[float | None] = mapped_column(nullable=True)
    prev_rank: Mapped[float | None] = mapped_column(nullable=True)
    breach_streak: Mapped[int] = mapped_column(default=0)
    recipients: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="sent")  # "sent" | "error"
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )  # 목록 조회가 항상 created_at DESC 정렬
