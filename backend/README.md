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
```

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
http://localhost:8000/api/health
```

### 5. 執行測試

```bash
python -m pytest
```
