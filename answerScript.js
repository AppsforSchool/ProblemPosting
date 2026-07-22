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

let userCache = {};
let userAdminCache = {};

let problemsData = [];

let currentProblemIndex = 0;
let correctAnswersCount = 0;
let currentBookId = "";

let answerButton;
let answerModal;
let answerResultText;
let answerExplanationArea;
let answerExplanationText;
let answerCorrectList;
let answerModalNextButton;

let homeButton;
let resultModal;
let resultScoreText;
let resultHomeButton;

let writeImpressionButton;
let impressionModal;
let impressionModalClose;
let impressionInput;
let impressionSaveButton;

let loadingOverlay;
let drawerOverlay;
let accountSettingsDrawer;
let drawerCloseButton;
let accountSettingsButton;
let drawerUserId;
let drawerLogoutButton;
document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
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

  answerButton = document.getElementById("answer-button");
  answerModal = document.getElementById("answer-modal");
  answerResultText = document.getElementById("answer-result-text");
  answerExplanationArea = document.getElementById("answer-explanation-area");
  answerExplanationText = document.getElementById("answer-explanation-text");
  answerCorrectList = document.getElementById("answer-correct-list");
  answerModalNextButton = document.getElementById("answer-modal-next-button");

  answerButton.addEventListener("click", handleAnswerSubmit);
  answerModalNextButton.addEventListener("click", handleAnswerModalNext);

  homeButton = document.getElementById("home-button");
  resultModal = document.getElementById("result-modal");
  resultScoreText = document.getElementById("result-score-text");
  resultHomeButton = document.getElementById("result-home-button");

  writeImpressionButton = document.getElementById("write-impression-button");
  impressionModal = document.getElementById("impression-modal");
  impressionModalClose = document.getElementById("impression-modal-close");
  impressionInput = document.getElementById("impression-input");
  impressionSaveButton = document.getElementById("impression-save-button");

  homeButton.addEventListener("click", () => {
    if (confirm("本当にやめますか？")) {
      window.location.href = "./app.html";
    }
  });
  resultHomeButton.addEventListener("click", () => {
    window.location.href = "./app.html";
  });

  writeImpressionButton.addEventListener("click", openImpressionModal);
  impressionModalClose.addEventListener("click", () => {
    impressionModal.classList.add("hidden");
  });
  impressionSaveButton.addEventListener("click", saveImpression);
});

async function openImpressionModal() {
  impressionInput.value = "";
  impressionInput.disabled = true;
  impressionModal.classList.remove("hidden");

  try {
    const bookSnap = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(currentBookId)
      .get();
    const impressions = (bookSnap.exists && bookSnap.data().impressions) || {};
    impressionInput.value = impressions[myUserId] || "";
  } catch (error) {
    console.error("感想の取得エラー:", error);
  } finally {
    impressionInput.disabled = false;
  }
}

async function saveImpression() {
  const text = impressionInput.value.trim();

  impressionSaveButton.disabled = true;
  impressionSaveButton.textContent = "保存中...";

  try {
    await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(currentBookId)
      .update({
        [`impressions.${myUserId}`]: text
      });
    alert("感想を保存しました。");
    impressionModal.classList.add("hidden");
  } catch (error) {
    console.error("感想の保存エラー:", error);
    alert("感想の保存に失敗しました。\n" + error);
  } finally {
    impressionSaveButton.disabled = false;
    impressionSaveButton.textContent = "保存する";
  }
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
      drawerUsername.textContent = userCache[myUserId];
      if (userAdminCache[myUserId]) drawerUsername.classList.add("admin");

      myUid = userData.uid;

      const bookId = getParmFromUrl("id");
      if (!bookId) {
        alert("問題集が指定されていません。");
        return;
      }
      currentBookId = bookId;
      await loadProblemBook(bookId);
      loadingOverlay.classList.add("hidden");
      document.getElementById("problem-area").classList.remove("hidden");
      
      nextProblem(0);
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


function getParmFromUrl(parm) {
  const params = new URLSearchParams(window.location.search);
  return params.get(parm);
}

async function loadProblemBook(bookId) {
  try {
    const titleAreaTitle = document.getElementById("title-area-title");
    const allProblemsCount = document.getElementById("all-problems-count");
    
    const bookDocRef = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(bookId);
    const bookData = await bookDocRef.get();
    titleAreaTitle.textContent = bookData.get("title");
    
    const problemsSnapshot = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(bookId)
      .collection("problems")
      .orderBy("no")
      .get();
    
    allProblemsCount.textContent = problemsSnapshot.size;

    for (const doc of problemsSnapshot.docs) {
      const data = doc.data();
      if (!data.problem) throw new Error("問題文がありません");
      const problem = data.problem;
      if (!data.choices) throw new Error("選択肢がありません");
      const choices = data.choices;
      if (!data.answer) throw new Error("解答がありません");
      const answer = data.answer;
      const answerType = data.answerType || (answer.length === 1 ? "single" : "multiple");
      const explanation = data.explanation || "";
      const imageUrl = data.imageUrl || "";
      
      problemsData.push([problem, choices, answer, explanation, imageUrl, answerType]);
    }
  } catch (error) {
    console.log(error);
    alert(error);
  }
}



function nextProblem(problemCount) {
  currentProblemIndex = problemCount;

  const gaugeBar = document.getElementById("gauge-bar");
  const nowProblemCount = document.getElementById("now-problem-count");
  const problemText = document.getElementById("problem-text");
  const choicesArea = document.getElementById("choices-area");
  const answerTypeText = document.getElementById("answer-type-text");
  
  choicesArea.innerHTML = "";
  
  const isSingle = problemsData[problemCount][5] === "single";
  answerTypeText.textContent = isSingle ? "単数選択" : "複数選択";
  
  gaugeBar.style.width = `${((problemCount + 1) / problemsData.length) * 100}%`;
  nowProblemCount.textContent = problemCount + 1;
  problemText.textContent = problemsData[problemCount][0];
  
  const problemImage = document.getElementById("problem-image");
  const imageUrl = problemsData[problemCount][4];
  if (imageUrl) {
    problemImage.src = imageUrl;
    problemImage.classList.remove("hidden");
  } else {
    problemImage.src = "";
    problemImage.classList.add("hidden");
  }
  
  let choiceButtons = [];
  problemsData[problemCount][1].forEach((choice, index) => {
    const button = document.createElement("button");
    button.textContent = choice;
    button.dataset.index = index;
    choiceButtons.push(button);
    
    choicesArea.appendChild(button);
  });
  // console.log(choiceButtons);
  choiceButtons.forEach(button => {
    if (isSingle) {
      button.addEventListener("click", () => {
        choiceButtons.forEach(choice => {
          choice.classList.remove("active");
        });
        button.classList.add("active");
      });
    } else {
      button.addEventListener("click", () => {
        button.classList.toggle("active");
      });
    }
  });
  
  answerButton.disabled = false;
}


function handleAnswerSubmit() {
  const choicesArea = document.getElementById("choices-area");
  const buttons = Array.from(choicesArea.querySelectorAll("button"));

  const selectedIndices = buttons
    .filter(button => button.classList.contains("active"))
    .map(button => Number(button.dataset.index));

  if (selectedIndices.length === 0) {
    alert("選択肢を選んでください。");
    return;
  }

  const correctIndices = problemsData[currentProblemIndex][2];
  const isCorrect = isSameIndexSet(selectedIndices, correctIndices);

  if (isCorrect) correctAnswersCount++;

  buttons.forEach(button => {
    const index = Number(button.dataset.index);
    button.classList.remove("active");
    if (correctIndices.includes(index)) {
      button.classList.add("correct");
    } else if (selectedIndices.includes(index)) {
      button.classList.add("incorrect");
    }
    button.disabled = true;
  });

  answerButton.disabled = true;

  showAnswerModal(isCorrect);
}

function isSameIndexSet(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((value, i) => value === sortedB[i]);
}

function showAnswerModal(isCorrect) {
  answerResultText.textContent = isCorrect ? "正解！" : "不正解...";
  answerResultText.classList.toggle("correct-text", isCorrect);
  answerResultText.classList.toggle("incorrect-text", !isCorrect);

  const choices = problemsData[currentProblemIndex][1];
  const correctIndices = problemsData[currentProblemIndex][2];
  answerCorrectList.innerHTML = "";
  correctIndices.forEach(index => {
    const li = document.createElement("li");
    li.textContent = choices[index];
    answerCorrectList.appendChild(li);
  });

  const explanation = problemsData[currentProblemIndex][3];
  if (explanation) {
    answerExplanationText.textContent = explanation;
    answerExplanationArea.classList.remove("hidden");
  } else {
    answerExplanationArea.classList.add("hidden");
  }

  const isLastProblem = currentProblemIndex === problemsData.length - 1;
  answerModalNextButton.textContent = isLastProblem ? "結果を見る" : "次へ";

  answerModal.classList.remove("hidden");
}

function handleAnswerModalNext() {
  answerModal.classList.add("hidden");

  const nextIndex = currentProblemIndex + 1;
  if (nextIndex < problemsData.length) {
    nextProblem(nextIndex);
  } else {
    showResultModal();
  }
}

function showResultModal() {
  resultScoreText.textContent = `${correctAnswersCount} / ${problemsData.length} 問正解`;
  resultModal.classList.remove("hidden");

  db.collection("ProblemPosting")
    .doc("books")
    .collection("data")
    .doc(currentBookId)
    .update({
      solvedBy: firebase.firestore.FieldValue.arrayUnion(myUserId)
    })
    .catch(error => console.error("解答済み記録エラー:", error));
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
