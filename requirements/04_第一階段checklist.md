# D. 驗收 Checklist

## 完整流程

* [ ] 使用者可以登入
* [ ] 可以建立 Session
* [ ] 可以開啟攝影機
* [ ] 可以看到 Camera Preview
* [ ] 可以錄製手語
* [ ] 可以停止錄影
* [ ] 可以取得 Video Blob
* [ ] 可以上傳 Video
* [ ] Backend 收到 Video
* [ ] Backend 成功呼叫 AI
* [ ] AI 回傳中文文字
* [ ] Backend 將結果存成 Message
* [ ] Frontend 顯示中文文字

## Demo流程

```text
Login
  ↓
建立 Session
  ↓
開啟 Camera
  ↓
錄製手語
  ↓
停止
  ↓
上傳 Video
  ↓
Backend
  ↓
AI Recognition
  ↓
「我要掛號」
  ↓
儲存 Message
  ↓
Frontend 顯示
```