# 後端

守護無聲世界 後端服務

## 技術架構

- Python 3.12+
- FastAPI
- SQLAlchemy
- PostgreSQL
- Supabase

## 需求

- Python 3.12+
- Supabase project

## 設置

### 1. 創建Python虛擬環境

```bash
python -m venv .venv
```

啟動虛擬環境：

```bash
# Windows
.venv\Scripts\activate

# Mac
source .venv/bin/activate
```

### 2. 安裝套件

```bash
pip install -r requirements.txt
```

### 3. 設定環境變數

建立 `.env`檔案:

```env
DATABASE_URL=supabase連結字串
AI_MODE=mock
AI_API_URL=
AI_TIMEOUT_SECONDS=30
```

`AI_MODE=mock` 使用 Backend 內建的固定中文回覆。要呼叫 AI 服務，設定
`AI_MODE=real` 並填入 `AI_API_URL`（只填主機位址，例如
`http://localhost:8000`）。未設定 `AI_MODE` 時，會依 `AI_API_URL` 是否有值
沿用自動切換：空值使用 Mock，有值呼叫 AI 服務。

### 4. 啟動伺服器

```bash
uvicorn app.main:app --reload --port 3000
```

API可通過以下網址存取:

```text
http://localhost:3000
```

Swagger API 文件:

```text
http://localhost:3000/docs
```

後端服務狀態檢查:

```text
http://localhost:3000/api/health
```

### 5. 執行測試

```bash
python -m pytest
```

## 啟動 AI Mock API

在專案根目錄執行：

```bash
python -m pip install -r ai_model/requirements.txt
python -m uvicorn ai_model.main:app --reload --port 8000
```

`POST http://localhost:8000/api/recognize` 接收 `multipart/form-data` 的
`video`、`session_id`、`scenario_id`、`language`，成功時依相同的
`{success, data: {text}, error}` 格式回傳中文 Mock 結果。要讓 Backend
呼叫此服務，將 `.env` 設為 `AI_MODE=real`、`AI_API_URL=http://localhost:8000`。
