// ★ プッシュ通知(OneSignal + Firebase)まわりの処理を1か所にまとめたモジュール。
//   通知を使う各ページから <script src="notify.js"></script> で読み込み、グローバルの Notify として使う。
//   push-notification-spec_2.md(高校見学サイトの仕組みを移植したもの)に基づく実装。
const Notify = (() => {
  // ★ サイトごとにOneSignalのアプリを分けているため、Firestore上のキーの保管場所もサイトごとに変える
  const KEY_DOC_ID = "onesignal_ProblemPosting";
  const INIT_TIMEOUT_MS = 15000;
  const LOGOUT_TIMEOUT_MS = 3000;
  const BUTTON_ACTION_TIMEOUT_MS = 15000;

  let cachedKeys = null; // { appId, restApiKey } ★ 初回取得後はメモリにキャッシュし、以後は再取得しない
  let initPromise = null;

  function withTimeout(promise, ms, stageLabel) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`止まった段階: ${stageLabel}`)), ms);
      })
    ]);
  }

  async function fetchKeys(db) {
    if (cachedKeys) return cachedKeys;
    const snap = await db.collection("system_keys").doc(KEY_DOC_ID).get();
    const data = snap.exists ? snap.data() : null;
    if (!data || !data.appId || !data.restApiKey) {
      throw new Error("OneSignalのキーがFirestoreに設定されていません。");
    }
    cachedKeys = { appId: data.appId, restApiKey: data.restApiKey };
    return cachedKeys;
  }

  function runOnOneSignal(task) {
    return new Promise((resolve, reject) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async OneSignal => {
        try {
          const result = await task(OneSignal);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // ★ ログイン完了後(ユーザーIDが確定した時点)で1回呼ぶ。
  //   MPA構成でページ遷移のたびにJSの状態がリセットされるため、認証済みの全ページそれぞれで呼ぶ必要がある。
  //   通知の初期化に失敗しても、ページ本来の機能(一覧表示など)を止めてはいけないので、
  //   呼び出し側は結果を待たず(awaitせず)、ここで例外を外に投げない。
  function initPush(db, userId) {
    initPromise = (async () => {
      const keys = await withTimeout(fetchKeys(db), INIT_TIMEOUT_MS, "Firestoreからキーを取得中");

      const base = location.pathname.replace(/[^/]*$/, "");

      await withTimeout(
        runOnOneSignal(async OneSignal => {
          await OneSignal.init({
            appId: keys.appId,
            serviceWorkerPath: base + "OneSignalSDKWorker.js",
            serviceWorkerParam: { scope: base },
            allowLocalhostAsSecureOrigin: true,
            notifyButton: { enable: false } // OneSignal標準のベルボタンは使わない
          });
          await OneSignal.login(userId);
        }),
        INIT_TIMEOUT_MS,
        "OneSignalの初期化中"
      );
    })();

    initPromise.catch(error => {
      console.warn("通知の初期化に失敗しました:", error);
    });

    return initPromise;
  }

  // ★ 初期化の完了(または失敗)を待つ。setupPushButton内の再試行用
  async function ensureInitialized() {
    if (!initPromise) return false;
    try {
      await initPromise;
      return true;
    } catch (error) {
      return false;
    }
  }

  function isPushEnabled() {
    return typeof Notification !== "undefined" && Notification.permission === "granted";
  }

  async function isOptedIn() {
    try {
      return await withTimeout(
        runOnOneSignal(OneSignal => !!(OneSignal.User && OneSignal.User.PushSubscription && OneSignal.User.PushSubscription.optedIn)),
        5000,
        "購読状態の確認中"
      );
    } catch (error) {
      return false;
    }
  }

  // ★ 「通知をオンにする」ボタンの動作一式を設定する。initPushの直後に呼ぶ
  function setupPushButton(buttonId) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    // ★ .hidden の詳細度の問題(spec 7.3)を避けるため、表示切り替えはinline styleで行う
    function setVisible(visible) {
      btn.style.display = visible ? "" : "none";
    }

    async function refreshButtonState() {
      if (typeof Notification === "undefined") {
        setVisible(true);
        btn.textContent = "通知をオンにする";
        return;
      }
      if (Notification.permission !== "granted") {
        setVisible(true);
        btn.textContent = "通知をオンにする";
        return;
      }
      // ★「許可済み」というだけでは隠さない。購読が実際に完了した時だけ隠す
      const optedIn = await isOptedIn();
      if (optedIn) {
        setVisible(false);
      } else {
        setVisible(true);
        btn.textContent = "通知の登録をやり直す";
      }
    }

    btn.addEventListener("click", async () => {
      if (typeof Notification === "undefined") {
        const message = "この端末では通知を使えません。iPhoneの場合は、ホーム画面に追加して、そのアイコンから開いてください。";
        if (window.AppDialog) await AppDialog.alert(message);
        else alert(message);
        return;
      }
      if (Notification.permission === "denied") {
        const message = "通知がブロックされています。端末の設定アプリから、このサイトの通知を許可してください。";
        if (window.AppDialog) await AppDialog.alert(message);
        else alert(message);
        return;
      }

      const originalText = btn.textContent;
      btn.disabled = true;
      try {
        // ★ ボタンを押した直後に、まずブラウザ標準のrequestPermission()を呼ぶ。
        //   OneSignalの初期化を待ってから呼ぶと、iPhoneではユーザー操作と見なされず無反応になる
        btn.textContent = "許可を確認中...";
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          return;
        }

        btn.textContent = "OneSignalを準備中...";
        const ok = await withTimeout(ensureInitialized(), BUTTON_ACTION_TIMEOUT_MS, "OneSignalの初期化中");
        if (!ok) throw new Error("通知の初期化に失敗しています。ページを再読み込みしてもう一度お試しください。");

        btn.textContent = "購読を登録中...";
        await withTimeout(
          runOnOneSignal(OneSignal => OneSignal.User.PushSubscription.optIn()),
          BUTTON_ACTION_TIMEOUT_MS,
          "購読を登録中"
        );

        await refreshButtonState();
      } catch (error) {
        console.warn("通知の登録に失敗しました:", error);
        const message = "通知の登録に失敗しました。\n" + (error && error.message ? error.message : error);
        if (window.AppDialog) await AppDialog.alert(message);
        else alert(message);
        btn.textContent = originalText;
      } finally {
        btn.disabled = false;
      }
    });

    refreshButtonState();
  }

  // ★ ログアウト処理で auth.signOut() の直前に呼ぶ。呼ばないと、端末に前のユーザー宛の通知が届き続ける
  async function logoutPush() {
    try {
      await withTimeout(runOnOneSignal(OneSignal => OneSignal.logout()), LOGOUT_TIMEOUT_MS, "通知のログアウト処理中");
    } catch (error) {
      console.warn("通知のログアウト処理に失敗しました:", error);
    }
  }

  // ★ 通知を送信する操作が成功した直後に呼ぶ想定。送信失敗が本来の操作を止めてはいけないため、
  //   呼び出し側はawaitせず、ここで例外を外に投げない
  async function sendPush(db, { targetIds, title, body, url, topic }) {
    try {
      if (!targetIds || targetIds.length === 0) return;
      const keys = await fetchKeys(db);
      const absoluteUrl = url ? new URL(url, location.href).href : undefined;

      const res = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Key ${keys.restApiKey}`
        },
        body: JSON.stringify({
          app_id: keys.appId,
          target_channel: "push",
          include_aliases: { external_id: targetIds },
          headings: { en: title, ja: title },
          contents: { en: body, ja: body },
          web_push_topic: topic || "default",
          url: absoluteUrl
        })
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("通知送信に失敗しました:", res.status, text);
      }
    } catch (error) {
      console.warn("通知送信に失敗しました:", error);
    }
  }

  // ★ 送信対象を決めるための補助関数。身内だけの小規模サイトなので、全ユーザーを取得して
  //   送信者本人を除外する、という単純な方式で十分
  async function getAllOtherUserIds(db, excludeUserId) {
    try {
      const snap = await db.collection("users_random").get();
      const ids = [];
      snap.forEach(doc => {
        if (doc.id !== excludeUserId) ids.push(doc.id);
      });
      return ids;
    } catch (error) {
      console.warn("通知対象ユーザーの取得に失敗しました:", error);
      return [];
    }
  }

  return { initPush, setupPushButton, logoutPush, isPushEnabled, sendPush, getAllOtherUserIds };
})();
