// ★ 読み込み画面(#loading-overlay)まわりの共通処理。各ページのスクリプトから import して使う。
//   ・setLoadingStage(text, percent, ceilingPercent) … 段階テキストと進捗バーの更新
//       ceilingPercent を渡すと、次の更新が来るまでの間、上限に向けてゆっくり進める(通信待ちで止まって見えないための演出)
//   ・watchLoadingStall()  … 読み込みが長引いたとき、止まっている段階と環境を表示し、復旧ボタンを出す
//   ・finishLoading(...)   … 読み込み完了：画面を閉じ、管理者にだけ計測レポートを表示する
import { perfMark, perfShowReport, perfWatchStall } from "./perf.js";
import { probeEnvironment, attachRecoveryButton } from "./recover.js";
import { runFirestoreDiagnostics } from "./diag.js";

let creepTimer = null;
let creepCurrent = 0;

export function setLoadingStage(text, percent, ceilingPercent) {
  if (creepTimer) {
    clearInterval(creepTimer);
    creepTimer = null;
  }
  const statusText = document.getElementById("loading-status-text");
  const fill = document.getElementById("loading-progress-bar-fill");
  if (statusText) statusText.textContent = text;
  if (fill && typeof percent === "number") {
    const clamped = Math.max(0, Math.min(100, percent));
    fill.style.width = `${clamped}%`;
    creepCurrent = clamped;
    if (typeof ceilingPercent === "number" && ceilingPercent > clamped) {
      creepTimer = setInterval(() => {
        const remaining = ceilingPercent - creepCurrent;
        if (remaining < 0.5) return; // 上限の手前で止め、本当の進捗を待つ
        creepCurrent += remaining * 0.06;
        fill.style.width = `${creepCurrent}%`;
      }, 200);
    }
  }
}

// ★ 読み込みが長引いたら、オーバーレイに「どの段階で止まっているか」を表示する(スマホでもコンソール無しで確認できる)。
//   あわせて、止まったブラウザから抜け出す手段として「ログイン情報をリセットして再試行」ボタンを出す
export function watchLoadingStall() {
  const overlay = document.getElementById("loading-overlay");
  let envText = "";
  perfWatchStall(
    () => !overlay || overlay.classList.contains("hidden"),
    (sec, label) => {
      setLoadingStage(`読み込みに時間がかかっています（${sec}秒経過）／最後に完了した段階: ${label}${envText ? "／" + envText : ""}`);
      if (!envText) {
        envText = "ブラウザ状態を確認中...";
        probeEnvironment().then((text) => { envText = text; });
      }
      attachRecoveryButton(overlay);
    }
  );
}

// ★ 読み込み完了：オーバーレイを閉じ、管理者にだけ計測レポート(通信診断ボタン付き)を表示する
export function finishLoading({ isAdmin, page, myUserId }) {
  setLoadingStage("読み込みが完了しました｡", 100);
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.classList.add("hidden");
  perfMark("オーバーレイを閉じて表示");
  perfShowReport({ isAdmin: !!isAdmin, page, diagnostics: () => runFirestoreDiagnostics(myUserId) });
}

// ★ 同時に発行した読み取りが「いくつ終わったか」で、進捗バーを実際の完了数に応じて進める。
//   使い方: const track = createReadTracker(3, 15, 65);  const p = track("ユーザー情報", hedged(() => getDoc(...)));
export function createReadTracker(total, fromPercent, toPercent) {
  let finished = 0;
  return (label, promise) => promise.then((result) => {
    finished++;
    setLoadingStage(`${label}を取得しました (${finished}/${total})｡`, fromPercent + (finished / total) * (toPercent - fromPercent), toPercent + 5);
    return result;
  });
}
