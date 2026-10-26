const videoElement = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const resultText = document.getElementById("result_text");

let cameraStream = null;
let activeRecorder = null;

export async function startCamera() {
  if (cameraStream?.active) return cameraStream;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    videoElement.srcObject = cameraStream;

    videoElement.onloadedmetadata = () => {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      resultText.innerText = "等待手勢輸入中...";
    };
    updateCameraControls(true);
    return cameraStream;
  } catch (error) {
    cameraStream = null;
    console.error("無法開啟攝影機：", error);
    resultText.innerText = "無法存取攝影機，請檢查存取權限。";
    updateCameraControls(false);
    throw error;
  }
}

export function stopCamera() {
  if (activeRecorder?.state === "recording") activeRecorder.stop();
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  videoElement.srcObject = null;
  updateCameraControls(false);
}

export function getCameraStream() {
  return cameraStream;
}

export async function captureCameraVideo(durationMs = 3000) {
  const stream = cameraStream;
  if (!stream?.active) throw new Error("攝影機尚未啟動，請先開啟攝影機。");
  if (!window.MediaRecorder) {
    throw new Error("此瀏覽器不支援影片錄製，無法進行手語辨識。");
  }
  if (activeRecorder?.state === "recording") {
    throw new Error("攝影機正在錄影，請稍後再試。");
  }

  const mimeType = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find(
    (type) =>
      typeof MediaRecorder.isTypeSupported !== "function" ||
      MediaRecorder.isTypeSupported(type),
  );
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks = [];
  activeRecorder = recorder;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, durationMs);

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", (event) => {
      clearTimeout(timeout);
      activeRecorder = null;
      reject(event.error || new Error("攝影機錄影失敗。"));
    });
    recorder.addEventListener("stop", () => {
      clearTimeout(timeout);
      activeRecorder = null;
      if (cameraStream !== stream || !stream.active) {
        reject(new Error("攝影機已關閉，錄影已取消。"));
        return;
      }
      const video = new Blob(chunks, {
        type: recorder.mimeType || "video/webm",
      });
      if (video.size === 0) {
        reject(new Error("沒有錄到影片，請重試。"));
        return;
      }
      resolve(video);
    });

    recorder.start();
  });
}

function updateCameraControls(isActive) {
  const startButton = document.getElementById("start_camera_btn");
  const stopButton = document.getElementById("stop_camera_btn");
  if (startButton) startButton.classList.toggle("hidden", isActive);
  if (stopButton) stopButton.classList.toggle("hidden", !isActive);
}

export function initCamera() {
  const startButton = document.getElementById("start_camera_btn");
  const stopButton = document.getElementById("stop_camera_btn");
  startButton?.addEventListener("click", () => {
    startCamera().catch((error) => {
      console.error("無法啟動攝影機:", error);
    });
  });
  stopButton?.addEventListener("click", stopCamera);
  startCamera().catch((error) => {
    console.error("攝影機初始化失敗:", error);
  });
}
