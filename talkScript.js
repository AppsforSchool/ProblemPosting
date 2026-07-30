const firebaseConfig = {
  apiKey: "AIzaSyAqIiNj0N4WruPSOkWbeo5gxzsNyeMkuLo",
  authDomain: "appsforschool-study.firebaseapp.com",
  projectId: "appsforschool-study",
  storageBucket: "appsforschool-study.firebasestorage.app",
  messagingSenderId: "740735293440",
  appId: "1:740735293440:web:982702b6d53aaa18ec60e5"
};

// Firebase 初期化とサービス取得
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let myUserId = "";
let myUid = "";
let meIsAdmin = false;

let talkId;

// キャッシュ用オブジェクト
// ★ ユーザーデータの統一キャッシュ（name / isAdmin / imageUrl / profileText をまとめて保持）
let userDataCache = {};
function getUserCache(userId) {
  return userDataCache[userId] || null;
}
function setUserCache(userId, data) {
  userDataCache[userId] = Object.assign({}, userDataCache[userId] || {}, data);
  return userDataCache[userId];
}
let userLastCheckedCache = {}; // ★ 最終確認日時用のキャッシュを追加
let currentRoomMembers = [];   // ★ 現在のルームのメンバーIDリストを保持する変数を追加

// ★ 返信機能用の状態
let replyToId = null;               // 返信先メッセージのドキュメントID
let replyPreviewBar;
let replyPreviewText;
let replyPreviewCancel;
let backToOriginalButton;
let scrollBeforeJump = null;        // ジャンプ前のスクロール位置を一時保存

// onSnapshotのリスナー解除用
let memberSubscribers = [];

let loadingOverlay;
let noActiveOverlay;
let drawerOverlay;
let accountSettingsDrawer;
let drawerCloseButton;
let accountSettingsButton;
let drawerUserId;
let drawerLogoutButton;
let drawerUsername;
let drawerEditProfileButton; // ドロワーの「プロフィールを編集」ボタン

// ★ アバターの頭文字を安全に取り出すヘルパー
function getInitial(name) {
  if (!name) return "?";
  return Array.from(name.trim())[0] || "?";
}

// ★ 頭文字アバター、または画像アバターを生成するヘルパー（size: "small" | "large" | 省略で通常サイズ）
function createAvatar(name, size, imageUrl) {
  if (imageUrl) {
    const img = document.createElement("img");
    img.classList.add("avatar-circle");
    if (size === "small") img.classList.add("small");
    if (size === "large") img.classList.add("large");
    img.src = imageUrl;
    img.alt = name || "";
    return img;
  }
  const avatar = document.createElement("div");
  avatar.classList.add("avatar-circle");
  if (size === "small") avatar.classList.add("small");
  if (size === "large") avatar.classList.add("large");
  avatar.textContent = getInitial(name);
  return avatar;
}

// ★ スマホでヘッダー分の高さを避けて #head-area を固定表示するため、
//   ヘッダーの実測高さを CSS 変数 --header-height に反映する
function updateHeaderHeightVar() {
  const header = document.getElementById("app-header");
  if (header) {
    document.documentElement.style.setProperty("--header-height", header.offsetHeight + "px");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  replyPreviewBar = document.getElementById("reply-preview-bar");
  replyPreviewText = document.getElementById("reply-preview-text");
  replyPreviewCancel = document.getElementById("reply-preview-cancel");
  backToOriginalButton = document.getElementById("back-to-original-button");

  replyPreviewCancel.addEventListener("click", cancelReply);
  backToOriginalButton.addEventListener("click", () => {
    const talkArea = document.getElementById("talk-area");
    if (scrollBeforeJump !== null) {
      talkArea.scrollTop = scrollBeforeJump;
    }
    scrollBeforeJump = null;
    backToOriginalButton.classList.add("hidden");
  });
});

// ★ 返信対象をセットし、メッセージ入力欄の上に「〇〇に返信」を表示する
function startReply(docId, userName) {
  replyToId = docId;
  replyPreviewText.textContent = `${userName}に返信`;
  replyPreviewBar.classList.remove("hidden");
  if (messageInput) messageInput.focus();
}

// ★ 返信状態を解除する
function cancelReply() {
  replyToId = null;
  replyPreviewBar.classList.add("hidden");
}

// ★ 引用元メッセージのテキストからタグを除いたプレーンテキストを取り出す
function stripTagsToPlainText(htmlString) {
  const doc = new DOMParser().parseFromString(htmlString, "text/html");
  return (doc.body.textContent || "").trim();
}

// ★ メッセージ本文の上に表示する「返信元プレビュー」の1行ブロックを組み立てる
function buildReplyQuote(replyTargetId, messagesById) {
  const quote = document.createElement("div");
  quote.classList.add("reply-quote");

  const target = messagesById[replyTargetId];
  if (!target) {
    quote.classList.add("reply-quote-missing");
    const textSpan = document.createElement("span");
    textSpan.classList.add("reply-quote-text");
    textSpan.textContent = "元のメッセージは見つかりません";
    quote.appendChild(textSpan);
    return quote;
  }

  const cached = getUserCache(target.userId) || {};
  const targetName = cached.name || "不明なユーザー";

  let snippetText = "";
  if (target.message && target.message.trim() !== "") {
    snippetText = stripTagsToPlainText(target.message);
  } else if (target.imageUrl) {
    snippetText = "[画像]";
  } else if (Array.isArray(target.choices) && target.choices.length > 0) {
    snippetText = `[アンケート] ${target.message || ""}`;
  }

  const nameSpan = document.createElement("span");
  nameSpan.classList.add("reply-quote-user");
  nameSpan.textContent = targetName;

  const textSpan = document.createElement("span");
  textSpan.classList.add("reply-quote-text");
  textSpan.textContent = snippetText;

  quote.appendChild(nameSpan);
  quote.appendChild(textSpan);

  quote.addEventListener("click", () => {
    jumpToMessage(replyTargetId);
  });

  return quote;
}

// ★ 指定したメッセージまでスクロールしてジャンプし、「元のメッセージにもどる」ボタンを表示する
function jumpToMessage(targetId) {
  const targetEl = document.getElementById("msg-" + targetId);
  if (!targetEl) return;

  const talkArea = document.getElementById("talk-area");
  if (scrollBeforeJump === null && talkArea) {
    scrollBeforeJump = talkArea.scrollTop;
  }

  targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
  targetEl.classList.add("jump-highlight");
  setTimeout(() => targetEl.classList.remove("jump-highlight"), 1400);

  if (backToOriginalButton) backToOriginalButton.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  updateHeaderHeightVar();
  window.addEventListener("resize", updateHeaderHeightVar);

  const header = document.getElementById("app-header");
  if (header && window.ResizeObserver) {
    const headerResizeObserver = new ResizeObserver(() => updateHeaderHeightVar());
    headerResizeObserver.observe(header);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  noActiveOverlay = document.getElementById("no-active-overlay");
  
  drawerOverlay = document.getElementById("drawerOverlay");
  accountSettingsDrawer = document.getElementById("accountSettingsDrawer");
  drawerCloseButton = document.getElementById("drawerCloseButton");
  accountSettingsButton = document.getElementById("setting-button");

  drawerUserId = document.getElementById("drawerUserId");
  drawerLogoutButton = document.getElementById("logout-button");
  drawerUsername = document.getElementById("drawerUsername");
  drawerEditProfileButton = document.getElementById("drawer-edit-profile-button");

  accountSettingsButton.addEventListener("click", openDrawer);
  drawerCloseButton.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);
  drawerLogoutButton.addEventListener("click", handleLogout);

  // ドロワー内の「プロフィールを編集」ボタン
  drawerEditProfileButton.addEventListener("click", () => {
    closeDrawer();
    openProfileModal(myUserId, true); // 自分のプロフィールを編集モードONで開く
  });
});

function openDrawer() {
  accountSettingsDrawer.classList.add("is-open");
  drawerOverlay.classList.add("is-open");
}
function closeDrawer() {
  accountSettingsDrawer.classList.remove("is-open");
  drawerOverlay.classList.remove("is-open");
}

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    try {
      if (user) {
        myUserId = user.email.split("@")[0];
        drawerUserId.textContent = myUserId;

        const userSnapshot = await db
          .collection("users_random")
          .doc(myUserId)
          .get();
        const userData = userSnapshot.data();

        if (userData.isActive) {
          drawerUsername.textContent = userData.name;
          meIsAdmin = userData.isAdmin;
          if (meIsAdmin) drawerUsername.classList.add("admin");
          myUid = userData.uid;

          setUserCache(myUserId, {
            name: userData.name,
            isAdmin: userData.isAdmin,
            imageUrl: userData.imageUrl || "",
            profileText: userData.profileText || ""
          });

          talkId = getParmFromUrl("id");
          // ★ メンバーのリアルタイム監視・キャッシュ化を開始
          await setupMemberSnapshots(talkId);

          getAllTalkData(talkId);
          
          loadingOverlay.classList.add("hidden");
      } else {
        loadingOverlay.classList.add("hidden");
        noActiveOverlay.classList.remove("hidden");
        // window.location.href = "404.html";
      }
        
        
      } else {
        console.log("logout");
        // ログアウト時にリスナーをすべて解除
        memberSubscribers.forEach(unsub => unsub());
        memberSubscribers = [];
        window.location.href = "./index.html";
      }
    } catch (error) {
      console.log(error);
      alert(error);
    }
  });
});

// ★ ルームメンバーの情報を裏側でリアルタイムに監視してキャッシュを更新する関数
async function setupMemberSnapshots(talkId) {
  try {
    const roomSnapshot = await db.collection("KokoKengaku").doc(talkId).get();
    if (!roomSnapshot.exists) return;

    const roomData = roomSnapshot.data();
    const memberUserIds = roomData.members || [];
    currentRoomMembers = memberUserIds; // ★ ルームに所属するメンバーID一覧を保持

    // 既存のリスナーがあれば念のため解除
    memberSubscribers.forEach(unsub => unsub());
    memberSubscribers = [];

    // 各メンバーのドキュメントに onSnapshot を設定
    memberUserIds.forEach((userId) => {
      const unsub = db.collection("users_random").doc(userId).onSnapshot((doc) => {
        if (doc.exists) {
          const userData = doc.data();
          
          // 各種キャッシュを最新状態に更新
          setUserCache(userId, {
            name: userData.name || "名前未設定",
            isAdmin: userData.isAdmin || false,
            imageUrl: userData.imageUrl || "",
            profileText: userData.profileText || ""
          });
          
          if (!userLastCheckedCache[userId]) {
            userLastCheckedCache[userId] = {};
          }
          
          if (userData.lastChecked && userData.lastChecked[talkId]) {
            const dateObject = userData.lastChecked[talkId].toDate();
            userLastCheckedCache[userId][talkId] = formatDateTime(dateObject);
          } else {
            userLastCheckedCache[userId][talkId] = "";
          }

          // もしメンバーモーダルが現在開いている状態なら、UIを自動で再描画する
          const memberModal = document.getElementById("member-modal");
          if (memberModal && !memberModal.classList.contains("hidden")) {
            getMember(talkId);
          }
        }
      });
      memberSubscribers.push(unsub);
    });
  } catch (error) {
    console.error("メンバーの監視設定に失敗しました:", error);
  }
}

const handleLogout = async () => {
  const isConfirmed = confirm("ログアウトしますか？");
  if (isConfirmed) {
    try {
      await auth.signOut(auth);
      console.log("ログアウトしました！");
      alert("ログアウトしました。");
    } catch (error) {
      console.error("ログアウトエラー:", error);
      alert("ログアウトに失敗しました。");
    }
  }
};

async function getAllTalkData(talkId) {
  const talkTitle = document.getElementById("talk-title");
  const talkArea = document.getElementById("talk-area");

  try {
    const roomSnapshot = await db.collection("KokoKengaku").doc(talkId).get();
    const roomData = roomSnapshot.data();
    talkTitle.textContent = roomData.title;

    db.collection("users_random").doc(myUserId).update({
      [`unreadCounts.${talkId}`]: 0
    }).catch(err => console.error("未読リセットエラー:", err));
    

    db.collection("KokoKengaku")
      .doc(talkId)
      .collection("talk")
      .orderBy("time", "asc")
      .onSnapshot(async (messageSnapshot) => {
        const newTalk = document.createElement("div");
        const loadingText = document.createElement("p");
        loadingText.textContent = "loading...";
        talkArea.innerHTML = "";
        talkArea.appendChild(loadingText);
        newTalk.innerHTML = "";

        // ★ 返信元メッセージを引くためのマップ（同じスナップショット内の全メッセージ）
        const messagesById = {};
        messageSnapshot.docs.forEach((doc) => {
          messagesById[doc.id] = doc.data();
        });

        for (const talkDoc of messageSnapshot.docs) {
          const messageData = talkDoc.data();
          const message = document.createElement("div");
          message.id = "msg-" + talkDoc.id; // ★ 返信ジャンプ先として参照するためのID
          message.classList.add("message");

          const messageUserId = messageData.userId;
          const isOwnMessage = messageUserId === myUserId;
          message.classList.add(isOwnMessage ? "message-own" : "message-other");

          const messageUser = document.createElement("p");
          let senderName = "不明なユーザー";
          let isAdmin = false;
          let senderImageUrl = "";

          if (messageUserId) {
            if (!getUserCache(messageUserId)) {
              const userSnapshot = await db.collection("users_random").doc(messageUserId).get();
            
              if (userSnapshot.exists) {
                const userData = userSnapshot.data();
                setUserCache(messageUserId, {
                  name: userData.name || "名前未設定",
                  isAdmin: userData.isAdmin || false,
                  imageUrl: userData.imageUrl || "",
                  profileText: userData.profileText || ""
                });
              } else {
                setUserCache(messageUserId, { name: "不明なユーザー", isAdmin: false, imageUrl: "", profileText: "" });
              }
            }
            const cached = getUserCache(messageUserId);
            senderName = cached.name;
            isAdmin = cached.isAdmin;
            senderImageUrl = cached.imageUrl;
          }

          let displayTime = "時間不明";
          if (messageData.time) {
            const dateObject = messageData.time.toDate();
            displayTime = formatDateTime(dateObject);
          }

          const readByList = messageData.readBy || [];
          if (messageData.userId !== myUserId && !readByList.includes(myUserId)) {
            db.collection("KokoKengaku")
              .doc(talkId)
              .collection("talk")
              .doc(talkDoc.id)
              .update({
                readBy: firebase.firestore.FieldValue.arrayUnion(myUserId)
              })
              .catch(err => console.error("既読更新エラー:", err));
          }
          
          let displayReadCount = readByList.length;
          const readSpan = document.createElement("span");
          readSpan.textContent = `既読:${displayReadCount}人`;
          readSpan.style.textDecoration = 'underline';
          readSpan.style.cursor = 'pointer';
          readSpan.addEventListener("click", () => {
            openReadByModal(readByList);
          });

          const senderNameSpan = document.createElement("span");
          senderNameSpan.textContent = `${senderName} `;
          senderNameSpan.classList.add("clickable-user");
          senderNameSpan.addEventListener("click", () => {
            openProfileModal(messageUserId);
          });
          
          const displayTimeSpan = document.createElement("span");
          displayTimeSpan.textContent = `${displayTime} `;
          messageUser.classList.add("message-user");
          if (isAdmin) {
            senderNameSpan.classList.add("admin");
          }
          const editSpan = document.createElement("span");
          editSpan.textContent = `編集`;
          editSpan.style.textDecoration = 'underline';
          editSpan.style.cursor = 'pointer';
          editSpan.addEventListener("click", () => {
            openEditModal(talkDoc.id, messageData.userId, messageData.message);
          });

          // ★ 自分の発言では吹き出しの上に自分の名前を出さない（相手の発言のみ表示）
          if (!isOwnMessage) {
            messageUser.appendChild(senderNameSpan);
          }
          messageUser.appendChild(displayTimeSpan);
          messageUser.appendChild(readSpan);
          if (meIsAdmin || messageData.userId === myUserId) {
            messageUser.appendChild(document.createTextNode(" "));
            messageUser.appendChild(editSpan);
          }

          // ★ アバター + 本文をまとめた行を組み立て（自分は右寄せ、相手は左寄せ＋アバター表示）
          const bubbleCol = document.createElement("div");
          bubbleCol.classList.add("bubble-col");
          bubbleCol.appendChild(messageUser);

          const hasText = messageData.message && messageData.message.trim() !== "";

          // ★ 返信先がある場合の元メッセージプレビュー（未使用ならあとで単独表示にフォールバック）
          let replyQuoteEl = messageData.replyTo
            ? buildReplyQuote(messageData.replyTo, messagesById)
            : null;

          // ★ 画像は吹き出しの外に、その下にテキストがあれば吹き出しで表示する
          if (messageData.imageUrl) {
            // テキストが無い画像単独メッセージの場合は、画像の直上に返信プレビューを単独表示
            if (replyQuoteEl && !hasText) {
              bubbleCol.appendChild(replyQuoteEl);
              replyQuoteEl = null;
            }

            const img = document.createElement("img");
            img.src = messageData.imageUrl;
            img.alt = "送信された画像";
            img.classList.add("message-image");

            img.addEventListener("load", () => {
              // 実際の画像の縦横比に書き換える（アスペクト比が変わるので、必要に応じて箱は縮む）
              img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
              img.classList.add("loaded");
            });

            bubbleCol.appendChild(img);
          }

          // ★ テキスト本文＋返信矢印を横並びにし、本文がある場合は返信プレビューを吹き出しに直結して表示する
          let bubbleContentRow = null;
          if (hasText) {
            const messageText = document.createElement("p");
            messageText.classList.add("message-text");
            const safeContent = sanitizeHtmlToOnlyLinks(messageData.message);
            messageText.appendChild(safeContent);

            let bubbleBlock = messageText;
            if (replyQuoteEl) {
              // 返信プレビューを吹き出しの上部に直結させ、1つの吹き出しのように見せる
              replyQuoteEl.classList.add("attached");
              messageText.classList.add("attached-below");
              const bubbleGroup = document.createElement("div");
              bubbleGroup.classList.add("bubble-group");
              bubbleGroup.appendChild(replyQuoteEl);
              bubbleGroup.appendChild(messageText);
              bubbleBlock = bubbleGroup;
              replyQuoteEl = null;
            }

            // ★ 吹き出しのすぐ横に返信矢印を配置する
            bubbleContentRow = document.createElement("div");
            bubbleContentRow.classList.add("bubble-content-row");
            bubbleContentRow.appendChild(bubbleBlock);

            const replyIcon = document.createElement("span");
            replyIcon.textContent = "↩︎";
            replyIcon.classList.add("reply-action");
            replyIcon.title = "返信";
            replyIcon.addEventListener("click", () => {
              startReply(talkDoc.id, senderName);
            });
            bubbleContentRow.appendChild(replyIcon);

            bubbleCol.appendChild(bubbleContentRow);
          }

          // ★ アンケートがあれば、テキストの下にアンケートウィジェットを表示する
          if (Array.isArray(messageData.choices) && messageData.choices.length > 0) {
            // テキストが無いアンケート単独メッセージの場合は、返信プレビューを単独表示
            if (replyQuoteEl) {
              bubbleCol.appendChild(replyQuoteEl);
              replyQuoteEl = null;
            }
            const pollWidget = buildPollWidget(talkDoc.id, messageData.choices, messageData.answer || {});
            bubbleCol.appendChild(pollWidget);
          }

          // ★ 画像・テキスト・アンケートのいずれも無いメッセージへの返信プレビュー救済（通常は発生しない）
          if (replyQuoteEl) {
            bubbleCol.appendChild(replyQuoteEl);
            replyQuoteEl = null;
          }

          // ★ テキストが無いメッセージ（画像単独・アンケート単独）にも返信矢印を出す
          if (!hasText) {
            const standaloneRow = document.createElement("div");
            standaloneRow.classList.add("bubble-content-row", "standalone-reply-row");

            const replyIcon = document.createElement("span");
            replyIcon.textContent = "↩︎";
            replyIcon.classList.add("reply-action");
            replyIcon.title = "返信";
            replyIcon.addEventListener("click", () => {
              startReply(talkDoc.id, senderName);
            });
            standaloneRow.appendChild(replyIcon);
            bubbleCol.appendChild(standaloneRow);
          }

          const messageRow = document.createElement("div");
          messageRow.classList.add("message-row");
          if (!isOwnMessage) {
            const rowAvatar = createAvatar(senderName, undefined, senderImageUrl);
            rowAvatar.classList.add("clickable-user");
            rowAvatar.addEventListener("click", () => {
              openProfileModal(messageUserId);
            });
            messageRow.appendChild(rowAvatar);
          }
          messageRow.appendChild(bubbleCol);

          message.appendChild(messageRow);

          newTalk.appendChild(message);
        }
        talkArea.innerHTML = "";
        talkArea.appendChild(newTalk);
        talkArea.scrollTop = talkArea.scrollHeight;

        updateLastCheckedTime(talkId, myUserId);
      });
    
  } catch (error) {
    console.error("データ取得エラー:", error);
    alert(error);
  }
}

function sanitizeHtmlToOnlyLinks(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const box = document.createDocumentFragment();

  // 再帰的にノードを処理するヘルパー関数
  function processNode(node) {
    // 1. テキストノードの場合：そのままテキストノードを返す
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent);
    }

    // 要素ノード（ELEMENT_NODE）の処理
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toUpperCase();
      let resultElement = null;

      // 各タグに応じた要素の生成
      if (tagName === 'A') {
        resultElement = document.createElement('a');
        const rawHref = node.getAttribute('href') || '#';
        resultElement.setAttribute('href', rawHref);
        resultElement.setAttribute('target', '_blank');
        resultElement.setAttribute('rel', 'noopener noreferrer');
        resultElement.classList.add('chat-link');
      } 
      else if (tagName === 'UNDERLINE') {
        resultElement = document.createElement('span');
        resultElement.classList.add('underline');
      } 
      else if (tagName === 'LARGE') {
        resultElement = document.createElement('span');
        resultElement.classList.add('large');
      } 
      else if (tagName === 'MAINCOLOR') {
        resultElement = document.createElement('span');
        resultElement.classList.add('main-color');
      }
      else if (tagName === 'SMALL') {
        resultElement = document.createElement('span');
        resultElement.classList.add('small');
      }
      else if (tagName === 'EMOJI') {
        resultElement = document.createElement('span');
        resultElement.classList.add('emoji');
      }

      if (resultElement) {
        // 許可されたタグの場合：子ノードを再帰的に処理して自身に追加する
        node.childNodes.forEach(child => {
          const processedChild = processNode(child);
          if (processedChild) {
            resultElement.appendChild(processedChild);
          }
        });
        return resultElement;
      } else {
        // 許可されていない未知のタグ（例: <div>, <p> など）の場合：
        // タグ自体は無視し、中身の子ノード（テキストや許可タグ）だけを平坦化して返す
        const fragment = document.createDocumentFragment();
        node.childNodes.forEach(child => {
          const processedChild = processNode(child);
          if (processedChild) {
            fragment.appendChild(processedChild);
          }
        });
        return fragment;
      }
    }

    return null;
  }

  // ルート直下の子ノードを順次処理して documentFragment に追加
  Array.from(doc.body.childNodes).forEach(node => {
    const processed = processNode(node);
    if (processed) {
      box.appendChild(processed);
    }
  });

  return box;
}


function getParmFromUrl(parm) {
  const params = new URLSearchParams(window.location.search);
  return params.get(parm);
}

function formatDateTime(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

// ★ ImgBBへの画像アップロード共通処理（チャット画像・プロフィールアイコン共通で使用）
let imgbbApiKeyCache = null;
async function uploadImageToImgbb(file) {
  if (!imgbbApiKeyCache) {
    const keyDoc = await db.collection("system_keys").doc("imgbb").get();
    if (!keyDoc.exists) {
      throw new Error("APIキーの設定が見つかりません。セキュリティルールかドキュメントを確認してください。");
    }
    imgbbApiKeyCache = keyDoc.data().apiKey;
  }

  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKeyCache}`, {
    method: "POST",
    body: formData
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error("ImgBBのアップロード処理に失敗しました。");
  }
  return result.data.url;
}

let messageInput;
let messageAddButton;
document.addEventListener("DOMContentLoaded", () => {
  messageInput = document.getElementById("message-input");
  messageAddButton = document.getElementById("message-add-button");
  
  messageInput.addEventListener("input", () => {
    updateMessageAddButtonState();
  });
  
  messageAddButton.addEventListener("click", async () => {
    const talkId = getParmFromUrl("id");
    await addMessage(talkId);
  });
});

function updateMessageAddButtonState() {
  const hasMessage = messageInput && messageInput.value.trim() !== "";
  messageAddButton.disabled = !hasMessage;
}

async function addMessage(talkId) {
  const message = messageInput.value.trim();
  messageAddButton.disabled = true;
  messageAddButton.textContent = "送信中...";
  const user = auth.currentUser;
  const myUserId = user.email.split("@")[0];
  const replyToSnapshot = replyToId; // ★ 送信前に返信先IDを確定させておく
  try {
    await db.collection("KokoKengaku")
      .doc(talkId)
      .collection("talk")
      .add({
        userId: myUserId,
        message: message,     
        readBy: [],
        replyTo: replyToSnapshot || null,
        time: firebase.firestore.FieldValue.serverTimestamp()
      });
    await db.collection("KokoKengaku").doc(talkId).update({
      lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() // これを追加！
    });
    cancelReply(); // ★ 送信成功後は返信状態を解除
  }
  catch (error) {
    console.log(error);
  }
  finally {
    messageAddButton.disabled = true;
    messageAddButton.textContent = "送信";
    messageInput.value = "";
  }
}

// ★ ルームの members リストに入っている人のみを表示するように修正
function getMember(talkId) {
  const memberArea = document.getElementById("member-area");
  memberArea.innerHTML = "";

  // 自分が管理者かどうかを判定
  const isMeAdmin = (getUserCache(myUserId) || {}).isAdmin || false;

  // ★ 全キャッシュのキーではなく、ルームに属するメンバーIDリストでループを回す
  for (const userId of currentRoomMembers) {
    const cached = getUserCache(userId) || {};
    const memberName = cached.name || "不明なユーザー";
    const isAdmin = cached.isAdmin || false;
    const memberImageUrl = cached.imageUrl || "";
    let lastCheckedTimeStr = "";

    // キャッシュから対象トークルームの最終確認日時を取得
    if (userLastCheckedCache[userId] && userLastCheckedCache[userId][talkId]) {
      lastCheckedTimeStr = userLastCheckedCache[userId][talkId];
    }

    const memberElement = document.createElement("div");
    memberElement.classList.add("member-item");
    if (isAdmin) memberElement.classList.add("admin");

    // アバター + 名前
    const memberLeft = document.createElement("div");
    memberLeft.classList.add("member-left", "clickable-user");
    memberLeft.style.cursor = 'pointer';

    const avatar = createAvatar(memberName, "small", memberImageUrl);
    memberLeft.appendChild(avatar);

    const nameSpan = document.createElement("span");
    nameSpan.classList.add("member-name");
    nameSpan.textContent = memberName;
    memberLeft.appendChild(nameSpan);

    // タップ（クリック）されたらプロフィールモーダルを開く
    memberLeft.addEventListener("click", () => {
      openProfileModal(userId);
    });

    memberElement.appendChild(memberLeft);

    // 自分が管理者かつデータがある場合のみ、右側に最終確認時間を追加
    if (isMeAdmin) {
      const timeSpan = document.createElement("span");
      timeSpan.classList.add("member-last-checked");
      timeSpan.textContent = lastCheckedTimeStr ? lastCheckedTimeStr : "未確認";
      memberElement.appendChild(timeSpan);
    }

    memberArea.appendChild(memberElement);
  }
}

async function updateLastCheckedTime(talkId, myUserId) {
  try {
    await db.collection("users_random").doc(myUserId).set({
      lastChecked: {
        [talkId]: firebase.firestore.FieldValue.serverTimestamp()
      }
    }, { merge: true });
    console.log(`${talkId} の最終確認時刻を更新しました`);
  } catch (error) {
    console.error("最終確認時刻の更新に失敗:", error);
  }
}

let shareModalBtn;
let shareModal;
let shareModalClose;
document.addEventListener("DOMContentLoaded", () => {
  shareModalBtn = document.getElementById("share-modal-btn");
  shareModal = document.getElementById("share-modal");
  shareModalClose = document.getElementById("share-modal-close");
  
  shareModalBtn.addEventListener("click", () => {
    shareModal.classList.remove("hidden");
  });
  shareModalClose.addEventListener("click", () => {
    shareModal.classList.add("hidden");
  });
});

let toHomeButton;
document.addEventListener("DOMContentLoaded", () => {
  toHomeButton = document.getElementById("to-home-button");
  
  toHomeButton.addEventListener("click", () => {
    window.location.href = "./app.html";
  });
});

let memberButton;
let memberModal;
let memberModalClose;
document.addEventListener("DOMContentLoaded", () => {
  memberButton = document.getElementById("member-button");
  memberModal = document.getElementById("member-modal");
  memberModalClose = document.getElementById("member-modal-close");
  
  memberButton.addEventListener("click", () => {
    memberModal.classList.remove("hidden");
    const talkId = getParmFromUrl("id");
    getMember(talkId); // ★ キャッシュから瞬時にUI描画を行うため、完全にノンブロッキングで一瞬で開く
  });
  memberModalClose.addEventListener("click", () => {
    memberModal.classList.add("hidden");
  });
});

let readModal;
let readModalClose;
let readArea;
document.addEventListener("DOMContentLoaded", () => {
  readModal = document.getElementById("read-modal");
  readModalClose = document.getElementById("read-modal-close");
  readArea = document.getElementById("read-area");
  
  readModalClose.addEventListener("click", () => {
    readModal.classList.add("hidden");
  });
});

// ★ 既読モーダルも基本的には既存のユーザーデータキャッシュを最優先に利用するように最適化
async function openReadByModal(readByList) {
  readArea.innerHTML = "読み込み中...";
  readModal.classList.remove("hidden");

  const fragment = document.createDocumentFragment();

  for (const userId of readByList) {
    let cached = getUserCache(userId);
    
    // 万が一キャッシュに載っていないイレギュラーなユーザーIDが含まれていた場合のみ個別get
    if (!cached) {
      try {
        const userSnapshot = await db.collection("users_random").doc(userId).get();
      
        if (userSnapshot.exists) {
          const userData = userSnapshot.data();
          cached = setUserCache(userId, {
            name: userData.name || "名前未設定",
            isAdmin: userData.isAdmin || false,
            imageUrl: userData.imageUrl || "",
            profileText: userData.profileText || ""
          });
        } else {
          cached = setUserCache(userId, { name: "不明なユーザー", isAdmin: false, imageUrl: "", profileText: "" });
        }
      } catch (e) {
        console.error(e);
        cached = { name: "不明なユーザー", isAdmin: false, imageUrl: "" };
      }
    }
    const name = cached.name;
    const isAdmin = cached.isAdmin;

    const p = document.createElement("p");
    p.classList.add("clickable-user");
    p.style.cursor = 'pointer';
    p.appendChild(createAvatar(name, "small", cached.imageUrl));
    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    if (isAdmin) nameSpan.classList.add("admin");
    p.appendChild(nameSpan);

    p.addEventListener("click", () => {
      openProfileModal(userId);
    });

    fragment.appendChild(p);
  }

  readArea.innerHTML = "";
  readArea.appendChild(fragment);
}


let messageId;
let editModal;
let editModalClose;
let newUserIdInput, newMessageInput, newMessageChangeButton, messageDeleteButton;
document.addEventListener("DOMContentLoaded", () => {
  editModal = document.getElementById("edit-modal");
  editModalClose = document.getElementById("edit-modal-close");
  newUserIdInput = document.getElementById("new-userId-input");
  newMessageInput = document.getElementById("new-message-input");
  newMessageChangeButton = document.getElementById("new-message-change-button");
  messageDeleteButton = document.getElementById("message-delete-button");
  
  editModalClose.addEventListener("click", () => {
    editModal.classList.add("hidden");
  });

  newMessageChangeButton.addEventListener("click", async () => {
    await newMessageChange(messageId, newUserIdInput.value, newMessageInput.value);
  });

  messageDeleteButton.addEventListener("click", async () => {
    if (window.confirm('本当に削除しますか？')) {
      await messageDelete(messageId);
    }
  });
});

function openEditModal(thisMessageId, messageUserId, messageText) {
  messageId = thisMessageId;
  newUserIdInput.value = messageUserId;
  newMessageInput.value = messageText;

  if (!meIsAdmin) {
    newUserIdInput.disabled = true;
    messageDeleteButton.disabled = true;
  }
  
  editModal.classList.remove("hidden");
  
}

async function newMessageChange(messageId, newUserId, newMessage) {
  try {
    const docRef = db.collection("KokoKengaku")
      .doc(talkId)
      .collection("talk")
      .doc(messageId);
    await docRef.update({
      userId: newUserId,
      message: newMessage
    });
    alert("変更しました。");
  }
  catch (error) {
    alert(error);
    console.error(error);
  }
}

async function messageDelete(messageId) {
  try {
    db.collection("KokoKengaku")
      .doc(talkId)
      .collection("talk")
      .doc(messageId)
      .delete();
    editModal.classList.add("hidden");
    // alert(messageId);
    alert("削除しました。");
  } catch (error) {
    alert(error);
    console.error(error);
  }
}

let profileModal;
let profileModalClose;
let profileAvatarWrap;
let profileAvatarHolder;
let profileAvatarInput;
let profileAvatarRemoveButton;
let profileName;
let profileNameInput; // 追加：編集用の名前入力欄
let profileText;
let profileTextEdit;  // 追加：編集用の自己紹介テキストエリア
// --- 追加：プロフィールの編集用変数 ---
let profileEditButton;
let isProfileEditing = false; // 編集モード中かどうかのフラグ
let currentProfileUserId = ""; // 現在開いているプロフィールのユーザーID
let canEditCurrentProfile = false; // 現在開いているプロフィールが自分（or管理者権限で）編集可能か
let profileAvatarCurrentUrl = ""; // Firestoreに保存されている現在の画像URL
let profileAvatarFile = null; // 新しく選択された未アップロードの画像ファイル
let profileAvatarRemoved = false; // 「画像を削除」が押されたかどうか

document.addEventListener("DOMContentLoaded", () => {
  // 追加要素の取得
  profileModal = document.getElementById("profile-modal");
  profileModalClose = document.getElementById("profile-modal-close");
  profileAvatarWrap = document.querySelector(".profile-avatar-wrap");
  profileAvatarHolder = document.getElementById("profile-avatar-holder");
  profileAvatarInput = document.getElementById("profile-avatar-input");
  profileAvatarRemoveButton = document.getElementById("profile-avatar-remove-button");
  profileName = document.getElementById("profile-name");
  profileNameInput = document.getElementById("profile-name-input"); // 既存DOMからあらかじめ取得
  profileText = document.getElementById("profile-text");
  profileTextEdit = document.getElementById('profile-text-edit');
  profileEditButton = document.getElementById("profile-edit-button");

  // 閉じるボタンのイベント
  profileModalClose.addEventListener("click", () => {
    profileModal.classList.add("hidden");
    resetProfileEditMode(); // モーダルを閉じるときに編集状態をリセット
  });

  // 編集・保存ボタンのクリックイベント
  profileEditButton.addEventListener("click", handleProfileEditOrSave);

  // アイコンをタップ（編集モード中のみ有効）→ ファイル選択を開く
  profileAvatarHolder.addEventListener("click", () => {
    if (!isProfileEditing || !canEditCurrentProfile) return;
    profileAvatarInput.click();
  });

  // ファイルが選択されたらプレビューに反映（アップロードは保存時にまとめて行う）
  profileAvatarInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    profileAvatarFile = file;
    profileAvatarRemoved = false;

    const reader = new FileReader();
    reader.onload = (event) => {
      profileAvatarHolder.innerHTML = "";
      const img = document.createElement("img");
      img.classList.add("avatar-circle", "large");
      img.src = event.target.result;
      profileAvatarHolder.appendChild(img);
      profileAvatarRemoveButton.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  // 「画像を削除」→ プレビューを頭文字アバターに戻し、保存時に画像を消去
  profileAvatarRemoveButton.addEventListener("click", () => {
    profileAvatarFile = null;
    profileAvatarRemoved = true;
    profileAvatarInput.value = "";

    profileAvatarHolder.innerHTML = "";
    const nameForInitial = isProfileEditing ? profileNameInput.value : profileName.textContent;
    profileAvatarHolder.appendChild(createAvatar(nameForInitial, "large"));
    profileAvatarRemoveButton.classList.add("hidden");
  });
});

// 編集モードをリセットする関数
function resetProfileEditMode() {
  isProfileEditing = false;
  if (profileEditButton) {
    profileEditButton.textContent = "プロフィールを編集";
    profileEditButton.disabled = false;
  }
  // 表示状態をノーマルに戻し、編集用を隠す
  if (profileName) profileName.classList.remove("hidden");
  if (profileNameInput) profileNameInput.classList.add("hidden");
  if (profileText) profileText.classList.remove("hidden");
  if (profileTextEdit) profileTextEdit.classList.add("hidden");
  if (profileModalClose) profileModalClose.classList.remove("hidden");

  // アバターの編集用UIも隠し、未保存の変更があれば元の状態に戻す
  if (profileAvatarWrap) profileAvatarWrap.classList.remove("editable");
  if (profileAvatarRemoveButton) profileAvatarRemoveButton.classList.add("hidden");
  profileAvatarFile = null;
  profileAvatarRemoved = false;
  if (profileAvatarHolder && profileName) {
    profileAvatarHolder.innerHTML = "";
    profileAvatarHolder.appendChild(createAvatar(profileName.textContent, "large", profileAvatarCurrentUrl));
  }
}

// 編集ボタン・保存ボタンが押された時の処理
async function handleProfileEditOrSave() {
  if (!isProfileEditing) {
    // 【編集モードに入る処理】
    isProfileEditing = true;
    profileEditButton.textContent = "プロフィールを保存";

    // 現在表示されているテキストを取得
    let currentName = profileName.textContent;
    let currentText = profileText.textContent;

    if (currentText === "ステータスメッセージはありません。" || currentText === "取得中...") {
      currentText = "";
    }
    if (currentName === "取得中..." || currentName === "不明なユーザー") {
      currentName = "";
    }

    profileName.classList.add("hidden");
    profileNameInput.classList.remove("hidden");
    profileNameInput.value = currentName;

    profileText.classList.add("hidden");
    profileTextEdit.classList.remove("hidden");
    profileTextEdit.value = currentText;

    // アイコンをタップして変更できるようにする（自分／管理者のみ）
    if (canEditCurrentProfile) {
      profileAvatarWrap.classList.add("editable");
      if (profileAvatarCurrentUrl) {
        profileAvatarRemoveButton.classList.remove("hidden");
      }
    }

  } else {
    // 【保存処理】
    const newName = profileNameInput.value.trim();
    const newProfileText = profileTextEdit.value.trim();

    if (!newName) {
      alert("ユーザーネームを入力してください。");
      return;
    }

    profileEditButton.disabled = true;
    profileEditButton.textContent = "保存中...";
    profileModalClose.classList.add("hidden");
    try {
      // アイコン画像の変更があれば、先にアップロード（または削除）を確定させる
      let finalImageUrl = profileAvatarCurrentUrl;
      if (profileAvatarFile) {
        profileEditButton.textContent = "画像をアップロード中...";
        finalImageUrl = await uploadImageToImgbb(profileAvatarFile);
      } else if (profileAvatarRemoved) {
        finalImageUrl = "";
      }

      profileEditButton.textContent = "保存中...";

      // Firestoreの users_random コレクションを更新
      await db.collection("users_random").doc(currentProfileUserId).set(
        {
          name: newName,
          profileText: newProfileText,
          imageUrl: finalImageUrl
        },
        { merge: true }
      );

      // キャッシュ情報の更新（name / isAdmin / imageUrl / profileText を一括で最新化）
      const cached = getUserCache(currentProfileUserId) || {};
      setUserCache(currentProfileUserId, {
        name: newName,
        isAdmin: cached.isAdmin || false,
        imageUrl: finalImageUrl,
        profileText: newProfileText
      });

      // 各UIテキストのリアルタイム更新
      drawerUsername.textContent = newName;
      
      // 通常時のテキスト要素へ反映させて復元
      profileName.textContent = newName;
      profileText.textContent = newProfileText || "ステータスメッセージはありません。";

      profileAvatarCurrentUrl = finalImageUrl;
      profileAvatarFile = null;
      profileAvatarRemoved = false;
      profileAvatarHolder.innerHTML = "";
      profileAvatarHolder.appendChild(createAvatar(newName, "large", profileAvatarCurrentUrl));

      if ((getUserCache(currentProfileUserId) || {}).isAdmin) {
        profileName.classList.add("admin");
      } else {
        profileName.classList.remove("admin");
      }
      
      resetProfileEditMode();
      alert("プロフィールを保存しました。");
    } catch (error) {
      console.error("プロフィール保存エラー:", error);
      alert("プロフィールの保存に失敗しました: " + error.message);
      profileEditButton.disabled = false;
      profileEditButton.textContent = "プロフィールを保存";
    }
  }
}

// プロフィールモーダルを開いてFirebaseから最新のステメ等を取得する関数
// startEditModeがtrueの場合、ダイレクトに編集可能なテキストエリア等を開く
async function openProfileModal(userId, startEditMode = false) {
  currentProfileUserId = userId; // 現在開いているユーザーIDを保持
  canEditCurrentProfile = meIsAdmin || userId === myUserId;
  resetProfileEditMode();       // 編集状態を初期化

  // ★ キャッシュがあれば先にそれを表示し（体感速度優先）、裏で最新データに更新する
  const cached = getUserCache(userId);
  profileName.textContent = (cached && cached.name) || "取得中...";
  profileName.classList.toggle("admin", !!(cached && cached.isAdmin));
  profileText.textContent = (cached && cached.profileText) || "取得中...";
  profileAvatarCurrentUrl = (cached && cached.imageUrl) || "";

  profileAvatarHolder.innerHTML = "";
  profileAvatarHolder.appendChild(createAvatar(profileName.textContent, "large", profileAvatarCurrentUrl));

  profileEditButton.classList.toggle("hidden", !canEditCurrentProfile);
  profileModal.classList.remove("hidden");

  try {
    const userSnapshot = await db.collection("users_random").doc(userId).get();
    if (userSnapshot.exists) {
      const userData = userSnapshot.data();

      // ★ ユーザーデータをまとめてキャッシュに反映
      setUserCache(userId, {
        name: userData.name || "名前未設定",
        isAdmin: userData.isAdmin || false,
        imageUrl: userData.imageUrl || "",
        profileText: userData.profileText || ""
      });

      profileName.textContent = userData.name || "名前未設定";
      profileName.classList.toggle("admin", !!userData.isAdmin);
      profileText.textContent = userData.profileText || "ステータスメッセージはありません。";
      profileAvatarCurrentUrl = userData.imageUrl || "";

      profileAvatarHolder.innerHTML = "";
      profileAvatarHolder.appendChild(createAvatar(profileName.textContent, "large", profileAvatarCurrentUrl));

      // ドロワーから来たなどの場合は即座に編集モードに移行する
      if (canEditCurrentProfile && startEditMode) {
        handleProfileEditOrSave();
      }
    } else {
      profileName.textContent = "不明なユーザー";
      profileText.textContent = "";
    }
  } catch (error) {
    console.error("プロフィール取得エラー:", error);
    profileName.textContent = "エラー";
    profileText.textContent = "プロフィールの取得に失敗しました。";
  }
}

// ★ 画像送信モーダル一式（キャプション付き）
let imageUploadModal;
let openImageModalBtn;
let imageModalClose;
let modalImageInput;
let selectImageBtn;
let imagePreviewContainer;
let imagePreview;
let imageMessageInput;
let submitImageBtn;
let selectedImageFile = null;

document.addEventListener("DOMContentLoaded", () => {
  imageUploadModal = document.getElementById("image-upload-modal");
  openImageModalBtn = document.getElementById("open-image-modal-button");
  imageModalClose = document.getElementById("image-modal-close");
  modalImageInput = document.getElementById("modal-image-input");
  selectImageBtn = document.getElementById("select-image-button");
  imagePreviewContainer = document.getElementById("image-preview-container");
  imagePreview = document.getElementById("image-preview");
  imageMessageInput = document.getElementById("image-message-input");
  submitImageBtn = document.getElementById("submit-image-button");

  // 1. モーダルを開く
  openImageModalBtn.addEventListener("click", () => {
    // 状態を初期化
    selectedImageFile = null;
    modalImageInput.value = "";
    imagePreview.src = "";
    imagePreviewContainer.classList.add("hidden");
    submitImageBtn.disabled = true;
    submitImageBtn.textContent = "画像を送信";
    imageModalClose.classList.remove("hidden");
    selectImageBtn.disabled = false;
    imageMessageInput.disabled = false;
    imageUploadModal.classList.remove("hidden");
  });

  // 2. モーダルを閉じる（キャンセル）
  imageModalClose.addEventListener("click", () => {
    imageUploadModal.classList.add("hidden");
  });

  // 3. 「画像を選択する」ボタンが押されたら隠しinputを発火
  selectImageBtn.addEventListener("click", () => {
    modalImageInput.click();
  });

  // 4. ファイルが選択されたらプレビューを表示
  modalImageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    selectedImageFile = file;

    // FileReaderで読み込んでプレビュー表示
    const reader = new FileReader();
    reader.onload = (event) => {
      imagePreview.src = event.target.result;
      imagePreviewContainer.classList.remove("hidden");
      submitImageBtn.disabled = false; // 送信ボタンを活性化
    };
    reader.readAsDataURL(file);
  });

  // 5. 画像を送信する（アップロード & Firestore書き込み）
  submitImageBtn.addEventListener("click", async () => {
    if (!selectedImageFile) return;

    // UIを「アップロード中」に変更して入力をロック
    submitImageBtn.disabled = true;
    imageModalClose.classList.add("hidden"); // 閉じるボタンを無効化
    selectImageBtn.disabled = true;
    submitImageBtn.textContent = "画像をアップロード中...";
    imageMessageInput.disabled = true;

    try {
      const imageUrl = await uploadImageToImgbb(selectedImageFile);

      // 現在のトークルーム（talkId）のtalkに画像メッセージを追加（任意のキャプション付き）
      await db.collection("KokoKengaku").doc(talkId).collection("talk").add({
        userId: myUserId,
        message: imageMessageInput.value,
        imageUrl: imageUrl,
        readBy: [],
        replyTo: replyToId || null,
        time: firebase.firestore.FieldValue.serverTimestamp()
      });

      // ルーム一覧側の未読カウント・並び順のためにlastUpdatedAtも更新
      await db.collection("KokoKengaku").doc(talkId).update({
        lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log("画像送信が完了しました！");

      // d. 成功したら自動的にモーダルを閉じる
      imageUploadModal.classList.add("hidden");
      imageMessageInput.value = "";
      cancelReply(); // ★ 送信成功後は返信状態を解除
    } catch (error) {
      console.error("画像送信中にエラーが発生しました:", error);
      alert("画像の送信に失敗しました。\n" + error.message);
      
      // エラー時はユーザーがやり直せるようにボタンのロックを解除
      submitImageBtn.disabled = false;
      submitImageBtn.textContent = "画像を送信";
      imageModalClose.classList.remove("hidden");
      selectImageBtn.disabled = false;
      imageMessageInput.disabled = false;
    }
  });
});

// ================================
// ★ アンケート機能
// ================================

const POLL_MIN_CHOICES = 2;
const POLL_MAX_CHOICES = 10;

let pollCreateModal;
let pollCreateModalClose;
let openPollModalBtn;
let pollQuestionInput;
let pollChoicesList;
let pollAddChoiceButton;
let pollSubmitButton;

document.addEventListener("DOMContentLoaded", () => {
  pollCreateModal = document.getElementById("poll-create-modal");
  pollCreateModalClose = document.getElementById("poll-create-modal-close");
  openPollModalBtn = document.getElementById("open-poll-modal-button");
  pollQuestionInput = document.getElementById("poll-question-input");
  pollChoicesList = document.getElementById("poll-choices-list");
  pollAddChoiceButton = document.getElementById("poll-add-choice-button");
  pollSubmitButton = document.getElementById("poll-submit-button");

  openPollModalBtn.addEventListener("click", () => {
    resetPollCreateForm();
    pollCreateModal.classList.remove("hidden");
  });

  pollCreateModalClose.addEventListener("click", () => {
    pollCreateModal.classList.add("hidden");
  });

  pollQuestionInput.addEventListener("input", updatePollSubmitState);

  pollAddChoiceButton.addEventListener("click", () => {
    addPollChoiceRow();
  });

  pollSubmitButton.addEventListener("click", submitPoll);
});

// ★ 選択肢の入力欄を1行追加する
function addPollChoiceRow(prefillValue) {
  if (pollChoicesList.children.length >= POLL_MAX_CHOICES) return;

  const row = document.createElement("div");
  row.classList.add("poll-choice-row");

  const input = document.createElement("input");
  input.type = "text";
  input.classList.add("poll-choice-input");
  input.maxLength = 100;
  input.value = prefillValue || "";
  input.addEventListener("input", updatePollSubmitState);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.classList.add("poll-choice-remove");
  removeBtn.textContent = "×";
  removeBtn.setAttribute("aria-label", "選択肢を削除");
  removeBtn.addEventListener("click", () => {
    if (pollChoicesList.children.length <= POLL_MIN_CHOICES) return;
    row.remove();
    renumberPollChoicePlaceholders();
    updatePollAddButtonState();
    updatePollRemoveButtonsVisibility();
    updatePollSubmitState();
  });

  row.appendChild(input);
  row.appendChild(removeBtn);
  pollChoicesList.appendChild(row);

  renumberPollChoicePlaceholders();
  updatePollAddButtonState();
  updatePollRemoveButtonsVisibility();
}

// ★ 選択肢のプレースホルダー（「選択肢 1」など）を振り直す
function renumberPollChoicePlaceholders() {
  const inputs = pollChoicesList.querySelectorAll(".poll-choice-input");
  inputs.forEach((input, index) => {
    input.placeholder = `選択肢 ${index + 1}`;
  });
}

// ★ 最小選択肢数までは削除ボタンを隠す
function updatePollRemoveButtonsVisibility() {
  const canRemove = pollChoicesList.children.length > POLL_MIN_CHOICES;
  pollChoicesList.querySelectorAll(".poll-choice-remove").forEach((btn) => {
    btn.classList.toggle("hidden", !canRemove);
  });
}

// ★ 最大数に達したら追加ボタンを無効化
function updatePollAddButtonState() {
  pollAddChoiceButton.disabled = pollChoicesList.children.length >= POLL_MAX_CHOICES;
}

// ★ 質問文が入力され、選択肢が2つ以上埋まっていれば送信ボタンを活性化
function updatePollSubmitState() {
  const hasQuestion = pollQuestionInput.value.trim() !== "";
  const filledChoices = Array.from(pollChoicesList.querySelectorAll(".poll-choice-input"))
    .filter((input) => input.value.trim() !== "").length;
  pollSubmitButton.disabled = !(hasQuestion && filledChoices >= POLL_MIN_CHOICES);
}

// ★ フォームを初期状態（質問欄クリア・選択肢2行）にリセットする
function resetPollCreateForm() {
  pollQuestionInput.value = "";
  pollChoicesList.innerHTML = "";
  for (let i = 0; i < POLL_MIN_CHOICES; i++) {
    addPollChoiceRow();
  }
  updatePollSubmitState();
}

// ★ アンケートを送信する
async function submitPoll() {
  const question = pollQuestionInput.value.trim();
  const choices = Array.from(pollChoicesList.querySelectorAll(".poll-choice-input"))
    .map((input) => input.value.trim())
    .filter((value) => value !== "")
    .slice(0, POLL_MAX_CHOICES);

  if (!question || choices.length < POLL_MIN_CHOICES) return;

  pollSubmitButton.disabled = true;
  pollSubmitButton.textContent = "送信中...";

  try {
    await db.collection("KokoKengaku").doc(talkId).collection("talk").add({
      userId: myUserId,
      message: question,
      choices: choices,
      answer: {},
      readBy: [],
      replyTo: replyToId || null,
      time: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection("KokoKengaku").doc(talkId).update({
      lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    pollCreateModal.classList.add("hidden");
    resetPollCreateForm();
    cancelReply(); // ★ 送信成功後は返信状態を解除
  } catch (error) {
    console.error("アンケート送信中にエラーが発生しました:", error);
    alert("アンケートの送信に失敗しました。\n" + error.message);
  } finally {
    pollSubmitButton.textContent = "アンケートを送信";
    updatePollSubmitState();
  }
}

// ★ メッセージ内に表示するアンケートウィジェットを組み立てる
function buildPollWidget(messageDocId, choices, answerMap) {
  const widget = document.createElement("div");
  widget.classList.add("poll-widget");

  const scroll = document.createElement("div");
  scroll.classList.add("poll-choices-scroll");

  const hasMyAnswer = Object.prototype.hasOwnProperty.call(answerMap, myUserId);
  const myAnswerIndex = hasMyAnswer ? answerMap[myUserId] : null;
  const radioGroupName = `poll-${messageDocId}`;

  const answerButton = document.createElement("button");
  answerButton.type = "button";
  answerButton.classList.add("poll-answer-button");
  answerButton.textContent = hasMyAnswer ? "再回答する" : "答える";
   answerButton.disabled = true;

  choices.forEach((choiceLabel, index) => {
    const count = Object.values(answerMap).filter((v) => v === index).length;

    const optionLabel = document.createElement("label");
    optionLabel.classList.add("poll-choice-option");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = radioGroupName;
    radio.value = String(index);
    if (myAnswerIndex === index) radio.checked = true;
    radio.addEventListener("change", () => {
      answerButton.disabled = (index === myAnswerIndex);
    });

    const labelSpan = document.createElement("span");
    labelSpan.classList.add("poll-choice-label");
    labelSpan.textContent = choiceLabel;

    const countSpan = document.createElement("span");
    countSpan.classList.add("poll-choice-count");
    countSpan.textContent = `${count}人`;
    countSpan.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPollVotersModal(answerMap, index, choiceLabel);
    });

    optionLabel.appendChild(radio);
    optionLabel.appendChild(labelSpan);
    optionLabel.appendChild(countSpan);
    scroll.appendChild(optionLabel);
  });

  widget.appendChild(scroll);

  answerButton.addEventListener("click", async () => {
    const checked = scroll.querySelector(`input[name="${radioGroupName}"]:checked`);
    if (!checked) return;

    const selectedIndex = Number(checked.value);
    const originalText = answerButton.textContent;
    answerButton.disabled = true;
    answerButton.textContent = "送信中...";

    try {
      await db.collection("KokoKengaku").doc(talkId).collection("talk").doc(messageDocId).update({
        [`answer.${myUserId}`]: selectedIndex
      });
    } catch (error) {
      console.error("回答の送信に失敗しました:", error);
      alert("回答の送信に失敗しました。\n" + error.message);
      answerButton.disabled = false;
      answerButton.textContent = originalText;
    }
    // 成功時はメッセージ一覧のリアルタイム再描画で新しい状態に置き換わる
  });

  widget.appendChild(answerButton);

  return widget;
}

// ★ ある選択肢を選んだ人の一覧を表示する
let pollVotersModal;
let pollVotersModalClose;
let pollVotersTitle;
let pollVotersArea;

document.addEventListener("DOMContentLoaded", () => {
  pollVotersModal = document.getElementById("poll-voters-modal");
  pollVotersModalClose = document.getElementById("poll-voters-modal-close");
  pollVotersTitle = document.getElementById("poll-voters-title");
  pollVotersArea = document.getElementById("poll-voters-area");

  pollVotersModalClose.addEventListener("click", () => {
    pollVotersModal.classList.add("hidden");
  });
});

async function openPollVotersModal(answerMap, choiceIndex, choiceLabel) {
  pollVotersTitle.textContent = choiceLabel ? `「${choiceLabel}」を選んだ人` : "回答した人";
  pollVotersArea.innerHTML = "読み込み中...";
  pollVotersModal.classList.remove("hidden");

  const voterIds = Object.keys(answerMap || {}).filter((uid) => answerMap[uid] === choiceIndex);
  const fragment = document.createDocumentFragment();

  if (voterIds.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "まだ誰も選んでいません";
    emptyMessage.style.color = "var(--text-muted)";
    fragment.appendChild(emptyMessage);
  }

  for (const userId of voterIds) {
    let cached = getUserCache(userId);

    // 万が一キャッシュに載っていないイレギュラーなユーザーIDが含まれていた場合のみ個別get
    if (!cached) {
      try {
        const userSnapshot = await db.collection("users_random").doc(userId).get();
        if (userSnapshot.exists) {
          const userData = userSnapshot.data();
          cached = setUserCache(userId, {
            name: userData.name || "名前未設定",
            isAdmin: userData.isAdmin || false,
            imageUrl: userData.imageUrl || "",
            profileText: userData.profileText || ""
          });
        } else {
          cached = setUserCache(userId, { name: "不明なユーザー", isAdmin: false, imageUrl: "", profileText: "" });
        }
      } catch (e) {
        console.error(e);
        cached = { name: "不明なユーザー", isAdmin: false, imageUrl: "" };
      }
    }

    const p = document.createElement("p");
    p.classList.add("clickable-user");
    p.style.cursor = "pointer";
    p.appendChild(createAvatar(cached.name, "small", cached.imageUrl));
    const nameSpan = document.createElement("span");
    nameSpan.textContent = cached.name;
    if (cached.isAdmin) nameSpan.classList.add("admin");
    p.appendChild(nameSpan);

    p.addEventListener("click", () => {
      openProfileModal(userId);
    });

    fragment.appendChild(p);
  }

  pollVotersArea.innerHTML = "";
  pollVotersArea.appendChild(fragment);
}
