from pydantic import BaseModel, Field


class SessionCreateRequest(BaseModel):
    scenario_id: str = Field(min_length=1, max_length=100)
    language: str = Field(min_length=1, max_length=20)


class SessionUpdateRequest(BaseModel):
    scenario_id: str | None = Field(default=None, min_length=1, max_length=100)
    language: str | None = Field(default=None, min_length=1, max_length=20)
    status: str | None = Field(default=None, min_length=1, max_length=20)


class SessionData(BaseModel):
    session_id: str
    scenario_id: str
    language: str
    status: str


class SessionCreateResponse(BaseModel):
    success: bool
    data: SessionData | None
    error: str | None


class SessionListResponse(BaseModel):
    success: bool
    data: list[SessionData] | None
    error: str | None


class SessionResponse(BaseModel):
    success: bool
    data: SessionData | None
    error: str | None


class SessionDeleteData(BaseModel):
    session_id: str
    deleted: bool


class SessionDeleteResponse(BaseModel):
    success: bool
    data: SessionDeleteData | None
    error: str | None
