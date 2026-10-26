import { API_BASE_URL } from "../config.js";

const ACTIVE_SESSION_KEY = "activeSession";

function getAuthToken() {
  const token = localStorage.getItem("userToken");
  if (!token) throw new Error("請先登入再建立或更新 Session。");
  return token;
}

async function readResponse(response) {
  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      result.detail ||
        result.message ||
        result.error?.message ||
        result.error ||
        "Session 請求失敗。",
    );
  }
  return result;
}

export function getActiveSession() {
  const session = localStorage.getItem(ACTIVE_SESSION_KEY);
  return session ? JSON.parse(session) : null;
}

export async function createSession(scenarioId, language = "zh-TW") {
  if (!scenarioId?.trim()) throw new Error("scenario_id 不可為空。");
  if (!language?.trim()) throw new Error("language 不可為空。");

  const response = await fetch(`${API_BASE_URL}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ scenario_id: scenarioId, language }),
  });
  const result = await readResponse(response);
  if (!result.data?.session_id) {
    throw new Error("建立 Session 成功，但後端未回傳 session_id。");
  }
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(result.data));
  return result.data;
}

export async function completeSession() {
  const session = getActiveSession();
  if (!session) throw new Error("目前沒有進行中的 Session。");

  const response = await fetch(
    `${API_BASE_URL}/api/sessions/${encodeURIComponent(session.session_id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ status: "completed" }),
    },
  );
  const result = await readResponse(response);
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  return result.data;
}