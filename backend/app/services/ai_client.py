"""後端 → AI 的呼叫（對應 docs/api-contract/後端-AI.md）。

切換方式：.env 的 AI_API_URL
  - 空字串  → 回傳內建的假資料（AI 還沒好時用）
  - 有填    → 把影片用 multipart/form-data 轉發到  {AI_API_URL}/api/recognize
不需要改程式碼。
"""

import logging

import httpx

from app.core.config import settings
from app.core.responses import AppError

logger = logging.getLogger(__name__)

MOCK_TEXT = "我要辦信用卡"  # 假資料：想換成別的句子改這裡


async def recognize(
    *,
    video_bytes: bytes,
    filename: str | None,
    content_type: str | None,
    session_id: str,
    scenario_id: str,
    language: str,
) -> str:
    """回傳辨識出的中文文字；失敗時 raise AppError。"""

    # ---------- 假的 AI ----------
    if not settings.ai_api_url:
        return MOCK_TEXT

    # ---------- 真的 AI ----------
    url = settings.ai_api_url.rstrip("/") + "/api/recognize"
    files = {
        "video": (
            filename or "video.webm",
            video_bytes,
            content_type or "application/octet-stream",
        )
    }
    data = {"session_id": session_id, "scenario_id": scenario_id, "language": language}

    try:
        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            resp = await client.post(url, files=files, data=data)
    except httpx.TimeoutException:
        logger.warning("AI timeout: %s", url)
        raise AppError(500, "SERVER_ERROR", "AI recognition timeout")
    except httpx.RequestError as exc:
        logger.warning("AI unreachable: %s (%s)", url, exc)
        raise AppError(500, "SERVER_ERROR", "AI service unavailable")

    try:
        body = resp.json()
    except ValueError:
        body = None

    if resp.status_code == 200 and isinstance(body, dict) and body.get("success"):
        text = (body.get("data") or {}).get("text")
        if isinstance(text, str) and text:
            return text
        raise AppError(500, "SERVER_ERROR", "AI returned empty text")

    # AI 回的錯誤碼（後端-AI.md）轉成前端文件有的錯誤碼
    ai_code = ((body or {}).get("error") or {}).get("code") if isinstance(body, dict) else None
    logger.warning("AI error: status=%s code=%s", resp.status_code, ai_code)

    if ai_code in ("VIDEO_INVALID", "INVALID_REQUEST"):
        raise AppError(400, "INVALID_REQUEST", "Invalid video")
    if ai_code == "AI_TIMEOUT":
        raise AppError(500, "SERVER_ERROR", "AI recognition timeout")
    if ai_code == "AI_RECOGNITION_FAILED":
        raise AppError(500, "SERVER_ERROR", "AI recognition failed")
    raise AppError(500, "SERVER_ERROR", "AI server error")
