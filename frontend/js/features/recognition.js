import { recognizeSign } from "../api/recognizeApi.js";
import { getSession } from "../api/sessionApi.js";
import { appendChatMessage } from "./chat.js";
import { getActiveSession } from "./sessions.js";

export async function recognizeVideo(video) {
  if (!(video instanceof Blob) || video.size === 0) {
    throw new Error("請提供非空的影片檔案進行辨識。");
  }

  const resultText = document.getElementById("result_text");
  resultText.innerText = "正在辨識手語...";

  const session = getActiveSession();
  if (!session?.session_id) {
    const error = new Error("請先開始服務或選擇進行中的 Session，再進行辨識。");
    resultText.innerText = error.message;
    throw error;
  }
  const sessionId = session.session_id;

  try {
    const sessionResponse = await getSession(sessionId);
    const validSession = sessionResponse.data;

    if (getActiveSession()?.session_id !== sessionId) {
      throw new Error("目前 Session 已變更，請重新開始辨識。");
    }
    if (validSession?.session_id !== sessionId) {
      throw new Error("無法確認目前 Session，請重新選擇服務。");
    }
    if (validSession.status !== "active") {
      throw new Error("目前 Session 已結束，請開始或選擇進行中的服務。");
    }

    const formData = new FormData();
    formData.append("video", video, video.name || "sign-language.webm");
    formData.append("session_id", validSession.session_id);
    formData.append("scenario_id", validSession.scenario_id);
    formData.append("language", validSession.language);

    const responseData = await recognizeSign(formData);

    const recognizedText = responseData.data?.text;
    if (!recognizedText) throw new Error("辨識成功，但後端未回傳文字結果。");

    if (getActiveSession()?.session_id !== sessionId) return recognizedText;

    resultText.innerText = recognizedText;
    appendChatMessage("聽障使用者 (手語辨識)", recognizedText, false);
    return recognizedText;
  } catch (error) {
    if (getActiveSession()?.session_id === sessionId) {
      resultText.innerText = error.message || "辨識失敗，請稍後再試。";
    }
    throw error;
  }
}
