"""POST /api/recognize —— 接收手語影片 → 呼叫 AI → 存 Message → 回傳文字。

標示【STUB】的地方，是用「別人還沒完成的部分」的假版本暫代，
之後要換成正式的（清單見 app/stubs/ 底下各檔案的檔頭）。
"""

import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.responses import AppError, ok
from app.models.message import MESSAGE_TYPE_SIGN_RECOGNITION, Message
from app.services import ai_client

# 【STUB】登入驗證：之後換成登入組員的 dependency
from app.stubs.auth import CurrentUser, get_current_user

# 【STUB】Session / 情境查詢：之後換成真正的資料庫查詢
from app.stubs.sessions import get_session_by_id, is_valid_scenario

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["recognize"])


@router.post("/recognize")
async def recognize_sign_video(
    # 欄位都設成可選，是為了缺欄位時能回文件規定的 400 INVALID_REQUEST（不是 FastAPI 預設的 422）
    video: UploadFile | None = File(default=None),
    session_id: str | None = Form(default=None),
    scenario_id: str | None = Form(default=None),
    language: str | None = Form(default=None),
    current_user: CurrentUser = Depends(get_current_user),  # 【STUB】驗證 Token（失敗 → 401）
    db: Session = Depends(get_db),
):
    # 1) 欄位與影片是否存在
    if video is None or not session_id or not scenario_id or not language:
        raise AppError(400, "INVALID_REQUEST", "video, session_id, scenario_id, language are required")

    video_bytes = await video.read()
    if not video_bytes:
        raise AppError(400, "INVALID_REQUEST", "Video is empty")

    # 2) Session 檢查
    session = get_session_by_id(db, session_id)  # 【STUB】
    if session is None:
        raise AppError(404, "SESSION_NOT_FOUND", "Session not found")
    if session.user_id != current_user.user_id:  # 要屬於目前登入的 user（user_id 來自 Token，不是前端傳的）
        raise AppError(403, "FORBIDDEN", "Session does not belong to current user")
    if session.status == "completed":
        raise AppError(409, "SESSION_COMPLETED", "Session already completed")
    if not is_valid_scenario(db, scenario_id):  # 【STUB】
        raise AppError(404, "SCENARIO_NOT_FOUND", "Scenario not found")

    # 3) 呼叫 AI（AI_API_URL 沒設 → 假資料；失敗時 ai_client 會 raise AppError）
    text = await ai_client.recognize(
        video_bytes=video_bytes,
        filename=video.filename,
        content_type=video.content_type,
        session_id=session_id,
        scenario_id=scenario_id,
        language=language,
    )

    # 4) 辨識成功 → 存成 Message
    message = Message(
        session_id=session_id,
        sender_type=current_user.role,  # 【待確認】暫定用 role
        message_type=MESSAGE_TYPE_SIGN_RECOGNITION,  # 【待確認】暫定值
        text=text,
    )
    try:
        db.add(message)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to save message")
        raise AppError(500, "SERVER_ERROR", "Failed to save message")

    # 5) 回傳（格式依 前端-後端.md：data.text）
    return ok({"text": text})
