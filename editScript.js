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
let currentBookId = "";
let imgbbApiKeyCache = null;

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

function getParmFromUrl(parm) {
  const params = new URLSearchParams(window.location.search);
  return params.get(parm);
}

let loadingOverlay;
let noPermissionOverlay;
let noPermissionHomeButton;
let problemsListEl;
let addProblemButton;
let submitButton;
let deleteBookButton;
let problemTemplate;
let choiceTemplate;
let bookTitleInput;
let bookDescriptionInput;
let bookSubjectSelect;
let bookGradeSelect;

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  noPermissionOverlay = document.getElementById("no-permission-overlay");
  noPermissionHomeButton = document.getElementById("no-permission-home-button");
  problemsListEl = document.getElementById("problems-list");
  addProblemButton = document.getElementById("add-problem-button");
  submitButton = document.getElementById("submit-button");
  deleteBookButton = document.getElementById("delete-book-button");
  problemTemplate = document.getElementById("problem-template");
  choiceTemplate = document.getElementById("choice-template");
  bookTitleInput = document.getElementById("book-title-input");
  bookDescriptionInput = document.getElementById("book-description-input");
  bookSubjectSelect = document.getElementById("book-subject-select");
  bookGradeSelect = document.getElementById("book-grade-select");

  addProblemButton.addEventListener("click", () => addProblemBlock());
  submitButton.addEventListener("click", handleUpdate);
  deleteBookButton.addEventListener("click", handleDeleteBook);
  noPermissionHomeButton.addEventListener("click", () => {
    window.location.href = "./app.html";
  });
});

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      myUserId = user.email.split("@")[0];

      currentBookId = getParmFromUrl("id");
      if (!currentBookId) {
        alert("問題集が指定されていません。");
        window.location.href = "./app.html";
        return;
      }

      await loadBookData(currentBookId);
    } else {
      console.log("logout");
      window.location.href = "./index.html";
    }
  });
});

async function loadBookData(bookId) {
  try {
    const bookRef = db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(bookId);
    const bookSnap = await bookRef.get();

    if (!bookSnap.exists) {
      alert("問題集が見つかりません。");
      window.location.href = "./app.html";
      return;
    }

    const bookData = bookSnap.data();

    if (bookData.madeBy !== myUserId) {
      loadingOverlay.classList.add("hidden");
      noPermissionOverlay.classList.remove("hidden");
      return;
    }

    bookTitleInput.value = bookData.title || "";
    bookDescriptionInput.value = bookData.description || "";
    bookSubjectSelect.value = String(bookData.subjectId || 0);
    bookGradeSelect.value = String(bookData.gradeId || 0);

    const problemsSnap = await bookRef.collection("problems").orderBy("no").get();
    problemsListEl.innerHTML = "";

    problemsSnap.forEach(doc => {
      const data = doc.data();
      addProblemBlock({
        problem: data.problem || "",
        choices: data.choices || [],
        answer: data.answer || [],
        explanation: data.explanation || "",
        imageUrl: data.imageUrl || ""
      });
    });

    if (problemsListEl.children.length === 0) {
      addProblemBlock();
    }

    loadingOverlay.classList.add("hidden");
  } catch (error) {
    console.error(error);
    alert("問題集の読み込みに失敗しました。\n" + error);
  }
}


function addProblemBlock(prefill) {
  const fragment = problemTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".problem-card");
  const choicesListEl = card.querySelector(".choices-list");
  const addChoiceButton = card.querySelector(".add-choice-button");
  const removeProblemButton = card.querySelector(".remove-problem-button");
  const problemTextInput = card.querySelector(".problem-text-input");
  const explanationInput = card.querySelector(".explanation-input");

  removeProblemButton.addEventListener("click", () => {
    card.remove();
    renumberProblems();
  });
  addChoiceButton.addEventListener("click", () => {
    addChoiceRow(choicesListEl);
    updateChoiceButtonsState(card);
  });

  setupImageControls(card, prefill ? prefill.imageUrl : "");

  problemsListEl.appendChild(card);

  if (prefill) {
    problemTextInput.value = prefill.problem || "";
    explanationInput.value = prefill.explanation || "";

    const choices = prefill.choices && prefill.choices.length ? prefill.choices : ["", ""];
    const answer = prefill.answer || [];
    choices.forEach((choiceText, index) => {
      addChoiceRow(choicesListEl, choiceText, answer.includes(index));
    });
  } else {
    // 新規追加時は選択肢を最初から2つ用意しておく
    addChoiceRow(choicesListEl);
    addChoiceRow(choicesListEl);
  }

  updateChoiceButtonsState(card);
  renumberProblems();
}

function setupImageControls(card, existingImageUrl) {
  const selectImageButton = card.querySelector(".select-image-button");
  const imageFileInput = card.querySelector(".image-file-input");
  const previewWrap = card.querySelector(".problem-image-preview-wrap");
  const previewImg = card.querySelector(".problem-image-preview");
  const removeImageButton = card.querySelector(".remove-image-button");

  card._selectedImageFile = null;
  card._existingImageUrl = existingImageUrl || "";
  card._imageRemoved = false;

  if (card._existingImageUrl) {
    previewImg.src = card._existingImageUrl;
    previewWrap.classList.remove("hidden");
    selectImageButton.classList.add("hidden");
  }

  selectImageButton.addEventListener("click", () => {
    imageFileInput.click();
  });

  imageFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    card._selectedImageFile = file;
    card._imageRemoved = false;

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
    card._imageRemoved = true;
    imageFileInput.value = "";
    previewImg.src = "";
    previewWrap.classList.add("hidden");
    selectImageButton.classList.remove("hidden");
  });
}

function addChoiceRow(choicesListEl, prefillText, prefillChecked) {
  if (choicesListEl.children.length >= MAX_CHOICES) return;

  const fragment = choiceTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".choice-row");
  const removeChoiceButton = row.querySelector(".remove-choice-button");
  const textInput = row.querySelector(".choice-text-input");
  const checkbox = row.querySelector(".choice-correct-checkbox");

  if (prefillText !== undefined) textInput.value = prefillText;
  if (prefillChecked) checkbox.checked = true;

  removeChoiceButton.addEventListener("click", () => {
    row.remove();
    const card = choicesListEl.closest(".problem-card");
    updateChoiceButtonsState(card);
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


function validateAndCollectPayload() {
  const title = bookTitleInput.value.trim();
  if (!title) {
    alert("タイトルを入力してください。");
    return null;
  }

  const description = bookDescriptionInput.value.trim();
  const subjectId = Number(bookSubjectSelect.value);
  const gradeId = Number(bookGradeSelect.value);

  const problemCards = Array.from(problemsListEl.querySelectorAll(".problem-card"));
  if (problemCards.length === 0) {
    alert("問題を1問以上追加してください。");
    return null;
  }

  const problemsPayload = [];

  for (let i = 0; i < problemCards.length; i++) {
    const card = problemCards[i];
    const problemNumber = i + 1;

    const problemText = card.querySelector(".problem-text-input").value.trim();
    if (!problemText) {
      alert(`${problemNumber}問目の問題文を入力してください。`);
      return null;
    }

    const choiceRows = Array.from(card.querySelectorAll(".choice-row"));
    if (choiceRows.length < MIN_CHOICES) {
      alert(`${problemNumber}問目の選択肢は${MIN_CHOICES}個以上入力してください。`);
      return null;
    }

    const choices = [];
    const answer = [];
    for (let c = 0; c < choiceRows.length; c++) {
      const choiceText = choiceRows[c].querySelector(".choice-text-input").value.trim();
      if (!choiceText) {
        alert(`${problemNumber}問目の選択肢${c + 1}を入力してください。`);
        return null;
      }
      choices.push(choiceText);
      if (choiceRows[c].querySelector(".choice-correct-checkbox").checked) {
        answer.push(c);
      }
    }

    if (answer.length === 0) {
      alert(`${problemNumber}問目の正解を1つ以上チェックしてください。`);
      return null;
    }

    const explanation = card.querySelector(".explanation-input").value.trim();

    problemsPayload.push({
      problem: problemText,
      choices,
      answer,
      explanation,
      imageFile: card._selectedImageFile || null,
      imageRemoved: !!card._imageRemoved,
      existingImageUrl: card._existingImageUrl || ""
    });
  }

  return { title, description, subjectId, gradeId, problemsPayload };
}

async function handleUpdate() {
  const collected = validateAndCollectPayload();
  if (!collected) return;
  const { title, description, subjectId, gradeId, problemsPayload } = collected;

  if (!myUserId) {
    alert("ユーザー情報を確認しています。少し待ってからもう一度お試しください。");
    return;
  }

  submitButton.disabled = true;
  deleteBookButton.disabled = true;
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
        } else if (p.imageRemoved) {
          p.imageUrl = "";
        } else {
          p.imageUrl = p.existingImageUrl;
        }
      }
      if (loadingText) loadingText.textContent = "保存しています｡";
    } else {
      problemsPayload.forEach(p => {
        p.imageUrl = p.imageRemoved ? "" : p.existingImageUrl;
      });
    }

    const bookRef = db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(currentBookId);

    const existingProblemsSnap = await bookRef.collection("problems").get();

    const batch = db.batch();
    batch.update(bookRef, {
      title,
      description,
      subjectId,
      gradeId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    existingProblemsSnap.forEach(doc => batch.delete(doc.ref));
    problemsPayload.forEach((p, index) => {
      const problemRef = bookRef.collection("problems").doc();
      batch.set(problemRef, {
        no: index + 1,
        problem: p.problem,
        choices: p.choices,
        answer: p.answer,
        explanation: p.explanation,
        imageUrl: p.imageUrl
      });
    });
    await batch.commit();

    alert("問題集を更新しました！");
    window.location.href = "./app.html";
  } catch (error) {
    console.error(error);
    alert("更新に失敗しました。\n" + error);
    submitButton.disabled = false;
    deleteBookButton.disabled = false;
    loadingOverlay.classList.add("hidden");
  }
}

async function handleDeleteBook() {
  const isConfirmed = confirm("本当にこの問題集を削除しますか？この操作は取り消せません。");
  if (!isConfirmed) return;

  submitButton.disabled = true;
  deleteBookButton.disabled = true;
  loadingOverlay.classList.remove("hidden");
  const loadingText = loadingOverlay.querySelector("p");
  if (loadingText) loadingText.textContent = "削除しています｡";

  try {
    const bookRef = db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(currentBookId);

    const problemsSnap = await bookRef.collection("problems").get();
    const batch = db.batch();
    problemsSnap.forEach(doc => batch.delete(doc.ref));
    batch.delete(bookRef);
    await batch.commit();

    alert("削除しました。");
    window.location.href = "./app.html";
  } catch (error) {
    console.error(error);
    alert("削除に失敗しました。\n" + error);
    submitButton.disabled = false;
    deleteBookButton.disabled = false;
    loadingOverlay.classList.add("hidden");
  }
}
