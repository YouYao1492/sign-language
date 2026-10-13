"""
############################################################
#  【假的／暫代】Session 查詢 —— 這不是正式程式碼
#
#  正式的 sessions 資料表與 Model 是負責「Session」的組員寫的。
#  這裡用一份寫死的假資料代替，所以「不會」建立任何資料表。
#  等他們完成後：
#    1. 刪掉這個檔案
#    2. 在 app/api/recognize.py 把 get_session_by_id / is_valid_scenario
#       換成真正的資料庫查詢（參數 db 就是為了這個預留的）
#    3. 把 app/models/message.py 的 session_id 改成 ForeignKey
############################################################
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session


@dataclass
class StubSession:
    session_id: str
    user_id: str
    scenario_id: str
    status: str  # active / completed


# 假資料：user-001 有一個進行中、一個已結束的 session；user-002 有一個
_FAKE_SESSIONS = {
    "session-001": StubSession("session-001", "user-001", "bank", "active"),
    "session-completed": StubSession("session-completed", "user-001", "bank", "completed"),
    "session-other": StubSession("session-other", "user-002", "medical", "active"),
}

# 假的情境清單（文件沒定義有哪些情境）
_FAKE_SCENARIOS = {"bank", "medical"}


def get_session_by_id(db: Session, session_id: str) -> StubSession | None:
    return _FAKE_SESSIONS.get(session_id)


def is_valid_scenario(db: Session, scenario_id: str) -> bool:
    return scenario_id in _FAKE_SCENARIOS
