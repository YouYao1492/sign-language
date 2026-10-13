# 手語辨識 API（`POST /api/recognize`）交接說明

> 範圍：**接收影片 → 呼叫 AI → 存 Message → 回傳前端**。
> 目前登入、Session、AI 都還沒接上，用「假的」暫代。這份文件說明：做到哪、每個檔案做什麼、**哪裡要換成真的**、Checklist 現況。

---

## 1. 目前做到什麼程度

```text
前端上傳影片 + session_id / scenario_id / language
 ↓
[真的] 檢查欄位、影片是否存在、影片是否為空          app/api/recognize.py
 ↓
[假的] 驗證 Token（任何 Bearer xxx 都通過）           app/stubs/auth.py
 ↓
[假的] 查 Session / 情境（寫死的資料）                 app/stubs/sessions.py
 ↓
[假或真] 呼叫 AI                                       app/services/ai_client.py
          .env 沒設 AI_API_URL → 回固定文字（假）
          .env 有設 AI_API_URL → 真的轉發影片給 AI
 ↓
[真的] 存進 messages 資料表                            app/models/message.py
 ↓
[真的] 回傳 { "success": true, "data": { "text": "..." }, "error": null }
```

- 自動測試：`python -m pytest` → **13 passed**（1 個 health + 12 個辨識）。測試一律使用記憶體 SQLite，**不會碰到 Supabase**。
- **還沒做**：連 Supabase 實際寫入、接真 AI、接真 Token / Session、瀏覽器前端實際串接（`main.py` 尚未加 CORS）。

---

## 2. 怎麼找到「要換成真的」的地方

整個專案用三種標記，用編輯器全域搜尋（VS Code：`Ctrl+Shift+F`）即可找到全部：

| 搜尋這個字 | 代表 |
|---|---|
| `【STUB】` | 這一行用了假的東西，之後要換掉（在 `recognize.py`） |
| `【待替換】` | 等別人的功能完成後要改（在 `message.py`、`stubs/` 檔頭） |
| `【待確認】` | 全組還沒決定的值（在 `message.py`、`recognize.py`） |

另外 `app/stubs/` 整個資料夾都是暫代，**之後整個刪掉**。

---

## 3. 要替換的清單

| # | 暫代的東西 | 誰負責換 | 假的在哪 | 怎麼換 |
|---|---|---|---|---|
| 1 | Token 驗證 | 登入組員 | `app/stubs/auth.py` | 見下方「換法 A」 |
| 2 | Session 查詢 | Session 組員 | `app/stubs/sessions.py` 的 `get_session_by_id` | 見下方「換法 B」 |
| 3 | 情境（scenario）檢查 | Session 組員 | `app/stubs/sessions.py` 的 `is_valid_scenario` | 換成真正的情境清單；若 Session 建立時已檢查，可移除 |
| 4 | `messages.session_id` 沒有外鍵 | Session 組員 / 辨識負責人 | `app/models/message.py`（標【待替換】） | 改成 `ForeignKey("sessions.<主鍵欄位>")`，型別要與 sessions 主鍵一致 |
| 5 | `sender_type`、`message_type` 的值 | 全組討論 | `app/models/message.py`、`app/api/recognize.py`（標【待確認】） | 目前暫定：`sender_type` = 登入者 role（`deaf`/`staff`），`message_type` = `"sign_recognition"` |
| 6 | AI 辨識 | AI 組員 | `app/services/ai_client.py` 的假資料 `MOCK_TEXT` | **不用改程式**，在 `.env` 設 `AI_API_URL`（見第 4 節） |
| 7 | `messages` 資料表 | 全組決定誰建 | （尚未建立） | 在 Supabase 建表（`create_all`、migration 或 SQL Editor，要先約好） |

### 換法 A：Token 驗證（登入組員）

在 `app/api/recognize.py` 找到 `【STUB】` 那一行：

```python
from app.stubs.auth import CurrentUser, get_current_user
```

換成登入組員提供的 dependency。**需求**：它回傳的物件要有 `user_id` 與 `role` 兩個屬性；Token 無效或過期要回 `401 UNAUTHORIZED`。換完後刪除 `app/stubs/auth.py`。

### 換法 B：Session 查詢（Session 組員）

在 `app/api/recognize.py` 找到 `【STUB】` 那一行：

```python
from app.stubs.sessions import get_session_by_id, is_valid_scenario
```

換成真正的資料庫查詢。**需求**：`get_session_by_id(db, session_id)` 查不到要回 `None`；查到的物件要有 `.user_id` 和 `.status`（`"active"` 或 `"completed"`）。換完後刪除 `app/stubs/sessions.py`。

### 換完之後，測試要跟著改

`tests/test_recognize.py` 目前依賴假資料（`session-001`、`session-other`、`session-completed`，以及 Token `token-other`）。換成真的之後，這幾個測試會失敗，這是正常的。做法二選一：

1. 用 `app.dependency_overrides[get_current_user] = ...` 在測試中指定登入者；
2. 在測試資料庫中先建立對應的 session 資料。

---

## 4. `AI_API_URL` 在哪裡？

程式碼裡**看不到大寫的 `AI_API_URL` 字串**，這是正常的。它靠 pydantic-settings 自動對應（不分大小寫）：

```text
.env 檔                         app/core/config.py                  app/services/ai_client.py
AI_API_URL=http://localhost:8000  →  ai_api_url: str = ""   →   settings.ai_api_url
AI_TIMEOUT_SECONDS=30             →  ai_timeout_seconds: int = 30 →  settings.ai_timeout_seconds
```

- `config.py` 裡的欄位 `ai_api_url` 會自動讀取環境變數 / `.env` 的 `AI_API_URL`。
- `ai_client.py` 裡 `if not settings.ai_api_url:` 就是「沒設定 → 回假資料」，有設定 → 轉發。
- 轉發的網址是 `{AI_API_URL}/api/recognize`，所以 **`AI_API_URL` 只填到主機位址**，例如 `http://localhost:8000`，不要包含 `/api/recognize`。

**切換 Mock / 真 AI 只改 `.env`，不用改程式：**

```env
# 假 AI（預設）：留空
AI_API_URL=

# 真 AI 或 AI 組員的 Mock AI 服務
AI_API_URL=http://localhost:8000
AI_TIMEOUT_SECONDS=30
```

建議把這兩行也加進 `.env.example`（只新增），組員才知道有這個設定。

---

## 5. 每個檔案在做什麼

| 檔案 | 功用 | 狀態 |
|---|---|---|
| `app/api/recognize.py` | 辨識 API 入口：收影片與欄位 → 檢查 → 呼叫 AI → 存 Message → 回傳 | 正式 |
| `app/services/ai_client.py` | 呼叫 AI；沒設 `AI_API_URL` 回假文字，有設就轉發影片並處理 AI 的各種錯誤 | 正式（假資料可由 `.env` 關閉） |
| `app/models/message.py` | `messages` 資料表的 ORM 模型 | 正式（兩個欄位值待確認） |
| `app/core/responses.py` | 統一 `{success, data, error}` 格式；`AppError` 業務錯誤；把 FastAPI 預設的 422 改成 `400 INVALID_REQUEST`、未處理例外改成 `500 SERVER_ERROR` | 正式，**影響全專案** |
| `app/core/config.py`（修改） | 新增 `ai_api_url`、`ai_timeout_seconds` 兩個設定 | 正式 |
| `app/main.py`（修改） | 新增 `register_exception_handlers(app)` 與 `include_router(recognize.router)` | 正式 |
| `app/stubs/auth.py` | 假的 Token 驗證 | **暫代，之後刪除** |
| `app/stubs/sessions.py` | 假的 Session / 情境查詢 | **暫代，之後刪除** |
| `tests/test_recognize.py` | 12 個辨識 API 測試 | 正式（換真的後要調整） |
| `tests/conftest.py` | 讓所有測試使用記憶體 SQLite，不需 `.env` | 正式 |
| `requirements.txt`（修改） | 新增 `python-multipart`、`httpx` | 正式 |

**對其他組員的影響：**

- `main.py`、`config.py` 是共用檔案，push 前先 `git pull`，避免衝突。
- `responses.py` 的錯誤處理套用到**所有** API（含登入、Session）：驗證失敗會回 `400`（符合 API 文件），不是 FastAPI 預設的 `422`。建議其他 API 也用 `AppError` 與 `ok()`，回應格式才一致。

---

## 6. Checklist 現況（B. 後端）

標註說明：`[x]` 已完成並驗證；`[ ]` 未完成，後面註明原因。

### Server

* [X] backend 檔案建制
* [ ] ~~Node.js / Express~~ Server 可以正常啟動（改為 FastAPI；待實際用 `uvicorn` 啟動確認）
* [ ] `.env` 設定完成（目前只有 `.env.example`）
* [ ] ~~MongoDB~~ 可以正常連線（改為 Supabase；尚未連線測試）
* [x] API Base Path 統一為 `/api`（辨識 API 與 health 已是 `/api`）

### Login / Authentication / Session（他人負責）

* 全部由登入、Session 組員負責，辨識 API 只「使用」其成果（見第 3 節換法 A、B）。

### Sign Recognition

* [x] 實作 `POST /api/recognize`
* [ ] API 必須驗證 Token（**假的**：只檢查有沒有帶 Bearer）
* [x] 接收 Video
* [x] 接收 `session_id`
* [x] 接收 `scenario_id`
* [x] 接收 `language`
* [ ] 驗證 Session 是否存在（**假的**資料）
* [ ] 驗證 Session 是否屬於目前 User（**假的**資料）
* [x] 驗證 Video 是否存在
* [ ] 將 Video 傳送給 AI（程式已寫，只用模擬的 AI 測過；待真 AI）
* [ ] 接收 AI 回傳的 `text`（同上）
* [ ] 將辨識結果建立成 Message（SQLite 測過；待 Supabase）
* [x] 回傳辨識結果給 Frontend（目前內容是假資料）

### Backend ↔ AI

* [x] AI API URL 可以透過 `.env` 設定
* [ ] Backend 可以呼叫 `POST /api/recognize`（待真 AI）
* [ ] 正確傳送 Video（待真 AI）
* [ ] 正確傳送 `session_id`（待真 AI）
* [ ] 正確傳送 `scenario_id`（待真 AI）
* [ ] 正確傳送 `language`（待真 AI）
* [ ] 可以處理 AI Success Response（待真 AI）
* [ ] 可以處理 AI Recognition Error（待真 AI）
* [ ] 可以處理 AI Timeout（以模擬的逾時例外驗證過；未用真的慢速 AI 測）
* [ ] AI 無法連線時回傳適當錯誤（以模擬的連線失敗驗證過；待真 AI 環境）

### Message Storage（Supabase）

* [ ] 建立 `messages` table（尚未在 Supabase 建立）
* [ ] AI 辨識成功後建立 Message（待 Supabase）
* [ ] Message 儲存 `message_id`
* [ ] Message 儲存 `session_id`
* [ ] Message 儲存 `sender_type`（值待確認）
* [ ] Message 儲存 `message_type`（值待確認）
* [ ] Message 儲存 `text`
* [ ] Message 儲存 `created_at`

### 最小資料

* [ ] `users`（他人負責）
* [ ] `sessions`（他人負責）
* [ ] `messages`（待 Supabase）

> 已完成 **9 項**：base path、實作 recognize、接收 Video 與三個欄位、驗證 Video 存在、回傳結果、AI URL 可由 `.env` 設定。其餘依賴組員的功能、真 AI、或 Supabase。
> Checklist 內的 Node.js / Express、MongoDB、collection 字樣已過時，建議改為 FastAPI、Supabase / PostgreSQL、table。

---

## 7. 本機執行

```bash
# 測試（不需要 .env）
python -m pytest

# 啟動伺服器（需要 backend/.env，內含 DATABASE_URL）
uvicorn app.main:app --reload --port 3000
# Swagger： http://localhost:3000/docs
```

手動測試辨識 API（假 Token 與假 Session）：

```bash
curl -X POST http://localhost:3000/api/recognize \
  -H "Authorization: Bearer abc" \
  -F video=@test.webm -F session_id=session-001 -F scenario_id=bank -F language=zh-TW
```
