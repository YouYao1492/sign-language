import { recognizeSign } from "../api/recognizeApi.js";
import { appendChatMessage } from "./chat.js";
import { getActiveSession } from "./sessions.js";

export async function recognizeVideo(video) {
  if (!(video instanceof Blob) || video.size === 0) {
    throw new Error("請提供非空的影片檔案進行辨識。");
  }

  const session = getActiveSession();
  if (!session) throw new Error("請先建立 Session 再開始辨識。");

  const formData = new FormData();
  formData.append("video", video, video.name || "sign-language.webm");
  formData.append("session_id", session.session_id);
  formData.append("scenario_id", session.scenario_id);
  formData.append("language", session.language);

  const resultText = document.getElementById("result_text");
  resultText.innerText = "正在辨識手語...";

  try {
    const responseData = await recognizeSign(formData);

    const recognizedText = responseData.data?.text;
    if (!recognizedText) throw new Error("辨識成功，但後端未回傳文字結果。");

    resultText.innerText = recognizedText;
    appendChatMessage("聽障使用者 (手語辨識)", recognizedText, false);
    return recognizedText;
  } catch (error) {
    resultText.innerText = error.message || "辨識失敗，請稍後再試。";
    throw error;
  }
}
