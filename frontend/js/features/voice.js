import { appendChatMessage } from "./chat.js";
import { simulateAvatarSign } from "./avatar.js";
import { getActiveSession } from "./sessions.js";

let recognition = null;
let isListening = false;
let listeningSessionId = null;

function stopListeningUI() {
  isListening = false;
  const talkBtn = document.getElementById("talk_btn");
  talkBtn.className =
    "w-full bg-emerald-500 hover:bg-emerald-600 py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 select-none";
  document.getElementById("talk_icon").innerText = "🎙️";
  document.getElementById("talk_text").innerText = "按住不放開始說話";
}

function startListening() {
  if (!recognition) {
    alert("您的瀏覽器暫不支援語音辨識功能，請改用 Chrome 瀏覽器或打字輸入。");
    return;
  }
  if (isListening) return;

  try {
    isListening = true;
    listeningSessionId = getActiveSession()?.session_id ?? null;
    recognition.start();
    document.getElementById("talk_btn").className =
      "w-full bg-red-600 py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 select-none shadow-lg animate-pulse";
    document.getElementById("talk_icon").innerText = "🔴";
    document.getElementById("talk_text").innerText =
      "正在聆聽中... (鬆開完成)";
  } catch (error) {
    isListening = false;
    console.error("無法啟動語音辨識:", error);
  }
}

function stopListening() {
  if (recognition && isListening) recognition.stop();
}

export function initVoice() {
  const talkBtn = document.getElementById("talk_btn");
  if (!talkBtn) return;

  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "zh-TW";

    recognition.onresult = (event) => {
      if (getActiveSession()?.session_id !== listeningSessionId) return;

      const transcript = event.results[0][0].transcript;
      document.getElementById("voice_input").value = transcript;
      appendChatMessage("醫護人員 (語音)", transcript, true);
      simulateAvatarSign(`【${transcript}】`);
    };

    recognition.onerror = (event) => {
      console.error("語音辨識錯誤:", event.error);
    };

    recognition.onend = stopListeningUI;
  }

  talkBtn.addEventListener("mousedown", startListening);
  talkBtn.addEventListener("mouseup", stopListening);
  talkBtn.addEventListener("mouseleave", stopListening);
  talkBtn.addEventListener("touchstart", (event) => {
    event.preventDefault();
    startListening();
  });
  talkBtn.addEventListener("touchend", (event) => {
    event.preventDefault();
    stopListening();
  });
}
