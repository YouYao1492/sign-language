import {
  handleLogin,
  handleRegister,
  initAuth,
  logout,
  switchAuthTab,
  toggleLoginModal,
} from "./features/auth.js";
import { simulateAvatarSign } from "./features/avatar.js";
import {
  captureCameraVideo,
  initCamera,
  startCamera,
  stopCamera,
} from "./features/camera.js";
import {
  handleKeyPress,
  sendQuickText,
  sendTextMessage,
} from "./features/chat.js";
import {
  initRecognition,
  recognizeFromCamera,
  recognizeVideo,
} from "./features/recognition.js";
import {
  completeSession,
  createSession,
  getActiveSession,
  getSessions,
  initSessions,
  selectSession,
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
    camera: Object.freeze({
      start: startCamera,
      stop: stopCamera,
      captureVideo: captureCameraVideo,
    }),
    sessions: Object.freeze({
      create: createSession,
      complete: completeSession,
      getActive: getActiveSession,
      list: getSessions,
      select: selectSession,
    }),
    recognizeVideo,
    recognizeFromCamera,
  });

  initAuth();
  initSessions();
  initCamera();
  initRecognition();
  initVoice();
}

initApp();
