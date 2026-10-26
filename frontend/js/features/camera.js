const videoElement = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const resultText = document.getElementById("result_text");

let cameraStream = null;

export async function startCamera() {
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
  } catch (error) {
    console.error("無法開啟攝影機：", error);
    resultText.innerText = "無法存取攝影機，請檢查存取權限。";
  }
}

export function getCameraStream() {
  return cameraStream;
}

export function initCamera() {
  startCamera();
}
