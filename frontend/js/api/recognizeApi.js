import { apiRequest } from "./apiClient.js";

export function createRecognitionFormData(video, session) {
  if (!(video instanceof Blob) || video.size === 0) {
    throw new Error("請提供非空的手語影片。");
  }
  if (!session?.session_id || !session.scenario_id || !session.language) {
    throw new Error("辨識請求需要 session_id、scenario_id 與 language。");
  }

  const mediaType = video.type.split(";")[0] || "video/webm";
  const extension = mediaType.split("/")[1] || "webm";
  const videoFile = new File([video], `sign-language.${extension}`, {
    type: mediaType,
  });
  const formData = new FormData();
  formData.append("video", videoFile);
  formData.append("session_id", session.session_id);
  formData.append("scenario_id", session.scenario_id);
  formData.append("language", session.language);
  return formData;
}

export function recognizeSign(formData) {
  if (!(formData instanceof FormData)) {
    throw new TypeError("辨識請求必須使用 FormData。");
  }
  const video = formData.get("video");
  if (!(video instanceof Blob) || video.size === 0) {
    throw new Error("辨識請求必須包含非空的 video 檔案。");
  }
  for (const field of ["session_id", "scenario_id", "language"]) {
    if (!formData.get(field)?.toString().trim()) {
      throw new Error(`辨識請求缺少必要欄位：${field}。`);
    }
  }

  return apiRequest("/api/recognize", {
    method: "POST",
    body: formData,
    auth: true,
  });
}
