const API_BASE_URL = "http://localhost:3000";

const videoElement = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const resultText = document.getElementById("result_text");

// 啟動鏡頭
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    videoElement.srcObject = stream;

    videoElement.onloadedmetadata = () => {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      resultText.innerText = "等待手勢輸入中...";
    };
  } catch (err) {
    console.error("無法開啟攝影機：", err);
    resultText.innerText = "無法存取攝影機，請檢查存取權限。";
  }
}

// 觸發 2D 虛擬人比手語動作
function simulateAvatarSign(text) {
  const leftArm = document.getElementById("left_arm");
  const rightArm = document.getElementById("right_arm");
  const avatarStatus = document.getElementById("avatar_status");

  leftArm.classList.add("signing-left");
  rightArm.classList.add("signing-right");

  avatarStatus.innerText = `🤟 比手語中：${text}`;
  avatarStatus.className =
    "text-xs text-center text-emerald-300 font-bold bg-emerald-950/80 py-1.5 rounded-lg border border-emerald-500/50 animate-pulse";

  setTimeout(() => {
    leftArm.classList.remove("signing-left");
    rightArm.classList.remove("signing-right");
    avatarStatus.innerText = "準備翻譯中...";
    avatarStatus.className =
      "text-xs text-center text-slate-300 font-medium bg-slate-900/80 py-1.5 rounded-lg border border-slate-700/60";
  }, 3500);
}

// 新增訊息至對話歷程
function appendChatMessage(sender, text, isUser) {
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

// 發送文字訊息
function sendTextMessage() {
  const input = document.getElementById("voice_input");
  const text = input.value.trim();
  if (text !== "") {
    appendChatMessage("醫護人員 (文字)", text, true);
    simulateAvatarSign(`【${text}】`);
    input.value = "";
  }
}

function sendQuickText(text) {
  appendChatMessage("聽障使用者 (快捷鍵)", text, false);
}

function handleKeyPress(e) {
  if (e.key === "Enter") sendTextMessage();
}

// 🎙️ 語音辨識 (Web Speech API - Hold to Talk)
let recognition = null;
let isListening = false;

if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "zh-TW";

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("voice_input").value = transcript;
    appendChatMessage("醫護人員 (語音)", transcript, true);
    simulateAvatarSign(`【${transcript}】`);
  };

  recognition.onerror = (event) => {
    console.error("語音辨識錯誤:", event.error);
  };

  recognition.onend = () => {
    stopListeningUI();
  };
}

const talkBtn = document.getElementById("talk_btn");

function startListening() {
  if (!recognition) {
    alert("您的瀏覽器暫不支援語音辨識功能，請改用 Chrome 瀏覽器或打字輸入。");
    return;
  }
  if (isListening) return;

  try {
    isListening = true;
    recognition.start();
    talkBtn.className =
      "w-full bg-red-600 py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 select-none shadow-lg animate-pulse";
    document.getElementById("talk_icon").innerText = "🔴";
    document.getElementById("talk_text").innerText = "正在聆聽中... (鬆開完成)";
  } catch (e) {
    console.error(e);
  }
}

function stopListeningUI() {
  isListening = false;
  talkBtn.className =
    "w-full bg-emerald-500 hover:bg-emerald-600 py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 select-none";
  document.getElementById("talk_icon").innerText = "🎙️";
  document.getElementById("talk_text").innerText = "按住不放開始說話";
}

function stopListening() {
  if (recognition && isListening) {
    recognition.stop();
  }
}

// 綁定滑鼠與觸控事件 (Hold to Talk)
talkBtn.addEventListener("mousedown", startListening);
talkBtn.addEventListener("mouseup", stopListening);
talkBtn.addEventListener("mouseleave", stopListening);

talkBtn.addEventListener("touchstart", (e) => {
  e.preventDefault();
  startListening();
});
talkBtn.addEventListener("touchend", (e) => {
  e.preventDefault();
  stopListening();
});

// Auth 邏輯
function toggleLoginModal(show) {
  const modal = document.getElementById("login_modal");
  if (show) modal.classList.remove("hidden");
  else modal.classList.add("hidden");
}

function switchAuthTab(type) {
  const loginForm = document.getElementById("login_form");
  const registerForm = document.getElementById("register_form");
  const tabLogin = document.getElementById("tab_login");
  const tabRegister = document.getElementById("tab_register");

  if (type === "login") {
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
    tabLogin.className =
      "flex-1 pb-3 text-center border-b-2 border-emerald-500 text-emerald-400 font-bold text-sm";
    tabRegister.className =
      "flex-1 pb-3 text-center text-slate-400 font-bold text-sm";
  } else {
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
    tabRegister.className =
      "flex-1 pb-3 text-center border-b-2 border-emerald-500 text-emerald-400 font-bold text-sm";
    tabLogin.className =
      "flex-1 pb-3 text-center text-slate-400 font-bold text-sm";
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("login_email").value;
  const password = document.getElementById("login_password").value;
  const errorDiv = document.getElementById("login_error");
  const submitBtn = document.getElementById("login_btn");

  errorDiv.classList.add("hidden");
  submitBtn.innerText = "驗證中...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem("userToken", data.token);
      localStorage.setItem("userInfo", JSON.stringify(data.user));

      alert(`✅ 登入成功！歡迎回來，${data.user.name}`);
      updateUserUI(data.user);
      toggleLoginModal(false);
    } else {
      errorDiv.innerText = data.message || "登入失敗！";
      errorDiv.classList.remove("hidden");
    }
  } catch (err) {
    console.error("無法連線至後端 API:", err);
    errorDiv.innerText = "無法連接至 .NET 後端伺服器，請確認後端已啟動。";
    errorDiv.classList.remove("hidden");
  } finally {
    submitBtn.innerText = "立即登入";
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById("reg_name").value;
  const email = document.getElementById("reg_email").value;
  const password = document.getElementById("reg_password").value;
  const msgDiv = document.getElementById("register_msg");
  const submitBtn = document.getElementById("register_btn");

  msgDiv.className = "hidden text-xs text-center";
  submitBtn.innerText = "註冊資料發送中...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // body: JSON.stringify({ name, email, password })
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      alert(`🎉 ${data.message}`);
      document.getElementById("login_email").value = email;
      document.getElementById("login_password").value = password;
      switchAuthTab("login");
    } else {
      msgDiv.innerText = data.message || "註冊失敗！";
      msgDiv.className = "text-xs text-center text-red-400";
    }
  } catch (err) {
    console.error("無法連線至後端 API:", err);
    msgDiv.innerText = "無法連接至 .NET 後端伺服器，請確認後端已啟動。";
    msgDiv.className = "text-xs text-center text-red-400";
  } finally {
    submitBtn.innerText = "註冊並發送至 .NET 後端";
  }
}

function updateUserUI(user) {
  document.getElementById("user_profile_area").innerHTML = `
		<div class="flex items-center gap-2">
			<span class="text-xs text-emerald-400 font-semibold">👤 ${user.name}</span>
			<button onclick="logout()" class="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-xs border border-slate-600">登出</button>
		</div>
	`;
}

function logout() {
  localStorage.clear();
  location.reload();
}

window.onload = () => {
  startCamera();
  const savedUser = localStorage.getItem("userInfo");
  if (savedUser) {
    updateUserUI(JSON.parse(savedUser));
  }
};
