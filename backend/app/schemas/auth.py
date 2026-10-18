from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginData(BaseModel):
    user_id: int
    email: EmailStr
    role: str
    token: str


class LoginResponse(BaseModel):
    success: bool
    data: LoginData | None
    error: dict | None
