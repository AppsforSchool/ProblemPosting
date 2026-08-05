const firebaseConfig = {
  apiKey: "AIzaSyAqIiNj0N4WruPSOkWbeo5gxzsNyeMkuLo",
  authDomain: "appsforschool-study.firebaseapp.com",
  projectId: "appsforschool-study",
  storageBucket: "appsforschool-study.firebasestorage.app",
  messagingSenderId: "740735293440",
  appId: "1:740735293440:web:a1363adbab57f1ceec60e5"
};

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const MIN_CARDS = 1;
const MAX_CARDS = 100;

let myUserId = "";
let meIsAdmin = false;
let currentDeckId = "";
let wasAlreadyPublic = false;

function getParmFromUrl(parm) {
  const params = new URLSearchParams(window.location.search);
  return params.get(parm);
}

let loadingOverlay;
let loadingStatusText;
let noPermissionOverlay;
let noPermissionHomeButton;
let cardsListEl;
let addCardButton;
let submitButton;
let deleteDeckButton;
let cardTemplate;
let deckTitleInput;
let deckDescriptionInput;
let deckSubjectSelect;
let deckGradeSelect;
let deckAllowFlipCheckbox;
let madeByArea;
let deckMadeByInput;
let importJsonButton;
let importJsonFileInput;
let exportJsonButton;

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  loadingStatusText = document.getElementById("loading-status-text");
  noPermissionOverlay = document.getElementById("no-permission-overlay");
  noPermissionHomeButton = document.getElementById("no-permission-home-button");
  cardsListEl = document.getElementById("cards-list");
  addCardButton = document.getElementById("add-card-button");
  submitButton = document.getElementById("submit-button");
  deleteDeckButton = document.getElementById("delete-deck-button");
  cardTemplate = document.getElementById("card-template");
  deckTitleInput = document.getElementById("deck-title-input");
  deckDescriptionInput = document.getElementById("deck-description-input");
  deckSubjectSelect = document.getElementById("deck-subject-select");
  deckGradeSelect = document.getElementById("deck-grade-select");
  deckAllowFlipCheckbox = document.getElementById("deck-allow-flip-checkbox");
  madeByArea = document.getElementById("made-by-area");
  deckMadeByInput = document.getElementById("deck-madeBy-input");
  importJsonButton = document.getElementById("import-json-button");
  importJsonFileInput = document.getElementById("import-json-file-input");
  exportJsonButton = document.getElementById("export-json-button");

  addCardButton.addEventListener("click", () => addCardBlock());
  submitButton.addEventListener("click", handleUpdate);
  deleteDeckButton.addEventListener("click", handleDeleteDeck);
  noPermissionHomeButton.addEventListener("click", () => {
    window.location.href = "./app.html";
  });
  importJsonButton.addEventListener("click", () => importJsonFileInput.click());
  importJsonFileInput.addEventListener("change", handleImportJsonFile);
  exportJsonButton.addEventListener("click", handleExportJson);
});

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      setLoadingStatus("ユーザー情報を確認しています｡");
      myUserId = user.email.split("@")[0];

      const mySnapshot = await db.collection("users_random").doc(myUserId).get();
      meIsAdmin = mySnapshot.exists ? !!mySnapshot.data().isAdmin : false;

      currentDeckId = getParmFromUrl("id");
      if (!currentDeckId) {
        alert("暗記カードが指定されていません。");
        window.location.href = "./app.html";
        return;
      }

      await loadDeckData(currentDeckId);
      updateLastChecked();
    } else {
      console.log("logout");
      window.location.href = "./index.html";
    }
  });
});

// ★ ローディングオーバーレイ下部の小さいテキストを更新する
function setLoadingStatus(text) {
  if (loadingStatusText) loadingStatusText.textContent = text;
}

// ★ 最終アクセス日時の更新。優先度が低いので他の読み込みを妨げないよう、待たずに投げっぱなしにする
function updateLastChecked() {
  db.collection("users_random")
    .doc(myUserId)
    .set({ lastOpenedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
    .catch(error => console.error("最終アクセス日時の更新エラー:", error));
}

async function loadDeckData(deckId) {
  try {
    setLoadingStatus("暗記カードの情報を読み込んでいます｡");

    const deckRef = db.collection("ProblemPosting").doc("cards").collection("data").doc(deckId);
    const deckSnap = await deckRef.get();

    if (!deckSnap.exists) {
      alert("暗記カードが見つかりません。");
      window.location.href = "./app.html";
      return;
    }

    const deckData = deckSnap.data();

    if (deckData.madeBy !== myUserId && !meIsAdmin) {
      loadingOverlay.classList.add("hidden");
      noPermissionOverlay.classList.remove("hidden");
      return;
    }

    deckTitleInput.value = deckData.title || "";
    deckDescriptionInput.value = deckData.description || "";
    deckSubjectSelect.value = String(deckData.subjectId || 0);
    deckGradeSelect.value = String(deckData.gradeId || 0);
    deckAllowFlipCheckbox.checked = !!deckData.allowFlip;

    wasAlreadyPublic = !deckData.isPrivate;
    const visibilityRadios = document.querySelectorAll(".deck-visibility-radio");
    visibilityRadios.forEach(radio => {
      radio.checked = deckData.isPrivate ? radio.value === "private" : radio.value === "public";
      // 一度公開された暗記カードは、非公開に戻せないようにする
      if (wasAlreadyPublic) {
        radio.disabled = radio.value === "private";
      }
    });
    const visibilityLockedMessage = document.getElementById("visibility-locked-message");
    if (visibilityLockedMessage) visibilityLockedMessage.classList.toggle("hidden", !wasAlreadyPublic);

    if (meIsAdmin) {
      madeByArea.classList.remove("hidden");
      deckMadeByInput.value = deckData.madeBy || "";
    }

    const cards = deckData.cards || [];
    cardsListEl.innerHTML = "";
    cards.forEach(c => {
      addCardBlock({ front: c.front || "", back: c.back || "" });
    });

    if (cardsListEl.children.length === 0) {
      addCardBlock();
    }

    loadingOverlay.classList.add("hidden");
  } catch (error) {
    console.error(error);
    alert("暗記カードの読み込みに失敗しました。\n" + error);
  }
}


function addCardBlock(prefill) {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".problem-card");
  const removeButton = card.querySelector(".remove-problem-button");

  removeButton.addEventListener("click", () => {
    card.remove();
    renumberCards();
  });

  cardsListEl.appendChild(card);

  if (prefill) {
    card.querySelector(".card-front-input").value = prefill.front || "";
    card.querySelector(".card-back-input").value = prefill.back || "";
  }

  renumberCards();
}

function renumberCards() {
  const cards = cardsListEl.querySelectorAll(".problem-card");
  cards.forEach((card, index) => {
    card.querySelector(".problem-card-title").textContent = `カード ${index + 1}`;
  });
}


// ★ JSONエクスポート・インポート（AIで作ったカードを取り込めるようにする機能）

function downloadJsonFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(name) {
  const base = (name || "card-deck").trim() || "card-deck";
  return base.replace(/[\\/:*?"<>|]/g, "_") + ".json";
}

function handleExportJson() {
  const cardBlocks = Array.from(cardsListEl.querySelectorAll(".problem-card"));
  const cards = cardBlocks.map(card => ({
    front: card.querySelector(".card-front-input").value.trim(),
    back: card.querySelector(".card-back-input").value.trim()
  }));

  const data = {
    title: deckTitleInput.value.trim(),
    description: deckDescriptionInput.value.trim(),
    subjectId: Number(deckSubjectSelect.value) || 0,
    gradeId: Number(deckGradeSelect.value) || 0,
    allowFlip: deckAllowFlipCheckbox.checked,
    cards
  };

  downloadJsonFile(data, safeFileName(data.title));
}

function handleImportJsonFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      applyImportedDeckJson(data);
    } catch (error) {
      console.error(error);
      alert("JSONの読み込みに失敗しました。ファイルの形式を確認してください。\n" + error);
    }
  };
  reader.readAsText(file);

  // 同じファイルを連続で選択してもchangeイベントが発火するようにリセット
  event.target.value = "";
}

function applyImportedDeckJson(data) {
  if (!data || typeof data !== "object") {
    alert("JSONの形式が正しくありません。");
    return;
  }

  const cards = Array.isArray(data.cards) ? data.cards : [];
  if (cards.length === 0) {
    alert("cards配列が見つからないか、中身が空です。");
    return;
  }

  const isConfirmed = confirm(`${cards.length}枚を読み込みます。現在のカードはすべて置き換えられますがよろしいですか？`);
  if (!isConfirmed) return;

  if (typeof data.title === "string") deckTitleInput.value = data.title;
  if (typeof data.description === "string") deckDescriptionInput.value = data.description;
  if (data.subjectId !== undefined) deckSubjectSelect.value = String(Number(data.subjectId) || 0);
  if (data.gradeId !== undefined) deckGradeSelect.value = String(Number(data.gradeId) || 0);
  if (data.allowFlip !== undefined) deckAllowFlipCheckbox.checked = !!data.allowFlip;

  cardsListEl.innerHTML = "";
  cards.forEach(c => addCardBlock(c));

  if (cardsListEl.children.length === 0) {
    addCardBlock();
  }
}


function validateAndCollectPayload() {
  const title = deckTitleInput.value.trim();
  if (!title) {
    alert("タイトルを入力してください。");
    return null;
  }

  const description = deckDescriptionInput.value.trim();
  const subjectId = Number(deckSubjectSelect.value);
  const gradeId = Number(deckGradeSelect.value);
  const allowFlip = deckAllowFlipCheckbox.checked;

  const visibilityRadio = document.querySelector(".deck-visibility-radio:checked");
  // 一度公開された暗記カードは、UIを迂回されても非公開に戻せないようにする
  const isPrivate = wasAlreadyPublic ? false : (!!visibilityRadio && visibilityRadio.value === "private");

  let madeBy = null;
  if (meIsAdmin) {
    madeBy = deckMadeByInput.value.trim();
    if (!madeBy) {
      alert("作成者のユーザーIDを入力してください。");
      return null;
    }
  }

  const cardBlocks = Array.from(cardsListEl.querySelectorAll(".problem-card"));
  if (cardBlocks.length < MIN_CARDS) {
    alert("カードを1枚以上追加してください。");
    return null;
  }

  const cardsPayload = [];
  for (let i = 0; i < cardBlocks.length; i++) {
    const cardNumber = i + 1;
    const front = cardBlocks[i].querySelector(".card-front-input").value.trim();
    const back = cardBlocks[i].querySelector(".card-back-input").value.trim();

    if (!front) {
      alert(`${cardNumber}枚目の表面を入力してください。`);
      return null;
    }
    if (!back) {
      alert(`${cardNumber}枚目の裏面を入力してください。`);
      return null;
    }

    cardsPayload.push({ front, back });
  }

  return { title, description, subjectId, gradeId, allowFlip, isPrivate, madeBy, cardsPayload };
}

async function handleUpdate() {
  const collected = validateAndCollectPayload();
  if (!collected) return;
  const { title, description, subjectId, gradeId, allowFlip, isPrivate, madeBy, cardsPayload } = collected;

  if (!myUserId) {
    alert("ユーザー情報を確認しています。少し待ってからもう一度お試しください。");
    return;
  }

  submitButton.disabled = true;
  deleteDeckButton.disabled = true;
  loadingOverlay.classList.remove("hidden");
  setLoadingStatus("暗記カードを更新しています｡");

  try {
    const deckRef = db.collection("ProblemPosting").doc("cards").collection("data").doc(currentDeckId);

    const updateData = {
      title,
      description,
      subjectId,
      gradeId,
      allowFlip,
      isPrivate,
      cardCount: cardsPayload.length,
      cards: cardsPayload,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (meIsAdmin && madeBy) {
      updateData.madeBy = madeBy;
    }

    await deckRef.update(updateData);

    alert("暗記カードを更新しました！");
    window.location.href = "./app.html";
  } catch (error) {
    console.error(error);
    alert("更新に失敗しました。\n" + error);
    submitButton.disabled = false;
    deleteDeckButton.disabled = false;
    loadingOverlay.classList.add("hidden");
  }
}

async function handleDeleteDeck() {
  const isConfirmed = confirm("本当にこの暗記カードを削除しますか？この操作は取り消せません。");
  if (!isConfirmed) return;

  submitButton.disabled = true;
  deleteDeckButton.disabled = true;
  loadingOverlay.classList.remove("hidden");
  setLoadingStatus("暗記カードを削除しています｡");

  try {
    const deckRef = db.collection("ProblemPosting").doc("cards").collection("data").doc(currentDeckId);
    await deckRef.delete();

    alert("削除しました。");
    window.location.href = "./app.html";
  } catch (error) {
    console.error(error);
    alert("削除に失敗しました。\n" + error);
    submitButton.disabled = false;
    deleteDeckButton.disabled = false;
    loadingOverlay.classList.add("hidden");
  }
}
