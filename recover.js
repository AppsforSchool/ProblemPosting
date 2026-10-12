// ★ 読み込みが止まったときの診断と復旧（appScript.js / talkScript.js の「止まっています」表示から使う）
//   「別のブラウザでは一瞬で開くのに、このブラウザだけ止まる」場合は、そのブラウザに保存されている
//   Firebase のログイン情報（IndexedDB / localStorage）の不整合や、ブラウザ設定・拡張機能による通信/保存のブロックが疑われる。

// ★ ブラウザの保存領域・通信の状態を調べて、1行の文字列で返す（約3秒で打ち切る）
export async function probeEnvironment() {
  const parts = [];

  // IndexedDB（FirebaseのログインはここにIDを保存する）。実際のFirebase用DBには触れず、専用の仮DBで確認する
  const idb = await new Promise((resolve) => {
    if (!window.indexedDB) return resolve("使えません");
    let finished = false;
    const timer = setTimeout(() => { if (!finished) { finished = true; resolve("応答なし(3秒)"); } }, 3000);
    const done = (text) => { if (finished) return; finished = true; clearTimeout(timer); resolve(text); };
    try {
      const request = indexedDB.open("perf-probe-db");
      request.onsuccess = () => {
        try { request.result.close(); indexedDB.deleteDatabase("perf-probe-db"); } catch (e) { /* 無視 */ }
        done("OK");
      };
      request.onerror = () => done("エラー(" + (request.error && request.error.name) + ")");
      request.onblocked = () => done("ブロックされています");
    } catch (e) {
      done("例外(" + e.name + ")");
    }
  });
  parts.push("IndexedDB: " + idb);

  try {
    localStorage.setItem("perf-probe", "1");
    localStorage.removeItem("perf-probe");
    parts.push("localStorage: OK");
  } catch (e) {
    parts.push("localStorage: 使えません");
  }

  parts.push("Cookie: " + (navigator.cookieEnabled ? "有効" : "無効"));
  parts.push("ServiceWorker: " + ("serviceWorker" in navigator
    ? (navigator.serviceWorker.controller ? "稼働中" : "なし") : "非対応"));
  parts.push("オンライン: " + (navigator.onLine ? "はい" : "いいえ"));
  return parts.join(" / ");
}

// ★ このブラウザに残っている Firebase のログイン情報を消して、ログイン画面からやり直す。
//   通信方式やキャッシュの設定（fsTransport / fsCache）、新UI/旧UIの設定は消さない。
async function resetLoginState() {
  try {
    ["firebaseLocalStorageDb", "firebase-installations-database", "firebase-heartbeat-database"].forEach((name) => {
      try { indexedDB.deleteDatabase(name); } catch (e) { /* 無視 */ }
    });
  } catch (e) { /* 無視 */ }
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("firebase:")).forEach((k) => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter((k) => k.startsWith("firebase:")).forEach((k) => sessionStorage.removeItem(k));
  } catch (e) { /* 無視 */ }
  // 他の接続が残っていると削除が待たされることがあるので、少し待ってからログイン画面へ移る
  await new Promise((resolve) => setTimeout(resolve, 600));
  location.href = "./index.html";
}

// ★ 読み込み画面（オーバーレイ）に「ログイン情報をリセットして再試行」ボタンを1つだけ追加する
export function attachRecoveryButton(container) {
  if (!container || container.querySelector("#recover-button")) return;
  const button = document.createElement("button");
  button.id = "recover-button";
  button.type = "button";
  button.textContent = "ログイン情報をリセットして再試行";
  button.style.cssText =
    "margin-top:1rem;padding:.7rem 1.2rem;font:inherit;font-weight:700;border:none;border-radius:999px;" +
    "background:#fff;color:#24303d;cursor:pointer;max-width:90%;";
  button.addEventListener("click", async () => {
    const message = "このブラウザに保存されているログイン情報を消して、ログイン画面に戻ります。\n※ ログイン情報は同じサイト内の他のアプリ（チャット・問題投稿など）と共有しているため、それらもログアウトになります。\nよろしいですか？";
    const ok = (typeof AppDialog !== "undefined") ? await AppDialog.confirm(message) : window.confirm(message);
    if (!ok) return;
    button.disabled = true;
    button.textContent = "リセット中...";
    await resetLoginState();
  });
  container.appendChild(button);
}
