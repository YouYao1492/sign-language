import { apiRequest } from "../api/apiClient.js";

const ACTIVE_SESSION_KEY = "activeSession";

export function getActiveSession() {
  const session = localStorage.getItem(ACTIVE_SESSION_KEY);
  return session ? JSON.parse(session) : null;
}

export async function createSession(scenarioId, language = "zh-TW") {
  if (!scenarioId?.trim()) throw new Error("scenario_id 不可為空。");
  if (!language?.trim()) throw new Error("language 不可為空。");

  const result = await apiRequest("/api/sessions", {
    method: "POST",
    body: { scenario_id: scenarioId, language },
    auth: true,
  });
  if (!result.data?.session_id) {
    throw new Error("建立 Session 成功，但後端未回傳 session_id。");
  }
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(result.data));
  return result.data;
}

export async function completeSession() {
  const session = getActiveSession();
  if (!session) throw new Error("目前沒有進行中的 Session。");

  const result = await apiRequest(
    `/api/sessions/${encodeURIComponent(session.session_id)}`,
    {
      method: "PATCH",
      body: { status: "completed" },
      auth: true,
    },
  );
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  return result.data;
}
