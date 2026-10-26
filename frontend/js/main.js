import {
  handleLogin,
  handleRegister,
  initAuth,
  logout,
  switchAuthTab,
  toggleLoginModal,
} from "./features/auth.js";
import { simulateAvatarSign } from "./features/avatar.js";
import { initCamera } from "./features/camera.js";
import {
  handleKeyPress,
  sendQuickText,
  sendTextMessage,
} from "./features/chat.js";
import { recognizeVideo } from "./features/recognition.js";
import {
  completeSession,
  createSession,
  getActiveSession,
  getSessions,
  initSessions,
} from "./features/sessions.js";
import { initVoice } from "./features/voice.js";

function initApp() {
  Object.assign(window, {
    toggleLoginModal,
    switchAuthTab,
    handleLogin,
    handleRegister,
    logout,
    simulateAvatarSign,
    sendQuickText,
    sendTextMessage,
    handleKeyPress,
  });

  window.signBridge = Object.freeze({
    sessions: Object.freeze({
      create: createSession,
      complete: completeSession,
      getActive: getActiveSession,
      list: getSessions,
    }),
    recognizeVideo,
  });

  initAuth();
  initSessions();
  initCamera();
  initVoice();
}

initApp();
