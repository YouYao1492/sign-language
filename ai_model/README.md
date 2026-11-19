# AI Model API

This folder contains the AI recognition API. `main.py` currently provides a
Mock recognizer so the Backend and Frontend can exercise the full video-upload
contract before a trained sign-language model is available.

## Run the Mock API

From the project root:

```bash
python -m pip install -r ai_model/requirements.txt
python -m uvicorn ai_model.main:app --reload --port 8000
```

The API accepts `POST /api/recognize` as `multipart/form-data` with `video`,
`session_id`, `scenario_id`, and `language`. A non-empty video returns a Chinese
Mock result using the same response shape as the Backend:

```json
{"success": true, "data": {"text": "我要辦信用卡"}, "error": null}
```

Set `MOCK_RECOGNITION_TEXT` to override the demo text. The Mock does not inspect
the video or recognize real signs; replace its recognition step with a trained
model to enable actual sign-language recognition.

## Connect the Backend

Set the Backend's `backend/.env` to:

```env
AI_MODE=real
AI_API_URL=http://localhost:8000
```

`AI_MODE=mock` uses the Backend's built-in Mock instead. The recognition
endpoint and response contract are documented in
[`../docs/api-contract/後端-AI.md`](../docs/api-contract/後端-AI.md).
