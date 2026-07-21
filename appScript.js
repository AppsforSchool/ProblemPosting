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

let userCache = {};
let userAdminCache = {};
let userImageCache = {};

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

// ★ 指定したユーザーの情報（name/isAdmin/imageUrl）がキャッシュになければ取得する
async function ensureUserCached(userId) {
  if (userId in userCache && userId in userAdminCache && userId in userImageCache) return;

  const userSnapshot = await db.collection("users_random").doc(userId).get();
  if (userSnapshot.exists) {
    const userData = userSnapshot.data();
    userCache[userId] = userData.name || "名前未設定";
    userAdminCache[userId] = userData.isAdmin || false;
    userImageCache[userId] = userData.imageUrl || "";
  } else {
    userCache[userId] = "不明なユーザー";
    userAdminCache[userId] = false;
    userImageCache[userId] = "";
  }
}

let drawerOverlay;
let accountSettingsDrawer;
let drawerCloseButton;
let accountSettingsButton;
let drawerUserId;
let drawerLogoutButton;

let subjectSelect;
let gradeSelect;

document.addEventListener("DOMContentLoaded", () => {
  drawerOverlay = document.getElementById("drawerOverlay");
  accountSettingsDrawer = document.getElementById("accountSettingsDrawer");
  drawerCloseButton = document.getElementById("drawerCloseButton");
  accountSettingsButton = document.getElementById("setting-button");

  drawerUserId = document.getElementById("drawerUserId");
  drawerLogoutButton = document.getElementById("logout-button");

  accountSettingsButton.addEventListener("click", openDrawer);
  drawerCloseButton.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);
  drawerLogoutButton.addEventListener("click", handleLogout);

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
      userCache[myUserId] = userData.name;
      userAdminCache[myUserId] = userData.isAdmin;
      userImageCache[myUserId] = userData.imageUrl || "";
      meIsAdmin = userData.isAdmin || false;
      drawerUsername.textContent = userCache[myUserId];
      if (userAdminCache[myUserId]) drawerUsername.classList.add("admin");

      myUid = userData.uid;

      //displayVocabularyBooks();
      await loadProblemBooks();
      makeDisplayBooks("all", "all");
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
      
    const makerName = userCache[book[5]];
    const isAdmin = userAdminCache[book[5]];
    const nameSpan = document.createElement("span");
    nameSpan.textContent = makerName;
    if (isAdmin) nameSpan.classList.add("admin");
    const madeByTextContent = document.createTextNode('作成者: ');
    cardMadeBy.appendChild(madeByTextContent);
    cardMadeBy.appendChild(nameSpan);
      
    if (isAdmin) nameSpan.classList.add("admin");
      
    const solvedBy = book[6] || [];
    let solvedByArea = null;
    if (solvedBy.length > 0) {
      solvedByArea = document.createElement("div");
      solvedByArea.classList.add("solved-by-area");

      const solvedByLabel = document.createElement("span");
      solvedByLabel.classList.add("solved-by-label");
      solvedByLabel.textContent = "解いた人:";

      const stack = document.createElement("div");
      stack.classList.add("solved-by-stack");

      const MAX_SHOWN = 4;
      solvedBy.slice(0, MAX_SHOWN).forEach(userId => {
        const avatar = createAvatar(userCache[userId], "small", userImageCache[userId]);
        avatar.classList.add("solved-by-avatar");
        stack.appendChild(avatar);
      });
      if (solvedBy.length > MAX_SHOWN) {
        const overflow = document.createElement("div");
        overflow.classList.add("avatar-circle", "small", "solved-by-avatar", "solved-by-overflow");
        overflow.textContent = "…";
        stack.appendChild(overflow);
      }

      solvedByArea.appendChild(solvedByLabel);
      solvedByArea.appendChild(stack);

      solvedByArea.addEventListener("click", (e) => {
        e.stopPropagation();
        openSolvedModal(bookId);
      });
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
let settingModalEditButton, settingModalStartButton;
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

  settingModalClose.addEventListener("click", () => {
    settingModal.classList.add("hidden");
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
});

function openSettingModal(id) {
  settingModalBookId = id;
  settingModal.classList.remove("hidden");
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
  settingModalMadeByName.textContent = userCache[bookCache[id][5]];
  if (userAdminCache[bookCache[id][5]])
    settingModalMadeByName.classList.add("admin");

  if (bookCache[id][5] === myUserId || meIsAdmin) settingModalEditButton.disabled = false;
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

      const avatar = createAvatar(userCache[userId], "small", userImageCache[userId]);
      left.appendChild(avatar);

      const nameSpan = document.createElement("span");
      nameSpan.classList.add("member-name");
      nameSpan.textContent = userCache[userId] || "不明なユーザー";
      if (userAdminCache[userId]) nameSpan.classList.add("admin");
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

      userCache[currentProfileUserId] = newName;

      if (currentProfileUserId === myUserId) {
        drawerUsername.textContent = newName;
      }

      profileName.textContent = newName;
      profileText.textContent = newProfileText || "ステータスメッセージはありません。";

      profileAvatarHolder.innerHTML = "";
      profileAvatarHolder.appendChild(createAvatar(newName, "large", userImageCache[currentProfileUserId]));

      const userSnapshot = await db.collection("users_random").doc(currentProfileUserId).get();
      if (userSnapshot.exists && userSnapshot.data().isAdmin) {
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
async function openProfileModal(userId) {
  currentProfileUserId = userId;
  resetProfileEditMode();

  profileName.textContent = userCache[userId] || "取得中...";
  profileName.classList.toggle("admin", !!userAdminCache[userId]);
  profileText.textContent = "取得中...";

  profileAvatarHolder.innerHTML = "";
  profileAvatarHolder.appendChild(createAvatar(profileName.textContent, "large", userImageCache[userId]));

  const canEdit = meIsAdmin || userId === myUserId;
  profileEditButton.classList.toggle("hidden", !canEdit);
  profileModal.classList.remove("hidden");

  try {
    const userSnapshot = await db.collection("users_random").doc(userId).get();
    if (userSnapshot.exists) {
      const userData = userSnapshot.data();

      userCache[userId] = userData.name || "名前未設定";
      userAdminCache[userId] = userData.isAdmin || false;
      userImageCache[userId] = userData.imageUrl || "";

      profileName.textContent = userCache[userId];
      profileName.classList.toggle("admin", !!userData.isAdmin);
      profileText.textContent = userData.profileText || "ステータスメッセージはありません。";

      profileAvatarHolder.innerHTML = "";
      profileAvatarHolder.appendChild(createAvatar(profileName.textContent, "large", userImageCache[userId]));
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
