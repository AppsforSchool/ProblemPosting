// ★ Firebase（モジュラーSDK）の初期化と、各ファイルで使う関数の共通窓口。【問題投稿サイト版】
//   バージョンを変えるときは、このファイル内の gstatic のURL（12.14.0）をすべて書き換える（各ページ側は触らなくてよい）。
//   各HTMLの <head> にあった compat 版の <script> は不要になった。
//
//   ★★ 共通部分（firebaseConfig の apiKey、Authの初期化＝initializeAuth の persistence、SDKのバージョン）は、
//      同じオリジン(appsforschool.github.io)で動く「チャットアプリ」と一字一句同じにすること。
//      将来変更するときは、必ず全サイト同時に変更する（1つでも古いサイトが残ると、それを開くたびに全サイトがログアウトになる）。
//      このサイト固有なのは、appId（ログイン情報の保存キーには影響しない）と、Realtime Database まわりだけ。
import { perfSample } from "./perf.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  initializeAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getDocFromServer,
  getDocsFromServer,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  increment,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  getCountFromServer,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  Timestamp,
  documentId
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

import {
  getDatabase,
  ref as rtdbRef,
  get as rtdbGet,
  set as rtdbSet,
  update as rtdbUpdate,
  push as rtdbPush,
  remove as rtdbRemove,
  onValue,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  serverTimestamp as rtdbServerTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAqIiNj0N4WruPSOkWbeo5gxzsNyeMkuLo",
  authDomain: "appsforschool-study.firebaseapp.com",
  projectId: "appsforschool-study",
  storageBucket: "appsforschool-study.firebasestorage.app",
  messagingSenderId: "740735293440",
  appId: "1:740735293440:web:a1363adbab57f1ceec60e5"
};

// ★ アプリ名は付けない（既定の "[DEFAULT]"）。
//   ログイン情報の保存キーは "firebase:authUser:<APIキー>:[DEFAULT]" になり、同じ appsforschool.github.io の下にある
//   すべてのサイト（チャット・問題投稿など）で同じキーを使う ＝ どれか1つのサイトでログインすれば、全サイトでログイン状態になる。
//   ★★ ただし、これは「全サイトの Auth の初期化設定（保存先の候補）が同じ」であることが前提。
//      1つでも違う設定（getAuth() の既定＝IndexedDB優先、など）のサイトがあると、そのサイトを開いた瞬間に、
//      localStorage のログイン情報を別の保存先へ「移し替えて localStorage から削除」するため、他のサイトがログアウトになる。
//      Auth の初期化部分（下の initializeAuth）は、全サイトで一字一句同じにすること。変更するときも全サイト同時に。
export const app = initializeApp(firebaseConfig);
// ★ Auth は getAuth() ではなく initializeAuth() で初期化する。
//   getAuth() は、Googleログインのポップアップ/リダイレクト用に外部のiframe（apis.google.com・firebaseapp.com/__/auth/iframe）を
//   起動時に読み込む。このアプリはID+パスワードのログインしか使わないので不要で、ブラウザの設定や拡張機能で
//   これがブロックされると「ログイン状態の確定」が進まなくなることがあるため、外している。
//
// ★ ログイン情報の保存先は、全ブラウザで localStorage にする。
//   Safari（iPhone/iPad/Mac）では、IndexedDBの最初のアクセスが約10秒止まることがあり（計測：ログイン状態の確定に9.99秒、
//   外部通信が始まる前の約9.4秒が空白）、その間ずっと読み込み画面のままになる。
//   Firebase Authは、保存先の候補にIndexedDBが入っているだけで、既存のログイン情報を探すために必ずそこを読みに行くので、
//   候補からIndexedDBを外し、即座に読める localStorage を使う。
//   localStorageが使えない環境では、sessionStorage（タブを閉じるまで）→ メモリ（ページを閉じるまで）の順に代替する。
//   ※ 以前のIndexedDBに残っているログイン情報は読まないため、切り替え後に1回だけ、ログインし直しが必要。
//   ※ ログアウトすると、全サイトで同時にログアウトになる（保存キーを共有しているため。仕様）。
//   以前あった ?auth=idb での切り替えは廃止した（全サイトで保存先を揃えないと、他のサイトのログインを壊すため）。
export const authStorageMode = "local";

// ★ 診断用：「しばらくしてから開くと再ログインになる」原因を切り分けるための記録。
//   起動した時点で localStorage にログイン情報が残っていたか、その有効期限、その後 Auth がログイン状態をどう判断したかを、
//   端末の localStorage（キー authDebugLog、直近30件）に残す。
//     ・起動時に情報が「なし」 → 保存領域のほうが消えている（ブラウザのデータ削除、Safariの自動削除、別のアプリ内ブラウザ/ホーム画面アイコン経由、等）
//     ・起動時に情報が「あり」なのに結果が「ログアウト」 → SDKが更新に失敗してログイン情報を破棄した（トークンの更新エラー、アカウント側の問題、等）
//   確認方法：どのページでも、URLの末尾に ?authdebug=1 を付けて開くと、記録が表示される（ログアウト状態の index.html でも可）。
const AUTH_STORAGE_KEY = `firebase:authUser:${firebaseConfig.apiKey}:[DEFAULT]`;
const AUTH_DEBUG_LOG_KEY = "authDebugLog";

function appendAuthDebug(entry) {
  try {
    const log = JSON.parse(localStorage.getItem(AUTH_DEBUG_LOG_KEY) || "[]");
    log.push({ at: new Date().toISOString(), page: location.pathname.split("/").pop() || "/", ...entry });
    localStorage.setItem(AUTH_DEBUG_LOG_KEY, JSON.stringify(log.slice(-30)));
  } catch (e) { /* 診断用なので失敗しても何もしない */ }
}

function readStoredAuthInfo() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw === null) return { stored: false };
    const user = JSON.parse(raw);
    const tm = user.stsTokenManager || {};
    return {
      stored: true,
      hasRefreshToken: !!tm.refreshToken,
      tokenExpiresAt: tm.expirationTime ? new Date(Number(tm.expirationTime)).toISOString() : null,
      lastLoginAt: user.lastLoginAt ? new Date(Number(user.lastLoginAt)).toISOString() : null
    };
  } catch (e) {
    return { stored: null, error: String(e && e.message || e) }; // localStorageが読めない
  }
}
function listFirebaseKeys() {
  try { return Object.keys(localStorage).filter((k) => k.startsWith("firebase:")).map((k) => k.replace(/^firebase:authUser:[^:]+:/, "authUser:")); }
  catch (e) { return null; }
}
appendAuthDebug({ event: "起動時", mode: authStorageMode, usingKey: AUTH_STORAGE_KEY.replace(/^firebase:authUser:[^:]+:/, "authUser:"), firebaseKeysInLocalStorage: listFirebaseKeys(), ...(authStorageMode === "local" ? readStoredAuthInfo() : { stored: "（IndexedDBモードのため未確認）" }) }); // ★ initializeAuthより前に記録する（SDKが書き換える前の状態）

export const auth = initializeAuth(app, {
  persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]
});

onAuthStateChanged(auth, (user) => {
  appendAuthDebug({ event: "Auth判定", mode: authStorageMode, loggedIn: !!user });
  if (user) {
    // ログイン済みのとき、情報が実際にどの保存先に書かれたか（localStorage / sessionStorage）を少し後で確認する。
    // localStorageに無くsessionStorageにある場合は、localStorageが使えず、タブを閉じると消える状態になっている。
    setTimeout(() => {
      try {
        appendAuthDebug({
          event: "保存先の確認",
          inLocalStorage: localStorage.getItem(AUTH_STORAGE_KEY) !== null,
          inSessionStorage: sessionStorage.getItem(AUTH_STORAGE_KEY) !== null
        });
      } catch (e) { appendAuthDebug({ event: "保存先の確認", error: String(e && e.message || e) }); }
    }, 1500);
  }
});

// ★ このページを開いたまま、他のページ（別タブ・別サイト）が localStorage を変更したら記録する。
//   ・key が null のとき ＝ 他のページが localStorage.clear() を呼んだ（保存内容がすべて消える）
//   ・Firebase のログイン情報のキーが変更/削除されたとき ＝ どのキーで、どのページ(url)からかを記録する
//   （値そのものは記録しない）
window.addEventListener("storage", (e) => {
  if (e.storageArea !== localStorage) return;
  if (e.key === null) {
    appendAuthDebug({ event: "他のページが localStorage.clear() を実行した", fromUrl: e.url || "" });
  } else if (e.key.startsWith("firebase:")) {
    appendAuthDebug({
      event: e.newValue === null ? "他のページがFirebaseのキーを削除した" : "他のページがFirebaseのキーを書き換えた",
      key: e.key.replace(/^firebase:authUser:[^:]+:/, "authUser:"),
      isOurKey: e.key === AUTH_STORAGE_KEY,
      fromUrl: e.url || ""
    });
  }
});

try {
  if (new URLSearchParams(location.search).get("authdebug")) {
    window.addEventListener("load", () => setTimeout(() => {
      const log = JSON.parse(localStorage.getItem(AUTH_DEBUG_LOG_KEY) || "[]");
      alert("【ログイン状態の記録（新しい順）】\n" + log.slice().reverse().map((e) => JSON.stringify(e)).join("\n"));
    }, 1500));
  }
} catch (e) { /* 無視 */ }

// ★ Firestoreの通信方式。学校などのネットワークでは、通常の方式（WebChannel）の読み取りだけが
//   数十秒止まることがあったため、既定を「ロングポーリング」にしている。
//   切り替え（A/B比較用）：URLに ?fs=long / ?fs=auto / ?fs=default を付けて開くと、その設定が端末に保存される。
//     long    … 常にロングポーリング（既定）
//     auto    … 通常方式で接続できなければ自動でロングポーリングに切り替える
//     default … SDKの標準（以前と同じ）
function pickTransport() {
  let mode = "long";
  try {
    const fromUrl = new URLSearchParams(location.search).get("fs");
    if (fromUrl === "long" || fromUrl === "auto" || fromUrl === "default") {
      localStorage.setItem("fsTransport", fromUrl);
    }
    const saved = localStorage.getItem("fsTransport");
    if (saved === "long" || saved === "auto" || saved === "default") mode = saved;
  } catch (e) { /* localStorageが使えなければ既定値 */ }
  return mode;
}
export const firestoreTransport = pickTransport();

const firestoreSettings = {};
if (firestoreTransport === "long") firestoreSettings.experimentalForceLongPolling = true;
if (firestoreTransport === "auto") firestoreSettings.experimentalAutoDetectLongPolling = true;

// ★ 永続キャッシュ（IndexedDB）は、既定ではオフ。
//   オンにすると、ページ遷移（一覧 → トーク）のたびに「複数タブ間のIndexedDBの引き継ぎ」が入り、
//   スマホ（特にiOS）で読み込みが止まる例があるため。試したいときは URLに ?cache=on（戻すときは ?cache=off）。
function pickCacheMode() {
  let mode = "off";
  try {
    const fromUrl = new URLSearchParams(location.search).get("cache");
    if (fromUrl === "on" || fromUrl === "off") localStorage.setItem("fsCache", fromUrl);
    const saved = localStorage.getItem("fsCache");
    if (saved === "on" || saved === "off") mode = saved;
  } catch (e) { /* 既定値のまま */ }
  return mode;
}
export const firestoreCacheMode = pickCacheMode();

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, firestoreCacheMode === "on"
    ? { ...firestoreSettings, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
    : firestoreSettings);
} catch (e) {
  console.warn("Firestoreの初期化設定に失敗しました:", e);
  firestoreInstance = getFirestore(app);
}
export const db = firestoreInstance;

export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, deleteField, increment,
  query, where, orderBy, onSnapshot, writeBatch, getCountFromServer,
  serverTimestamp, arrayUnion, arrayRemove, Timestamp, documentId,
  getDocFromServer, getDocsFromServer
};

// ★ Realtime Database（「みんなで解く」のライブ進行で使う）。このサイト固有の部分。
//   名前の衝突を避けるため、Firestoreと同名の関数(ref/get/set/update/push/remove/serverTimestamp)は rtdb〜 の別名で渡す。
export const rtdb = getDatabase(app, "https://appsforschool-study-default-rtdb.asia-southeast1.firebasedatabase.app");
export {
  rtdbRef, rtdbGet, rtdbSet, rtdbUpdate, rtdbPush, rtdbRemove,
  onValue, onChildAdded, onChildChanged, onChildRemoved, rtdbServerTimestamp
};

// ★ 読み取りが「返ってこない」ときの再送。
//   計測で、読み取りが1本だけ約30秒止まる（同じ時間に出した別の読み取りは0.1秒で返る）ことがあったため、
//   hedgeMs 待っても結果が来なければ、同じ読み取りをもう1本出し直し、先に返ったほうを使う
//   （最初の1本は止めずに残す。最大 maxAttempts 本）。すべて失敗したときだけエラーにする。
//   使い方：  await hedged(() => getDoc(doc(db, "a", "b")))
export function hedged(fn, { hedgeMs = 4000, maxAttempts = 3 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let attempts = 0;
    let failures = 0;
    let timer = null;

    const launch = () => {
      attempts++;
      if (attempts > 1) perfSample("読み取りの再送（待っても返らず出し直した回数）", hedgeMs);
      Promise.resolve().then(fn).then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          failures++;
          if (settled) return;
          if (failures >= attempts) { // 動いているものが無くなった
            clearTimeout(timer);
            if (attempts >= maxAttempts) { settled = true; reject(error); }
            else launch();
          }
        }
      );
      if (attempts < maxAttempts) {
        clearTimeout(timer);
        timer = setTimeout(() => { if (!settled) launch(); }, hedgeMs);
      }
    };
    launch();
  });
}
