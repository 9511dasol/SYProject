"""크론 시각의 기준 시간대.

`AsyncIOScheduler()` 를 시간대 없이 만들면 **프로세스 로컬 시간대**를 쓴다. 운영
컨테이너는 `python:3.14-slim` 기본값인 UTC 라(호스트 VM 은 Asia/Seoul 인데도)
모든 크론이 9시간씩 밀려 돌았다:

    순위 수집  hour=8 → 한국시간 17시
    순위 알림  hour=9 → 한국시간 18시   ("아침에 알려드립니다"가 저녁이 됐다)
    월간 리포트 hour=9 → 한국시간 18시   (주석은 "오전 9시"라고 적혀 있었다)
    체험 정리  hour=4 → 한국시간 13시

호스트 시간대가 맞아도 컨테이너는 따로이고, `TZ` 환경변수로 맞추면 새 배포 대상에서
조용히 빠진다. 그래서 설정값으로 못 박고 여기서 고정한다. 이 테스트는 "몇 시에
보내는가"라는 제품 약속을 지키는 장치다.
"""

from app.core.settings import settings


def test_scheduler_runs_on_korean_time():
    """기본값은 한국 시간대 — 고객에게 약속한 시각이 이 시간대 기준이다."""
    assert settings.SCHEDULER_TIMEZONE == "Asia/Seoul"


def test_the_app_scheduler_uses_the_configured_timezone():
    """설정값이 실제 스케줄러에 전달돼야 한다 — 설정만 있고 안 쓰면 의미가 없다."""
    from app.main import scheduler

    assert str(scheduler.timezone) == settings.SCHEDULER_TIMEZONE


# "아침"의 범위 — 출근해서 그날 대응을 시작할 수 있는 시각대. 업무 시작 전(6시)부터
# 점심 전(11시)까지로 둔다. IR·소개 문구의 "아침에 메일로 알려드립니다"가 이 범위를
# 전제하므로, 숫자를 바꾸려면 그 문구도 함께 봐야 한다.
MORNING_START, MORNING_END = 6, 11


def test_alert_hour_means_morning_in_korea():
    """"아침에 알려드립니다"는 제품 약속이다 — 시각이 오전 범위를 벗어나면 약속이 깨진다.

    숫자만 고정하지 않고 "오전인가"를 묻는 이유: 시간대가 UTC 로 되돌아가면 같은
    hour=9 가 한국시간 18시가 되는데, 숫자 비교만으로는 그걸 잡지 못한다. 위
    test_the_app_scheduler_uses_the_configured_timezone 과 짝으로 읽어야 한다.
    """
    for name, hour in (
        ("순위 알림", settings.RANK_ALERT_CRON_HOUR),
        ("순위 수집", settings.RANK_COLLECT_CRON_HOUR),
    ):
        assert MORNING_START <= int(hour) <= MORNING_END, f"{name} 시각이 아침이 아니다: {hour}시"

    # 수집이 평가보다 먼저여야 그날 알림이 당일 데이터를 본다.
    assert int(settings.RANK_COLLECT_CRON_HOUR) <= int(settings.RANK_ALERT_CRON_HOUR)


def test_cron_hours_are_plain_hour_values():
    """시각 설정은 시간대를 품지 않는다 — 기준 시간대는 스케줄러 한 곳에서만 정한다.

    설정값에 "+09:00" 같은 오프셋이 섞이면 int() 변환이 깨지고, 어느 쪽이 기준인지
    읽는 사람이 알 수 없게 된다.
    """
    for value in (
        settings.REPORT_CRON_HOUR,
        settings.RANK_ALERT_CRON_HOUR,
        settings.RANK_COLLECT_CRON_HOUR,
        settings.TRIAL_PURGE_CRON_HOUR,
    ):
        assert int(value) in range(24)
