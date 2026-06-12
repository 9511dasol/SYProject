from sqlalchemy.orm import Session

from app.models.system_setting_model import SystemSetting


class SystemSettingRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_all(self) -> list[SystemSetting]:
        return self.db.query(SystemSetting).order_by(SystemSetting.key).all()

    def get(self, key: str) -> SystemSetting | None:
        return self.db.get(SystemSetting, key)

    def set_value(self, key: str, value: bool) -> SystemSetting:
        setting = self.get(key)
        if setting is None:
            raise ValueError(f"설정 키를 찾을 수 없습니다: {key}")
        setting.value = "true" if value else "false"
        self.db.commit()
        self.db.refresh(setting)
        return setting

    def ensure_defaults(self, defaults: dict[str, tuple[str, str]]) -> None:
        """존재하지 않는 키만 기본값으로 생성한다. defaults: key -> (value, description)"""
        existing = {s.key for s in self.list_all()}
        for key, (value, description) in defaults.items():
            if key not in existing:
                self.db.add(SystemSetting(key=key, value=value, description=description))
        self.db.commit()
