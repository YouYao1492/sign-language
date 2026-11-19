"""Mock AI recognition API. Replace the mock recognizer with a trained model when available."""

import tempfile

from hand_capture.hand_detector import extract_hand_info

import logging
import os

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

MOCK_TEXT = os.getenv("MOCK_RECOGNITION_TEXT", "我要辦信用卡")

app = FastAPI(title="Sign Language AI", version="0.1.0")


def _response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "data": None,
            "error": {"code": code, "message": message},
        },
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return _response(400, "INVALID_REQUEST", "Invalid request")


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("AI recognition failed")
    return _response(500, "AI_SERVER_ERROR", "AI server error")


@app.get("/api/health")
async def health_check() -> dict:
    return {"success": True, "data": {"status": "ok"}, "error": None}


@app.post("/api/recognize")
async def recognize_sign_video(
    video: UploadFile | None = File(default=None),
    session_id: str | None = Form(default=None),
    scenario_id: str | None = Form(default=None),
    language: str | None = Form(default=None),
):
    if video is None or not session_id or not scenario_id or not language:
        return _response(
            400,
            "INVALID_REQUEST",
            "video, session_id, scenario_id, language are required",
        )

    content = await video.read()

    if not content:
        return _response(
            400,
            "VIDEO_INVALID",
            "Invalid video",
        )

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=".mp4",
    ) as temp_file:
        temp_file.write(content)
        video_path = temp_file.name

    result = extract_hand_info(video_path)
    text = predict(result)
    return {
    "success": True,
    "data": {
        "text": text,
        "total_frames": result["total_frames"],
        "hand_frames": result["hand_frames"],
        "landmarks_count": result["landmarks_count"]
    },
    "error": None,
}
    from recognition.predictor import predict