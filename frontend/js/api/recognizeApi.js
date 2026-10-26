import { apiRequest } from "./apiClient.js";

export function recognizeSign(formData) {
  if (!(formData instanceof FormData)) {
    throw new TypeError("辨識請求必須使用 FormData。");
  }

  return apiRequest("/api/recognize", {
    method: "POST",
    body: formData,
    auth: true,
  });
}
