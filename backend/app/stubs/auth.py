"""
############################################################
#  【假的／暫代】登入驗證 —— 這不是正式程式碼
#
#  正式的 Token 驗證 dependency 是負責「登入」的組員寫的。
#  等他們完成後：
#    1. 刪掉這個檔案
#    2. 在 app/api/recognize.py 把
#         from app.stubs.auth import CurrentUser, get_current_user
#       改成他們的 import
#    3. 確認他們回傳的物件有 user_id、role 兩個欄位
############################################################
"""

from dataclasses import dataclass

from fastapi import Header

from app.core.responses import AppError


@dataclass
class CurrentUser:
    user_id: str
    role: str


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    # 只檢查「有沒有帶 Bearer token」，不檢查簽章與過期。
    if not authorization or not authorization.startswith("Bearer "):
        raise AppError(401, "UNAUTHORIZED", "Missing or invalid token")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise AppError(401, "UNAUTHORIZED", "Missing or invalid token")

    # 測試用：token 是 "token-other" 時，當作另一個使用者（用來測 403）
    if token == "token-other":
        return CurrentUser(user_id="user-002", role="staff")
    return CurrentUser(user_id="user-001", role="deaf")
