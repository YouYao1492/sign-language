// ai-model/index.js
// Placeholder for AI model interface. 目前為 mock implementation。
// 未來可以把真正的 model inference (e.g., PyTorch / TF / compiled binary)
// 接在 analyzeVideo 中，回傳同樣格式的 JSON 結果。

const path = require("path");
const fs = require("fs").promises;

/**
 * analyzeVideo(filePath, opts)
 * - filePath: 上傳後的影片實體路徑
 * - opts: { session_id, scenario_id, language }
 * 回傳格式 (示例)：
 * {
 *   text: "你好",
 *   confidence: 0.9,
 *   segments: [{ start_ms: 0, end_ms: 900, text: "你好", confidence: 0.9 }],
 *   meta: { source: "mock", session_id: "...", language: "zh-TW" }
 * }
 */
async function analyzeVideo(filePath, opts = {}) {
    // 簡單的 mock 行為：根據檔案大小或檔名決定回傳字串（方便測試）
    try {
        const st = await fs.stat(filePath);
        const sizeKb = Math.round(st.size / 1024);
        // 產生 mock 回傳：如果影片 > 50KB，就回傳 "（mock）已接收影片" 之類的文字
        const text = sizeKb > 40 ? "（mock）偵測到手語" : "（mock）影片太短或無內容";
        const confidence = Math.min(0.98, Math.max(0.2, Math.min(1, sizeKb / 1000)));
        return {
            text,
            confidence,
            segments: [
                { start_ms: 0, end_ms: Math.max(1000, Math.min(6000, sizeKb * 60)), text, confidence }
            ],
            meta: { source: "mock-ai-model", session_id: opts.session_id || null, language: opts.language || "zh-TW", file: path.basename(filePath) }
        };
    } catch (e) {
        return { text: "", confidence: 0, segments: [], meta: { error: e.message } };
    }
}

module.exports = { analyzeVideo };