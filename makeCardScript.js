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

let loadingOverlay;
let cardsListEl;
let addCardButton;
let submitButton;
let cardTemplate;
let deckTitleInput;
let deckDescriptionInput;
let deckSubjectSelect;
let deckGradeSelect;
let deckAllowFlipCheckbox;

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  cardsListEl = document.getElementById("cards-list");
  addCardButton = document.getElementById("add-card-button");
  submitButton = document.getElementById("submit-button");
  cardTemplate = document.getElementById("card-template");
  deckTitleInput = document.getElementById("deck-title-input");
  deckDescriptionInput = document.getElementById("deck-description-input");
  deckSubjectSelect = document.getElementById("deck-subject-select");
  deckGradeSelect = document.getElementById("deck-grade-select");
  deckAllowFlipCheckbox = document.getElementById("deck-allow-flip-checkbox");

  addCardButton.addEventListener("click", () => addCardBlock());
  submitButton.addEventListener("click", handleSubmit);

  // 最初は2枚分の入力欄を用意しておく
  addCardBlock();
  addCardBlock();
});

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged((user) => {
    if (user) {
      myUserId = user.email.split("@")[0];
      updateLastChecked();
    } else {
      console.log("logout");
      window.location.href = "./index.html";
    }
  });
});

// ★ 最終アクセス日時の更新。優先度が低いので他の読み込みを妨げないよう、待たずに投げっぱなしにする
function updateLastChecked() {
  db.collection("users_random")
    .doc(myUserId)
    .set({ lastOpenedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
    .catch(error => console.error("最終アクセス日時の更新エラー:", error));
}


function addCardBlock() {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".problem-card");
  const removeButton = card.querySelector(".remove-problem-button");

  removeButton.addEventListener("click", () => {
    card.remove();
    renumberCards();
  });

  cardsListEl.appendChild(card);
  renumberCards();
}

function renumberCards() {
  const cards = cardsListEl.querySelectorAll(".problem-card");
  cards.forEach((card, index) => {
    card.querySelector(".problem-card-title").textContent = `カード ${index + 1}`;
  });
}


async function handleSubmit() {
  const title = deckTitleInput.value.trim();
  if (!title) {
    alert("タイトルを入力してください。");
    return;
  }

  const description = deckDescriptionInput.value.trim();
  const subjectId = Number(deckSubjectSelect.value);
  const gradeId = Number(deckGradeSelect.value);
  const allowFlip = deckAllowFlipCheckbox.checked;
  const visibilityRadio = document.querySelector(".deck-visibility-radio:checked");
  const isPrivate = !!visibilityRadio && visibilityRadio.value === "private";

  const cardBlocks = Array.from(cardsListEl.querySelectorAll(".problem-card"));
  if (cardBlocks.length < MIN_CARDS) {
    alert("カードを1枚以上追加してください。");
    return;
  }

  const cardsPayload = [];
  for (let i = 0; i < cardBlocks.length; i++) {
    const cardNumber = i + 1;
    const front = cardBlocks[i].querySelector(".card-front-input").value.trim();
    const back = cardBlocks[i].querySelector(".card-back-input").value.trim();

    if (!front) {
      alert(`${cardNumber}枚目の表面を入力してください。`);
      return;
    }
    if (!back) {
      alert(`${cardNumber}枚目の裏面を入力してください。`);
      return;
    }

    cardsPayload.push({ front, back });
  }

  if (!myUserId) {
    alert("ユーザー情報を確認しています。少し待ってからもう一度お試しください。");
    return;
  }

  submitButton.disabled = true;
  loadingOverlay.classList.remove("hidden");

  try {
    await db
      .collection("ProblemPosting")
      .doc("cards")
      .collection("data")
      .add({
        title,
        description,
        subjectId,
        gradeId,
        madeBy: myUserId,
        allowFlip,
        isPrivate,
        cardCount: cardsPayload.length,
        cards: cardsPayload,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    alert("暗記カードを作成しました！");
    window.location.href = "./app.html";
  } catch (error) {
    console.error(error);
    alert("作成に失敗しました。\n" + error);
    submitButton.disabled = false;
    loadingOverlay.classList.add("hidden");
  }
}
