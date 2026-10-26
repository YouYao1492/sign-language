import {
  createRecognitionFormData,
  recognizeSign,
} from "../api/recognizeApi.js";
import { getSession } from "../api/sessionApi.js";
import { captureCameraVideo } from "./camera.js";
import { appendChatMessage } from "./chat.js";
import { getActiveSession } from "./sessions.js";

let isRecognitionInProgress = false;

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

function setRecognitionLoading(isLoading, message) {
  const button = document.getElementById("recognize_btn");
  if (button) {
    button.disabled = isLoading;
    button.innerText = isLoading ? "辨識中..." : "錄影 3 秒並辨識";
    button.setAttribute("aria-busy", String(isLoading));
  }
  if (message) document.getElementById("result_text").innerText = message;
}

async function runRecognition(operation) {
  if (isRecognitionInProgress) return null;
  isRecognitionInProgress = true;
  setRecognitionLoading(true);

  try {
    return await operation();
  } finally {
    isRecognitionInProgress = false;
    setRecognitionLoading(false);
  }
}

async function submitVideo(video, expectedSessionId) {
  const resultText = document.getElementById("result_text");

  try {
    const session = await verifyActiveSession();
    if (session.session_id !== expectedSessionId) {
      throw new Error("目前 Session 已變更，請重新開始辨識。");
    }

    const formData = createRecognitionFormData(video, session);

    setRecognitionLoading(true, "正在送出影片並辨識手語...");
    const responseData = await recognizeSign(formData);

    const responseText = responseData?.data?.text;
    if (typeof responseText !== "string" || !responseText.trim()) {
      throw new Error("辨識未回傳文字結果，請重試。");
    }
    const recognizedText = responseText.trim();

    if (getActiveSession()?.session_id !== expectedSessionId) {
      return recognizedText;
    }

    resultText.innerText = recognizedText;
    appendChatMessage("聽障使用者 (手語辨識)", recognizedText, false);
    return recognizedText;
  } catch (error) {
    if (
      !expectedSessionId ||
      getActiveSession()?.session_id === expectedSessionId
    ) {
      resultText.innerText = error.message || "辨識失敗，請稍後再試。";
    }
    throw error;
  }
}

export async function recognizeVideo(video) {
  const sessionId = getActiveSession()?.session_id;
  return runRecognition(() => submitVideo(video, sessionId));
}

export async function recognizeFromCamera() {
  const resultText = document.getElementById("result_text");
  const sessionId = getActiveSession()?.session_id;

  return runRecognition(async () => {
    try {
      await verifyActiveSession();
      if (getActiveSession()?.session_id !== sessionId) {
        throw new Error("目前 Session 已變更，請重新開始辨識。");
      }
      setRecognitionLoading(true, "正在錄影，請保持手勢...");
      const video = await captureCameraVideo();
      if (getActiveSession()?.session_id !== sessionId) {
        throw new Error("錄影期間 Session 已變更，請重新錄製。");
      }
      return await submitVideo(video, sessionId);
    } catch (error) {
      if (!sessionId || getActiveSession()?.session_id === sessionId) {
        resultText.innerText = error.message || "無法擷取影片進行辨識。";
      }
      throw error;
    }
  });
}

export function initRecognition() {
  const button = document.getElementById("recognize_btn");
  button?.addEventListener("click", () => {
    recognizeFromCamera().catch((error) => {
      console.error("手語辨識失敗:", error);
    });
  });
}
