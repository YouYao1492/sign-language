import {
  createSession as createSessionRequest,
  getSessions as getSessionsRequest,
  updateSession,
} from "../api/sessionApi.js";

const ACTIVE_SESSION_KEY = "activeSession";

export function getActiveSession() {
  const session = localStorage.getItem(ACTIVE_SESSION_KEY);
  return session ? JSON.parse(session) : null;
}

export async function createSession(scenarioId, language = "zh-TW") {
  if (!scenarioId?.trim()) throw new Error("scenario_id 不可為空。");
  if (!language?.trim()) throw new Error("language 不可為空。");

  const result = await createSessionRequest({
    scenario_id: scenarioId,
    language,
  });
  if (!result.data?.session_id) {
    throw new Error("建立 Session 成功，但後端未回傳 session_id。");
  }
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(result.data));
  return result.data;
}

export async function getSessions() {
  const result = await getSessionsRequest();
  return result.data || [];
}

export async function completeSession() {
  const session = getActiveSession();
  if (!session) throw new Error("目前沒有進行中的 Session。");

  const result = await updateSession(session.session_id, {
    status: "completed",
  });
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  return result.data;
}

function renderSessionList(sessions) {
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
    item.className = isActive ? "text-emerald-300" : "text-slate-400";
    item.innerText = `${session.scenario_id} · ${session.status} · ${session.session_id}`;
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
  if (!startButton || !refreshButton) return;

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
      const activeSession = getActiveSession();
      const current = sessions.find(
        (session) => session.session_id === activeSession?.session_id,
      );

      if (current?.status === "active") {
        localStorage.setItem("activeSession", JSON.stringify(current));
      } else if (activeSession) {
        localStorage.removeItem("activeSession");
      }

      renderActiveSession();
      renderSessionList(sessions);
    } catch (error) {
      errorMessage.innerText = error.message || "無法載入 Session 清單。";
      errorMessage.classList.remove("hidden");
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
