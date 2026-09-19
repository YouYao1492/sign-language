# Sign Language 手語辨識系統

**第一階段**：基本的登入、手語錄影與辨識功能。

### 第一階段的主要流程：

```text
登入
 ↓
建立 Session
 ↓
開啟攝影機
 ↓
錄製手語
 ↓
停止錄影
 ↓
取得 Video
 ↓
送到 Backend
 ↓
Backend 呼叫 AI
 ↓
AI 辨識手語
 ↓
回傳中文文字
 ↓
Frontend 顯示結果
```

例如：

```text
使用者錄製「我要辦信用卡」
            ↓
          AI 辨識
            ↓
      「我要辦信用卡」
```

# 專案架構

目前專案主要分成三個部分：

```text
sign-language/
│
├── frontend/       # 前端
│
├── backend/        # 後端
│
├── ai-model/       # AI 手語辨識
│
├── docs/           # API 文件
│
└── requirements/   # 開發需求與 Checklist
```

### 前端

負責：

* 登入畫面
* Session 建立
* 情境選擇
* 開啟攝影機
* 錄製手語
* 上傳影片
* 顯示 AI 辨識結果

### 後端

負責：

* 使用者登入
* JWT 驗證
* 建立 Session
* 接收手語影片
* 呼叫 AI
* 儲存辨識結果
* 回傳辨識結果給前端

### AI

負責：

* 接收手語影片
* 進行手語辨識
* 將結果轉成中文文字


# 使用

### Clone 專案

先將 GitHub 專案下載到自己的電腦：

```bash
git clone https://github.com/YouYao1492/sign-language.git
```

進入專案：

```bash
cd sign-language
```

# 登入

前端會呼叫：

```http
POST /api/login
```

Request：

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

登入成功後後端會回傳：

```json
{
  "success": true,
  "data": {
    "user_id": "user-001",
    "email": "user@example.com",
    "role": "deaf",
    "token": "token-example"
  },
  "error": null
}
```

前端需要保存 `token`。

之後需要登入權限的 API，都要帶：

```http
Authorization: Bearer <token>
```

# 建立 Session

登入後，前端可以建立 Session：

```http
POST /api/sessions
```

Request：

```json
{
  "scenario_id": "medical",
  "language": "zh-TW"
}
```

後端會回傳：

```json
{
  "success": true,
  "data": {
    "session_id": "session-001",
    "scenario_id": "medical",
    "language": "zh-TW",
    "status": "active"
  },
  "error": null
}
```

# 手語辨識

使用者錄製完手語影片後，前端會將影片上傳到：

```http
POST /api/recognize
```

格式：

```text
multipart/form-data
```

需要傳送：

```text
video        = 手語影片
session_id   = session-001
scenario_id  = medical
language     = zh-TW
```

流程：

```text
Frontend
   │
   │ Video
   ↓
Backend
   │
   │ Video
   ↓
  AI
   │
   │ 中文文字
   ↓
Backend
   │
   │ 儲存 Message
   ↓
Frontend
   │
   ↓
顯示中文文字
```

例如 AI 回傳：

```json
{
  "success": true,
  "data": {
    "text": "我要掛號"
  },
  "error": null
}
```

Frontend 最後顯示：

```text
我要掛號
```


# 負責内容

### 前端

主要負責：

```text
Login
Session
Camera
Video Recording
Video Upload
顯示辨識結果
```

主要 API：

```text
POST /api/login
POST /api/sessions
POST /api/recognize
```


### 後端

主要負責：

```text
Login
JWT
Session
接收 Video
呼叫 AI
儲存 Message
```

主要 API：

```text
POST /api/login
POST /api/sessions
POST /api/recognize
```


### AI

主要負責：

```text
接收 Video
 ↓
手語辨識
 ↓
中文文字
```

提供：

```text
POST /api/recognize
```


# API 文件

API 規格放在：

```text
docs/api-contract/
```

目前主要有：

```text
前端-後端.md
後端-AI.md
```



# 注意事項

### 1. 不要把 `.env` 上傳

例如：

```text
.env
```

裡面的：

```text
JWT_SECRET
MONGODB_URI
AI_API_URL
```

不要直接推到 GitHub。

### 2. Commit 寫清楚

例如：

```text
feat: 新增登入頁面
feat: 增加影片上傳功能
fix: 修改AI識別API
docs: update README
```

### 3. 開發前先 Pull

開始前：

```bash
git pull
```

完成後再：

```bash
git add .
git commit -m "你的修改內容"
git push
```

# 第一階段目標

完成：

```text
登入
 ↓
建立 Session
 ↓
錄製手語
 ↓
上傳影片
 ↓
AI 辨識
 ↓
得到中文文字
 ↓
畫面顯示結果
```

另外有附上checklist可以參考裏面的内容，有做了的就可以打勾（中括號裏面放`[x]`）
