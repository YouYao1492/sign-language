import { simulateAvatarSign } from "./avatar.js";

export function clearChatHistory() {
  document.getElementById("chat_box").replaceChildren();
}

export function appendChatMessage(sender, text, isUser) {
  const chatBox = document.getElementById("chat_box");
  const msgDiv = document.createElement("div");

  if (isUser) {
    msgDiv.className =
      "self-end bg-emerald-600 p-3 rounded-2xl rounded-tr-none max-w-[85%] text-sm shadow";
    msgDiv.innerHTML = `<span class="block text-[10px] text-emerald-200 mb-1">${sender}</span>${text}`;
  } else {
    msgDiv.className =
      "self-start bg-slate-700/80 p-3 rounded-2xl rounded-tl-none max-w-[85%] text-sm shadow";
    msgDiv.innerHTML = `<span class="block text-[10px] text-slate-400 mb-1">${sender}</span>${text}`;
  }

  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

export function sendTextMessage() {
  const input = document.getElementById("voice_input");
  const text = input.value.trim();
  if (text !== "") {
    appendChatMessage("醫護人員 (文字)", text, true);
    simulateAvatarSign(`【${text}】`);
    input.value = "";
  }
}

export function sendQuickText(text) {
  appendChatMessage("聽障使用者 (快捷鍵)", text, false);
}

export function handleKeyPress(event) {
  if (event.key === "Enter") sendTextMessage();
}
