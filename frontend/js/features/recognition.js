import {
  createRecognitionFormData,
  recognizeSign,
} from "../api/recognizeApi.js";
import { getSession } from "../api/sessionApi.js";
import { captureCameraVideo } from "./camera.js";
import { appendChatMessage } from "./chat.js";
import { getActiveSession } from "./sessions.js";

async function verifyActiveSession() {
  const session = getActiveSession();
  if (!session?.session_id) {
    throw new Error("請先開始服務或選擇進行中的 Session，再進行辨識。");
  }

  const sessionResponse = await getSession(session.session_id);
  const validSession = sessionResponse.data;
  if (getActiveSession()?.session_id !== session.session_id) {
    throw new Error("目前 Session 已變更，請重新開始辨識。");
  }
  if (validSession?.session_id !== session.session_id) {
    throw new Error("無法確認目前 Session，請重新選擇服務。");
  }
  if (validSession.status !== "active") {
    throw new Error("目前 Session 已結束，請開始或選擇進行中的服務。");
  }
  return validSession;
}

export async function recognizeVideo(video) {
  const resultText = document.getElementById("result_text");
  const sessionId = getActiveSession()?.session_id;

  try {
    const session = await verifyActiveSession();
    const formData = createRecognitionFormData(video, session);

    resultText.innerText = "正在辨識手語...";
    const responseData = await recognizeSign(formData);

    const recognizedText = responseData.data?.text;
    if (!recognizedText) throw new Error("辨識成功，但後端未回傳文字結果。");

    if (getActiveSession()?.session_id !== sessionId) return recognizedText;

    resultText.innerText = recognizedText;
    appendChatMessage("聽障使用者 (手語辨識)", recognizedText, false);
    return recognizedText;
  } catch (error) {
    if (!sessionId || getActiveSession()?.session_id === sessionId) {
      resultText.innerText = error.message || "辨識失敗，請稍後再試。";
    }
    throw error;
  }
}

export async function recognizeFromCamera() {
  const resultText = document.getElementById("result_text");
  const button = document.getElementById("recognize_btn");
  const sessionId = getActiveSession()?.session_id;
  if (button) button.disabled = true;

  try {
    await verifyActiveSession();
    if (getActiveSession()?.session_id !== sessionId) {
      throw new Error("目前 Session 已變更，請重新開始辨識。");
    }
    resultText.innerText = "正在錄影，請保持手勢...";
    const video = await captureCameraVideo();
    if (getActiveSession()?.session_id !== sessionId) {
      throw new Error("錄影期間 Session 已變更，請重新錄製。");
    }
    return await recognizeVideo(video);
  } catch (error) {
    if (!sessionId || getActiveSession()?.session_id === sessionId) {
      resultText.innerText = error.message || "無法擷取影片進行辨識。";
    }
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

export function initRecognition() {
  const button = document.getElementById("recognize_btn");
  button?.addEventListener("click", () => {
    recognizeFromCamera().catch((error) => {
      console.error("手語辨識失敗:", error);
    });
  });
}
