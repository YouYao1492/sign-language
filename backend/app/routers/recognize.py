"""POST /api/recognize —— 接收手語影片 → 呼叫 AI → 存 Message → 回傳文字。"""

import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.responses import AppError, ok
from app.models.message import MESSAGE_TYPE_SIGN_RECOGNITION, Message
from app.models.session import Session as SessionModel
from app.models.user import User
from app.services import ai_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["recognize"])


@router.post("/recognize")
async def recognize_sign_video(
    # 欄位都設成可選，是為了缺欄位時能回文件規定的 400 INVALID_REQUEST（不是 FastAPI 預設的 422）
    video: UploadFile | None = File(default=None),
    session_id: str | None = Form(default=None),
    scenario_id: str | None = Form(default=None),
    language: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1) 欄位與影片是否存在
    if video is None or not session_id or not scenario_id or not language:
        raise AppError(
            400,
            "INVALID_REQUEST",
            "video, session_id, scenario_id, language are required",
        )

    video_bytes = await video.read()
    if not video_bytes:
        raise AppError(400, "INVALID_REQUEST", "Video is empty")

    # 2) Session 檢查
    session = (
        db.query(SessionModel).filter(SessionModel.session_id == session_id).first()
    )
    if session is None:
        raise AppError(404, "SESSION_NOT_FOUND", "Session not found")
    if session.user_id != current_user.id:
        raise AppError(403, "FORBIDDEN", "Session does not belong to current user")
    if session.status == "completed":
        raise AppError(409, "SESSION_COMPLETED", "Session already completed")
    if session.scenario_id != scenario_id:
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
