export function simulateAvatarSign(text) {
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
