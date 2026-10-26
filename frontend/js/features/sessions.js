import {
  createSession as createSessionRequest,
  getSession as getSessionRequest,
  getSessions as getSessionsRequest,
  updateSession,
} from "../api/sessionApi.js";
import { clearChatHistory } from "./chat.js";

const ACTIVE_SESSION_KEY = "activeSession";
let sessionSelectionRequestId = 0;

export function getActiveSession() {
  const session = localStorage.getItem(ACTIVE_SESSION_KEY);
  return session ? JSON.parse(session) : null;
}

export async function createSession(scenarioId, language = "zh-TW") {
  if (!scenarioId?.trim()) throw new Error("scenario_id 不可為空。");
  if (!language?.trim()) throw new Error("language 不可為空。");

  const requestId = ++sessionSelectionRequestId;
  const result = await createSessionRequest({
    scenario_id: scenarioId,
    language,
  });
  if (!result.data?.session_id) {
    throw new Error("建立 Session 成功，但後端未回傳 session_id。");
  }
  if (requestId !== sessionSelectionRequestId) return result.data;

  const currentSession = getActiveSession();
  if (currentSession?.session_id !== result.data.session_id) {
    clearChatHistory();
    document.getElementById("result_text").innerText =
      "等待手勢輸入中...";
  }
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(result.data));
  return result.data;
}

export async function getSessions() {
  const result = await getSessionsRequest();
  return result.data || [];
}

export async function selectSession(sessionId) {
  if (!sessionId) throw new Error("請選擇有效的 Session。");

  const requestId = ++sessionSelectionRequestId;
  const result = await getSessionRequest(sessionId);
  if (requestId !== sessionSelectionRequestId) return null;

  const session = result.data;
  if (!session?.session_id) {
    throw new Error("後端未回傳 Session 詳細資料。");
  }
  if (session.status !== "active") {
    throw new Error("此 Session 已完成，無法恢復為進行中的服務。");
  }

  const currentSession = getActiveSession();
  if (currentSession?.session_id !== session.session_id) {
    clearChatHistory();
    document.getElementById("result_text").innerText =
      "等待手勢輸入中...";
  }

  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  renderActiveSession();
  return session;
}

export async function completeSession() {
  const session = getActiveSession();
  if (!session) throw new Error("目前沒有進行中的 Session。");

  const result = await updateSession(session.session_id, {
    status: "completed",
  });
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  renderActiveSession();
  return result.data;
}

function renderSessionList(sessions, onSelect) {
  const list = document.getElementById("session_list");
  const activeSession = getActiveSession();
  list.replaceChildren();

  if (sessions.length === 0) {
    const item = document.createElement("li");
    item.innerText = "尚無 Session 記錄。";
    list.appendChild(item);
    return;
  }

  for (const session of sessions) {
    const item = document.createElement("li");
    const isActive = session.session_id === activeSession?.session_id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `w-full text-left hover:text-emerald-300 ${isActive ? "text-emerald-300" : "text-slate-400"}`;
    button.innerText = `${session.scenario_id} · ${session.status} · ${session.session_id}`;
    button.addEventListener("click", () => onSelect(session.session_id));
    item.appendChild(button);
    list.appendChild(item);
  }
}

function renderActiveSession() {
  const session = getActiveSession();
  const status = document.getElementById("active_session_status");
  const sessionId = document.getElementById("active_session_id");

  if (!session) {
    status.innerText = "尚未開始服務";
    sessionId.innerText = "";
    return;
  }

  status.innerText = `進行中 · ${session.scenario_id}`;
  sessionId.innerText = `Session ID: ${session.session_id}`;
}

export async function initSessions() {
  const startButton = document.getElementById("start_session_btn");
  const refreshButton = document.getElementById("refresh_sessions_btn");
  const errorMessage = document.getElementById("session_error");
  const sessionList = document.getElementById("session_list");
  if (!startButton || !refreshButton || !sessionList) return;

  const showError = (error) => {
    errorMessage.innerText = error.message || "Session 操作失敗。";
    errorMessage.classList.remove("hidden");
  };

  let loadedSessions = [];
  const handleSelectSession = async (sessionId) => {
    errorMessage.classList.add("hidden");
    try {
      await selectSession(sessionId);
      renderSessionList(loadedSessions, handleSelectSession);
    } catch (error) {
      showError(error);
    }
  };

  const loadSessions = async () => {
    if (!localStorage.getItem("userToken")) {
      document.getElementById("active_session_status").innerText =
        "請先登入以開始服務";
      document.getElementById("session_list").innerHTML =
        "<li>登入後載入 Session 清單。</li>";
      return;
    }

    try {
      errorMessage.classList.add("hidden");
      const sessions = await getSessions();
      loadedSessions = sessions;
      const activeSession = getActiveSession();
      const current = sessions.find(
        (session) => session.session_id === activeSession?.session_id,
      );

      if (current?.status === "active") {
        localStorage.setItem("activeSession", JSON.stringify(current));
      } else if (activeSession) {
        localStorage.removeItem("activeSession");
        clearChatHistory();
        document.getElementById("result_text").innerText =
          "請選擇或開始服務 Session。";
      }

      renderActiveSession();
      renderSessionList(sessions, handleSelectSession);
    } catch (error) {
      showError(error);
    }
  };

  startButton.addEventListener("click", async () => {
    if (!localStorage.getItem("userToken")) {
      document.getElementById("active_session_status").innerText =
        "請先登入以開始服務";
      window.toggleLoginModal(true);
      return;
    }

    startButton.disabled = true;
    errorMessage.classList.add("hidden");
    try {
      const scenarioId =
        document.getElementById("scenario_select").value;
      await createSession(scenarioId);
      renderActiveSession();
      await loadSessions();
    } catch (error) {
      errorMessage.innerText = error.message || "無法建立 Session。";
      errorMessage.classList.remove("hidden");
    } finally {
      startButton.disabled = false;
    }
  });

  refreshButton.addEventListener("click", loadSessions);
  window.addEventListener("signbridge:auth-changed", loadSessions);
  renderActiveSession();
  await loadSessions();
}
