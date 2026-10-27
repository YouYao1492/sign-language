# Sign Language 手語辨識系統

### 啟動前端（Frontend）

使用 VS Code 開啟專案根目錄 sign-language。

前往 Extensions（擴充套件）。

搜尋並安裝 Live Server。

在檔案總管中開啟 frontend/index.html。

在編輯器內按右鍵，選擇 Open with Live Server。

瀏覽器會自動開啟前端頁面，通常網址為：

http://127.0.0.1:5500/frontend/index.html

Live Server 的連接埠可能依本機設定而不同。

### 建立 Python 虛擬環境（Backend）

開啟另一個終端機，進入後端目錄：

```
cd backend
```

使用 Python 3.14 建立虛擬環境：

Windows
```
py -3.14 -m venv .venv
```
啟用虛擬環境：
```
.venv\Scripts\activate.bat
```
啟用成功後，終端機通常會在提示字元前顯示 (.venv)。

### 安裝後端套件

確認目前位於 backend 目錄，並已啟用虛擬環境。

先更新 pip：
```
python -m pip install --upgrade pip
```
安裝專案所需套件：
```
python -m pip install -r requirements.txt
```
### 設定環境變數

確認 backend 目錄中的環境設定檔已正確設定。

在 backend 新增檔案 .env

### 啟動後端（Backend）

確認目前位於 backend 目錄，並且虛擬環境已啟用。

執行：
```
python -m uvicorn app.main:app --reload --port 3000
```
成功啟動後，後端 API 位址為：

http://127.0.0.1:3000

FastAPI 互動式 API 文件：

http://127.0.0.1:3000/docs

啟動後請保持終端機開啟；若要停止服務，按下 Ctrl + C。
