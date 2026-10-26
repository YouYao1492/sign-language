import { API_BASE_URL } from "../config.js";

const TOKEN_KEY = "userToken";

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function getErrorMessage(data, status) {
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.detail?.message === "string") return data.detail.message;
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.error?.message === "string") return data.error.message;
  if (typeof data?.error === "string") return data.error;
  return `API 請求失敗 (HTTP ${status})。`;
}

export async function apiRequest(
  path,
  { method = "GET", body, auth = false, headers = {} } = {},
) {
  const requestHeaders = new Headers(headers);
  let requestBody = body;

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
    requestBody = JSON.stringify(body);
  }

  if (auth) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      throw new ApiError("請先登入再呼叫此 API。", 401, "UNAUTHORIZED");
    }
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: requestBody,
    });
  } catch (error) {
    throw new ApiError("無法連接至後端伺服器，請確認後端已啟動。", 0, "NETWORK_ERROR");
  }

  const responseText = await response.text();
  let data = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      if (response.ok) {
        throw new ApiError("伺服器回應格式錯誤。", response.status, "INVALID_RESPONSE");
      }
    }
  }

  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(data, response.status),
      response.status,
      data?.error?.code || data?.code || `HTTP_${response.status}`,
    );
  }

  return data;
}
