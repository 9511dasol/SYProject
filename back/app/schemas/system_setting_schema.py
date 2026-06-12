from pydantic import BaseModel


class FeatureFlagOut(BaseModel):
    key: str
    value: bool
    description: str


class FeatureFlagUpdate(BaseModel):
    value: bool
