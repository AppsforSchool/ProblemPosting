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
  "社会(公民)"
];
const gradeIdList = ["不明", "1年", "2年", "3年", "総合"];

let myUid = "";
let myUserId = "";

let userCache = {};
let userAdminCache = {};

let bookCache = {};

let drawerOverlay;
let accountSettingsDrawer;
let drawerCloseButton;
let accountSettingsButton;
let drawerUserId;
let drawerLogoutButton;
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
      drawerUsername.textContent = userCache[myUserId];
      if (userAdminCache[myUserId]) drawerUsername.classList.add("admin");

      myUid = userData.uid;

      //displayVocabularyBooks();
      await loadProblemBooks();
      makeDisplayBooks(0, 0);
    } else {
      console.log("logout");
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
    } catch (error) {
      console.error("ログアウトエラー:", error);
      alert("ログアウトに失敗しました。");
    }
  }
};

async function loadProblemBooks() {
  try {
    /*
    
    */

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
      if (7 < subjectId) subjectId = 0;
      let gradeId = data.gradeId || 0;
      if (4 < gradeId) gradeId = 0;
      let problemCount = 0;
      const makerUserId = data.madeBy || "";

      bookCache[bookId] = [
        title,
        description,
        subjectId,
        gradeId,
        problemCount,
        makerUserId
      ];

      /*
      const card = document.createElement("div");
      card.classList.add("card");
      
      const cardTop = document.createElement("div");
      cardTop.classList.add("card-top");
      const subjectBadge = document.createElement("span");
      subjectBadge.classList.add("badge");
      subjectBadge.classList.add(`t${subjectId}`);
      subjectBadge.textContent = subjectIdList[subjectId];
      const gradeBadge = document.createElement("span");
      gradeBadge.classList.add("badge");
      gradeBadge.classList.add(`t${subjectId}`);
      gradeBadge.textContent = gradeIdList[gradeId];
      const wordCountBadge = document.createElement("span");
      wordCountBadge.classList.add("badge");
      wordCountBadge.classList.add(`t${subjectId}`);
      wordCountBadge.innerHTML = `${STACK_ICON_SVG}${0}問`;
      cardTop.appendChild(subjectBadge);
      cardTop.appendChild(gradeBadge);
      cardTop.appendChild(wordCountBadge);
      
      const cardTitle = document.createElement("p");
      cardTitle.classList.add("card-title");
      cardTitle.textContent = title;
      
      const cardDescription = document.createElement("p");
      cardDescription.classList.add("card-description");
      cardDescription.textContent = description;
      
      const cardMadeBy = document.createElement("span");
      cardMadeBy.classList.add("card-madeBy");
      */
      if (!(makerUserId in userCache) || !(makerUserId in userAdminCache)) {
        // Firestoreへのアクセスは「1回だけ」
        const userSnapshot = await db.collection("users_random").doc(makerUserId).get();
    
        if (userSnapshot.exists) {
          const userData = userSnapshot.data();
      
          // 1回の通信で、両方のキャッシュを同時に保存する！
          userCache[makerUserId] = userData.name || "名前未設定";
          userAdminCache[makerUserId] = userData.isAdmin || false;
        } else {
          // ドキュメントが存在しなかった場合のセーフティ
          userCache[makerUserId] = "不明なユーザー";
          userAdminCache[makerUserId] = false;
        }
      }
      /*
      const makerName = userCache[makerUserId];
      const isAdmin = userAdminCache[makerUserId];
      const nameSpan = document.createElement("span");
      nameSpan.textContent = makerName;
      if (isAdmin) nameSpan.classList.add("admin");
      const madeByTextContent = document.createTextNode('作成者: ');
      cardMadeBy.appendChild(madeByTextContent);
      cardMadeBy.appendChild(nameSpan);
      
      if (isAdmin) nameSpan.classList.add("admin");
      
      
      card.addEventListener("click", () => {
        openSettingModal(bookId);
      });
      
      
      card.appendChild(cardTop);
      card.appendChild(cardTitle);
      card.appendChild(cardDescription);
      card.appendChild(cardMadeBy);
      fragment.appendChild(card);
      */
    }

    /*
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
    
    loadingText.classList.add("hidden");
    listElement.appendChild(makeBookButton);
    listElement.appendChild(fragment);
    */
  } catch (error) {
    console.log(error);
    alert(error);
  }
}

function makeDisplayBooks(subjectId, gradeId) {
  const listElement = document.getElementById("card-area");
  const loadingText = document.getElementById("loading-text");

  listElement.innerHTML = "";
  loadingText.classList.remove("hidden");
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
      
      
    card.addEventListener("click", () => {
      openSettingModal(bookId);
    });
      
      
    card.appendChild(cardTop);
    card.appendChild(cardTitle);
    card.appendChild(cardDescription);
    card.appendChild(cardMadeBy);
    
    if (subjectId === 0) {
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
    for (let i = 0; i < 7; i++) {
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
    //console.log(`./solve.html?id=${settingModalBookId}`);
    window.location.href = `./solve.html?id=${settingModalBookId}`;
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

  if (bookCache[id][5] === myUserId) settingModalEditButton.disabled = false;
}
