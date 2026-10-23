
from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RegisterData(BaseModel):
    user_id: int
    email: EmailStr
    role: str


class RegisterResponse(BaseModel):
    success: bool
    data: RegisterData | None
    error: dict | None
