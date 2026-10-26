import { HandLandmarker, PoseLandmarker, FaceLandmarker, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const $ = (id) => document.getElementById(id);
const video = $("video"), overlay = $("overlay"), avatar = $("avatar");
const octx = overlay.getContext("2d"), actx = avatar.getContext("2d");

/* ---------- 手語詞典：五指伸直程度 [拇指, 食指, 中指, 無名指, 小指] ---------- */
const DICT = {
  "你好": [1,1,1,1,1], "好": [1,0,0,0,0], "愛": [1,1,0,0,1],
  "零": [0,0,0,0,0], "一": [0,1,0,0,0], "二": [0,1,1,0,0],
  "三": [0,1,1,1,0], "四": [0,1,1,1,1], "五": [1,1,1,1,1],
};

// 詞典詞語搭配的表情（手語的語意也在臉上）
const EXPR = {
  "你好": { mouthSmileLeft: .6, mouthSmileRight: .6 },
  "好": { mouthSmileLeft: .5, mouthSmileRight: .5 },
  "愛": { mouthSmileLeft: .9, mouthSmileRight: .9, browInnerUp: .2 },
};

/* ---------- 個人角色設定檔：由使用者的臉產生 ---------- */
// FaceLandmarker 的臉部輪廓點（順時針一圈）
const OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const DEFAULT_PROFILE = {
  oval: Array.from({ length: 36 }, (_, i) => [Math.cos(i / 36 * 2 * Math.PI), Math.sin(i / 36 * 2 * Math.PI)]),
  eyeX: .38, eyeY: -.02, eyeW: .27, browY: -.3, browIn: .14, browOut: .62,
  mouthY: .48, mouthHalf: .28, noseY: .14,
  skin: "#F3B98B", hair: "#2B2118", shirt: "#2F5BEA", eye: "#5A3D2B", hairStyle: "short", base: {}, yawBase: 0, pitchBase: 0.55,
  gain: {}, lip: null, brow: null, skinHi: null, skinLo: null, beard: 0, beardColor: "#3a2a22", glasses: "none",
  eyeOpen: 0.78, browT: 0.085, lipFull: 1, noseW: 1,
  hairLen: 1, bangs: "part", partSide: 1, hairVol: 1, hairCurl: 0, hairBun: false, hairConf: 1,
};
/* 外觀固定規則：
   - 皮膚一律使用「一般人的膚色」，不再從鏡頭取樣（避免光線造成偏差）
   - 髮型只分「長髮」與「短髮」：頭髮垂到下巴以下（頸部、肩膀）算長髮，其餘算短髮 */
const STD_SKIN = { skin: "#EDC6A1", skinHi: "#F6D8BC", skinLo: "#D2A583" };
// 性別只用來決定預設髮型：男性 → 短髮；女性 → 中長髮（約及肩）。自動偵測可能不準，所以可以在選單手動指定
const GENDER_KEY = "signbridge.genderMode", MID_LEN = 0.6;
let genderMode = "auto";
try { genderMode = localStorage.getItem(GENDER_KEY) || "auto"; } catch {}
const genderOf = (p) => (genderMode === "male" || genderMode === "female") ? genderMode : (p.gender === "male" || p.gender === "female" ? p.gender : null);
function normalizeProfile(p, detected) {
  Object.assign(p, STD_SKIN);
  const g = genderOf(p);
  if (g === "female") { p.hairStyle = "long"; p.hairLen = MID_LEN; }
  else if (g === "male") { p.hairStyle = "short"; p.hairLen = 1; }
  else { p.hairStyle = p.hairStyle === "long" ? "long" : "short"; p.hairLen = p.hairStyle === "long" ? MID_LEN : 1; }   // 還不知道性別：沿用目前髮型
  Object.assign(p, { bangs: "part", partSide: 1, hairVol: 1, hairCurl: 0, hairBun: false });
  return p;
}
const PROFILE_KEY = "signbridge.profile.v1";
let PROFILE = { ...DEFAULT_PROFILE };
try { Object.assign(PROFILE, JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}")); } catch {}
normalizeProfile(PROFILE, true);          // 舊版存下來的設定（膚色、無髮、瀏海等）一併整理成新規則
const saveProfile = () => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(PROFILE)); } catch {} };

function shade(hex, f) {      // 把顏色變暗（f<1）用來做描邊色
  const n = parseInt(hex.slice(1), 16);
  return "#" + [n >> 16, (n >> 8) & 255, n & 255]
    .map(v => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0")).join("");
}
function skinShade(hex, f) {     // 皮膚專用明暗：暗部偏紅、亮部偏奶油色，比單純乘係數更像真皮膚
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255], k = [Math.pow(f, 0.7), f, Math.pow(f, 1.3)];
  return "#" + c.map((v, i) => Math.max(0, Math.min(255, Math.round(v * k[i]))).toString(16).padStart(2, "0")).join("");
}
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function mix(h1, h2, t) {           // 兩個顏色按比例混合
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  return "#" + [16, 8, 0].map(sh => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t).toString(16).padStart(2, "0")).join("");
}
function ovalPath(ctx, pts, s, dy) {   // 用相鄰點的中點串成平滑封閉曲線
  const P = pts.map(([x, y]) => [x * s, y * s + dy]), n = P.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath();
  const m0 = mid(P[n - 1], P[0]); ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(P[i], P[(i + 1) % n]);
    ctx.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]);
  }
  ctx.closePath();
}

/* ---------- 2D 虛擬角色：把 21 個關節點畫成卡通手 ---------- */
const FINGERS = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
const PALM = [0,1,5,9,13,17];

const v3 = {
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  cross: (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }),
};

// 手心或手背朝向鏡頭？由「哪一隻手」加上食指到小指的方向判斷（用未鏡像的原始座標）
function palmFacing(lm) {
  if (!lm.handed) return false;
  const cz = (lm[5].x - lm[0].x) * (lm[17].y - lm[0].y) - (lm[5].y - lm[0].y) * (lm[17].x - lm[0].x);
  return (cz < 0) === (lm.handed === "Right");
}

// 手指：暗部底色 + 中間調 + 偏左上的高光，外圍帶柔和的環境陰影（手指之間的暗部）
function shadedTube(ctx, a, b, w, skin) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len, sg = (nx + ny) >= 0 ? -1 : 1;
  ctx.lineCap = "round";
  const stroke = (color, width, k, alpha = 1) => {
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
    const ox = sg * nx * w * k, oy = sg * ny * w * k;
    ctx.beginPath(); ctx.moveTo(a.x + ox, a.y + oy); ctx.lineTo(b.x + ox, b.y + oy); ctx.stroke();
  };
  ctx.save(); ctx.shadowColor = "rgba(70,25,15,.38)"; ctx.shadowBlur = w * 0.35;
  stroke(skinShade(skin, .55), w + 1.5 + w * 0.06, 0, 0.9);
  ctx.restore();
  stroke(skinShade(skin, .8), w, 0);
  stroke(skinShade(skin, .95), w * 0.8, 0.08);
  stroke(skin, w * 0.55, 0.12);
  stroke(skinShade(skin, 1.14), w * 0.24, 0.22, 0.6);
  ctx.globalAlpha = 1;
}
function sphere(ctx, p, r, skin) {       // 指節：比手指略凸，明暗柔和
  const g = ctx.createRadialGradient(p.x - r * .3, p.y - r * .3, r * .1, p.x, p.y, r);
  g.addColorStop(0, skinShade(skin, 1.12)); g.addColorStop(.6, skin); g.addColorStop(1, skinShade(skin, .86));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
}
// 關節皺褶：垂直於手指方向的短弧線
function crease(ctx, p, d, w, skin, alpha, shift = 0) {
  const n = { x: -d.y, y: d.x }, cx = p.x + d.x * w * shift, cy = p.y + d.y * w * shift;
  ctx.strokeStyle = rgba(skinShade(skin, .5), alpha); ctx.lineWidth = Math.max(1, w * 0.07); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx + n.x * w * 0.34, cy + n.y * w * 0.34);
  ctx.quadraticCurveTo(cx + d.x * w * 0.08, cy + d.y * w * 0.08, cx - n.x * w * 0.34, cy - n.y * w * 0.34); ctx.stroke();
}
// 指甲（手背朝向鏡頭時才畫）：略帶粉色、有高光
function nail(ctx, tip, d, w, skin) {
  const nw = w * 0.6, nh = w * 0.78;
  ctx.save(); ctx.translate(tip.x - d.x * w * 0.2, tip.y - d.y * w * 0.2); ctx.rotate(Math.atan2(d.y, d.x));
  const g = ctx.createLinearGradient(-nh / 2, 0, nh / 2, 0);
  g.addColorStop(0, mix(skin, "#e79a92", 0.45)); g.addColorStop(1, "#f7e4dc");
  ctx.beginPath(); ctx.roundRect(-nh / 2, -nw / 2, nh, nw, nw * 0.38);
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = rgba(skinShade(skin, .55), .5); ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = Math.max(1, w * 0.06); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-nh * 0.18, -nw * 0.22); ctx.lineTo(nh * 0.12, -nw * 0.22); ctx.stroke();
  ctx.restore();
}

const FW = [1.12, .96, 1.0, .92, .8], TP = [1, .9, .8];     // 各手指粗細（拇指最粗、小指最細）與由根部到指尖的漸細

/* 寫實的手：P 是 21 個點 {x, y, z}（畫布像素，z 越大越靠近觀看者）。
   依深度由遠到近繪製。手心：掌紋、拇指根部隆起；手背：筋腱、指甲；手指有關節皺褶與柔和陰影 */
function renderHand(ctx, P, opt = {}) {
  const skin = PROFILE.skin, palm = !!opt.palm;
  const size = Math.hypot(P[9].x - P[0].x, P[9].y - P[0].y) || 1;
  const wBase = size * 0.25;
  const n = v3.cross(v3.sub(P[5], P[0]), v3.sub(P[17], P[0]));
  const lit = Math.abs((n.x * -0.4 + n.y * -0.5 + n.z * 0.75) / (Math.hypot(n.x, n.y, n.z) || 1));
  const dz = (z) => Math.max(0.8, Math.min(1.3, 1 + z / size * 0.25));   // 越近越粗
  const zAvg = (idx) => idx.reduce((t, k) => t + P[k].z, 0) / idx.length;
  const lp = (i, j, t) => ({ x: P[i].x + (P[j].x - P[i].x) * t, y: P[i].y + (P[j].y - P[i].y) * t });
  const prims = [];

  if (opt.wrist) {                                   // 手腕（特寫視圖用）
    const d = { x: P[0].x - P[9].x, y: P[0].y - P[9].y }, l = Math.hypot(d.x, d.y) || 1;
    const e = { x: P[0].x + d.x / l * size * 0.7, y: P[0].y + d.y / l * size * 0.7, z: P[0].z };
    prims.push({ z: P[0].z - size, draw: () => shadedTube(ctx, P[0], e, wBase * 1.5, skin) });
  }
  prims.push({ z: zAvg(PALM) - 0.01, draw: () => {  // 手掌：圓角外形，涵蓋拇指根部與掌緣
    const ids = [0, 1, 2, 5, 9, 13, 17];
    const cen = ids.reduce((t, i) => ({ x: t.x + P[i].x / ids.length, y: t.y + P[i].y / ids.length }), { x: 0, y: 0 });
    const pts = ids.map(i => { const dx = P[i].x - cen.x, dy = P[i].y - cen.y, l = Math.hypot(dx, dy) || 1;
      return [P[i].x + dx / l * wBase * 0.36, P[i].y + dy / l * wBase * 0.36]; });
    const path = () => ovalPath(ctx, pts, 1, 0);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const g = ctx.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    g.addColorStop(0, skinShade(skin, .95 + .2 * lit)); g.addColorStop(1, skinShade(skin, .78 + .18 * lit));
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = size * 0.18; ctx.shadowOffsetY = size * 0.07;
    path(); ctx.fillStyle = skinShade(skin, .7); ctx.fill(); ctx.restore();
    path(); ctx.fillStyle = g; ctx.fill();
    ctx.save(); path(); ctx.clip(); ctx.lineCap = "round";
    if (palm) {                                      // 手心：拇指根部隆起的高光 + 三條主要掌紋
      const t = lp(1, 0, 0.3), hg = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, size * 0.3);
      hg.addColorStop(0, "rgba(255,240,230,.28)"); hg.addColorStop(1, "rgba(255,240,230,0)");
      ctx.fillStyle = hg; ctx.fillRect(t.x - size, t.y - size, size * 2, size * 2);
      ctx.strokeStyle = rgba(skinShade(skin, .5), .36); ctx.lineWidth = Math.max(1.2, size * 0.013);
      const line = (a, c, b) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, b.x, b.y); ctx.stroke(); };
      const toward = (p, k) => ({ x: p.x + (P[0].x - p.x) * k, y: p.y + (P[0].y - p.y) * k });
      line(lp(17, 0, .3), toward(lp(13, 9, .5), .3), lp(5, 0, .22));          // 感情線
      line(lp(5, 0, .42), toward(lp(9, 13, .5), .5), lp(17, 0, .62));         // 智慧線
      line(lp(5, 2, .5), lp(1, 9, .3), lp(0, 9, .12));                        // 生命線
    } else {                                         // 手背：掌骨之間的筋腱
      ctx.strokeStyle = rgba(skinShade(skin, .55), .17); ctx.lineWidth = Math.max(2, size * 0.03);
      [5, 9, 13, 17].forEach(i => { const a = lp(i, 0, .12), b = lp(i, 0, .66); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); });
      ctx.strokeStyle = "rgba(255,255,255,.1)"; ctx.lineWidth = Math.max(1.5, size * 0.016);
      [5, 9, 13, 17].forEach(i => { const a = lp(i, 0, .14), b = lp(i, 0, .6); ctx.beginPath(); ctx.moveTo(a.x - 2, a.y); ctx.lineTo(b.x - 2, b.y); ctx.stroke(); });
    }
    ctx.restore();
    path(); ctx.strokeStyle = rgba(skinShade(skin, .5), .5); ctx.lineWidth = 1.5 + size * 0.01; ctx.stroke();
  } });
  FINGERS.forEach((f, fi) => {
    const fw = wBase * FW[fi];
    for (let k = 0; k < 3; k++) {
      const a = P[f[k]], b = P[f[k + 1]], z = (a.z + b.z) / 2;
      prims.push({ z: k === 0 ? Math.max(z, zAvg(PALM) + 0.02) : z, draw: () => shadedTube(ctx, a, b, fw * TP[k] * dz(z), skin) });   // 指根永遠畫在手掌之上
    }
    [1, 2].forEach(k => {                            // 指節 + 關節皺褶
      const j = P[f[k]], w = fw * TP[k] * dz(j.z);
      const ln = Math.hypot(P[f[k + 1]].x - P[f[k - 1]].x, P[f[k + 1]].y - P[f[k - 1]].y) || 1;
      const d = { x: (P[f[k + 1]].x - P[f[k - 1]].x) / ln, y: (P[f[k + 1]].y - P[f[k - 1]].y) / ln };
      prims.push({ z: j.z + 0.5, draw: () => {
        sphere(ctx, j, w * 0.5, skin);
        const shifts = k === 1 ? (palm ? [-.14, .14] : [-.2, 0, .2]) : (palm ? [0] : [-.08, .08]);
        shifts.forEach(sh => crease(ctx, j, d, w, skin, palm ? .5 : .34, sh));
      } });
    });
    const tip = P[f[3]], tw = fw * TP[2] * dz(tip.z);
    const tl = Math.hypot(tip.x - P[f[2]].x, tip.y - P[f[2]].y) || 1;
    const td = { x: (tip.x - P[f[2]].x) / tl, y: (tip.y - P[f[2]].y) / tl };
    prims.push({ z: tip.z + 0.5, draw: () => { sphere(ctx, tip, tw * 0.48, skin); if (!palm) nail(ctx, tip, td, tw, skin); } });
  });
  prims.sort((p, q) => p.z - q.z).forEach(p => p.draw());
}

// 角色畫布用：把偵測到的關節點（0~1）轉成畫布座標與深度，再交給寫實繪製
function drawHand(ctx, lm, mirror = true, clear = true) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (clear) ctx.clearRect(0, 0, W, H);
  if (!lm) return;
  renderHand(ctx, lm.map(p => ({ x: (mirror ? 1 - p.x : p.x) * W, y: p.y * H, z: -(p.z || 0) * W })), { palm: palmFacing(lm) });
}

/* 圓管（手臂、脖子）：可指定填色與描邊色 */
function drawTube(ctx, pts, width, fill = PROFILE.skin, line = skinShade(PROFILE.skin, .7)) {
  ctx.lineCap = ctx.lineJoin = "round";
  for (const [color, extra] of [[line, 4], [fill, 0]]) {
    ctx.strokeStyle = color; ctx.lineWidth = width + extra * 2;
    ctx.beginPath();
    pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  }
}

/* 虛擬人物：身體、頭、臉、手臂（姿勢偵測）+ 手掌手指（手部偵測） */
function drawAvatar(ctx, pose, hands, face = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  const toPx = (p) => ({ x: (1 - p.x) * W, y: p.y * H });
  const SHIRT = PROFILE.shirt, SHIRT_L = shade(PROFILE.shirt, .65);
  const seen = (i) => pose[i] && (pose[i].visibility ?? 1) > 0.4;

  if (pose) {
    const L = toPx(pose[11]), R = toPx(pose[12]);
    const sw = Math.hypot(L.x - R.x, L.y - R.y);
    const armW = Math.max(14, sw * 0.2);
    const mid = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };

    const nose = toPx(pose[0]), r = sw * 0.38;
    const head = { x: nose.x, y: nose.y - PROFILE.noseY * r };   // 臉部中心 = 鼻尖往上推
    const chinY = Math.max(...PROFILE.oval.map(p => p[1])) * r * 0.95, longDrop = (mid.y - head.y) + sw * 0.3;
    const hairDrop = chinY + (longDrop - chinY) * Math.max(0, Math.min(1, PROFILE.hairLen ?? 1));   // 髮長：0 = 及下巴，1 = 過肩
    if (PROFILE.hairStyle === "long" || PROFILE.hairBun) drawFace(ctx, head, r, face, "back", hairDrop);

    // 身體（上衣）：看不到髖部時往下延伸
    const bl = seen(23) ? toPx(pose[23]) : { x: L.x, y: L.y + sw * 1.8 };
    const br = seen(24) ? toPx(pose[24]) : { x: R.x, y: R.y + sw * 1.8 };
    const tg = ctx.createLinearGradient(0, Math.min(L.y, R.y), 0, Math.max(bl.y, br.y));
    tg.addColorStop(0, shade(SHIRT, 1.15)); tg.addColorStop(1, shade(SHIRT, .78));
    ctx.fillStyle = tg; ctx.strokeStyle = SHIRT_L; ctx.lineWidth = 4; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(L.x, L.y); ctx.lineTo(R.x, R.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = skinShade(PROFILE.skin, .88);                 // V 領露出的胸口
    ctx.beginPath(); ctx.moveTo(mid.x - sw * 0.13, mid.y - 2); ctx.lineTo(mid.x + sw * 0.13, mid.y - 2); ctx.lineTo(mid.x, mid.y + sw * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = SHIRT_L; ctx.lineWidth = 2; ctx.stroke();
    // 脖子 + 頭（臉會跟著你的表情與傾斜）
    drawTube(ctx, [mid, { x: head.x, y: head.y + r * 0.9 }], r * 0.5);
    drawFace(ctx, head, r, face, "front", hairDrop);

    // 手臂：上臂是袖子，前臂是皮膚，手腕對齊最近的手
    [[11, 13, 15], [12, 14, 16]].forEach(([s, e, w]) => {
      if (!seen(s) || !seen(e) || !seen(w)) return;
      let wrist = toPx(pose[w]);
      const near = hands.map(h => toPx(h[0]))
        .sort((p, q) => Math.hypot(p.x - wrist.x, p.y - wrist.y) - Math.hypot(q.x - wrist.x, q.y - wrist.y))[0];
      if (near && Math.hypot(near.x - wrist.x, near.y - wrist.y) < W * 0.15) wrist = near;
      const elbow = toPx(pose[e]);
      drawTube(ctx, [toPx(pose[s]), elbow], armW * 1.15, SHIRT, SHIRT_L);
      drawTube(ctx, [elbow, wrist], armW * 0.85);
    });
  }
  hands.forEach(h => drawHand(ctx, h, true, false));
}

/* ---------- 長髮：後面的頭髮（在身體後方）+ 前面的瀏海與兩側垂髮（蓋在臉與肩膀前方） ---------- */
function hairFill(ctx, hair, y0, y1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(hair, 1.3)); g.addColorStop(0.35, hair); g.addColorStop(1, shade(hair, 0.62));
  return g;
}
function strands(ctx, list, hair, lw) {            // 髮絲：細長曲線，亮暗交錯，固定位置不會閃爍
  ctx.lineCap = "round"; ctx.lineWidth = lw;
  list.forEach(([x0, y0, cx, cy, x1, y1], i) => {
    ctx.strokeStyle = i % 2 ? rgba(shade(hair, 1.9), 0.16) : "rgba(0,0,0,.2)";
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
  });
}
function longHairBack(ctx, r, pf, hair, drop) {
  const top = Math.min(...pf.oval.map(p => p[1])) * r, ey = pf.eyeY * r, wd = r * 1.2 * (pf.hairVol || 1);
  ctx.save();
  ctx.fillStyle = hairFill(ctx, hair, top, drop);
  ctx.beginPath();
  ctx.moveTo(-wd * 0.98, ey);                                                                  // 左太陽穴
  ctx.bezierCurveTo(-wd * 1.05, top * 0.85, -wd * 0.55, top - r * 0.14, 0, top - r * 0.14);    // 頭頂
  ctx.bezierCurveTo(wd * 0.55, top - r * 0.14, wd * 1.05, top * 0.85, wd * 0.98, ey);
  ctx.bezierCurveTo(wd * 1.2, ey + (drop - ey) * 0.45, wd * 1.12, drop * 0.85, wd * 1.0, drop - r * 0.02);   // 右側垂落
  ctx.quadraticCurveTo(wd * 0.75, drop + r * 0.12, wd * 0.5, drop - r * 0.02);               // 髮尾參差不齊
  ctx.quadraticCurveTo(wd * 0.25, drop + r * 0.1, 0, drop - r * 0.04);
  ctx.quadraticCurveTo(-wd * 0.25, drop + r * 0.12, -wd * 0.5, drop);
  ctx.quadraticCurveTo(-wd * 0.75, drop + r * 0.1, -wd * 1.0, drop - r * 0.02);
  ctx.bezierCurveTo(-wd * 1.12, drop * 0.85, -wd * 1.2, ey + (drop - ey) * 0.45, -wd * 0.98, ey);
  ctx.closePath(); ctx.fill();
  strands(ctx, [-0.85, -0.55, -0.25, 0.1, 0.4, 0.7, 0.9].map(k =>
    [wd * k * 0.9, ey - r * 0.2, wd * k * 1.14, (ey + drop) / 2, wd * k * 1.05, drop - r * 0.08]), hair, Math.max(1.2, r * 0.018));
  if ((pf.hairCurl || 0) > 0.35) { curlBumps(ctx, -1, wd * 1.04, ey, drop - r * 0.1, r, hair, pf.hairCurl); curlBumps(ctx, 1, wd * 1.04, ey, drop - r * 0.1, r, hair, pf.hairCurl); }
  ctx.restore();
}
function curlBumps(ctx, sd, x, y0, y1, r, hair, amt) {      // 捲髮：沿髮絲外緣疊上一圈圈小捲
  const n = Math.max(3, Math.round((y1 - y0) / (r * 0.22)));
  for (let k = 0; k <= n; k++) {
    const y = y0 + (y1 - y0) * k / n, rad = r * (0.13 + 0.07 * amt) * (0.85 + 0.3 * Math.sin(k * 2.1));
    ctx.fillStyle = k % 2 ? shade(hair, 1.12) : hair;
    ctx.beginPath(); ctx.arc(sd * (x + r * 0.03 * Math.cos(k * 1.3) - rad * 0.2), y, rad, 0, 7); ctx.fill();
  }
}
function hairBun(ctx, r, pf, hair) {                         // 丸子頭：頭頂的髮髻與髮圈
  const top = Math.min(...pf.oval.map(p => p[1])) * r, R = r * 0.4 * Math.min(1.25, pf.hairVol || 1), cy = top - R * 0.7;
  const g = ctx.createRadialGradient(-R * 0.3, cy - R * 0.3, R * 0.1, 0, cy, R);
  g.addColorStop(0, shade(hair, 1.4)); g.addColorStop(0.6, hair); g.addColorStop(1, shade(hair, 0.6));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, cy, R, 0, 7); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.2)"; ctx.lineWidth = Math.max(1.2, r * 0.018); ctx.lineCap = "round";
  for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(0, cy, R * (0.35 + 0.14 * k), 0.4 * k, 1.7 + 0.4 * k); ctx.stroke(); }
  ctx.fillStyle = mix(hair, "#c0392b", 0.4); ctx.beginPath(); ctx.ellipse(0, top - r * 0.02, R * 0.62, R * 0.16, 0, 0, 7); ctx.fill();
}
// 瀏海：part = 中分、full = 全瀏海、side = 旁分（partSide 為分線所在側）、back = 露額
function hairFringe(ctx, oval, r, pf, hair) {
  const top = Math.min(...oval.map(p => p[1])) * r, ey = pf.eyeY * r, brow = pf.browY * r, lw = Math.max(1.2, r * 0.018);
  const parting = brow - 0.3 * r, type = pf.bangs || "part", sd = (pf.partSide || 1) >= 0 ? 1 : -1;
  let low = parting + r * 0.6;
  ctx.save(); ovalPath(ctx, oval, r, 0); ctx.clip();
  ctx.beginPath();
  if (type === "full") {
    const y0 = brow - 0.14 * r; low = y0 + r * 0.1;
    ctx.moveTo(-2 * r, -3 * r); ctx.lineTo(2 * r, -3 * r); ctx.lineTo(2 * r, ey - 0.15 * r); ctx.lineTo(r * 1.02, ey - 0.15 * r);
    ctx.bezierCurveTo(r * 0.95, y0 - r * 0.05, r * 0.5, y0 + r * 0.06, 0, y0 + r * 0.06);
    ctx.bezierCurveTo(-r * 0.5, y0 + r * 0.06, -r * 0.95, y0 - r * 0.05, -r * 1.02, ey - 0.15 * r);
    ctx.lineTo(-2 * r, ey - 0.15 * r);
  } else if (type === "side") {                       // 以「分線在右側」的形狀畫，再依 partSide 左右鏡射
    low = brow;
    const X = (v) => sd * v * r;
    ctx.moveTo(X(-2), -3 * r); ctx.lineTo(X(2), -3 * r); ctx.lineTo(X(2), ey - 0.25 * r); ctx.lineTo(X(1.02), ey - 0.25 * r);
    ctx.quadraticCurveTo(X(0.75), parting - 0.1 * r, X(0.4), parting);
    ctx.bezierCurveTo(X(0.05), parting + 0.1 * r, X(-0.55), brow - 0.28 * r, X(-0.95), brow - 0.06 * r);
    ctx.lineTo(X(-1.02), ey - 0.02 * r); ctx.lineTo(X(-2), ey - 0.02 * r);
  } else if (type === "back") {                       // 髮線很高，額頭完整露出
    low = top + 0.5 * r;
    ctx.moveTo(-2 * r, -3 * r); ctx.lineTo(2 * r, -3 * r); ctx.lineTo(2 * r, ey - 0.5 * r); ctx.lineTo(r * 1.02, ey - 0.5 * r);
    ctx.quadraticCurveTo(r * 0.6, top + 0.35 * r, 0, top + 0.42 * r);
    ctx.quadraticCurveTo(-r * 0.6, top + 0.35 * r, -r * 1.02, ey - 0.5 * r);
    ctx.lineTo(-2 * r, ey - 0.5 * r);
  } else {                                            // 中分
    ctx.moveTo(-2 * r, -3 * r); ctx.lineTo(2 * r, -3 * r); ctx.lineTo(2 * r, ey - 0.2 * r); ctx.lineTo(r * 1.02, ey - 0.2 * r);
    ctx.quadraticCurveTo(r * 0.7, parting - 0.12 * r, r * 0.04, parting);
    ctx.quadraticCurveTo(-r * 0.7, parting - 0.12 * r, -r * 1.02, ey - 0.2 * r);
    ctx.lineTo(-2 * r, ey - 0.2 * r);
  }
  ctx.closePath(); ctx.fillStyle = hairFill(ctx, hair, top, low); ctx.fill();
  strands(ctx, [-0.7, -0.35, 0, 0.35, 0.7].map(k => [k * r, top + 0.3 * r, k * 1.1 * r, (top + low) / 2, k * 1.2 * r, low - 0.15 * r]), hair, lw);
  ctx.restore();
}
function hairSideLocks(ctx, oval, r, pf, hair, drop) {   // 兩側垂髮：從太陽穴沿臉頰垂下，蓋住耳朵與臉的邊緣
  const ey = pf.eyeY * r, chin = Math.max(...oval.map(p => p[1])) * r, lw = Math.max(1.2, r * 0.018), V = pf.hairVol || 1;
  for (const sd of [-1, 1]) {
    const yTop = ey - r * 0.25;
    ctx.fillStyle = hairFill(ctx, hair, yTop, drop + r * 0.2); ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1.5; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(sd * r * 0.9, yTop);
    ctx.bezierCurveTo(sd * r * 1.25 * V, yTop + r * 0.1, sd * r * 1.3 * V, (yTop + drop) / 2, sd * r * 1.12 * V, drop);
    ctx.quadraticCurveTo(sd * r * 0.95, drop + r * 0.3, sd * r * 0.62, drop + r * 0.12);
    ctx.bezierCurveTo(sd * r * 0.5, drop * 0.9, sd * r * 0.62, chin, sd * r * 0.8, ey + r * 0.55);
    ctx.bezierCurveTo(sd * r * 0.86, ey + r * 0.3, sd * r * 0.86, yTop + r * 0.1, sd * r * 0.9, yTop);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    strands(ctx, [0, 1, 2].map(k => [sd * r * (0.98 + k * 0.07), yTop + r * 0.2, sd * r * (1.12 + k * 0.03) * V, (yTop + drop) / 2, sd * r * (0.92 + k * 0.05), drop - r * 0.05]), hair, lw);
    if ((pf.hairCurl || 0) > 0.35) curlBumps(ctx, sd, r * 1.12 * V, yTop + r * 0.3, drop, r, hair, pf.hairCurl);
  }
}

/* 毛孔顆粒：固定的細微雜點花紋，疊在皮膚上增加質感 */
let _skinTex = null;
function skinTexture(ctx) {
  try {
    if (!_skinTex) {
      const c = document.createElement("canvas"); c.width = c.height = 96;
      const g = c.getContext("2d"), img = g.createImageData(96, 96); let seed = 12345;
      const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let i = 0; i < img.data.length; i += 4) { const v = rnd() < 0.5 ? 0 : 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = rnd() < 0.18 ? 14 : 0; }
      g.putImageData(img, 0, 0); _skinTex = c;
    }
    return ctx.createPattern(_skinTex, "repeat");
  } catch { return null; }
}
/* 鬍子：下巴與兩頰的鬍渣（由嘴巴高度往下漸濃）+ 上唇的鬍子，濃度由偵測或拉桿決定 */
function drawBeard(ctx, r, pf, fx, fy) {
  const s = pf.beard, col = pf.beardColor || "#3a2a22", my = fy(pf.mouthY * r, 0.7);
  const chin = Math.max(...pf.oval.map(p => p[1])) * r, top = my - r * 0.3;
  const g = ctx.createLinearGradient(0, top, 0, chin);
  g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.4, rgba(col, 0.5 * s)); g.addColorStop(1, rgba(col, 0.88 * s));
  ctx.fillStyle = g; ctx.fillRect(-r * 1.5, top, r * 3, chin - top + r * 0.4);
  const ey = pf.eyeY * r + r * 0.4;
  for (const sd of [-1, 1]) {
    const sg = ctx.createLinearGradient(sd * r * 0.95, 0, sd * r * 0.45, 0);
    sg.addColorStop(0, rgba(col, 0.5 * s)); sg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = sg; ctx.fillRect(sd < 0 ? -r * 1.1 : r * 0.45, ey, r * 0.65, my - ey);
  }
  const mx = fx(0, 0.7);
  ctx.fillStyle = rgba(col, 0.7 * s); ctx.beginPath();
  ctx.moveTo(mx - r * 0.4, my - r * 0.14); ctx.quadraticCurveTo(mx, my - r * 0.32, mx + r * 0.4, my - r * 0.14);
  ctx.quadraticCurveTo(mx + r * 0.2, my - r * 0.06, mx, my - r * 0.1); ctx.quadraticCurveTo(mx - r * 0.2, my - r * 0.06, mx - r * 0.4, my - r * 0.14);
  ctx.fill();
}

/* 臉：輪廓、五官位置來自你的臉；眨眼、瞇眼、視線、眉毛、嘴唇、牙齒、舌頭、鼓頰、轉頭點頭都即時跟著你 */
function drawFace(ctx, c, r, face, layer = "all", hairDrop = r * 2.4) {
  const pf = PROFILE, blend = face.blend || {}, b = (n) => blend[n] ?? 0;
  const L = (n) => b(n + "Left"), R = (n) => b(n + "Right"), avg = (n) => (L(n) + R(n)) / 2;
  const yaw = Math.max(-1, Math.min(1, face.yaw || 0)), pitch = Math.max(-0.8, Math.min(0.8, face.pitch || 0));
  const cosY = Math.sqrt(1 - (0.65 * yaw) ** 2);
  const fx = (x, depth) => x * cosY + yaw * r * 0.40 * depth;     // 五官位置：越突出（鼻子）位移越多
  const fy = (y, depth) => y + pitch * r * 0.32 * depth;
  const skin = pf.skin, skinL = shade(skin, .72), skinH = pf.skinHi || shade(skin, 1.1), hair = pf.hair;
  const lw = Math.max(2, r * 0.035), lipC = pf.lip || mix(skin, "#c2484f", 0.5), darkC = "#2a1b14";
  const browC = pf.brow || (pf.hairStyle === "none" ? "#3a2a20" : shade(hair, .85));
  const jaw = b("jawOpen"), puff = b("cheekPuff"), smile = avg("mouthSmile");
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(face.roll || 0);
  ctx.lineJoin = ctx.lineCap = "round";
  const oval = pf.oval.map(([x, y]) => [x * (1 + puff * 0.07 * Math.min(1, Math.abs(x))) * (1 - 0.06 * Math.abs(yaw)),
    y > 0 ? y * (1 + jaw * 0.14 * Math.min(1, y)) : y]);

  if (pf.hairStyle === "long" && layer !== "front") longHairBack(ctx, r, pf, hair, hairDrop);
  if (pf.hairBun && layer !== "front") hairBun(ctx, r, pf, hair);
  if (layer === "back") { ctx.restore(); return; }
  if (pf.hairStyle !== "none") {
    const V = pf.hairVol || 1;
    ctx.save(); ctx.beginPath(); ctx.rect(-3 * r, -3 * r, 6 * r, 3 * r + (pf.eyeY + 0.3) * r); ctx.clip();
    ctx.fillStyle = hair; ovalPath(ctx, oval, r * (1.0 + 0.12 * V), -r * 0.06); ctx.fill();
    if ((pf.hairCurl || 0) > 0.35) {                                     // 捲髮：頭頂外緣一圈小捲
      const topY = -Math.min(...oval.map(p => p[1])) * r;
      for (let t = 1.08; t < 1.93; t += 0.12) {
        ctx.fillStyle = Math.round(t * 10) % 2 ? shade(hair, 1.12) : hair;
        ctx.beginPath(); ctx.arc(Math.cos(t * Math.PI) * r * 1.08 * V, Math.sin(t * Math.PI) * topY * 1.02, r * (0.13 + 0.06 * pf.hairCurl), 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }
  for (const sd of [-1, 1]) {                                        // 耳朵（轉頭時遠側的耳朵會被遮住）
    const vis = 1 - Math.max(0, sd * yaw) * 0.9;
    ctx.globalAlpha = vis; ctx.fillStyle = skin; ctx.strokeStyle = skinL; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(sd * r * 0.98, fy(pf.eyeY * r + r * 0.22, 0.2), r * 0.12, r * 0.24, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(skin, .85); ctx.beginPath(); ctx.ellipse(sd * r * 0.99, fy(pf.eyeY * r + r * 0.24, 0.2), r * 0.05, r * 0.13, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  const g = ctx.createRadialGradient(-r * 0.25, -r * 0.35, r * 0.1, 0, 0, r * 1.5);   // 臉的立體感：額頭亮、邊緣暗
  g.addColorStop(0, skinH); g.addColorStop(0.55, skin); g.addColorStop(1, pf.skinLo ? mix(skin, pf.skinLo, 0.8) : shade(skin, .84));
  ctx.fillStyle = g; ctx.strokeStyle = skinL; ctx.lineWidth = lw * 1.2;
  ovalPath(ctx, oval, r, 0); ctx.fill(); ctx.stroke();
  // ----- 皮膚質感：T 字區反光、眼下淡影、鼻頭血色、毛孔顆粒，以及鬍子 -----
  ctx.save(); ovalPath(ctx, oval, r, 0); ctx.clip();
  const tz = ctx.createRadialGradient(fx(0, .5), fy(-r * 0.5, .5), 0, fx(0, .5), fy(-r * 0.5, .5), r * 0.55);
  tz.addColorStop(0, "rgba(255,255,255,.10)"); tz.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = tz; ctx.fillRect(-r * 1.5, -r * 1.8, r * 3, r * 3.6);
  for (const sd of [-1, 1]) {
    ctx.fillStyle = rgba(skinShade(skin, .6), .1);
    ctx.beginPath(); ctx.ellipse(fx(sd * pf.eyeX * r, .6), fy(pf.eyeY * r + r * 0.24, .6), r * 0.3, r * 0.085, 0, 0, 7); ctx.fill();
  }
  const ntx = fx(0, 1), nty = fy(pf.noseY * r, 1), nt = ctx.createRadialGradient(ntx, nty, 0, ntx, nty, r * 0.13);
  nt.addColorStop(0, "rgba(205,95,85,.14)"); nt.addColorStop(1, "rgba(205,95,85,0)");
  ctx.fillStyle = nt; ctx.fillRect(ntx - r * 0.2, nty - r * 0.2, r * 0.4, r * 0.4);
  const tex = skinTexture(ctx);
  if (tex) { ctx.globalAlpha = 0.5; ctx.fillStyle = tex; ctx.fillRect(-r * 1.5, -r * 1.8, r * 3, r * 3.6); ctx.globalAlpha = 1; }
  if ((pf.beard || 0) > 0.06) drawBeard(ctx, r, pf, fx, fy);
  ctx.restore();
  if (pf.hairStyle !== "none") hairFringe(ctx, oval, r, pf, hair);
  if (pf.hairStyle === "long") hairSideLocks(ctx, oval, r, pf, hair, hairDrop);
  const blush = Math.min(1, smile * 0.8 + avg("cheekSquint") * 0.6);   // 臉頰紅暈
  if (blush > 0.05) for (const sd of [-1, 1]) {
    const bx = fx(sd * r * 0.55, 0.4), by = fy(pf.eyeY * r + r * 0.5, 0.4);
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.3);
    bg.addColorStop(0, `rgba(226,100,100,${0.28 * blush})`); bg.addColorStop(1, "rgba(226,100,100,0)");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, r * 0.3, 0, 7); ctx.fill();
  }
  const up = (b("browInnerUp") + avg("browOuterUp")) / 2;               // 抬頭紋
  if (up > 0.45 && pf.hairStyle === "none") { ctx.strokeStyle = skinL; ctx.globalAlpha = 0.3 * up; ctx.lineWidth = lw * 0.8;
    [-0.78, -0.66].forEach(yy => { ctx.beginPath(); ctx.moveTo(fx(-r * 0.35, 0.3), fy(yy * r, 0.3)); ctx.quadraticCurveTo(fx(0, 0.3), fy((yy - 0.06) * r, 0.3), fx(r * 0.35, 0.3), fy(yy * r, 0.3)); ctx.stroke(); });
    ctx.globalAlpha = 1; }

  // ----- 眼睛 -----
  for (const sd of [-1, 1]) {                                        // -1 = 畫面左側，對應你的左眼
    const S = sd < 0 ? "Left" : "Right";
    const blink = b("eyeBlink" + S), squint = b("eyeSquint" + S), wide = b("eyeWide" + S);
    const rx = pf.eyeW * r * 0.62 * Math.max(0.6, Math.min(1.25, 1 - 0.28 * yaw * sd));
    const openH = Math.max(rx * 0.05, rx * (pf.eyeOpen ?? 0.78) * (1 + 0.35 * wide - 0.3 * squint) * (1 - blink * 0.95));
    const ex = fx(sd * pf.eyeX * r, 0.6), ey = fy(pf.eyeY * r, 0.6);
    const inn = { x: ex - sd * rx, y: ey + rx * 0.05 }, out = { x: ex + sd * rx, y: ey - rx * 0.08 };
    const cu = { x: ex, y: ey - openH * 2 }, cl = { x: ex, y: ey + openH * 1.2 };
    const eyePath = () => { ctx.beginPath(); ctx.moveTo(inn.x, inn.y); ctx.quadraticCurveTo(cu.x, cu.y, out.x, out.y); ctx.quadraticCurveTo(cl.x, cl.y, inn.x, inn.y); ctx.closePath(); };
    ctx.strokeStyle = skinL; ctx.globalAlpha = 0.5 * (1 - blink); ctx.lineWidth = lw * 0.8;     // 雙眼皮線
    ctx.beginPath(); ctx.moveTo(inn.x, inn.y - rx * 0.1); ctx.quadraticCurveTo(ex, ey - openH * 2.5 - rx * 0.18, out.x, out.y - rx * 0.1); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.save(); eyePath(); ctx.fillStyle = "#fbfbf9"; ctx.fill(); ctx.clip();
    const look = sd < 0 ? [L("eyeLookIn") - L("eyeLookOut"), L("eyeLookDown") - L("eyeLookUp")]
                        : [R("eyeLookOut") - R("eyeLookIn"), R("eyeLookDown") - R("eyeLookUp")];
    const ir = rx * 0.52 * (1 - 0.1 * Math.abs(yaw)), ix = ex + look[0] * rx * 0.42 + yaw * rx * 0.1, iy = ey + look[1] * openH * 0.5;
    const ig = ctx.createRadialGradient(ix, iy, ir * 0.1, ix, iy, ir);
    ig.addColorStop(0, mix(pf.eye, "#ffffff", 0.3)); ig.addColorStop(0.7, pf.eye); ig.addColorStop(1, shade(pf.eye, .55));
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, 7); ctx.fill();
    ctx.fillStyle = "#0b0b0b"; ctx.beginPath(); ctx.arc(ix, iy, ir * 0.46, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.arc(ix - ir * 0.32, iy - ir * 0.32, ir * 0.17, 0, 7); ctx.fill();
    const sh = ctx.createLinearGradient(0, ey - openH, 0, ey);                                // 上眼皮陰影
    sh.addColorStop(0, "rgba(0,0,0,.28)"); sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh; ctx.fillRect(ex - rx * 1.2, ey - openH * 1.3, rx * 2.4, openH * 1.3);
    ctx.restore();
    ctx.strokeStyle = darkC; ctx.lineWidth = lw * 1.25;                                       // 上眼線 + 睫毛
    ctx.beginPath(); ctx.moveTo(inn.x, inn.y); ctx.quadraticCurveTo(cu.x, cu.y, out.x, out.y); ctx.stroke();
    ctx.lineWidth = lw * 0.7;
    [0.62, 0.78, 0.92].forEach(t => {
      const q = (1 - t) ** 2, m = 2 * (1 - t) * t, e = t * t;
      const px = q * inn.x + m * cu.x + e * out.x, py = q * inn.y + m * cu.y + e * out.y;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + sd * rx * 0.16, py - rx * (0.2 - 0.04 * blink)); ctx.stroke();
    });
    ctx.strokeStyle = skinL; ctx.globalAlpha = 0.6; ctx.lineWidth = lw * 0.7;                  // 下眼線
    ctx.beginPath(); ctx.moveTo(inn.x, inn.y); ctx.quadraticCurveTo(cl.x, cl.y, out.x, out.y); ctx.stroke(); ctx.globalAlpha = 1;

    // ----- 眉毛：內粗外細、帶弧度 -----
    const down = b("browDown" + S), outer = b("browOuterUp" + S), inner = b("browInnerUp");
    const ix0 = fx(sd * pf.browIn * r, 0.5), ox0 = fx(sd * pf.browOut * r, 0.5), base = pf.browY * r;
    const yIn = fy(base + down * r * 0.13 - inner * r * 0.14, 0.5);
    const yOut = fy(base - outer * r * 0.15 - inner * r * 0.05 + down * r * 0.0, 0.5);
    const mx = (ix0 + ox0) / 2, my = (yIn + yOut) / 2 - r * 0.05 * (1 - down * 0.8) - outer * r * 0.05;
    const t0 = r * (pf.browT ?? 0.085), t1 = t0 * 0.41;
    ctx.fillStyle = browC; ctx.beginPath();
    ctx.moveTo(ix0, yIn - t0 / 2); ctx.quadraticCurveTo(mx, my - (t0 + t1) / 4, ox0, yOut - t1 / 2);
    ctx.lineTo(ox0, yOut + t1 / 2); ctx.quadraticCurveTo(mx, my + (t0 + t1) / 4, ix0, yIn + t0 / 2); ctx.closePath(); ctx.fill();
  }

  // ----- 眼鏡 -----
  if (pf.glasses && pf.glasses !== "none") {
    const round = pf.glasses === "round", gw = pf.eyeW * r * 1.2, gh = gw * (round ? 0.92 : 0.7), frame = "#1e1e24";
    ctx.lineJoin = "round";
    for (const sd of [-1, 1]) {
      const cx = fx(sd * pf.eyeX * r, 0.6), cy = fy(pf.eyeY * r, 0.6);
      ctx.beginPath();
      if (round) ctx.ellipse(cx, cy, gw, gh, 0, 0, 7); else ctx.roundRect(cx - gw, cy - gh, gw * 2, gh * 2, r * 0.1);
      ctx.fillStyle = "rgba(190,225,255,.14)"; ctx.fill(); ctx.strokeStyle = frame; ctx.lineWidth = r * 0.04; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = r * 0.02;                                  // 鏡片反光
      ctx.beginPath(); ctx.moveTo(cx - gw * 0.55, cy - gh * 0.25); ctx.lineTo(cx - gw * 0.15, cy - gh * 0.62); ctx.stroke();
      ctx.strokeStyle = frame; ctx.lineWidth = r * 0.04;
      ctx.beginPath(); ctx.moveTo(cx + sd * gw, cy - gh * 0.2); ctx.lineTo(sd * r * 1.04, cy - gh * 0.1); ctx.stroke();   // 鏡腳
    }
    const ly = fy(pf.eyeY * r, 0.6) - gh * 0.15;
    ctx.beginPath(); ctx.moveTo(fx(-pf.eyeX * r, 0.6) + gw, ly); ctx.quadraticCurveTo(fx(0, 0.8), ly - gh * 0.25, fx(pf.eyeX * r, 0.6) - gw, ly); ctx.stroke();   // 鼻樑架
  }

  // ----- 鼻子 -----
  const nx = fx(0, 1.0), ny = fy(pf.noseY * r, 1.0), sneer = avg("noseSneer");
  ctx.strokeStyle = skinL; ctx.globalAlpha = 0.35; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(fx(r * 0.03, 0.8), fy(pf.eyeY * r + r * 0.1, 0.8)); ctx.lineTo(nx + r * 0.015, ny - r * 0.06); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = skinH; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.ellipse(nx, ny - r * 0.03, r * 0.05, r * 0.04, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = shade(skin, .55); ctx.globalAlpha = 0.65;
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(nx + sd * r * 0.065 * (pf.noseW ?? 1) * (1 + sneer * 0.5), ny + r * 0.03, r * 0.028 * (1 + sneer * 0.6), r * 0.018, sd * 0.3, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (sneer > 0.3) { ctx.strokeStyle = skinL; ctx.lineWidth = lw * 0.8; ctx.globalAlpha = sneer;   // 皺鼻紋
    [0.0, 0.05].forEach(o => { ctx.beginPath(); ctx.moveTo(nx - r * 0.1, ny - r * (0.2 + o)); ctx.quadraticCurveTo(nx, ny - r * (0.25 + o), nx + r * 0.1, ny - r * (0.2 + o)); ctx.stroke(); });
    ctx.globalAlpha = 1; }

  // ----- 嘴巴：上下唇、牙齒、舌頭，嘴角、嘟嘴、抿嘴、翻唇都有 -----
  const frown = avg("mouthFrown"), stretch = avg("mouthStretch"), dimple = avg("mouthDimple"), press = avg("mouthPress");
  const upperUp = avg("mouthUpperUp"), lowerDown = avg("mouthLowerDown"), funnel = b("mouthFunnel"), pucker = b("mouthPucker");
  const rollU = b("mouthRollUpper"), rollL = b("mouthRollLower"), tongue = b("tongueOut");
  const mood = smile - frown;
  const halfW = Math.max(r * 0.1, pf.mouthHalf * r * (1 + 0.45 * smile + 0.25 * stretch - 0.45 * pucker - 0.35 * funnel));
  const mx0 = fx((b("mouthRight") - b("mouthLeft")) * r * 0.12 + (b("jawRight") - b("jawLeft")) * r * 0.06, 0.7);
  const y0 = fy(pf.mouthY * r, 0.7), cy = y0 - mood * r * 0.13 - dimple * r * 0.01;
  const lf = pf.lipFull ?? 1, tU = r * 0.07 * lf * (1 - 0.7 * rollU - 0.3 * press), tL = r * 0.09 * lf * (1 - 0.7 * rollL - 0.3 * press);
  const open = jaw * r * 0.55 + lowerDown * r * 0.07 + funnel * r * 0.12 + upperUp * r * 0.03, lift = upperUp * r * 0.06;
  const hw = halfW;
  ctx.save(); ctx.translate(mx0, 0);
  ctx.beginPath();                                                    // 嘴唇外輪廓
  ctx.moveTo(-hw, cy);
  ctx.bezierCurveTo(-hw * 0.55, y0 - tU * 1.6 - lift, -hw * 0.12, y0 - tU * 1.9 - lift, 0, y0 - tU * 1.35 - lift);
  ctx.bezierCurveTo(hw * 0.12, y0 - tU * 1.9 - lift, hw * 0.55, y0 - tU * 1.6 - lift, hw, cy);
  ctx.bezierCurveTo(hw * 0.6, y0 + open + tL * 2.0 + lowerDown * r * 0.03, -hw * 0.6, y0 + open + tL * 2.0 + lowerDown * r * 0.03, -hw, cy);
  ctx.closePath(); ctx.fillStyle = lipC; ctx.fill(); ctx.strokeStyle = shade(lipC, .6); ctx.lineWidth = lw * 0.7; ctx.stroke();
  if (open > r * 0.015) {
    const hi = hw * 0.86, topY = y0 + tU * 0.05, botY = y0 + open;
    const inner = () => { ctx.beginPath(); ctx.moveTo(-hi, cy); ctx.quadraticCurveTo(0, 2 * topY - cy, hi, cy); ctx.quadraticCurveTo(0, 2 * botY - cy, -hi, cy); ctx.closePath(); };
    ctx.save(); inner(); ctx.fillStyle = "#4a1717"; ctx.fill(); ctx.clip();
    ctx.fillStyle = "#f7f3ea"; ctx.fillRect(-hi, topY - 2, hi * 2, Math.min(open * 0.55, r * 0.14));      // 上排牙齒
    ctx.fillStyle = "#c9605f"; ctx.beginPath(); ctx.ellipse(0, botY - open * 0.15, hi * 0.55, open * 0.5, 0, 0, 7); ctx.fill(); // 舌頭
    ctx.restore();
  } else {
    ctx.strokeStyle = shade(lipC, .5); ctx.lineWidth = lw * 0.9;                                          // 閉嘴的唇線
    ctx.beginPath(); ctx.moveTo(-hw, cy); ctx.quadraticCurveTo(0, 2 * (y0 + tU * 0.1 + mood * r * 0.04) - cy, hw, cy); ctx.stroke();
  }
  if (tongue > 0.3) {                                                  // 吐舌頭
    ctx.fillStyle = "#d26a69"; ctx.strokeStyle = "#a94847"; ctx.lineWidth = lw * 0.7;
    ctx.beginPath(); ctx.ellipse(0, y0 + open + tL * 1.3, hw * 0.4, r * 0.14 * tongue, 0, 0, 7); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.beginPath(); ctx.ellipse(0, y0 + open + tL * 0.95, hw * 0.28, tL * 0.22, 0, 0, 7); ctx.fill();   // 下唇高光
  ctx.restore();
  if (smile > 0.35) {                                                  // 微笑時的法令紋
    ctx.strokeStyle = skinL; ctx.globalAlpha = Math.min(0.4, smile * 0.35); ctx.lineWidth = lw * 0.9;
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(nx + sd * r * 0.15, ny + r * 0.02); ctx.quadraticCurveTo(nx + sd * r * 0.3, (ny + cy) / 2, mx0 + sd * (hw + r * 0.05), cy); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* 沒有鏡頭資料時，用詞典手形組出一個舉手的角色（右手舉起） */
function syntheticScene(ext, ar = avatar.width / avatar.height) {
  const pose = [], set = (i, x, y) => (pose[i] = { x, y, visibility: 1 });
  set(0, .5, .34); set(2, .47, .31); set(5, .53, .31); set(9, .48, .4); set(10, .52, .4);
  set(11, .62, .6); set(12, .38, .6); set(13, .66, .8); set(14, .28, .5);
  set(15, .62, .97); set(16, .32, .3); set(23, .58, 1.1); set(24, .42, 1.1);
  const w = pose[16], s = 0.36;
  const hand = makePose(ext).map(p => ({ x: w.x + (p.x - 0.5) * s / ar, y: w.y + (p.y - 0.92) * s, z: 0 }));
  hand.handed = "Left";            // 詞典手形：手心朝向觀看者
  return { pose, hands: [hand] };
}

/* 由「手指伸直程度」合成一組關節點，用來播放詞典裡的手語 */
function makePose(ext) {
  const lm = new Array(21);
  lm[0] = { x: 0.5, y: 0.92 };
  const bases = [[0.40, 0.78], [0.40, 0.55], [0.50, 0.50], [0.60, 0.54], [0.69, 0.62]];
  const spread = [-55, -10, 0, 8, 16];
  FINGERS.forEach((f, n) => {
    let [x, y] = bases[n];
    lm[f[0]] = { x, y };
    let ang = (n === 0 ? -140 + (1 - ext[0]) * 110 : -90 + spread[n]) * Math.PI / 180;
    const e = ext[n];
    for (let k = 1; k < 4; k++) {
      const seg = (n === 0 ? 0.10 : 0.11 - k * 0.01) * (0.2 + 0.8 * e);
      x += Math.cos(ang) * seg; y += Math.sin(ang) * seg;
      lm[f[k]] = { x, y };
    }
  });
  return lm;
}

/* ---------- 臉部：表情分數（blendshapes）與頭部傾斜 ---------- */
const PITCH_SIGN = 1;      // 點頭方向如果和你相反，改成 -1
let prevBlend = {};
function readFace(res) {
  const cats = res.faceBlendshapes?.[0]?.categories;
  const lm = res.faceLandmarks?.[0];
  if (!cats || !lm) return { blend: {}, raw: {}, roll: 0, lm: null };
  const raw = {}, blend = {};
  cats.forEach(c => { raw[c.categoryName] = c.score; });
  // 每個人放鬆時的表情分數不同：扣掉校準時量到的基準，再拉伸回 0~1
  for (const k in raw) {
    const base = PROFILE.base?.[k] ?? 0, v = Math.min(1, Math.max(0, (raw[k] - base) / (1 - base)) * (PROFILE.gain?.[k] ?? 1));
    blend[k] = prevBlend[k] === undefined ? v : prevBlend[k] * 0.35 + v * 0.65;   // 輕度平滑，減少表情抖動
  }
  prevBlend = blend;
  // 以兩眼外眼角連線估計頭部左右傾斜（畫面是鏡像，所以 x 反向）
  const A = lm[33], B = lm[263];
  let roll = Math.atan2((B.y - A.y) * video.videoHeight, -(B.x - A.x) * video.videoWidth);
  if (roll > Math.PI / 2) roll -= Math.PI;
  if (roll < -Math.PI / 2) roll += Math.PI;
  // 轉頭（yaw）：鼻尖偏離兩頰中線的程度；點頭（pitch）：鼻尖在「眼線到下巴」之間的位置
  const c1 = lm[234], c2 = lm[454], half = Math.abs(c2.x - c1.x) / 2 || 1e-3;
  const yaw = Math.max(-1, Math.min(1, (-(lm[1].x - (c1.x + c2.x) / 2) / half * 1.4) - (PROFILE.yawBase || 0)));
  const ratio = (lm[1].y - (lm[33].y + lm[263].y) / 2) / ((lm[152].y - (lm[33].y + lm[263].y) / 2) || 1e-3);
  const pitch = Math.max(-0.8, Math.min(0.8, (ratio - (PROFILE.pitchBase ?? 0.55)) * 3 * PITCH_SIGN));
  return { blend, raw, lm, yaw, pitch, roll: Math.max(-0.6, Math.min(0.6, roll)) };
}
// 挑眉（眉心與眉尾同時上揚）視為疑問語氣
const isQuestionFace = () => ((face.blend.browInnerUp ?? 0) + (face.blend.browOuterUpLeft ?? 0) + (face.blend.browOuterUpRight ?? 0)) / 3 > 0.45;

/* ---------- 手勢 → 文字（目前為規則式示範，之後可換成訓練好的模型） ---------- */
function fingerState(lm) {
  const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const ext = [d(4, 17) > d(3, 17) * 1.05 ? 1 : 0];
  [[8,6],[12,10],[16,14],[20,18]].forEach(([t, p]) => ext.push(d(t, 0) > d(p, 0) * 1.1 ? 1 : 0));
  return ext;
}
function matchWord(ext) {
  for (const [w, pose] of Object.entries(DICT))
    if (pose.every((v, i) => v === ext[i])) return w;
  return null;
}

/* ---------- 手語 → 文字（動態）：用你在詞典錄下的動作來比對 ----------
   原本只會比對內建的靜態手形（五指伸直或彎曲），所以錄下的「謝謝」永遠不會被認出來。
   現在把雙手相對於肩膀的位置、軌跡與指尖形狀當作特徵，用 DTW（動態時間校正）比對，
   速度快慢、距離鏡頭遠近、人在畫面的位置不同都能容忍 */
// 權重：手腕位置與軌跡最能區分不同的手語，所以最重；指尖形狀雜訊較大，權重較低
const SIGN_W = []; for (let s = 0; s < 2; s++) SIGN_W.push(1.5, 2.5, 2.5, ...Array(10).fill(0.4));
const SIGN_SLOT = SIGN_W.slice(0, 13).reduce((a, b) => a + b, 0);

// 每格畫面 → 26 維特徵：左右手各 13 維（是否在畫面、手腕相對肩膀的位置、五個指尖相對手腕的位置）
function signFeat(pose, hands) {
  if (!pose || !pose[11] || !pose[12] || !hands) return null;
  const asp = (video.videoWidth || 16) / (video.videoHeight || 9);
  const L = pose[11], R = pose[12];
  const mx = (L.x + R.x) / 2 * asp, my = (L.y + R.y) / 2;
  const sw = Math.hypot((L.x - R.x) * asp, L.y - R.y) || 1;               // 以肩寬當單位，所以不怕離鏡頭遠近
  const f = new Array(26).fill(0);
  const placed = hands.map(h => ({ h, wx: h[0].x * asp, wy: h[0].y })).sort((a, b) => a.wx - b.wx);
  const slots = [null, null];
  if (placed.length >= 2) { slots[0] = placed[0]; slots[1] = placed[1]; }
  else if (placed.length === 1) slots[placed[0].wx < mx ? 0 : 1] = placed[0];
  slots.forEach((p, s) => {
    if (!p) return;
    const o = s * 13, h = p.h;
    const size = Math.max(0.03, Math.hypot((h[9].x - h[0].x) * asp, h[9].y - h[0].y));
    f[o] = 1; f[o + 1] = (p.wx - mx) / sw; f[o + 2] = (p.wy - my) / sw;
    [4, 8, 12, 16, 20].forEach((t, k) => { f[o + 3 + 2 * k] = (h[t].x - h[0].x) * asp / size; f[o + 4 + 2 * k] = (h[t].y - h[0].y) / size; });
  });
  return f;
}
// 只計算「至少一邊有手」的那一隻手，單手手語不會被沒用到的另一隻手稀釋
function signDist(a, b) {
  let t = 0, den = 0;
  for (let s = 0; s < 2; s++) {
    const o = s * 13;
    if (!a[o] && !b[o]) continue;
    den += SIGN_SLOT;
    for (let k = 0; k < 13; k++) t += SIGN_W[o + k] * Math.abs(a[o + k] - b[o + k]);
  }
  return den ? t / den : 0;
}

// 子序列 DTW：整段範本必須對上「目前最新畫面為止」的某一段，起點不限；回傳每步平均距離
function sdtw(T, S) {
  const m = T.length, n = S.length;
  let pc = new Float32Array(n), pl = new Float32Array(n), cc = new Float32Array(n), cl = new Float32Array(n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const d = signDist(T[i], S[j]);
      if (i === 0) { cc[j] = d; cl[j] = 1; continue; }
      let bc = pc[j], bl = pl[j];
      if (j > 0) {
        if (pc[j - 1] < bc) { bc = pc[j - 1]; bl = pl[j - 1]; }
        if (cc[j - 1] < bc) { bc = cc[j - 1]; bl = cl[j - 1]; }
      }
      cc[j] = d + bc; cl[j] = bl + 1;
    }
    [pc, cc] = [cc, pc]; [pl, cl] = [cl, pl];
  }
  return pc[n - 1] / pl[n - 1];
}
// 範本：只留「手在畫面裡」的那一段，前後的待機動作不參與比對
function buildTemplate(clip) {
  const fs = clip.frames.map(f => ({ f: signFeat(f.pose, f.hands), has: !!(f.hands && f.hands.length) })).filter(x => x.f);
  let a = fs.findIndex(x => x.has), b = fs.length - 1;
  while (b >= 0 && !fs[b].has) b--;
  if (a < 0 || b - a < 6) return null;
  return fs.slice(a, b + 1).map(x => x.f);
}

// ---- live ----
let signSens = 5;
try { signSens = +localStorage.getItem("signbridge.signSens") || 5; } catch {}
const signThr = () => 0.14 + 0.03 * signSens;      // 敏感度 5 → 距離門檻 0.29
const live = { buf: [], last: 0, evalAt: 0, lock: 0, moving: false, info: "" };
let suppressStaticUntil = 0;
const setSignInfo = (t) => { if (t !== live.info) { live.info = t; $("signInfo").textContent = t; } };

function emitWord(word) {
  const t = $("transcript");
  if (t.dataset.empty !== "0") { t.textContent = ""; t.dataset.empty = "0"; }
  t.textContent += word + (isQuestionFace() ? "？" : "") + ($("tagEmo").checked && emotionLabel() ? `(${emotionLabel()})` : "") + " ";
}
function signMatch(now, pose, hands) {
  if (now < live.lock) return;
  if (now - live.last >= 66) {                       // 約 15 格/秒，與錄製時相同
    live.last = now;
    const f = signFeat(pose, hands);
    if (f) {
      const p = live.buf[live.buf.length - 1];
      live.moving = !!p && [1, 2, 14, 15].some(k => Math.abs(f[k] - p[k]) > 0.05 && (f[k < 13 ? 0 : 13] && p[k < 13 ? 0 : 13]));
      live.buf.push(f); if (live.buf.length > 150) live.buf.shift();
    }
  }
  if (now - live.evalAt < 150 || live.buf.length < 8) return;
  live.evalAt = now;
  const results = [];
  Object.keys(CLIPS).forEach(k => {
    const c = CLIPS[k];
    if (c._tpl === undefined) c._tpl = buildTemplate(c);
    if (!c._tpl) return;
    const win = Math.min(live.buf.length, Math.round(c._tpl.length * 1.8) + 6);
    results.push({ word: k.split("#")[0], dist: sdtw(c._tpl, live.buf.slice(-win)) });
  });
  if (!results.length) { setSignInfo("手語辨識：詞典裡還沒有錄製的詞（到最下方錄製）"); return; }
  const idle = live.buf.slice(-6).every(f => f[0] + f[13] === 0);
  results.sort((a, b) => a.dist - b.dist);
  const best = results[0], other = results.find(r => r.word !== best.word), thr = signThr();
  const sim = Math.round(100 * Math.max(0, 1 - 0.3 * best.dist / thr));
  setSignInfo(idle ? "手語辨識：請在鏡頭前比出你錄過的手語" : `手語辨識：最接近「${best.word}」，相似度 ${sim}%（達 70% 才會輸出）`);
  if (idle) return;
  if (best.dist <= thr && (!other || other.dist >= best.dist * 1.15)) {   // 夠像，而且明顯比第二名像
    emitWord(best.word);
    live.lock = now + 1500; live.buf.length = 0; suppressStaticUntil = now + 2000;
  }
}
$("signSens").value = signSens;
$("signSens").oninput = (e) => { signSens = +e.target.value; try { localStorage.setItem("signbridge.signSens", signSens); } catch {} };

let stable = { word: null, n: 0 }, lastEmitted = null;
function recognize(lm) {
  const word = lm ? matchWord(fingerState(lm)) : null;
  stable = word === stable.word ? { word, n: stable.n + 1 } : { word, n: 1 };
  if (word && stable.n === 12 && word !== lastEmitted) {
    if (performance.now() > suppressStaticUntil && !live.moving) emitWord(word);   // 正在比動作或剛辨識出詞時，不輸出靜態手形
    lastEmitted = word;
  }
  if (!word) lastEmitted = null;
}

/* ---------- 鏡頭 + MediaPipe 手部偵測 ---------- */
let landmarker, poseLandmarker, faceLandmarker, running = false;
let face = { blend: {}, roll: 0 };

/* ---------- 偵測結果平滑（One Euro 濾波）：慢動作時穩、快動作時不延遲 ---------- */
function makeFilter(minCut = 1.2, beta = 6) {
  let xp = null, dxp = 0, tp = 0;
  const alpha = (c, dt) => 1 / (1 + 1 / (2 * Math.PI * c) / dt);
  return (x, t) => {
    if (xp === null) { xp = x; tp = t; return x; }
    const dt = Math.max(1e-3, t - tp); tp = t;
    const ad = alpha(1, dt); dxp = ad * (x - xp) / dt + (1 - ad) * dxp;
    const a = alpha(minCut + beta * Math.abs(dxp), dt);
    return (xp = a * x + (1 - a) * xp);
  };
}
// 手：用手腕位置追蹤同一隻手，避免兩隻手的順序在畫面間對調；短暫偵測失敗時保留上一格
const handTracks = [];
const HANDEDNESS_MIRRORED = true;   // 模型的左右手標籤以「鏡像畫面」為準；若手心手背顛倒，改成 false
function trackHands(raw, t, handedness = []) {
  handTracks.forEach(tr => { tr.matched = false; });
  raw.forEach((lm, idx) => {
    let best = null, bd = 0.3;
    handTracks.forEach(tr => {
      if (tr.matched) return;
      const d = Math.hypot(tr.last[0].x - lm[0].x, tr.last[0].y - lm[0].y);
      if (d < bd) { bd = d; best = tr; }
    });
    if (!best && handTracks.length < 2) { best = { f: Array.from({ length: 63 }, () => makeFilter()), last: lm, miss: 0 }; handTracks.push(best); }
    if (!best) return;
    best.matched = true; best.miss = 0;
    const label = handedness[idx]?.[0]?.categoryName, prev = best.last.handed;
    best.last = lm.map((p, i) => ({ x: best.f[i * 3](p.x, t), y: best.f[i * 3 + 1](p.y, t), z: best.f[i * 3 + 2](p.z, t) }));
    best.last.handed = label ? (HANDEDNESS_MIRRORED ? (label === "Left" ? "Right" : "Left") : label) : prev;
  });
  handTracks.forEach(tr => { if (!tr.matched) tr.miss++; });
  for (let i = handTracks.length - 1; i >= 0; i--) if (handTracks[i].miss > 4) handTracks.splice(i, 1);
  return handTracks.map(tr => tr.last);
}
// 身體：只平滑會用到的關節點
const poseFilters = {};
let lastPose = null, poseMiss = 0;
function smoothPose(raw, t) {
  if (!raw) { if (lastPose && ++poseMiss <= 5) return lastPose; return (lastPose = undefined); }
  poseMiss = 0;
  const out = [];
  POSE_IDX.forEach(i => {
    const f = poseFilters[i] ??= [makeFilter(), makeFilter(), makeFilter()];
    out[i] = { x: f[0](raw[i].x, t), y: f[1](raw[i].y, t), z: f[2](raw[i].z, t), visibility: raw[i].visibility };
  });
  return (lastPose = out);
}

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL = (p) => "https://storage.googleapis.com/mediapipe-models/" + p;

// 先用 GPU，不支援就自動改用 CPU（很多電腦的 GPU 模式會失敗）
async function make(Cls, fileset, modelPath, opts) {
  for (const delegate of ["GPU", "CPU"]) {
    try {
      return await Cls.createFromOptions(fileset, { baseOptions: { modelAssetPath: modelPath, delegate }, runningMode: "VIDEO", ...opts });
    } catch (e) { console.warn(Cls.name, delegate, "失敗：", e); }
  }
  return null;
}

async function init() {
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  landmarker = await make(HandLandmarker, fileset, MODEL("hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"), { numHands: 2, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6 });
  if (!landmarker) throw new Error("手部模型載入失敗（請確認網路可連到 storage.googleapis.com）");
  // 姿勢與臉部是加分功能：載入失敗時只會少了手臂或表情，不影響其他功能
  poseLandmarker = await make(PoseLandmarker, fileset, MODEL("pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"), { numPoses: 1, minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6 });
  faceLandmarker = await make(FaceLandmarker, fileset, MODEL("face_landmarker/face_landmarker/float16/1/face_landmarker.task"), { numFaces: 1, outputFaceBlendshapes: true });
}

const CAM_ERRORS = {
  NotAllowedError: "鏡頭權限被封鎖：請點網址列左邊的鎖頭或鏡頭圖示，把鏡頭改成「允許」後重新整理",
  NotFoundError: "找不到鏡頭：請確認電腦有接上鏡頭",
  NotReadableError: "鏡頭正被其他程式使用（例如 Teams、Zoom），請先關閉再試",
  OverconstrainedError: "鏡頭不支援 640x480，請換一個鏡頭",
};

$("camBtn").onclick = async () => {
  if (running) return;
  $("status").textContent = "載入模型中…（第一次約需數秒）";
  try {
    if (!landmarker) await init();
  } catch (e) {
    console.error(e); $("status").textContent = "模型載入失敗：" + (e.message || e); return;
  }
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Object.assign(new Error(), { name: "Insecure" });
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } });
    await video.play();
    overlay.width = video.videoWidth; overlay.height = video.videoHeight;
    const ar = video.videoWidth / video.videoHeight;            // 依鏡頭實際比例調整，避免畫面變形
    document.documentElement.style.setProperty("--ar", ar.toFixed(4));
    avatar.height = Math.round(avatar.width / ar);
    hv.height = Math.round(hv.width / ar);                     // 手部特寫與其他畫面同比例同大小
    running = true; autoDone = false; autoFrames = []; lastAutoMsg = ""; noFace = 0;
    $("status").textContent = "追蹤中" + (poseLandmarker ? "" : "（姿勢模型未載入，沒有手臂）") + (faceLandmarker ? "" : "（臉部模型未載入，沒有表情）");
    loop();
  } catch (e) {
    console.error(e);
    $("status").textContent = e.name === "Insecure"
      ? "瀏覽器不允許在這個網址使用鏡頭：請改用 https://localhost 或 http://localhost 開啟，不要用 IP 或檔案路徑"
      : (CAM_ERRORS[e.name] || "無法開啟鏡頭：" + (e.name || "") + " " + (e.message || ""));
  }
};

let lastT = -1;
function loop() {
  if (!running) return;
  if (video.currentTime !== lastT) {
    lastT = video.currentTime;
    const now = performance.now(), t = now / 1000;
    const hr = landmarker.detectForVideo(video, now);
    const hands = trackHands(hr.landmarks, t, hr.handedness || hr.handednesses || []);
    const pose = smoothPose(poseLandmarker?.detectForVideo(video, now).landmarks[0], t);
    face = faceLandmarker ? readFace(faceLandmarker.detectForVideo(video, now)) : { blend: {}, raw: {}, roll: 0, lm: null };
    if (capturing && face.lm) capturing.frames.push({ lm: face.lm, raw: face.raw, pose, g: capturing.frames.length % 5 === 0 ? grabFrame() : null });
    if (calibFrames && face.raw) calibFrames.push(face.raw);
    showExpr(face.blend); updateEmotion(face); autoLook(face, pose);
    captureFrame(now, pose, hands, face);
    drawOverlay(hands, pose);
    if (!playing) drawAvatar(actx, pose, hands, face);
    drawHandView(hands);
    showBody(pose, hands);
    signMatch(now, pose, hands);
    recognize(hands[0]);
  }
  requestAnimationFrame(loop);
}

/* 鏡頭畫面上的骨架：手指分色、肩肘腕、軀幹；信心不足的點不畫 */
const FINGER_COLORS = ["#ff6b6b", "#ffd166", "#7fe3c4", "#6bb5ff", "#c792ea"];
function drawOverlay(hands, pose) {
  const w = overlay.width, h = overlay.height;
  octx.clearRect(0, 0, w, h);
  octx.save(); octx.scale(-1, 1); octx.translate(-w, 0);
  octx.lineCap = octx.lineJoin = "round";
  const line = (pts, color, lw) => {
    octx.strokeStyle = color; octx.lineWidth = lw; octx.beginPath();
    pts.forEach((p, k) => k ? octx.lineTo(p.x * w, p.y * h) : octx.moveTo(p.x * w, p.y * h)); octx.stroke();
  };
  const dot = (p, c, r) => { octx.fillStyle = c; octx.beginPath(); octx.arc(p.x * w, p.y * h, r, 0, 7); octx.fill(); };
  if (pose) {
    const ok = (i) => (pose[i].visibility ?? 1) > 0.5;
    if (ok(11) && ok(12)) line([pose[11], pose[12]], "#FFD166", 4);
    if (ok(11) && ok(12) && ok(23) && ok(24)) line([pose[11], pose[12], pose[24], pose[23], pose[11]], "#FFD16688", 3);
    [[11, 13, 15], [12, 14, 16]].forEach(arm => {
      for (let k = 0; k < 2; k++) if (ok(arm[k]) && ok(arm[k + 1])) line([pose[arm[k]], pose[arm[k + 1]]], "#FFD166", 5);
      arm.forEach(i => ok(i) && dot(pose[i], "#fff", 6));
    });
    dot(pose[0], "#fff", 5);
  }
  hands.forEach(hd => {
    FINGERS.forEach((f, i) => line([hd[0], ...f.map(k => hd[k])], FINGER_COLORS[i], 3));
    line([...PALM.map(k => hd[k]), hd[PALM[0]]], "#ffffffaa", 2);
    hd.forEach(p => dot(p, "#fff", 3));
  });
  octx.restore();
}

/* 上半身偵測狀態：告訴使用者缺了什麼、該怎麼調整位置 */
let lastBody = "";
function showBody(pose, hands) {
  const ok = (i) => pose && (pose[i].visibility ?? 0) > 0.5;
  const mark = (name, v) => name + (v ? " ✓" : " ✗");
  let tip = "";
  if (!pose) tip = "　請往後坐，讓頭和肩膀入鏡";
  else if (!ok(11) || !ok(12)) tip = "　請讓雙肩完整入鏡";
  else if (!ok(13) || !ok(14)) tip = "　請再往後坐一點，讓手肘入鏡";
  const text = "上半身：" + [mark("雙肩", ok(11) && ok(12)), mark("左臂", ok(11) && ok(13) && ok(15)),
    mark("右臂", ok(12) && ok(14) && ok(16)), `手 ${hands.length}/2`].join("　") + tip;
  if (text !== lastBody) { lastBody = text; $("bodyStatus").textContent = text; }
}

/* ---------- 手部特寫：立體、可拖曳旋轉 ---------- */
const hv = $("handView"), hvx = hv.getContext("2d");
const VIEW0 = { yaw: 0.35, pitch: -0.2 }, view = { ...VIEW0 };
let drag = null;
hv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch }; hv.setPointerCapture(e.pointerId); });
hv.addEventListener("pointermove", (e) => {
  if (!drag) return;
  view.yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
  view.pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.01));
});
["pointerup", "pointercancel"].forEach(ev => hv.addEventListener(ev, () => { drag = null; }));
$("viewReset").onclick = () => Object.assign(view, VIEW0);

// 把手轉到「以手掌為中心、以手長為單位」的 3D 座標，旋轉後加上透視，再放到畫布上
function projectHand(lm, cx, cy, S) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const raw = lm.map(p => ({ x: p.x * vw, y: p.y * vh, z: (p.z || 0) * vw }));
  const c = [0, 5, 9, 13, 17].reduce((t, i) => ({ x: t.x + raw[i].x / 5, y: t.y + raw[i].y / 5, z: t.z + raw[i].z / 5 }), { x: 0, y: 0, z: 0 });
  const s0 = Math.hypot(raw[9].x - raw[0].x, raw[9].y - raw[0].y, raw[9].z - raw[0].z) || 1;
  const cyw = Math.cos(view.yaw), syw = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  return raw.map(p => {
    const x = -(p.x - c.x) / s0, y = (p.y - c.y) / s0, z = -(p.z - c.z) / s0;   // 鏡像；z 朝向觀看者為正
    const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
    const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const k = 1 / (1 - 0.12 * z2);
    return { x: cx + x1 * S * k, y: cy + y1 * S * k, z: z2 * S };
  });
}
const FINGER_NAMES = ["拇指", "食指", "中指", "無名指", "小指"];
function drawHandView(hands) {
  const W = hv.width, H = hv.height, fs = Math.round(H * 0.034);
  hvx.clearRect(0, 0, W, H);
  const bg = hvx.createRadialGradient(W / 2, H * 0.45, H * 0.1, W / 2, H / 2, H * 0.9);
  bg.addColorStop(0, "#F1F7FB"); bg.addColorStop(1, "#B3C9DA");
  hvx.fillStyle = bg; hvx.fillRect(0, 0, W, H);
  hvx.fillStyle = "#12263A"; hvx.font = `${fs}px sans-serif`;
  if (!hands.length) {
    hvx.textAlign = "center"; hvx.fillText("把手舉到鏡頭前，這裡會顯示放大的立體手部", W / 2, H / 2); hvx.textAlign = "left"; return;
  }
  hvx.fillText("拖曳可旋轉視角", 16, H - 16);
  const zoom = +$("handZoom").value || 1, labels = $("handLabels").checked;
  const list = [...hands].sort((a, b) => b[0].x - a[0].x), n = list.length;
  const S = H * (n === 1 ? 0.30 : 0.24) * zoom;
  list.forEach((hd, i) => {
    const P = projectHand(hd, n === 1 ? W / 2 : W * (i ? 0.7 : 0.3), H * 0.54, S);
    renderHand(hvx, P, { wrist: true, palm: palmFacing(hd) });
    if (!labels) return;
    hvx.font = `${fs}px sans-serif`; hvx.textAlign = "center"; hvx.textBaseline = "middle";
    FINGERS.forEach((f, k) => {                       // 在每個指尖外側標出手指名稱
      const t = P[f[3]], p = P[f[2]], d = Math.hypot(t.x - p.x, t.y - p.y) || 1;
      const x = t.x + (t.x - p.x) / d * S * 0.42, y = t.y + (t.y - p.y) / d * S * 0.42;
      const tw = hvx.measureText(FINGER_NAMES[k]).width + fs * 0.7;
      hvx.fillStyle = "rgba(255,255,255,.88)"; hvx.strokeStyle = FINGER_COLORS[k]; hvx.lineWidth = 3;
      hvx.beginPath(); hvx.roundRect(x - tw / 2, y - fs * 0.7, tw, fs * 1.4, fs * 0.7); hvx.fill(); hvx.stroke();
      hvx.fillStyle = "#12263A"; hvx.fillText(FINGER_NAMES[k], x, y);
    });
    hvx.textAlign = "left"; hvx.textBaseline = "alphabetic";
  });
}

$("clearBtn").onclick = () => { $("transcript").textContent = ""; lastEmitted = null; };

/* ---------- 用你的臉建立角色 ---------- */
let capturing = null;
const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const hex = (c) => "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

// 取樣：gs 可以是單一 2D context 或多個（來自不同畫面）；每個點取一小塊像素，三個色版取中位數
function sampleColor(gs, pts, half = 4) {
  const list = Array.isArray(gs) ? gs : [gs], R = [], G = [], B = [];
  list.forEach(g => {
    const vw = g.canvas.width, vh = g.canvas.height;
    pts.forEach(({ x, y }) => {
      x = Math.round(x); y = Math.round(y);
      if (x < half + 1 || y < half + 1 || x > vw - half - 1 || y > vh - half - 1) return;
      const d = g.getImageData(x - half, y - half, half * 2, half * 2).data;
      for (let i = 0; i < d.length; i += 4) { R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); }
    });
  });
  return R.length ? [median(R), median(G), median(B)] : null;
}
const mixC = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// 皮膚像素：在臉部輪廓內（縮小一圈避開邊緣與髮際）取格點，排除眼睛、眉毛、嘴巴、鼻孔
function skinPixels(gs, P, ctr, r) {
  const list = Array.isArray(gs) ? gs : [gs];
  const poly = OVAL.map(i => { const p = P(i); return { x: ctr.x + (p.x - ctr.x) * 0.84, y: ctr.y + (p.y - ctr.y) * 0.84 }; });
  const inside = (x, y) => { let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
      if (((poly[i].y > y) !== (poly[j].y > y)) && (x < (poly[j].x - poly[i].x) * (y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x)) c = !c;
    return c; };
  const el = (c, rx, ry) => (x, y) => ((x - c.x) / rx) ** 2 + ((y - c.y) / ry) ** 2 < 1;
  const mc = { x: (P(13).x + P(14).x) / 2, y: (P(13).y + P(14).y) / 2 };
  const excl = [el({ x: P(468).x, y: P(468).y - r * 0.1 }, r * 0.5, r * 0.36), el({ x: P(473).x, y: P(473).y - r * 0.1 }, r * 0.5, r * 0.36),
    el(mc, Math.hypot(P(61).x - P(291).x, P(61).y - P(291).y) * 0.7, r * 0.3), el(P(1), r * 0.22, r * 0.2)];
  const minX = Math.floor(Math.min(...poly.map(p => p.x))), maxX = Math.ceil(Math.max(...poly.map(p => p.x)));
  const minY = Math.floor(Math.min(...poly.map(p => p.y))), maxY = Math.ceil(Math.max(...poly.map(p => p.y)));
  const step = Math.max(2, Math.round(r / 12)), out = [];
  list.forEach(g => {
    const x0 = Math.max(0, minX), y0 = Math.max(0, minY), w = Math.min(g.canvas.width, maxX) - x0, h = Math.min(g.canvas.height, maxY) - y0;
    if (w < 8 || h < 8) return;
    const d = g.getImageData(x0, y0, w, h).data;
    for (let y = y0; y < y0 + h; y += step) for (let x = x0; x < x0 + w; x += step) {
      if (!inside(x, y) || excl.some(f => f(x, y))) continue;
      const k = ((y - y0) * w + (x - x0)) * 4; out.push([d[k], d[k + 1], d[k + 2]]);
    }
  });
  return out;
}
// 穩健的膚色估計：先用膚色色度（YCbCr）濾掉非皮膚，再去掉最亮與最暗的各兩成，取中位數；同時得到亮部與暗部色
function estimateSkin(px) {
  if (px.length < 40) return null;
  const chroma = (c) => [128 - 0.168736 * c[0] - 0.331264 * c[1] + 0.5 * c[2], 128 + 0.5 * c[0] - 0.418688 * c[1] - 0.081312 * c[2]];
  let keep = px.filter(c => { const [cb, cr] = chroma(c), Y = luma(c); return Y > 25 && Y < 245 && cr > 128 && cr < 182 && cb > 68 && cb < 136; });
  if (keep.length < px.length * 0.25) keep = px.slice();
  keep.sort((a, b) => luma(a) - luma(b));
  const n = keep.length, mid = keep.slice(Math.floor(n * 0.2), Math.ceil(n * 0.8)), k = Math.max(3, Math.floor(n * 0.12));
  const meanOf = (arr) => [0, 1, 2].map(i => arr.reduce((t, c) => t + c[i], 0) / arr.length);
  return { base: [0, 1, 2].map(i => median(mid.map(c => c[i]))), hi: meanOf(keep.slice(-k)), lo: meanOf(keep.slice(0, k)) };
}
// 光線色偏校正：以眼白（接近中性色）為參考，只修正一部分，避免過度校正
function whiteBalance(gs, P) {
  const lp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const c = sampleColor(gs, [[468, 33], [468, 133], [473, 362], [473, 263]].map(([i, k]) => lp(P(i), P(k), 0.7)), 2);
  if (!c || luma(c) < 110 || Math.max(...c) - Math.min(...c) > 70) return [1, 1, 1];
  const m = (c[0] + c[1] + c[2]) / 3;
  return c.map(v => 1 + (Math.max(0.88, Math.min(1.12, m / v)) - 1) * 0.7);
}
const applyWB = (c, g) => c && c.map((v, i) => Math.min(255, v * g[i]));

/* 髮型偵測：以髮色為基準，把頭部周圍的像素分成「頭髮／非頭髮」，再量測
   額頭被蓋住的比例（瀏海與分線）、兩側髮絲垂到哪裡（髮長）、外緣寬度（蓬鬆）、輪廓起伏（捲度）、頭頂有沒有髮髻 */
function detectHair(gs, P, ctr, r, hairC, skinC, shoulderY, shirtC) {
  const list = Array.isArray(gs) ? gs : [gs];
  const vw = list[0].canvas.width, vh = list[0].canvas.height;
  const faceH = Math.hypot(P(10).x - P(152).x, P(10).y - P(152).y);
  const cd = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const bg = sampleColor(list, [[.03, .2], [.03, .5], [.03, .8], [.97, .2], [.97, .5], [.97, .8]].map(([a, b]) => ({ x: a * vw, y: b * vh })), 3);
  const sep = bg ? cd(hairC, bg) : 99;                         // 髮色和背景差越多，判斷越可靠
  const isHair = (c) => { const dh = cd(c, hairC); return dh < 48 && dh < cd(c, skinC) * 0.8 && (!bg || cd(c, bg) > 20 || dh < cd(c, bg) * 0.6); };
  const clothesLikeHair = shirtC && cd(hairC, shirtC) < 45;    // 衣服和頭髮同色時，肩膀以下無法判斷
  const x0 = Math.max(0, Math.round(ctr.x - 3.2 * r)), x1 = Math.min(vw, Math.round(ctr.x + 3.2 * r));
  const y0 = Math.max(0, Math.round(P(10).y - 1.2 * faceH)), y1 = Math.min(vh, Math.round(P(152).y + 1.6 * faceH));
  const step = Math.max(2, Math.round(r / 24));
  const hairY = P(10).y, browY = (P(105).y + P(334).y) / 2, chinY = P(152).y, earY = (P(33).y + P(263).y) / 2 + 0.3 * r;
  const rowsY = [earY, chinY - 0.1 * faceH, chinY + 0.3 * faceH, chinY + 0.65 * faceH, chinY + 1.0 * faceH];
  const feats = [];
  list.forEach(g => {
    const w = x1 - x0, h = y1 - y0;
    if (w < 20 || h < 20) return;
    const d = g.getImageData(x0, y0, w, h).data;
    const at = (x, y) => { const xi = Math.round(x) - x0, yi = Math.round(y) - y0; if (xi < 0 || yi < 0 || xi >= w || yi >= h) return null;
      const k = (yi * w + xi) * 4; return isHair([d[k], d[k + 1], d[k + 2]]); };
    const frac = (xa, xb, ya, yb) => { let n = 0, hit = 0; for (let y = ya; y < yb; y += step) for (let x = xa; x < xb; x += step) { const v = at(x, y); if (v === null) continue; n++; if (v) hit++; } return n ? hit / n : 0; };
    const fa = hairY + 0.03 * faceH, fb = browY - 0.06 * faceH;
    const F = { Lf: frac(ctr.x - 0.7 * r, ctr.x - 0.12 * r, fa, fb), Cf: frac(ctr.x - 0.12 * r, ctr.x + 0.12 * r, fa, fb), Rf: frac(ctr.x + 0.12 * r, ctr.x + 0.7 * r, fa, fb),
      topF: frac(ctr.x - 0.7 * r, ctr.x + 0.7 * r, hairY - 0.28 * faceH, hairY - 0.02 * faceH) };
    const hs = []; for (let x = ctr.x - 0.5 * r; x <= ctr.x + 0.5 * r; x += r * 0.25) { let top = hairY, miss = 0;
      for (let y = hairY; y > y0; y -= step) { if (at(x, y)) { top = y; miss = 0; } else if (++miss > 3) break; } hs.push((hairY - top) / faceH); }
    F.hairH = median(hs);                                        // 頭頂的髮量高度
    const rowW = (y) => { let n = 0; for (let x = ctr.x - 1.3 * r; x <= ctr.x + 1.3 * r; x += step) if (at(x, y)) n++; return n; };
    const wLo = rowW(hairY - 0.05 * faceH), wHi = rowW(hairY - 0.38 * faceH);
    F.bun = F.hairH > 0.28 && wHi > 0 && wHi < wLo * 0.55 ? 1 : 0; // 頭頂高處變窄 → 髮髻
    let c = 0, lastY = earY;                                      // 兩側髮絲垂到第幾列
    for (let i = 0; i < rowsY.length; i++) {
      const yy = rowsY[i];
      if (yy > vh - 4) { if (c >= 2 && c === i) c = rowsY.length; break; }          // 一路垂到畫面下緣：長度超出畫面，視為最長
      if (clothesLikeHair && yy > shoulderY - 0.1 * faceH) break;
      const lo = (i === 0 ? 1.02 : 0.62) * r, hi = 1.5 * r;
      const hit = Math.max(frac(ctr.x - hi, ctr.x - lo, yy - 0.08 * faceH, yy + 0.08 * faceH), frac(ctr.x + lo, ctr.x + hi, yy - 0.08 * faceH, yy + 0.08 * faceH)) > 0.4;
      if (!hit) break; c++; lastY = yy;
    }
    F.rowsC = c;
    const edge = (sd, yy) => { for (let k = 2.2; k >= 0.9; k -= 0.04) if (at(ctr.x + sd * k * r, yy) && at(ctr.x + sd * (k - 0.04) * r, yy) && at(ctr.x + sd * (k - 0.08) * r, yy)) return k; return 0; };
    F.ext = c >= 1 ? (edge(-1, earY) + edge(1, earY)) / 2 - 1.0 : 0;   // 耳朵高度往外多出多少（以臉半寬為單位）
    let rough = 0, n = 0;                                          // 兩側輪廓的起伏（捲髮輪廓不平整）
    if (c >= 1) [-1, 1].forEach(sd => { const e = []; for (let yy = earY; yy <= lastY; yy += r * 0.12) e.push(edge(sd, yy));
      for (let i = 1; i < e.length - 1; i++) { rough += Math.abs(e[i - 1] - 2 * e[i] + e[i + 1]); n++; } });
    F.rough = n ? rough / n : 0;
    feats.push(F);
  });
  if (!feats.length) return {};
  const A = {}; Object.keys(feats[0]).forEach(k => { A[k] = feats[0] && feats.reduce((t, f) => t + f[k], 0) / feats.length; });
  const out = { hairConf: Math.min(1, sep / 35), hairDebug: A };
  const bald = (A.topF < 0.2 && A.Lf < 0.2 && A.Cf < 0.2 && A.Rf < 0.2 && A.hairH < 0.08) || cd(hairC, skinC) < 40;
  if (bald) return { ...out, hairStyle: "none", hairLen: 0, hairBun: false, hairCurl: 0, hairVol: 1 };
  const rc = Math.round(A.rowsC);
  out.hairStyle = rc >= 2 ? "long" : "short";
  out.hairLen = [0, 0, 0.05, 0.3, 0.6, 1][rc] ?? 1;
  if (A.Lf > 0.6 && A.Cf > 0.6 && A.Rf > 0.6) out.bangs = "full";
  else if (A.Lf < 0.25 && A.Cf < 0.25 && A.Rf < 0.25) out.bangs = "back";
  else if (Math.abs(A.Lf - A.Rf) > 0.35 && Math.max(A.Lf, A.Rf) > 0.5) { out.bangs = "side"; out.partSide = A.Lf > A.Rf ? -1 : 1; }   // 鏡頭左側較多 → 角色右側較多，分線在左
  else out.bangs = "part";
  out.hairBun = A.bun > 0.5;
  out.hairVol = rc >= 1 ? Math.max(0.9, Math.min(1.5, 1 + (A.ext - 0.3) * 0.9)) : 1;
  out.hairCurl = rc >= 1 ? Math.max(0, Math.min(1, (A.rough - 0.05) / 0.08)) : 0;
  return out;
}

function profileFromFace(frames, gs) {
  const vw = video.videoWidth, vh = video.videoHeight, cache = {};
  const P = (i) => cache[i] ??= {   // 多格取平均，降低抖動
    x: frames.reduce((t, f) => t + f.lm[i].x, 0) / frames.length * vw,
    y: frames.reduce((t, f) => t + f.lm[i].y, 0) / frames.length * vh };
  let cL = P(234), cR = P(454);
  if (cL.x > cR.x) [cL, cR] = [cR, cL];
  const ctr = { x: (cL.x + cR.x) / 2, y: (cL.y + cR.y) / 2 };
  const r = Math.hypot(cR.x - cL.x, cR.y - cL.y) / 2, a = Math.atan2(cR.y - cL.y, cR.x - cL.x);
  // 轉成「以兩頰寬度為 2」的座標，並做左右鏡像（畫面是鏡像）
  const N = (i) => { const p = P(i), dx = p.x - ctr.x, dy = p.y - ctr.y;
    return [-(dx * Math.cos(a) + dy * Math.sin(a)) / r, (-dx * Math.sin(a) + dy * Math.cos(a)) / r]; };
  const dist = (i, j) => Math.hypot(N(i)[0] - N(j)[0], N(i)[1] - N(j)[1]);
  const avg = (...v) => v.reduce((t, x) => t + x, 0) / v.length;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lp = (i, j, t) => ({ x: P(i).x + (P(j).x - P(i).x) * t, y: P(i).y + (P(j).y - P(i).y) * t });
  const out = {
    oval: OVAL.map(N),
    eyeX: avg(Math.abs(N(468)[0]), Math.abs(N(473)[0])), eyeY: avg(N(468)[1], N(473)[1]),
    eyeW: avg(dist(33, 133), dist(362, 263)),
    browIn: avg(Math.abs(N(107)[0]), Math.abs(N(336)[0])), browOut: avg(Math.abs(N(70)[0]), Math.abs(N(300)[0])),
    browY: avg(N(105)[1], N(334)[1]),
    mouthY: avg(N(13)[1], N(14)[1]), mouthHalf: dist(61, 291) / 2, noseY: N(1)[1],
    // 更細的臉部特徵：眼睛開闔比例、眉毛粗細、嘴唇厚度、鼻翼寬度
    eyeOpen: clamp(avg(dist(159, 145) / dist(33, 133), dist(386, 374) / dist(362, 263)) * 2.6, 0.45, 1.05),
    browT: clamp(avg(dist(52, 105), dist(282, 334)) * 0.85, 0.05, 0.13),
    lipFull: clamp((dist(0, 13) + dist(14, 17)) / 0.28, 0.7, 1.5),
    noseW: clamp(dist(129, 358) / 0.5, 0.75, 1.35),
  };
  { // 正面時的轉頭與點頭基準
    const c1 = P(234), c2 = P(454), half = Math.abs(c2.x - c1.x) / 2 || 1;
    out.yawBase = -(P(1).x - (c1.x + c2.x) / 2) / half * 1.4;
    const ey = (P(33).y + P(263).y) / 2;
    out.pitchBase = (P(1).y - ey) / ((P(152).y - ey) || 1);
  }
  { // 眼睛顏色：取虹膜中心與邊緣之間的位置，避開瞳孔與眼白
    const pts = [];
    [[468, [469, 470, 471, 472]], [473, [474, 475, 476, 477]]].forEach(([c, ring]) => ring.forEach(i =>
      pts.push({ x: P(c).x + (P(i).x - P(c).x) * 0.6, y: P(c).y + (P(i).y - P(c).y) * 0.6 })));
    const ec = sampleColor(gs, pts);
    if (ec && luma(ec) < 190) out.eye = hex(ec.map(v => Math.max(v, 35)));
  }
  // ---- 顏色：先校正光線色偏，再估計膚色（含亮部與暗部）、髮色、嘴唇、眉毛、衣服 ----
  const wb = whiteBalance(gs, P);
  const sk = estimateSkin(skinPixels(gs, P, ctr, r)), skinRaw = sk ? sk.base : sampleColor(gs, [P(117), P(346), P(151)]);
  if (skinRaw) {
    out.skin = hex(applyWB(skinRaw, wb));
    if (sk) { out.skinHi = hex(applyWB(mixC(sk.base, sk.hi, 0.6), wb)); out.skinLo = hex(applyWB(mixC(sk.base, sk.lo, 0.6), wb)); }
  }
  // 髮色：在髮際線上方取多個小區塊，取較暗的六成（避開牆壁等亮背景）再取中位數
  const faceH = Math.hypot(P(10).x - P(152).x, P(10).y - P(152).y), hp = [];
  [0.1, 0.18, 0.26].forEach(k => [-0.3, -0.15, 0, 0.15, 0.3].forEach(dx => hp.push(sampleColor(gs, [{ x: P(10).x + dx * r * 2, y: P(10).y - k * faceH }], 3))));
  const hs = hp.filter(Boolean).sort((p, q) => luma(p) - luma(q)).slice(0, Math.max(3, Math.ceil(hp.length * 0.6)));
  const hairC = hs.length ? [0, 1, 2].map(i => median(hs.map(c => c[i]))) : null;
  if (hairC) out.hair = hex(applyWB(hairC.map(v => v * 0.85), wb));
  // 髮型：長度、瀏海與分線、蓬鬆度、捲度、髮髻（細節見 detectHair）
  if (skinRaw && hairC) {
    const pose0 = frames[frames.length - 1].pose;
    const shY = pose0 ? (pose0[11].y + pose0[12].y) / 2 * vh : Infinity;
    const shC = pose0 ? sampleColor(gs, [{ x: (pose0[11].x + pose0[12].x) / 2 * vw, y: shY + vh * 0.12 }], 4) : null;
    const hd = detectHair(gs, P, ctr, r, hairC, skinRaw, shY, shC);
    out.hairDebug = hd.hairDebug; delete hd.hairDebug;
    Object.assign(out, hd);
  }
  const lipC = sampleColor(gs, [lp(13, 0, 0.5), lp(14, 17, 0.5)], 2);              // 嘴唇顏色（要偏紅才採用）
  if (lipC && lipC[0] - lipC[1] > 15) out.lip = hex(applyWB(lipC, wb));
  const browC = sampleColor(gs, [P(105), P(334), P(66), P(296)], 2);                 // 眉毛顏色（要比膚色暗才採用）
  if (browC && skinRaw && luma(browC) < luma(skinRaw) * 0.8) out.brow = hex(applyWB(browC.map(v => v * 0.85), wb));
  // 鬍子：下巴、兩側下頷與人中的顏色比臉頰暗多少，決定濃度
  if (skinRaw) {
    const toward = (p, k) => ({ x: p.x + (ctr.x - p.x) * k, y: p.y + (ctr.y - p.y) * k });
    const mp = lp(2, 0, 0.5);
    const bc = sampleColor(gs, [{ x: P(152).x, y: P(152).y - faceH * 0.08 }, toward(P(148), 0.12), toward(P(377), 0.12), toward(P(176), 0.14), toward(P(400), 0.14),
      { x: mp.x - r * 0.2, y: mp.y }, { x: mp.x + r * 0.2, y: mp.y }], 3);
    const delta = bc ? luma(skinRaw) - luma(bc) : 0;
    out.beard = clamp((delta - 18) / 55, 0, 1);
    if (out.beard > 0.15) out.beardColor = hex(applyWB(bc.map(v => v * 0.85), wb));
  }
  const pose = frames[frames.length - 1].pose;
  if (pose) {
    const mx = (pose[11].x + pose[12].x) / 2 * vw, my = (pose[11].y + pose[12].y) / 2 * vh;
    const sh = sampleColor(gs, [{ x: mx, y: my + vh * 0.12 }, { x: mx - vw * 0.05, y: my + vh * 0.12 }, { x: mx + vw * 0.05, y: my + vh * 0.12 }]);
    if (sh) out.shirt = hex(applyWB(sh, wb));
  }
  // 放鬆表情的基準
  out.base = {};
  Object.keys(frames[0].raw).forEach(k => { out.base[k] = Math.min(0.5, avg(...frames.map(f => f.raw[k] ?? 0))); });
  // 給使用者的提示（不存進設定檔）
  const notes = [], Y = skinRaw ? luma(skinRaw) : 128;
  notes.push(Y < 55 ? "光線偏暗，髮色與眼睛顏色可能不準" : Y > 225 ? "光線過亮，髮色與眼睛顏色可能不準" : "光線正常");
  if (Math.max(...wb) - Math.min(...wb) > 0.05) notes.push("已校正色偏");
  out.lightNote = notes.join("、");
  return out;
}

const syncPickers = () => {
  $("genderMode").value = genderMode;
  $("colSkin").value = PROFILE.skin; $("colHair").value = PROFILE.hair;
  $("colShirt").value = PROFILE.shirt; $("colEye").value = PROFILE.eye; $("hairStyle").value = PROFILE.hairStyle;
  $("glasses").value = PROFILE.glasses || "none"; $("beardAmt").value = Math.round((PROFILE.beard || 0) * 100);
  $("bangs").value = PROFILE.bangs === "side" ? (PROFILE.partSide < 0 ? "sideL" : "sideR") : (PROFILE.bangs || "part");
  $("hairLen").value = Math.round((PROFILE.hairLen ?? 1) * 100); $("hairCurl").value = Math.round((PROFILE.hairCurl || 0) * 100);
  $("hairBun").checked = !!PROFILE.hairBun;
};
const refreshAvatar = () => { if (!running && !playing) showPose(DICT["你好"]); if (!speechPlaying) idleStage(); };

// 拍下目前畫面取樣顏色，連同多格臉部關節點一起算出角色設定檔
function grabFrame() {            // 擷取目前鏡頭畫面（取樣顏色用）
  const c = document.createElement("canvas");
  c.width = video.videoWidth; c.height = video.videoHeight;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(video, 0, 0);
  return g;
}
// 把偵測到的髮型整理成一句話
function hairDesc(p) { return p.hairStyle === "long" ? "中長髮" : "短髮"; }

/* ---------- 性別偵測：載入小型模型（face-api 的 age/gender，約 1.7 MB，只下載一次），全程在你的瀏覽器裡執行，影像不會上傳 ---------- */
const FACEAPI = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13";
let faceapiP = null;
function loadGenderNet() {
  return faceapiP ??= (async () => {
    const api = await import(`${FACEAPI}/dist/face-api.esm.js`);
    await api.nets.ageGenderNet.loadFromUri(`${FACEAPI}/model`);
    return api;
  })().catch(e => { faceapiP = null; throw e; });
}
function cropFace(canvas, lm) {                          // 以臉部輪廓取正方形裁切（略放大 5%），縮成 112×112
  const W = canvas.width, H = canvas.height, xs = OVAL.map(i => lm[i].x * W), ys = OVAL.map(i => lm[i].y * H);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const side = Math.max(x1 - x0, y1 - y0) * 1.05, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const c = document.createElement("canvas"); c.width = c.height = 112;
  c.getContext("2d").drawImage(canvas, cx - side / 2, cy - side / 2, side, side, 0, 0, 112, 112);
  return c;
}
async function detectGender(frames) {                    // 取最多 5 個不同時間點的畫面，平均「女性機率」
  const shots = frames.filter(f => f.g && f.lm).slice(0, 5);
  if (!shots.length) return null;
  const api = await loadGenderNet();
  let q = 0;
  for (const f of shots) {
    const r = await api.nets.ageGenderNet.predictAgeAndGender(cropFace(f.g.canvas, f.lm));
    q += r.gender === "female" ? r.genderProbability : 1 - r.genderProbability;
  }
  q /= shots.length;
  return { gender: q >= 0.5 ? "female" : "male", conf: Math.max(q, 1 - q) };
}
const GENDER_TEXT = { male: "男性", female: "女性" };
function setGenderInfo(t) { $("genderInfo").textContent = t; }
function describeGender() {
  const g = genderOf(PROFILE);
  if (!g) return "尚未判斷：可手動選擇性別";
  return `${genderMode === "auto" ? "偵測為" : "手動選擇"}${GENDER_TEXT[g]}${genderMode === "auto" && PROFILE.genderConf ? `（把握 ${Math.round(PROFILE.genderConf * 100)}%）` : ""} → ${g === "female" ? "中長髮" : "短髮"}`;
}
function applyProfile(frames, st, doneMsg) {
  let gs = frames.map(f => f.g).filter(Boolean);       // 用多個不同時間點的畫面一起取樣，降低閃爍與雜訊的影響
  if (!gs.length) gs = [grabFrame()];
  try {
    const out = profileFromFace(frames, gs), note = out.lightNote; delete out.lightNote;
    if (out.hairDebug) console.log("髮型偵測數據", out.hairDebug); delete out.hairDebug;
    Object.assign(PROFILE, out);
    if (genderMode === "auto") { PROFILE.gender = null; PROFILE.genderConf = 0; }      // 換人時先清掉上一位的判斷
    normalizeProfile(PROFILE, true);
    saveProfile(); syncPickers();
    st.textContent = `${doneMsg}｜${note}｜${hairDesc(PROFILE)}${PROFILE.hairConf < 0.6 ? "（背景與髮色接近，髮型可能不準）" : ""}、${PROFILE.beard > 0.25 ? "有鬍鬚" : "無鬍鬚"}`;
  } catch (e) { console.error(e); st.textContent = "建立失敗：" + e.message; }
  if (genderMode === "auto") {                         // 性別偵測需要載入模型，在背景進行，完成後再更新髮型
    setGenderInfo("性別偵測中…（第一次需下載約 1.7 MB 模型）");
    detectGender(frames).then(res => {
      if (genderMode !== "auto") return;
      if (res && res.conf >= 0.6) { PROFILE.gender = res.gender; PROFILE.genderConf = res.conf; }
      normalizeProfile(PROFILE, true); saveProfile(); syncPickers(); refreshAvatar();
      setGenderInfo(res && res.conf >= 0.6 ? describeGender() : "無法確定性別，請手動選擇");
    }).catch(e => { console.warn("性別偵測失敗：", e); setGenderInfo("性別偵測失敗（" + (e.message || e) + "），請手動選擇"); });
  } else setGenderInfo(describeGender());
}

$("buildBtn").onclick = async () => {
  autoDone = true;                                    // 手動重新辨識時，自動辨識先暫停
  const st = $("buildStatus");
  if (capturing) return;
  if (!running) { st.textContent = "請先在上方開啟鏡頭"; return; }
  if (!faceLandmarker) { st.textContent = "臉部模型未載入，無法建立角色"; return; }
  for (let n = 3; n > 0; n--) { st.textContent = `${n} 秒後拍攝：請正對鏡頭、放鬆表情、頭髮不要遮住臉`; await sleep(1000); }
  capturing = { frames: [] };
  st.textContent = "拍攝中，請保持不動…";
  await sleep(1500);
  const frames = capturing.frames; capturing = null;
  if (frames.length < 5) { st.textContent = "沒有穩定偵測到臉，請調整光線與距離後再試一次"; return; }
  applyProfile(frames, st, "已用你的臉建立角色！顏色不準可以在下方微調");
};
for (const [id, key] of [["colSkin", "skin"], ["colHair", "hair"], ["colShirt", "shirt"], ["colEye", "eye"], ["hairStyle", "hairStyle"]])
  $(id).oninput = (e) => { PROFILE[key] = e.target.value; normalizeProfile(PROFILE, false); saveProfile(); refreshAvatar(); };
$("bangs").oninput = (e) => { const v = e.target.value; if (v === "sideL" || v === "sideR") { PROFILE.bangs = "side"; PROFILE.partSide = v === "sideL" ? -1 : 1; } else PROFILE.bangs = v; saveProfile(); refreshAvatar(); };
$("hairLen").oninput = (e) => { PROFILE.hairLen = e.target.value / 100; saveProfile(); refreshAvatar(); };
$("hairCurl").oninput = (e) => { PROFILE.hairCurl = e.target.value / 100; saveProfile(); refreshAvatar(); };
$("hairBun").onchange = (e) => { PROFILE.hairBun = e.target.checked; saveProfile(); refreshAvatar(); };
$("glasses").oninput = (e) => { PROFILE.glasses = e.target.value; saveProfile(); refreshAvatar(); };
$("beardAmt").oninput = (e) => { PROFILE.beard = e.target.value / 100; saveProfile(); refreshAvatar(); };
$("genderMode").onchange = (e) => {
  genderMode = e.target.value;
  try { localStorage.setItem(GENDER_KEY, genderMode); } catch {}
  normalizeProfile(PROFILE, false); saveProfile(); syncPickers(); refreshAvatar();
  setGenderInfo(genderMode === "auto" && running ? "將在下次辨識外表時自動偵測" : describeGender());
  if (genderMode === "auto" && running) { autoDone = false; autoFrames = []; lastAutoMsg = ""; }       // 鏡頭開著就重新辨識一次
};
$("resetProfile").onclick = () => { PROFILE = normalizeProfile({ ...DEFAULT_PROFILE }, false); saveProfile(); syncPickers(); refreshAvatar(); $("buildStatus").textContent = "已還原成預設角色"; };
syncPickers();

// 即時顯示偵測到的表情
let lastExpr = "";
function showExpr(b) {
  const g = (k) => b[k] ?? 0, t = [];
  if ((g("mouthSmileLeft") + g("mouthSmileRight")) / 2 > .4) t.push("微笑");
  if ((g("mouthFrownLeft") + g("mouthFrownRight")) / 2 > .3) t.push("嘴角下垂");
  if (g("jawOpen") > .3) t.push("張嘴");
  if (g("mouthPucker") > .4) t.push("嘟嘴");
  if ((g("browDownLeft") + g("browDownRight")) / 2 > .4) t.push("皺眉");
  if ((g("browInnerUp") + g("browOuterUpLeft") + g("browOuterUpRight")) / 3 > .45) t.push("挑眉");
  if (g("eyeBlinkLeft") > .5 && g("eyeBlinkRight") > .5) t.push("閉眼");
  const text = "表情：" + (t.join("、") || "自然");
  if (text !== lastExpr) { lastExpr = text; $("expr").textContent = text; }
}

/* ---------- 自動辨識外表：開啟鏡頭後，偵測到穩定的正面臉就自動建立角色 ---------- */
const AUTO_KEY = "signbridge.autoLook";
let autoOn = true;
try { autoOn = localStorage.getItem(AUTO_KEY) !== "0"; } catch {}
let autoDone = false, autoFrames = [], lastAutoMsg = "", noFace = 0;
function frontalNeutral(face) {
  const lm = face.lm;
  if (!lm) return "no";
  const a = lm[234], b = lm[454], n = lm[1], w = Math.abs(b.x - a.x);
  if (w * video.videoWidth < 90) return "far";
  const t = (n.x - Math.min(a.x, b.x)) / w;            // 鼻尖在兩頰之間的位置，約 0.5 表示正面
  if (t < 0.38 || t > 0.62 || Math.abs(face.roll) > 0.3) return "turn";
  if ((face.raw.jawOpen ?? 0) > 0.3) return "relax";
  return "ok";
}
const AUTO_MSG = {
  no: "自動辨識外表：請讓臉進入鏡頭", far: "請再靠近鏡頭一點", turn: "請正對鏡頭",
  relax: "請放鬆表情、嘴巴閉上", ok: "正在辨識你的外表，請保持不動…",
};
function autoLook(face, pose) {
  if (!face.lm) { if (++noFace > 90) autoDone = false; } else noFace = 0;   // 離開約 3 秒再回來，視為新使用者
  if (!autoOn || autoDone || capturing || !running) return;
  const st = frontalNeutral(face);
  if (st === "ok") autoFrames.push({ lm: face.lm, raw: face.raw, pose, g: autoFrames.length % 5 === 0 ? grabFrame() : null }); else autoFrames = [];
  if (AUTO_MSG[st] !== lastAutoMsg) { lastAutoMsg = AUTO_MSG[st]; $("buildStatus").textContent = lastAutoMsg; }
  if (autoFrames.length >= 20) {
    autoDone = true;
    applyProfile(autoFrames, $("buildStatus"), "已自動辨識你的外表並建立角色（顏色不準可在下方微調）");
    autoFrames = [];
  }
}
$("autoLook").checked = autoOn;
$("autoLook").onchange = (e) => {
  autoOn = e.target.checked;
  try { localStorage.setItem(AUTO_KEY, autoOn ? "1" : "0"); } catch {}
  if (autoOn) { autoDone = false; autoFrames = []; lastAutoMsg = ""; }
  else $("buildStatus").textContent = "已關閉自動辨識，可用按鈕手動建立";
};

/* ---------- 情緒判斷：由臉部肌肉動作分數推估 ---------- */
const EMOTIONS = [
  ["happy", "😊", "開心"], ["sad", "😢", "難過"], ["angry", "😠", "生氣"],
  ["surprised", "😲", "驚訝"], ["fear", "😨", "害怕"], ["disgust", "🤢", "厭惡"],
];
// 左右臉分數取平均
const side = (b, n) => ((b[n + "Left"] ?? 0) + (b[n + "Right"] ?? 0)) / 2;
function scoreEmotions(b) {             // 依臉部動作單元（FACS）組合出六種情緒的強度
  const smile = side(b, "mouthSmile"), cheek = side(b, "cheekSquint"), dimple = side(b, "mouthDimple");
  const frown = side(b, "mouthFrown"), shrug = b.mouthShrugLower ?? 0, press = side(b, "mouthPress");
  const inner = b.browInnerUp ?? 0, outer = side(b, "browOuterUp"), down = side(b, "browDown");
  const wide = side(b, "eyeWide"), squint = side(b, "eyeSquint"), jaw = b.jawOpen ?? 0, stretch = side(b, "mouthStretch");
  const sneer = side(b, "noseSneer"), upper = side(b, "mouthUpperUp"), lower = side(b, "mouthLowerDown");
  const up = (inner + outer) / 2;
  const raw = {
    happy: (0.75 * smile + 0.3 * cheek + 0.1 * dimple) * (1 - 0.5 * down),                 // AU6 + AU12
    sad: (0.45 * frown + 0.35 * inner * (1 - outer) + 0.2 * shrug + 0.1 * down * inner) * (1 - smile),   // AU1 + AU15 + AU17
    angry: (0.5 * down + 0.15 * wide + 0.2 * squint + 0.25 * press + 0.1 * sneer) * (1 - 0.7 * inner) * (1 - smile),   // AU4 + AU5 + AU7 + AU23
    surprised: (0.35 * up + 0.25 * wide + 0.35 * jaw) * (1 - 0.6 * down),                  // AU1+2 + AU5 + AU26
    fear: (0.3 * inner + 0.3 * wide + 0.4 * stretch) * (1 - 0.3 * smile),                  // AU1 + AU5 + AU20
    disgust: (0.45 * sneer + 0.3 * upper + 0.15 * down + 0.1 * lower) * (1 - smile),       // AU9 + AU10
  };
  const out = {};
  for (const k in raw) out[k] = Math.max(0, Math.min(1, raw[k] * 1.7));
  return out;
}

const emo = { scores: {}, current: "none", cand: "neutral", candN: 0 };
const emoRows = {};
(function buildEmotionUI() {
  const box = $("emotionBars");
  EMOTIONS.forEach(([key, icon, name]) => {
    const row = document.createElement("div"); row.className = "ebar";
    row.innerHTML = `<span>${icon} ${name}</span><i><b></b></i>`;
    box.append(row); emoRows[key] = row.querySelector("b");
  });
})();

function updateEmotion(face) {
  if (!face.lm) {                                  // 沒偵測到臉就不要亂猜
    emo.current = "none"; $("emoIcon").textContent = "🫥"; $("emoName").textContent = "未偵測到臉"; $("emoSub").textContent = "";
    EMOTIONS.forEach(([k]) => { emoRows[k].style.width = "0%"; }); return;
  }
  const now = scoreEmotions(face.blend), ks = EMOTIONS.map(([k]) => k);
  ks.forEach((k) => {                              // 指數平滑，避免一閃而過的抖動
    emo.scores[k] = (emo.scores[k] ?? 0) * 0.7 + now[k] * 0.3;
    emoRows[k].style.width = Math.round(emo.scores[k] * 100) + "%";
  });
  // 把六種情緒的強度與「平靜」一起換算成機率；最高的情緒要夠強、機率要勝過平靜，並且連續穩定幾格才切換
  const K = 5, NE = 0.28, ex = ks.map(k => Math.exp(K * emo.scores[k])), pn0 = Math.exp(K * NE), z = ex.reduce((t, v) => t + v, 0) + pn0;
  const probs = Object.fromEntries(ks.map((k, i) => [k, ex[i] / z])), pn = pn0 / z;
  const order = ks.slice().sort((a, b) => emo.scores[b] - emo.scores[a]), top = order[0];
  const cand = (probs[top] > pn && emo.scores[top] > 0.3) ? top : "neutral";
  if (cand === emo.cand) emo.candN++; else { emo.cand = cand; emo.candN = 1; }
  if (emo.current === "none" || (cand !== emo.current && emo.candN >= (cand === "neutral" ? 8 : 5))) emo.current = cand;
  const info = (k) => EMOTIONS.find(([e]) => e === k);
  const hit = info(emo.current), second = order[1];
  $("emoIcon").textContent = hit ? hit[1] : "😐";
  $("emoName").textContent = hit ? `${hit[2]} ${Math.round(probs[emo.current] * 100)}%` : `平靜 ${Math.round(pn * 100)}%`;
  $("emoSub").textContent = emo.scores[second] > 0.2 && emo.current !== second ? `同時帶有「${info(second)[2]}」的成分` : "";
}

/* ---------- 表情校準：記住每個人自己的表情幅度（有人表情很含蓄，有人很誇張） ---------- */
let calibrating = false, calibFrames = null;
const CAL_STEPS = [
  ["放鬆，看著鏡頭，不要做表情", null],
  ["大大地微笑", ["mouthSmileLeft", "mouthSmileRight", "cheekSquintLeft", "cheekSquintRight"]],
  ["皺眉、用力瞪眼（生氣）", ["browDownLeft", "browDownRight", "eyeSquintLeft", "eyeSquintRight", "mouthPressLeft", "mouthPressRight"]],
  ["驚訝：挑眉、張大嘴、睜大眼", ["browInnerUp", "browOuterUpLeft", "browOuterUpRight", "jawOpen", "eyeWideLeft", "eyeWideRight"]],
  ["難過：嘴角下垂、眉心上揚", ["mouthFrownLeft", "mouthFrownRight", "mouthShrugLower"]],
];
$("emoCalib").onclick = async () => {
  const st = $("emoCalibStatus");
  if (calibrating) return;
  if (!running || !faceLandmarker) { st.textContent = "請先開啟鏡頭"; return; }
  calibrating = true;
  const base = {}, gain = {}, cnt = {};
  try {
    for (let i = 0; i < CAL_STEPS.length; i++) {
      const [text, keys] = CAL_STEPS[i], tag = `第 ${i + 1}/${CAL_STEPS.length} 步`;
      for (let n = 3; n > 0; n--) { st.textContent = `${tag}（${n}）：${text}`; await sleep(1000); }
      calibFrames = []; st.textContent = `${tag} ▶ ${text}（保持 2 秒）`; await sleep(2000);
      const fr = calibFrames; calibFrames = null;
      if (fr.length < 8) { st.textContent = "沒有穩定偵測到臉，請調整位置後重試"; return; }
      if (!keys) Object.keys(fr[0]).forEach(k => { base[k] = Math.min(0.5, fr.reduce((t, f) => t + (f[k] ?? 0), 0) / fr.length); });
      else keys.forEach(k => {
        const b0 = base[k] ?? 0, v = fr.map(f => Math.max(0, ((f[k] ?? 0) - b0) / (1 - b0))).sort((x, y) => x - y), p90 = v[Math.floor(v.length * 0.9)];
        if (p90 < 0.08) return;                                  // 這個動作沒做出來，不調整
        const g = Math.max(0.8, Math.min(3.5, 0.75 / Math.max(p90, 0.12)));
        gain[k] = ((gain[k] ?? 0) * (cnt[k] ?? 0) + g) / ((cnt[k] ?? 0) + 1); cnt[k] = (cnt[k] ?? 0) + 1;
      });
    }
    PROFILE.base = base; PROFILE.gain = { ...PROFILE.gain, ...gain }; saveProfile();
    st.textContent = `校準完成：已記住你的放鬆表情與 ${Object.keys(gain).length} 項表情幅度`;
  } finally { calibrating = false; calibFrames = null; }
};
const emotionLabel = () => (EMOTIONS.find(([k]) => k === emo.current) || [])[2];

/* ---------- 手語詞典：把手臂、雙手、表情一起錄下來 ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const POSE_IDX = [0, 11, 12, 13, 14, 15, 16, 23, 24];
const BLEND_KEYS = ["eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight", "mouthFunnel",
  "mouthPressLeft", "mouthPressRight", "mouthLeft", "mouthRight", "mouthRollLower", "mouthRollUpper",
  "mouthUpperUpLeft", "mouthUpperUpRight", "mouthLowerDownLeft", "mouthLowerDownRight",
  "mouthDimpleLeft", "mouthDimpleRight", "mouthStretchLeft", "mouthStretchRight", "cheekPuff",
  "cheekSquintLeft", "cheekSquintRight", "noseSneerLeft", "noseSneerRight", "jawLeft", "jawRight", "tongueOut","eyeBlinkLeft", "eyeBlinkRight", "browDownLeft", "browDownRight", "browInnerUp",
  "browOuterUpLeft", "browOuterUpRight", "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft",
  "mouthFrownRight", "mouthPucker", "jawOpen",
  "eyeLookInLeft", "eyeLookOutLeft", "eyeLookUpLeft", "eyeLookDownLeft",
  "eyeLookInRight", "eyeLookOutRight", "eyeLookUpRight", "eyeLookDownRight"];
const CLIPS = {};                       // 詞 → { frames, dur }
const STORE_KEY = "signbridge.clips.v1";
const r3 = (v) => Math.round(v * 1000) / 1000;

// 存檔格式：每格畫面只留需要的關節點與表情分數，並降低精度以縮小檔案
const pack = (f) => ({
  t: Math.round(f.t), r: r3(f.roll || 0), ya: r3(f.yaw || 0), pt: r3(f.pitch || 0),
  hs: f.hands.map(h => h.handed || ""),
  p: f.pose ? POSE_IDX.map(i => [r3(f.pose[i].x), r3(f.pose[i].y), r3(f.pose[i].visibility ?? 1)]) : null,
  h: f.hands.map(h => h.map(q => [r3(q.x), r3(q.y), r3(q.z || 0)])),
  b: Object.fromEntries(BLEND_KEYS.map(k => [k, Math.round((f.blend?.[k] ?? 0) * 100) / 100])),
});
function unpack(o) {
  let pose;
  if (o.p) { pose = []; POSE_IDX.forEach((i, k) => pose[i] = { x: o.p[k][0], y: o.p[k][1], visibility: o.p[k][2] }); }
  const hands = o.h.map((h, i) => { const a = h.map(q => ({ x: q[0], y: q[1], z: q[2] || 0 })); if (o.hs?.[i]) a.handed = o.hs[i]; return a; });
  return { t: o.t, roll: o.r, yaw: o.ya || 0, pitch: o.pt || 0, pose, blend: o.b, hands };
}
const serialize = () => JSON.stringify(Object.fromEntries(
  Object.entries(CLIPS).map(([w, c]) => [w, c.frames.map(pack)])));
function loadClips(obj) {
  for (const [w, fr] of Object.entries(obj)) {
    const frames = fr.map(unpack);
    if (frames.length) CLIPS[w] = { frames, dur: frames[frames.length - 1].t };
  }
}
function saveClips() {
  try { localStorage.setItem(STORE_KEY, serialize()); }
  catch { $("recStatus").textContent = "瀏覽器儲存空間不足，請先「匯出詞典」備份，再刪除部分詞"; }
}
try { loadClips(JSON.parse(localStorage.getItem(STORE_KEY) || "{}")); } catch {}

// 錄製：約每 66 毫秒取一格（15 fps），最長 6 秒
let recState = null, counting = false;
function captureFrame(now, pose, hands, face) {
  if (!recState || now - recState.last < 66) return;
  recState.last = now;
  recState.frames.push({ t: now - recState.t0, pose, hands, blend: face.blend, roll: face.roll, yaw: face.yaw, pitch: face.pitch });
  if (now - recState.t0 > 6000) stopRecording();
}
/* ---------- 錄影並上傳到後端 POST /api/recognize ----------
   之前錄製詞典只保存「關節點」，沒有保存影片檔，所以「上傳最近錄製影片」永遠是「沒有可上傳的影片」。
   現在錄製時會同時用 MediaRecorder 把鏡頭畫面錄成影片；上傳格式為 multipart/form-data：
   video、session_id、scenario_id、language，回應為 { success, data: { text }, error } */
let lastVideo = null, vrec = null, uploading = false;
const SESSION_ID = (() => {
  try { let v = sessionStorage.getItem("signbridge.session"); if (!v) { v = "session-" + Math.random().toString(36).slice(2, 8); sessionStorage.setItem("signbridge.session", v); } return v; }
  catch { return "session-001"; }
})();
const setApiStatus = (t) => { $("uploadStatus").textContent = t; $("signApiStatus").textContent = t; };
function appendTranscript(text) {
  const t = $("transcript");
  if (t.dataset.empty !== "0") { t.textContent = ""; t.dataset.empty = "0"; }
  t.textContent += text + " ";
}
function startVideoCapture() {
  try {
    if (!window.MediaRecorder || !video.srcObject) return null;
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(m => MediaRecorder.isTypeSupported(m)) || "";
    const chunks = [], mr = new MediaRecorder(video.srcObject, mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined);
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => { mr.onstop = () => res(new Blob(chunks, { type: mr.mimeType || mime || "video/webm" })); });
    mr.start(250);
    return { mr, done };
  } catch (e) { console.warn("無法錄影：", e); return null; }
}
function finishCapture(cap) { if (cap.mr.state !== "inactive") cap.mr.stop(); return cap.done; }

async function uploadVideo(blob) {
  if (uploading) return null;
  uploading = true; setApiStatus("上傳中…（" + (blob.size / 1024).toFixed(0) + " KB）");
  try {
    const fd = new FormData();
    fd.append("video", blob, `sign-${Date.now()}.${(blob.type || "").includes("mp4") ? "mp4" : "webm"}`);
    fd.append("session_id", SESSION_ID);
    fd.append("scenario_id", $("scenarioId").value);
    fd.append("language", "zh-TW");
    const res = await fetch("/api/recognize", { method: "POST", body: fd });
    let json = null; try { json = await res.json(); } catch {}
    if (!res.ok || !json || json.success !== true) {
      const why = json?.error?.message || (res.status === 404
        ? "找不到 /api/recognize：後端沒有啟動（請用 Visual Studio 或 dotnet run 執行 SignBridge 專案，不要用 Live Server 或 python http.server）"
        : `伺服器回應 ${res.status}`);
      setApiStatus("辨識失敗：" + why); return null;
    }
    const text = json.data?.text ?? "";
    setApiStatus(`辨識結果：「${text}」（${SESSION_ID}）`);
    appendTranscript(text);
    return text;
  } catch (e) {
    setApiStatus("無法連到後端：" + e.message); return null;
  } finally { uploading = false; }
}
$("uploadBtn").onclick = async () => {
  if (!lastVideo) { setApiStatus("沒有可上傳的影片：請先錄製一段影片"); return; }
  await uploadVideo(lastVideo.blob);
};

// 「手語 → 文字」區塊的直接錄影：錄一段 → 上傳 → 顯示後端回傳的中文
let clipCap = null, clipTimer = 0, clipStarting = false;
async function stopClipAndUpload() {
  clearTimeout(clipTimer);
  const cap = clipCap; clipCap = null;
  $("signRecBtn").textContent = "錄影並送去辨識";
  if (!cap) return;
  const blob = await finishCapture(cap);
  if (!blob || blob.size < 1000) { setApiStatus("沒有錄到影片，請再試一次"); return; }
  lastVideo = { blob, word: "（直接辨識）", at: Date.now() };
  await uploadVideo(blob);
}
$("signRecBtn").onclick = async () => {
  if (clipCap) return stopClipAndUpload();
  if (clipStarting) return;
  if (!running) { setApiStatus("請先按「開啟鏡頭」"); return; }
  if (!window.MediaRecorder) { setApiStatus("此瀏覽器不支援錄影（MediaRecorder），請改用 Chrome 或 Edge"); return; }
  clipStarting = true;
  for (let n = 3; n > 0; n--) { setApiStatus(`${n} 秒後開始錄影，請準備`); await sleep(1000); }
  clipStarting = false;
  clipCap = startVideoCapture();
  if (!clipCap) { setApiStatus("無法開始錄影"); return; }
  $("signRecBtn").textContent = "停止並辨識"; setApiStatus("錄影中（最長 6 秒）");
  clipTimer = setTimeout(stopClipAndUpload, 6000);
};

$("recBtn").onclick = async () => {
  if (recState) return stopRecording();
  if (counting) return;
  const word = $("recWord").value.trim();
  if (!word) { $("recStatus").textContent = "請先輸入要錄製的詞"; return; }
  if (!running) { $("recStatus").textContent = "請先在上方開啟鏡頭"; return; }
  counting = true;
  for (let n = 3; n > 0; n--) { $("recStatus").textContent = `${n} 秒後開始，請準備`; await sleep(1000); }
  counting = false;
  recState = { word, frames: [], t0: performance.now(), last: -1e9 };
  vrec = startVideoCapture();                         // 同時把鏡頭畫面錄成影片，供「上傳最近錄製影片」使用
  $("recBtn").textContent = "停止並儲存";
  $("recStatus").textContent = "錄製中（最長 6 秒）";
};
function stopRecording() {
  const { frames } = recState, word = recState.word.replace(/#/g, ""); recState = null;
  const cap = vrec; vrec = null;
  const videoDone = cap ? finishCapture(cap) : Promise.resolve(null);
  $("recBtn").textContent = "開始錄製";
  const keep = frames.filter(f => f.pose || f.hands.length);
  if (keep.length < 5) { $("recStatus").textContent = "錄到的畫面太少，請確認人在鏡頭內再試一次"; return; }
  const t0 = keep[0].t; keep.forEach(f => f.t -= t0);
  let key = word;                                    // 勾選「新增為另一個樣本」時存成 詞#2、詞#3…，辨識時一起比對
  if ($("recAdd").checked && CLIPS[word]) { let n = 2; while (CLIPS[`${word}#${n}`]) n++; key = `${word}#${n}`; }
  CLIPS[key] = { frames: keep, dur: keep[keep.length - 1].t };
  saveClips(); renderClips();
  $("recStatus").textContent = `已儲存「${word}」${key !== word ? `（樣本 ${key.split("#")[1]}）` : ""}（${(CLIPS[key].dur / 1000).toFixed(1)} 秒）`;
  videoDone.then(blob => {
    if (!blob || blob.size < 1000) return;
    lastVideo = { blob, word, at: Date.now() };
    $("uploadStatus").textContent = `可以上傳：最近錄製的「${word}」影片（${(blob.size / 1024).toFixed(0)} KB）`;
  });
}

// 重現：在兩格之間做線性內插，動作才會順
const lerp = (a, b, k) => a + (b - a) * k;
function frameAt(c, t) {
  const F = c.frames, i = F.findIndex(f => f.t > t);
  if (i === 0) return F[0];
  if (i === -1) return F[F.length - 1];
  const a = F[i - 1], b = F[i], k = (t - a.t) / (b.t - a.t || 1);
  const blend = {};
  BLEND_KEYS.forEach(n => { blend[n] = lerp(a.blend[n] ?? 0, b.blend[n] ?? 0, k); });
  return {
    roll: lerp(a.roll, b.roll, k), yaw: lerp(a.yaw || 0, b.yaw || 0, k), pitch: lerp(a.pitch || 0, b.pitch || 0, k), blend,
    pose: a.pose && b.pose ? a.pose.map((p, j) => p && b.pose[j]
      ? { x: lerp(p.x, b.pose[j].x, k), y: lerp(p.y, b.pose[j].y, k), visibility: Math.min(p.visibility, b.pose[j].visibility) } : p) : a.pose,
    hands: a.hands.map((h, n) => {
      if (!b.hands[n]) return h;
      const r = h.map((q, j) => ({ x: lerp(q.x, b.hands[n][j].x, k), y: lerp(q.y, b.hands[n][j].y, k), z: lerp(q.z || 0, b.hands[n][j].z || 0, k) }));
      r.handed = h.handed; return r;
    }),
  };
}
async function playClip(c, ctx = actx) {
  if (ctx === actx) avatar.scrollIntoView({ block: "center", behavior: "smooth" });
  const t0 = performance.now();
  await new Promise(done => {
    const step = () => {
      const t = Math.min(performance.now() - t0, c.dur), f = frameAt(c, t);
      drawAvatar(ctx, f.pose, f.hands, f);
      t >= c.dur ? done() : requestAnimationFrame(step);
    };
    step();
  });
}
async function playWord(w) {
  if (playing || !CLIPS[w]) return;
  playing = true; await playClip(CLIPS[w]); playing = false;
  if (!running) showPose(DICT["你好"]);
}

// 詞典清單：播放 / 刪除 / 匯出 / 匯入
function renderClips() {
  const ul = $("clipList"); ul.innerHTML = "";
  const words = Object.keys(CLIPS).sort();
  if (!words.length) { ul.innerHTML = "<li class='empty'>還沒有錄製的詞。</li>"; return; }
  words.forEach(w => {
    const li = document.createElement("li");
    const [base, v] = w.split("#");
    li.innerHTML = `<span>${base}${v ? ` <small>樣本 ${v}</small>` : ""}</span><small>${(CLIPS[w].dur / 1000).toFixed(1)} 秒</small>`;
    const play = Object.assign(document.createElement("button"), { textContent: "播放", className: "ghost" });
    const del = Object.assign(document.createElement("button"), { textContent: "刪除", className: "ghost" });
    play.onclick = () => playWord(w);
    del.onclick = () => { delete CLIPS[w]; saveClips(); renderClips(); };
    li.append(play, del); ul.append(li);
  });
}
$("exportBtn").onclick = () => {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([serialize()], { type: "application/json" })),
    download: "signbridge-dictionary.json" });
  a.click(); URL.revokeObjectURL(a.href);
};
$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async (e) => {
  try { loadClips(JSON.parse(await e.target.files[0].text())); saveClips(); renderClips(); $("recStatus").textContent = "已匯入詞典"; }
  catch { $("recStatus").textContent = "匯入失敗：檔案格式不正確"; }
  e.target.value = "";
};
renderClips();

/* ---------- 聲音 → 手語 ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, wantListen = false, committed = "";

/* 辨識結果整理：語音引擎常把「一二三」寫成「123」、加上標點、或輸出簡體字，
   這些都會讓詞典對不上，所以先統一成繁體中文數字、拿掉標點 */
const NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const S2T = {};
"爱愛谢謝请請对對说說话話们們吗嗎这這没沒时時会會来來谁誰么麼见見样樣认認识識开開关關学學习習买買卖賣钱錢饭飯车車师師医醫点點后後发發东東国國边邊里裡让讓给給从從应應该該问問题題听聽觉覺难難过過欢歡帮幫业業务務电電脑腦机機书書报報纸紙动動画畫门門间間头頭脸臉队隊响響读讀写寫词詞语語声聲艺藝术術为為与與万萬亿億两兩个個还還进進远遠运運"
  .match(/[^\x00-\x7f]{2}/g).forEach(p => { S2T[p[0]] = p[1]; });
function normalizeSpeech(t) {
  return t
    .replace(/\d+/g, m => m === "10" ? "十" : [...m].map(d => NUM[+d]).join(" "))
    .replace(/[，。！？、；：,.!?;:"'「」『』“”‘’（）()\[\]{}…~～\-—]/g, " ")
    .replace(/[\u4e00-\u9fff]/g, ch => S2T[ch] || ch)
    .replace(/\s+/g, " ").trim();
}
// 引擎會給出多個候選，挑「詞典裡認得最多詞」的那一個（第一名不一定最符合詞典）
const knownCount = (t) => tokenize(normalizeSpeech(t)).filter(x => x.ok).reduce((n, x) => n + x.w.length, 0);   // 以「認得的字數」計分，長詞比單字更有份量
function bestAlternative(result) {
  let best = result[0].transcript, bs = knownCount(best);
  for (let i = 1; i < result.length; i++) { const sc = knownCount(result[i].transcript); if (sc > bs) { bs = sc; best = result[i].transcript; } }
  return best;
}

/* 音量條：讓你確認麥克風真的收到聲音（取不到也不影響辨識） */
let meter = null;
async function startMeter() {
  if (meter) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ac = new (window.AudioContext || window.webkitAudioContext)(), an = ac.createAnalyser(); an.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(an);
    meter = { stream, ac, an, buf: new Uint8Array(an.fftSize), raf: 0, quietSince: performance.now(), tipped: false };
    const tick = () => {
      if (!meter) return;
      meter.an.getByteTimeDomainData(meter.buf);
      let peak = 0; for (const v of meter.buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
      $("micLevel").style.width = Math.min(100, Math.round(peak * 160)) + "%";
      const now = performance.now();
      if (peak > 0.04) { meter.quietSince = now; meter.tipped = false; }
      else if (now - meter.quietSince > 4000 && !meter.tipped && wantListen) {
        meter.tipped = true; $("micStatus").textContent = "麥克風幾乎沒有聲音：請靠近麥克風、檢查系統輸入音量，或換一個麥克風";
      }
      meter.raf = requestAnimationFrame(tick);
    };
    tick();
  } catch { /* 沒有音量條也能辨識 */ }
}
function stopMeter() {
  if (!meter) return;
  cancelAnimationFrame(meter.raf); meter.stream.getTracks().forEach(t => t.stop()); meter.ac.close(); meter = null;
  $("micLevel").style.width = "0%";
}

try { $("speechLang").value = localStorage.getItem("signbridge.speechLang") || "zh-TW"; } catch {}
$("speechLang").onchange = (e) => {
  try { localStorage.setItem("signbridge.speechLang", e.target.value); } catch {}
  if (rec) rec.stop();                           // 收音中換語言：停掉後會自動用新語言接續
};

function startRec() {
  rec = new SR(); rec.lang = $("speechLang").value; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 5;
  rec.onstart = () => { $("micStatus").textContent = "收音中，請說話"; $("micBtn").textContent = "停止收音"; };
  rec.onresult = (e) => {
    let fin = "", interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) fin += " " + bestAlternative(r); else interim += r[0].transcript;
    }
    if (fin.trim()) committed = (committed + " " + normalizeSpeech(fin)).trim();
    $("speechText").value = (committed + " " + normalizeSpeech(interim)).trim();
    const raw = (fin + " " + interim).trim();
    if (raw) $("heardRaw").textContent = "原始辨識：" + raw;
  };
  rec.onerror = (e) => {
    const fatal = ["not-allowed", "service-not-allowed", "audio-capture", "network"].includes(e.error);
    if (fatal) wantListen = false;                // 這幾種錯誤重試也沒用，不要無限重來
    const why = { "not-allowed": "麥克風權限被封鎖，請在網址列允許麥克風後重新整理",
      "service-not-allowed": "瀏覽器不允許語音服務，請改用 https://localhost 並使用 Chrome 或 Edge",
      "network": "語音辨識需要連上網路（Chrome 會把聲音送到雲端辨識）",
      "no-speech": "沒有聽到聲音，請靠近麥克風再說一次（仍在收音）", "audio-capture": "找不到麥克風" }[e.error];
    if (e.error !== "aborted") $("micStatus").textContent = why || "語音辨識錯誤：" + e.error;
  };
  rec.onend = () => {                             // 瀏覽器停頓幾秒就會自動結束，只要還沒按停止就自動接續
    rec = null;
    if (wantListen) setTimeout(() => { if (wantListen && !rec) startRec(); }, 250);
    else { stopMeter(); $("micBtn").textContent = "開始收音"; }
  };
  try { rec.start(); } catch (e) { rec = null; wantListen = false; stopMeter(); $("micStatus").textContent = "無法開始收音：" + e.message; }
}
$("micBtn").onclick = () => {
  if (!SR) { $("micStatus").textContent = "此瀏覽器不支援語音辨識，請改用 Chrome 或 Edge"; return; }
  if (wantListen) { wantListen = false; if (rec) rec.stop(); stopMeter(); $("micBtn").textContent = "開始收音"; $("micStatus").textContent = "已停止"; return; }
  wantListen = true; committed = $("speechText").value.trim();   // 接續文字框目前的內容
  $("heardRaw").textContent = "";
  startMeter(); startRec();
};
$("speechClear").onclick = () => { committed = ""; $("speechText").value = ""; $("heardRaw").textContent = ""; $("cards").innerHTML = ""; };
// 手動在文字框打字或修改後，之後的語音辨識會接在修改後的內容後面
$("speechText").addEventListener("input", () => { if (!wantListen) committed = $("speechText").value.trim(); });

// 詞典最長優先切詞；沒收錄的字會標示為缺詞
function tokenize(text) {
  const keys = [...new Set([...Object.keys(DICT), ...Object.keys(CLIPS).filter(k => !k.includes("#"))])].sort((a, b) => b.length - a.length);
  const out = []; let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue; }
    const hit = keys.find(k => text.startsWith(k, i));
    if (hit) { out.push({ w: hit, ok: true }); i += hit.length; }
    else { out.push({ w: text[i], ok: false }); i++; }
  }
  return out;
}

let playing = false;                 // 詞典預覽正在使用上方角色
let speechPlaying = false;           // 本區塊的虛擬人物正在播放
const stage = $("signStage"), sctx = stage.getContext("2d");
const setStageWord = (t) => { $("stageWord").textContent = t; };

async function signWord(w) {         // 錄製的真實動作優先，否則用詞典手形
  setStageWord("手語：" + w);
  if (CLIPS[w]) await playClip(CLIPS[w], sctx);
  else { showPose(DICT[w], EXPR[w], sctx); await sleep(1000); }
}
const idleStage = () => { showPose(DICT["你好"], {}, sctx); setStageWord("虛擬人物：準備好了"); };

$("playBtn").onclick = async () => {
  if (speechPlaying) return;
  const tokens = tokenize($("speechText").value);
  const box = $("cards"); box.innerHTML = "";
  if (!tokens.length) { setStageWord("請先說話或輸入文字"); return; }
  const els = tokens.map(t => {
    const d = document.createElement("div");
    d.className = "card" + (t.ok ? "" : " miss"); d.textContent = t.w;
    d.title = t.ok ? "點一下可以重播這個詞" : "詞典尚未收錄";
    if (t.ok) d.onclick = async () => {
      if (speechPlaying) return;
      speechPlaying = true; d.classList.add("on"); await signWord(t.w); d.classList.remove("on");
      speechPlaying = false; idleStage();
    };
    box.append(d); return d;
  });
  if (!tokens.some(t => t.ok)) { setStageWord("詞典裡還沒有這些詞，可以到下方錄製"); return; }
  speechPlaying = true;
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].ok) continue;
    els[i].classList.add("on");
    await signWord(tokens[i].w);
    els[i].classList.remove("on");
    await sleep(200);
  }
  speechPlaying = false; idleStage();
};

function showPose(ext, expr = {}, ctx = actx) {
  const { pose, hands } = syntheticScene(ext, ctx.canvas.width / ctx.canvas.height);
  drawAvatar(ctx, pose, hands, { blend: expr, roll: 0 });
}
showPose(DICT["你好"]);
idleStage();
