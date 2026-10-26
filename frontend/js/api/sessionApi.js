import { apiRequest } from "./apiClient.js";

const SESSIONS_PATH = "/api/sessions";

export function createSession(data) {
  return apiRequest(SESSIONS_PATH, {
    method: "POST",
    body: data,
    auth: true,
  });
}

export function getSessions() {
  return apiRequest(SESSIONS_PATH, { auth: true });
}

export function getSession(sessionId) {
  return apiRequest(`${SESSIONS_PATH}/${encodeURIComponent(sessionId)}`, {
    auth: true,
  });
}

export function updateSession(sessionId, data) {
  return apiRequest(`${SESSIONS_PATH}/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: data,
    auth: true,
  });
}

export function deleteSession(sessionId) {
  return apiRequest(`${SESSIONS_PATH}/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    auth: true,
  });
}
