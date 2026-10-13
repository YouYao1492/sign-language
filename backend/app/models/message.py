"""messages 資料表（這張是「接收影片→回傳前端」這個功能自己的資料表）。"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ============================================================
# 【待確認】sender_type / message_type 可以填哪些值，API 文件沒有定義。
# 下面是「暫定值」，跟前端、AI 組員確認後再改。
#   sender_type  暫時直接用登入者的 role（deaf / staff）
#   message_type 手語辨識產生的訊息，暫定 "sign_recognition"
# ============================================================
MESSAGE_TYPE_SIGN_RECOGNITION = "sign_recognition"


class Message(Base):
    __tablename__ = "messages"

    message_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    # 【待替換】session 組員的 sessions 表做好後，這裡要改成
    # ForeignKey("sessions.<主鍵欄位>")，型別也要跟他們的主鍵一致。
    # 目前文件範例是 "session-001" 這種字串，所以先用 String。
    session_id: Mapped[str] = mapped_column(String(64), index=True)

    sender_type: Mapped[str] = mapped_column(String(20))
    message_type: Mapped[str] = mapped_column(String(30))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
