import { login, register } from "../api/authApi.js";

export function toggleLoginModal(show) {
  const modal = document.getElementById("login_modal");
  if (show) modal.classList.remove("hidden");
  else modal.classList.add("hidden");
}

export function switchAuthTab(type) {
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

export async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("login_email").value;
  const password = document.getElementById("login_password").value;
  const errorDiv = document.getElementById("login_error");
  const submitBtn = document.getElementById("login_btn");

  errorDiv.classList.add("hidden");
  submitBtn.innerText = "驗證中...";

  try {
    const response = await login({ email, password });
    const responseData = await response.json();

    if (response.ok) {
      const user = responseData.data;
      localStorage.setItem("userToken", user.token);
      localStorage.setItem("userInfo", JSON.stringify(user));

      alert(`✅ 登入成功！歡迎回來，${user.name}`);
      updateUserUI(user);
      toggleLoginModal(false);
    } else {
      errorDiv.innerText =
        responseData.message ||
        responseData.detail ||
        responseData.error?.message ||
        "登入失敗！";
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

export async function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById("reg_name").value;
  const email = document.getElementById("reg_email").value;
  const password = document.getElementById("reg_password").value;
  const msgDiv = document.getElementById("register_msg");
  const submitBtn = document.getElementById("register_btn");

  msgDiv.className = "hidden text-xs text-center";
  submitBtn.innerText = "註冊資料發送中...";

  try {
    const response = await register({ name, email, password });
    const responseData = await response.json();

    if (response.ok) {
      alert("🎉 註冊成功！請使用新帳號登入。");
      document.getElementById("login_email").value = email;
      document.getElementById("login_password").value = password;
      switchAuthTab("login");
    } else {
      msgDiv.innerText =
        responseData.message ||
        responseData.detail ||
        responseData.error?.message ||
        "註冊失敗！";
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

export function updateUserUI(user) {
  document.getElementById("user_profile_area").innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-xs text-emerald-400 font-semibold">👤 ${user.name}</span>
      <button onclick="logout()" class="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-xs border border-slate-600">登出</button>
    </div>
  `;
}

export function logout() {
  localStorage.clear();
  location.reload();
}

export function initAuth() {
  const savedUser = localStorage.getItem("userInfo");
  if (savedUser) updateUserUI(JSON.parse(savedUser));
}
