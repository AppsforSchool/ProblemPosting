const firebaseConfig = {
  apiKey: "AIzaSyAqIiNj0N4WruPSOkWbeo5gxzsNyeMkuLo",
  authDomain: "appsforschool-study.firebaseapp.com",
  projectId: "appsforschool-study",
  storageBucket: "appsforschool-study.firebasestorage.app",
  messagingSenderId: "740735293440",
  appId: "1:740735293440:web:a1363adbab57f1ceec60e5"
};

// Firebase 初期化とサービス取得
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const STACK_ICON_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="1" width="11" height="8" rx="1.4" opacity="0.45"></rect>
  <rect x="1.5" y="4" width="11" height="8" rx="1.4" opacity="0.7"></rect>
  <rect x="0" y="7" width="11" height="8" rx="1.4"></rect>
</svg>`;
const subjectIdList = [
  "不明",
  "国語",
  "数学",
  "理科",
  "英語",
  "社会(歴史)",
  "社会(地理)",
  "社会(公民)",
  "保健体育(保健)",
  "保健体育(実技)"
];
const gradeIdList = ["不明", "1年", "2年", "3年", "総合"];

let myUid = "";
let myUserId = "";
let meIsAdmin = false;

let userDataCache = {};
function getUserCache(userId) {
  return userDataCache[userId] || null;
}
function setUserCache(userId, data) {
  userDataCache[userId] = Object.assign({}, userDataCache[userId] || {}, data);
  return userDataCache[userId];
}

let bookCache = {};

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

// ★ 指定したユーザーの情報（name/isAdmin/imageUrl/profileText）がキャッシュになければ取得する
async function ensureUserCached(userId) {
  if (getUserCache(userId)) return;

  const userSnapshot = await db.collection("users_random").doc(userId).get();
  if (userSnapshot.exists) {
    const userData = userSnapshot.data();
    setUserCache(userId, {
      name: userData.name || "名前未設定",
      isAdmin: userData.isAdmin || false,
      imageUrl: userData.imageUrl || "",
      profileText: userData.profileText || ""
    });
  } else {
    setUserCache(userId, { name: "不明なユーザー", isAdmin: false, imageUrl: "", profileText: "" });
  }
}

let drawerOverlay;
let accountSettingsDrawer;
let drawerCloseButton;
let accountSettingsButton;
let drawerUserId;
let drawerUsername;
let drawerLogoutButton;
let drawerEditProfileButton;

let subjectSelect;
let gradeSelect;

document.addEventListener("DOMContentLoaded", () => {
  drawerOverlay = document.getElementById("drawerOverlay");
  accountSettingsDrawer = document.getElementById("accountSettingsDrawer");
  drawerCloseButton = document.getElementById("drawerCloseButton");
  accountSettingsButton = document.getElementById("setting-button");

  drawerUserId = document.getElementById("drawerUserId");
  drawerUsername = document.getElementById("drawerUsername");
  drawerLogoutButton = document.getElementById("logout-button");
  drawerEditProfileButton = document.getElementById("drawer-edit-profile-button");

  accountSettingsButton.addEventListener("click", openDrawer);
  drawerCloseButton.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);
  drawerLogoutButton.addEventListener("click", handleLogout);
  drawerEditProfileButton.addEventListener("click", () => {
    closeDrawer();
    openProfileModal(myUserId, true);
  });

  subjectSelect = document.getElementById("subject-select");
  gradeSelect = document.getElementById("grade-select");

  subjectSelect.addEventListener("change", handleFilterChange);
  gradeSelect.addEventListener("change", handleFilterChange);
});

function handleFilterChange() {
  makeDisplayBooks(subjectSelect.value, gradeSelect.value);
}

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
    if (user) {
      myUserId = user.email.split("@")[0];
      drawerUserId.textContent = myUserId;

      const userSnapshot = await db
        .collection("users_random")
        .doc(myUserId)
        .get();
      const userData = userSnapshot.data();
      setUserCache(myUserId, {
        name: userData.name,
        isAdmin: userData.isAdmin,
        imageUrl: userData.imageUrl || "",
        profileText: userData.profileText || ""
      });
      meIsAdmin = userData.isAdmin || false;
      drawerUsername.textContent = userData.name;
      if (meIsAdmin) drawerUsername.classList.add("admin");

      myUid = userData.uid;

      //displayVocabularyBooks();
      await loadProblemBooks();
      makeDisplayBooks("all", "all");
      openSettingModalFromHash();
    } else {
      console.log("logout");
      window.location.href = "./index.html";
    }
  });
});

const handleLogout = async () => {
  const isConfirmed = confirm("ログアウトしますか？");
  if (isConfirmed) {
    try {
      await auth.signOut(auth);
      console.log("ログアウトしました！");
      alert("ログアウトしました。");
      window.location.href = "./index.html";
    } catch (error) {
      console.error("ログアウトエラー:", error);
      alert("ログアウトに失敗しました。");
    }
  }
};

async function loadProblemBooks() {
  try {
    const querySnapshot = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .orderBy("createdAt", "desc")
      .get();

    for (const doc of querySnapshot.docs) {
      const data = doc.data();
      const bookId = doc.id;
      const title = data.title || "タイトルがありません";
      const description = data.description || "説明文がありません";
      let subjectId = data.subjectId || 0;
      if (9 < subjectId) subjectId = 0;
      let gradeId = data.gradeId || 0;
      if (4 < gradeId) gradeId = 0;
      const problemSnapshot = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(bookId)
      .collection("problems")
      .get();
      let problemCount = problemSnapshot.size;
      const makerUserId = data.madeBy || "";
      const solvedBy = data.solvedBy || [];

      bookCache[bookId] = [
        title,
        description,
        subjectId,
        gradeId,
        problemCount,
        makerUserId,
        solvedBy
      ];

      await ensureUserCached(makerUserId);
      for (const solverId of solvedBy) {
        await ensureUserCached(solverId);
      }
    }
  } catch (error) {
    console.log(error);
    alert(error);
  }
}

function makeDisplayBooks(subjectFilter, gradeFilter) {
  const listElement = document.getElementById("card-area");
  const loadingText = document.getElementById("loading-text");

  listElement.innerHTML = "";
  const fragment = document.createDocumentFragment();

  Object.entries(bookCache).forEach(([bookId, book]) => {
    
    const card = document.createElement("div");
    card.classList.add("card");
      
    const cardTop = document.createElement("div");
    cardTop.classList.add("card-top");
    const subjectBadge = document.createElement("span");
    subjectBadge.classList.add("badge");
    subjectBadge.classList.add(`t${book[2]}`);
    subjectBadge.textContent = subjectIdList[book[2]];
    const gradeBadge = document.createElement("span");
    gradeBadge.classList.add("badge");
    gradeBadge.classList.add(`t${book[2]}`);
    gradeBadge.textContent = gradeIdList[book[3]];
    const wordCountBadge = document.createElement("span");
    wordCountBadge.classList.add("badge");
    wordCountBadge.classList.add(`t${book[2]}`);
    wordCountBadge.innerHTML = `${STACK_ICON_SVG}${book[4]}問`;
    cardTop.appendChild(subjectBadge);
    cardTop.appendChild(gradeBadge);
    cardTop.appendChild(wordCountBadge);
      
    const cardTitle = document.createElement("p");
    cardTitle.classList.add("card-title");
    cardTitle.textContent = book[0];
      
    const cardDescription = document.createElement("p");
    cardDescription.classList.add("card-description");
    cardDescription.textContent = book[1];
      
    const cardMadeBy = document.createElement("span");
    cardMadeBy.classList.add("card-madeBy");
      
    const makerCached = getUserCache(book[5]) || {};
    const nameSpan = document.createElement("span");
    nameSpan.textContent = makerCached.name;
    nameSpan.classList.add("clickable-user");
    if (makerCached.isAdmin) nameSpan.classList.add("admin");
    nameSpan.addEventListener("click", (e) => {
      e.stopPropagation();
      openProfileModal(book[5]);
    });
    const madeByTextContent = document.createTextNode('作成者: ');
    cardMadeBy.appendChild(madeByTextContent);
    cardMadeBy.appendChild(nameSpan);
      
    const solvedBy = book[6] || [];
    const solvedByArea = document.createElement("div");
    solvedByArea.classList.add("solved-by-area");

    const solvedByLabel = document.createElement("span");
    solvedByLabel.classList.add("solved-by-label");
    solvedByLabel.textContent = "解いた人:";
    solvedByArea.appendChild(solvedByLabel);

    if (solvedBy.length > 0) {
      const stack = document.createElement("div");
      stack.classList.add("solved-by-stack");

      const MAX_SHOWN = 4;
      solvedBy.slice(0, MAX_SHOWN).forEach(userId => {
        const cached = getUserCache(userId) || {};
        const avatar = createAvatar(cached.name, "small", cached.imageUrl);
        avatar.classList.add("solved-by-avatar");
        stack.appendChild(avatar);
      });
      if (solvedBy.length > MAX_SHOWN) {
        const overflow = document.createElement("div");
        overflow.classList.add("avatar-circle", "small", "solved-by-avatar", "solved-by-overflow");
        overflow.textContent = "…";
        stack.appendChild(overflow);
      }

      solvedByArea.appendChild(stack);
      solvedByArea.addEventListener("click", (e) => {
        e.stopPropagation();
        openSolvedModal(bookId);
      });
    } else {
      const emptyText = document.createElement("span");
      emptyText.classList.add("solved-by-empty-text");
      emptyText.textContent = "解いた人はまだいません";
      solvedByArea.appendChild(emptyText);
    }
      
      
    card.addEventListener("click", () => {
      openSettingModal(bookId);
    });
      
      
    card.appendChild(cardTop);
    card.appendChild(cardTitle);
    card.appendChild(cardDescription);
    card.appendChild(cardMadeBy);
    if (solvedByArea) card.appendChild(solvedByArea);
    
    const subjectMatches = subjectFilter === "all" || book[2] === Number(subjectFilter);
    const gradeMatches = gradeFilter === "all" || book[3] === Number(gradeFilter);
    if (subjectMatches && gradeMatches) {
      fragment.appendChild(card);
    }
  });
  
  const makeBookButton = document.createElement("button");
    makeBookButton.classList.add("card");
    makeBookButton.classList.add("make-card");
    makeBookButton.innerHTML = `
    <svg xmlns="http://w3.org" viewBox="0 0 24 24" width="24" height="24">
      <circle cx="12" cy="12" r="10" fill="currentColor"/>
      <path d="M 12,8 L 12,16 M 8,12 L 16,12" 
        fill="none" 
        stroke="white" 
        stroke-width="2" 
        stroke-linecap="round"/>
    </svg>
    <p class="card-title">問題集を作成</p>`;
    makeBookButton.addEventListener("click", () => {
      window.location.href = "./make.html";
    });
  
    loadingText.classList.add("hidden");
    listElement.classList.remove("hidden");
    listElement.appendChild(makeBookButton);
    listElement.appendChild(fragment);
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

let settingModal;
let settingModalClose;
let settingModalBookId;
let settingModalSubject,
  settingModalGrade,
  settingModalCount,
  settingModalCountText;
let settingModalTitle, settingModalDescription, settingModalMadeByName;
let settingModalEditButton, settingModalStartButton, viewImpressionsButton;
document.addEventListener("DOMContentLoaded", () => {
  settingModal = document.getElementById("setting-modal");
  settingModalClose = document.getElementById("setting-modal-close");
  settingModalSubject = document.getElementById("setting-subject");
  settingModalGrade = document.getElementById("setting-grade");
  settingModalCount = document.getElementById("setting-count");
  settingModalCountText = document.getElementById("setting-count-text");
  settingModalTitle = document.getElementById("setting-title");
  settingModalDescription = document.getElementById("setting-description");
  settingModalMadeByName = document.getElementById("setting-madeBy-name");
  settingModalStartButton = document.getElementById("start-button");
  settingModalEditButton = document.getElementById("edit-button");
  viewImpressionsButton = document.getElementById("view-impressions-button");

  settingModalClose.addEventListener("click", () => {
    settingModal.classList.add("hidden");
    clearBookHash();
    settingModalSubject.textContent = "不明";
    settingModalGrade.textContent = "不明";
    settingModalCountText.textContent = "--問";
    for (let i = 0; i < 9; i++) {
      settingModalSubject.classList.remove(`t${i + 1}`);
      settingModalGrade.classList.remove(`t${i + 1}`);
      settingModalCount.classList.remove(`t${i + 1}`);
    }
    settingModalSubject.classList.add("t0");
    settingModalGrade.classList.add("t0");
    settingModalCount.classList.add("t0");

    settingModalTitle.textContent = "loading...";
    settingModalDescription.textContent = "loading...";
    settingModalMadeByName.textContent = "loading...";
    settingModalMadeByName.classList.remove("admin");

    settingModalEditButton.disabled = true;
  });
  settingModalStartButton.addEventListener("click", () => {
    window.location.href = `./answer.html?id=${settingModalBookId}`;
  });
  settingModalEditButton.addEventListener("click", () => {
    window.location.href = `./edit.html?id=${settingModalBookId}`;
  });
  settingModalMadeByName.addEventListener("click", () => {
    openProfileModal(bookCache[settingModalBookId][5]);
  });
  viewImpressionsButton.addEventListener("click", () => {
    openImpressionsModal(settingModalBookId);
  });
});

function openSettingModal(id) {
  settingModalBookId = id;
  settingModal.classList.remove("hidden");
  setBookHash(id);
  settingModalTitle.textContent = bookCache[id][0];
  settingModalDescription.textContent = bookCache[id][1];
  settingModalSubject.classList.remove("t0");
  settingModalGrade.classList.remove("t0");
  settingModalCount.classList.remove("t0");
  settingModalSubject.classList.add(`t${bookCache[id][2]}`);
  settingModalGrade.classList.add(`t${bookCache[id][2]}`);
  settingModalCount.classList.add(`t${bookCache[id][2]}`);
  settingModalSubject.textContent = subjectIdList[bookCache[id][2]];
  settingModalGrade.textContent = gradeIdList[bookCache[id][3]];
  settingModalCountText.textContent = `${bookCache[id][4]}問`;
  const makerCached = getUserCache(bookCache[id][5]) || {};
  settingModalMadeByName.textContent = makerCached.name;
  settingModalMadeByName.classList.toggle("admin", !!makerCached.isAdmin);

  if (bookCache[id][5] === myUserId || meIsAdmin) settingModalEditButton.disabled = false;
}

// ★ URLのハッシュ(#問題集ID)を使った出題設定モーダルの直リンク対応
function setBookHash(bookId) {
  if (window.location.hash === `#${bookId}`) return;
  const newUrl = `${window.location.pathname}${window.location.search}#${bookId}`;
  history.pushState(null, "", newUrl);
}
function clearBookHash() {
  if (!window.location.hash) return;
  const newUrl = `${window.location.pathname}${window.location.search}`;
  history.replaceState(null, "", newUrl);
}
function openSettingModalFromHash() {
  const id = window.location.hash.replace("#", "");
  if (id && bookCache[id]) {
    openSettingModal(id);
  }
}

let bookShareModal;
let bookShareModalClose;
let bookShareQr;
let bookShareUrl;
let settingModalShareButton;
document.addEventListener("DOMContentLoaded", () => {
  bookShareModal = document.getElementById("book-share-modal");
  bookShareModalClose = document.getElementById("book-share-modal-close");
  bookShareQr = document.getElementById("book-share-qr");
  bookShareUrl = document.getElementById("book-share-url");
  settingModalShareButton = document.getElementById("setting-modal-share-button");

  bookShareModalClose.addEventListener("click", () => {
    bookShareModal.classList.add("hidden");
  });
  settingModalShareButton.addEventListener("click", () => {
    openBookShareModal(settingModalBookId);
  });
});

function openBookShareModal(bookId) {
  const targetUrl = new URL(`app.html#${bookId}`, window.location.href).href;
  bookShareUrl.textContent = targetUrl;
  bookShareQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(targetUrl)}`;
  bookShareModal.classList.remove("hidden");
}

let solvedModal;
let solvedModalClose;
let solvedArea;
document.addEventListener("DOMContentLoaded", () => {
  solvedModal = document.getElementById("solved-modal");
  solvedModalClose = document.getElementById("solved-modal-close");
  solvedArea = document.getElementById("solved-area");

  solvedModalClose.addEventListener("click", () => {
    solvedModal.classList.add("hidden");
  });
});

function openSolvedModal(bookId) {
  const solvedBy = (bookCache[bookId] && bookCache[bookId][6]) || [];
  solvedArea.innerHTML = "";

  if (solvedBy.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "まだ誰も解いていません";
    solvedArea.appendChild(emptyMessage);
  } else {
    solvedBy.forEach(userId => {
      const item = document.createElement("div");
      item.classList.add("member-item");

      const left = document.createElement("div");
      left.classList.add("member-left");

      const cached = getUserCache(userId) || {};
      const avatar = createAvatar(cached.name, "small", cached.imageUrl);
      left.appendChild(avatar);

      const nameSpan = document.createElement("span");
      nameSpan.classList.add("member-name");
      nameSpan.textContent = cached.name || "不明なユーザー";
      if (cached.isAdmin) nameSpan.classList.add("admin");
      left.appendChild(nameSpan);

      item.appendChild(left);
      item.addEventListener("click", () => {
        openProfileModal(userId);
      });
      solvedArea.appendChild(item);
    });
  }

  solvedModal.classList.remove("hidden");
}

let profileModal;
let profileModalClose;
let profileAvatarHolder;
let profileName;
let profileNameInput;
let profileText;
let profileTextEdit;
let profileEditButton;
let isProfileEditing = false;
let currentProfileUserId = "";

document.addEventListener("DOMContentLoaded", () => {
  profileModal = document.getElementById("profile-modal");
  profileModalClose = document.getElementById("profile-modal-close");
  profileAvatarHolder = document.getElementById("profile-avatar-holder");
  profileName = document.getElementById("profile-name");
  profileNameInput = document.getElementById("profile-name-input");
  profileText = document.getElementById("profile-text");
  profileTextEdit = document.getElementById("profile-text-edit");
  profileEditButton = document.getElementById("profile-edit-button");

  profileModalClose.addEventListener("click", () => {
    profileModal.classList.add("hidden");
    resetProfileEditMode();
  });

  profileEditButton.addEventListener("click", handleProfileEditOrSave);
});

// 編集モードをリセットする関数
function resetProfileEditMode() {
  isProfileEditing = false;
  if (profileEditButton) {
    profileEditButton.textContent = "プロフィールを編集";
    profileEditButton.disabled = false;
  }
  if (profileName) profileName.classList.remove("hidden");
  if (profileNameInput) profileNameInput.classList.add("hidden");
  if (profileText) profileText.classList.remove("hidden");
  if (profileTextEdit) profileTextEdit.classList.add("hidden");
}

// 編集ボタン・保存ボタンが押された時の処理
async function handleProfileEditOrSave() {
  if (!isProfileEditing) {
    isProfileEditing = true;
    profileEditButton.textContent = "プロフィールを保存";

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

  } else {
    const newName = profileNameInput.value.trim();
    const newProfileText = profileTextEdit.value.trim();

    if (!newName) {
      alert("ユーザーネームを入力してください。");
      return;
    }

    profileEditButton.disabled = true;
    profileEditButton.textContent = "保存中...";

    try {
      await db.collection("users_random").doc(currentProfileUserId).set(
        {
          name: newName,
          profileText: newProfileText
        },
        { merge: true }
      );

      const previousCache = getUserCache(currentProfileUserId) || {};
      const updated = setUserCache(currentProfileUserId, {
        name: newName,
        isAdmin: previousCache.isAdmin || false,
        imageUrl: previousCache.imageUrl || "",
        profileText: newProfileText
      });

      if (currentProfileUserId === myUserId) {
        drawerUsername.textContent = newName;
      }

      profileName.textContent = newName;
      profileText.textContent = newProfileText || "ステータスメッセージはありません。";

      profileAvatarHolder.innerHTML = "";
      profileAvatarHolder.appendChild(createAvatar(newName, "large", updated.imageUrl));

      profileName.classList.toggle("admin", !!updated.isAdmin);

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

// プロフィールモーダルを開く関数。キャッシュにステータスメッセージまで揃っていれば再取得しない
async function openProfileModal(userId, startEditMode = false) {
  currentProfileUserId = userId;
  resetProfileEditMode();

  const cached = getUserCache(userId);
  profileName.textContent = (cached && cached.name) || "取得中...";
  profileName.classList.toggle("admin", !!(cached && cached.isAdmin));
  profileText.textContent = (cached && cached.profileText) || "取得中...";

  profileAvatarHolder.innerHTML = "";
  profileAvatarHolder.appendChild(createAvatar(profileName.textContent, "large", cached && cached.imageUrl));

  const canEdit = meIsAdmin || userId === myUserId;
  profileEditButton.classList.toggle("hidden", !canEdit);
  profileModal.classList.remove("hidden");

  // すでにステータスメッセージまでキャッシュ済みなら、Firestoreへは再取得しに行かない
  if (cached && cached.profileText !== undefined) {
    if (canEdit && startEditMode) handleProfileEditOrSave();
    return;
  }

  try {
    const userSnapshot = await db.collection("users_random").doc(userId).get();
    if (userSnapshot.exists) {
      const userData = userSnapshot.data();
      const updated = setUserCache(userId, {
        name: userData.name || "名前未設定",
        isAdmin: userData.isAdmin || false,
        imageUrl: userData.imageUrl || "",
        profileText: userData.profileText || ""
      });

      profileName.textContent = updated.name;
      profileName.classList.toggle("admin", !!updated.isAdmin);
      profileText.textContent = updated.profileText || "ステータスメッセージはありません。";

      profileAvatarHolder.innerHTML = "";
      profileAvatarHolder.appendChild(createAvatar(profileName.textContent, "large", updated.imageUrl));

      if (canEdit && startEditMode) handleProfileEditOrSave();
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

let impressionsModal;
let impressionsModalClose;
let impressionsArea;
document.addEventListener("DOMContentLoaded", () => {
  impressionsModal = document.getElementById("impressions-modal");
  impressionsModalClose = document.getElementById("impressions-modal-close");
  impressionsArea = document.getElementById("impressions-area");

  impressionsModalClose.addEventListener("click", () => {
    impressionsModal.classList.add("hidden");
  });
});

async function openImpressionsModal(bookId) {
  impressionsArea.innerHTML = "<p>読み込み中...</p>";
  impressionsModal.classList.remove("hidden");

  try {
    const bookSnap = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(bookId)
      .get();
    const impressions = (bookSnap.exists && bookSnap.data().impressions) || {};
    const entries = Object.entries(impressions).filter(([, text]) => text && text.trim() !== "");

    impressionsArea.innerHTML = "";

    if (entries.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.textContent = "まだ感想はありません";
      impressionsArea.appendChild(emptyMessage);
      return;
    }

    for (const [userId] of entries) {
      await ensureUserCached(userId);
    }

    entries.forEach(([userId, text]) => {
      const cached = getUserCache(userId) || {};

      const card = document.createElement("div");
      card.classList.add("impression-card");

      const header = document.createElement("div");
      header.classList.add("impression-card-header");

      const avatar = createAvatar(cached.name, "small", cached.imageUrl);
      header.appendChild(avatar);

      const nameSpan = document.createElement("span");
      nameSpan.classList.add("impression-card-name", "clickable-user");
      nameSpan.textContent = cached.name || "不明なユーザー";
      if (cached.isAdmin) nameSpan.classList.add("admin");
      nameSpan.addEventListener("click", () => {
        openProfileModal(userId);
      });
      header.appendChild(nameSpan);

      const textP = document.createElement("p");
      textP.classList.add("impression-card-text");
      textP.textContent = text;

      card.appendChild(header);
      card.appendChild(textP);
      impressionsArea.appendChild(card);
    });
  } catch (error) {
    console.error("感想の取得エラー:", error);
    impressionsArea.innerHTML = "<p>感想の取得に失敗しました。</p>";
  }
}
