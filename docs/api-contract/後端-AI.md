# 後端 ↔ AI

Base URL：

```text
/api
```

---

## 1. Sign Language Recognition

### POST `/api/recognize`

Content-Type：

```http
multipart/form-data
```

Request：

```text
video        = <video file>
session_id   = session-001
scenario_id  = medical
language     = zh-TW
```

---

## 2. Success Response

```json
{
  "success": true,
  "data": {
    "text": "我要辦信用卡"
  },
  "error": null,
  "timestamp": "2026-09-20T00:30:00+08:00"
}
```

 流程：

```text
Video
 ↓
Sign Recognition
 ↓
Chinese Text
```

---

## 3. Error Response

### Invalid Request

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request"
  }
}
```

### Invalid Video

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VIDEO_INVALID",
    "message": "Invalid video"
  }
}
```

### Recognition Failed

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "AI_RECOGNITION_FAILED",
    "message": "Recognition failed"
  }
}
```

### AI Timeout

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "AI_TIMEOUT",
    "message": "AI recognition timeout"
  }
}
```

### Server Error

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "AI_SERVER_ERROR",
    "message": "AI server error"
  }
}
```
