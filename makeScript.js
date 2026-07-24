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

const MIN_CHOICES = 2;
const MAX_CHOICES = 6;

let myUserId = "";
let imgbbApiKeyCache = null;
let problemUidCounter = 0;

// ★ ImgBBへの画像アップロード（チャットサイトと同じ仕様：system_keys/imgbb からAPIキーを取得してアップロードし、URLを保存する）
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
    throw new Error("画像のアップロードに失敗しました。");
  }
  return result.data.url;
}

let loadingOverlay;
let problemsListEl;
let addProblemButton;
let submitButton;
let problemTemplate;
let choiceTemplate;
let bookTitleInput;
let bookDescriptionInput;
let bookSubjectSelect;
let bookGradeSelect;

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  problemsListEl = document.getElementById("problems-list");
  addProblemButton = document.getElementById("add-problem-button");
  submitButton = document.getElementById("submit-button");
  problemTemplate = document.getElementById("problem-template");
  choiceTemplate = document.getElementById("choice-template");
  bookTitleInput = document.getElementById("book-title-input");
  bookDescriptionInput = document.getElementById("book-description-input");
  bookSubjectSelect = document.getElementById("book-subject-select");
  bookGradeSelect = document.getElementById("book-grade-select");

  addProblemButton.addEventListener("click", () => addProblemBlock());
  submitButton.addEventListener("click", handleSubmit);

  // 最初は1問分の入力欄を用意しておく
  addProblemBlock();
});

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged((user) => {
    if (user) {
      myUserId = user.email.split("@")[0];
    } else {
      console.log("logout");
      window.location.href = "./index.html";
    }
  });
});


function addProblemBlock() {
  const fragment = problemTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".problem-card");
  const choicesListEl = card.querySelector(".choices-list");
  const addChoiceButton = card.querySelector(".add-choice-button");
  const removeProblemButton = card.querySelector(".remove-problem-button");

  card.dataset.uid = String(problemUidCounter++);

  removeProblemButton.addEventListener("click", () => {
    card.remove();
    renumberProblems();
  });
  addChoiceButton.addEventListener("click", () => {
    addChoiceRow(choicesListEl);
    updateChoiceButtonsState(card);
  });

  setupImageControls(card);
  setupAnswerTypeControls(card);

  problemsListEl.appendChild(card);

  // 選択肢を最初から2つ用意しておく
  addChoiceRow(choicesListEl);
  addChoiceRow(choicesListEl);
  updateChoiceButtonsState(card);

  renumberProblems();
}

function setupAnswerTypeControls(card) {
  const radios = card.querySelectorAll(".answer-type-radio");
  radios.forEach(radio => {
    radio.name = `answer-type-${card.dataset.uid}`;
    radio.addEventListener("change", () => {
      if (radio.checked && radio.value === "single") {
        enforceSingleCorrectChoice(card);
      }
    });
  });
}

function getAnswerType(card) {
  const checked = card.querySelector(".answer-type-radio:checked");
  return checked ? checked.value : "single";
}

function enforceSingleCorrectChoice(card, keepCheckbox) {
  const checkboxes = Array.from(card.querySelectorAll(".choice-correct-checkbox"));
  const checked = checkboxes.filter(cb => cb.checked);
  if (checked.length <= 1) return;

  const toKeep = keepCheckbox && checked.includes(keepCheckbox) ? keepCheckbox : checked[0];
  checked.forEach(cb => {
    if (cb !== toKeep) cb.checked = false;
  });
}

function setupImageControls(card) {
  const selectImageButton = card.querySelector(".select-image-button");
  const imageFileInput = card.querySelector(".image-file-input");
  const previewWrap = card.querySelector(".problem-image-preview-wrap");
  const previewImg = card.querySelector(".problem-image-preview");
  const removeImageButton = card.querySelector(".remove-image-button");

  card._selectedImageFile = null;

  selectImageButton.addEventListener("click", () => {
    imageFileInput.click();
  });

  imageFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    card._selectedImageFile = file;

    const reader = new FileReader();
    reader.onload = (event) => {
      previewImg.src = event.target.result;
      previewWrap.classList.remove("hidden");
      selectImageButton.classList.add("hidden");
    };
    reader.readAsDataURL(file);
  });

  removeImageButton.addEventListener("click", () => {
    card._selectedImageFile = null;
    imageFileInput.value = "";
    previewImg.src = "";
    previewWrap.classList.add("hidden");
    selectImageButton.classList.remove("hidden");
  });
}

function addChoiceRow(choicesListEl) {
  if (choicesListEl.children.length >= MAX_CHOICES) return;

  const fragment = choiceTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".choice-row");
  const removeChoiceButton = row.querySelector(".remove-choice-button");
  const correctCheckbox = row.querySelector(".choice-correct-checkbox");

  removeChoiceButton.addEventListener("click", () => {
    row.remove();
    const card = choicesListEl.closest(".problem-card");
    updateChoiceButtonsState(card);
  });

  correctCheckbox.addEventListener("change", () => {
    const card = choicesListEl.closest(".problem-card");
    if (correctCheckbox.checked && getAnswerType(card) === "single") {
      enforceSingleCorrectChoice(card, correctCheckbox);
    }
  });

  choicesListEl.appendChild(row);
}

function updateChoiceButtonsState(card) {
  const choicesListEl = card.querySelector(".choices-list");
  const addChoiceButton = card.querySelector(".add-choice-button");
  const removeChoiceButtons = card.querySelectorAll(".remove-choice-button");

  const count = choicesListEl.children.length;

  addChoiceButton.disabled = count >= MAX_CHOICES;
  removeChoiceButtons.forEach(button => {
    button.disabled = count <= MIN_CHOICES;
  });
}

function renumberProblems() {
  const cards = problemsListEl.querySelectorAll(".problem-card");
  cards.forEach((card, index) => {
    card.querySelector(".problem-card-title").textContent = `問題 ${index + 1}`;
  });
}


async function handleSubmit() {
  const title = bookTitleInput.value.trim();
  if (!title) {
    alert("タイトルを入力してください。");
    return;
  }

  const description = bookDescriptionInput.value.trim();
  const subjectId = Number(bookSubjectSelect.value);
  const gradeId = Number(bookGradeSelect.value);

  const problemCards = Array.from(problemsListEl.querySelectorAll(".problem-card"));
  if (problemCards.length === 0) {
    alert("問題を1問以上追加してください。");
    return;
  }

  const problemsPayload = [];

  for (let i = 0; i < problemCards.length; i++) {
    const card = problemCards[i];
    const problemNumber = i + 1;

    const problemText = card.querySelector(".problem-text-input").value.trim();
    if (!problemText) {
      alert(`${problemNumber}問目の問題文を入力してください。`);
      return;
    }

    const choiceRows = Array.from(card.querySelectorAll(".choice-row"));
    if (choiceRows.length < MIN_CHOICES) {
      alert(`${problemNumber}問目の選択肢は${MIN_CHOICES}個以上入力してください。`);
      return;
    }

    const answerType = getAnswerType(card);

    const choices = [];
    const answer = [];
    for (let c = 0; c < choiceRows.length; c++) {
      const choiceText = choiceRows[c].querySelector(".choice-text-input").value.trim();
      if (!choiceText) {
        alert(`${problemNumber}問目の選択肢${c + 1}を入力してください。`);
        return;
      }
      choices.push(choiceText);
      if (choiceRows[c].querySelector(".choice-correct-checkbox").checked) {
        answer.push(c);
      }
    }

    if (answer.length === 0) {
      alert(`${problemNumber}問目の正解を1つ以上チェックしてください。`);
      return;
    }
    if (answerType === "single" && answer.length !== 1) {
      alert(`${problemNumber}問目は単数選択なので、正解は1つだけチェックしてください。`);
      return;
    }

    const explanation = card.querySelector(".explanation-input").value.trim();

    problemsPayload.push({
      problem: problemText,
      choices,
      answer,
      answerType,
      explanation,
      imageFile: card._selectedImageFile || null
    });
  }

  if (!myUserId) {
    alert("ユーザー情報を確認しています。少し待ってからもう一度お試しください。");
    return;
  }

  submitButton.disabled = true;
  loadingOverlay.classList.remove("hidden");
  const loadingText = loadingOverlay.querySelector("p");

  try {
    const imageCount = problemsPayload.filter(p => p.imageFile).length;
    if (imageCount > 0) {
      let uploadedCount = 0;
      for (const p of problemsPayload) {
        if (p.imageFile) {
          uploadedCount++;
          if (loadingText) loadingText.textContent = `画像をアップロードしています (${uploadedCount}/${imageCount})｡`;
          p.imageUrl = await uploadImageToImgbb(p.imageFile);
        } else {
          p.imageUrl = "";
        }
      }
      if (loadingText) loadingText.textContent = "保存しています｡";
    } else {
      problemsPayload.forEach(p => { p.imageUrl = ""; });
    }

    const bookRef = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .add({
        title,
        description,
        subjectId,
        gradeId,
        madeBy: myUserId,
        problemCount: problemsPayload.length,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    const batch = db.batch();
    problemsPayload.forEach((p, index) => {
      const problemRef = bookRef.collection("problems").doc();
      batch.set(problemRef, {
        no: index + 1,
        problem: p.problem,
        choices: p.choices,
        answer: p.answer,
        answerType: p.answerType,
        explanation: p.explanation,
        imageUrl: p.imageUrl
      });
    });
    await batch.commit();

    alert("問題集を作成しました！");
    window.location.href = "./app.html";
  } catch (error) {
    console.error(error);
    alert("作成に失敗しました。\n" + error);
    submitButton.disabled = false;
    loadingOverlay.classList.add("hidden");
  }
}
