"""統一回應格式 { success, data, error } 與錯誤處理。

API 文件規定所有回應都長這樣，所以錯誤也要包成同一種格式
（FastAPI 預設的 {"detail": ...} 不符合文件）。
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppError(Exception):
    """業務錯誤。在任何地方 raise，就會被轉成文件規定的錯誤格式。"""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def ok(data):
    return {"success": True, "data": data, "error": None}


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "data": None,
            "error": {"code": code, "message": message},
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError):
        return _error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        # FastAPI 預設回 422；API 文件的錯誤碼表是 400 INVALID_REQUEST
        return _error_response(400, "INVALID_REQUEST", "Invalid request")

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception):
        logger.exception("Unhandled error")
        return _error_response(500, "SERVER_ERROR", "Internal server error")
