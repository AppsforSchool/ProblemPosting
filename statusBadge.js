// ★ 画面左上（ヘッダーのすぐ下）に、読み込み中などの小さな通知（角丸の四角形）を縦に積んで出す共通部品。
//   ・「通知の受信を準備中…」（notify.js）、「画像を読み込み中…(a/b)」＋ゲージ（talkScript.js）、
//     「計測結果をみる」ボタン（perf.js、管理者のみ）が、同じ場所に縦に並ぶ。
//   ・並び順は order で決める（小さいほうが上）。OneSignal = 1、画像 = 2、計測結果 = 3。
//   ・消えるとき：フェードアウトしながら高さも0に縮め、下にあった通知が上に詰まる（同時に動く）。
//     出るとき：その逆（フェードインしながら、高さが広がる）。
//   ・表示のたびにヘッダーの高さを測り直す（画面幅や新旧UIで変わるため）。
//   ・通知の外側（スタック）はクリックを通過させるので、操作の邪魔にならない。ボタンの通知だけクリックできる。
//   ・OSの「視差効果を減らす」設定がオンの端末では、アニメーションなしで切り替える。

const DURATION = 300; // ミリ秒（フェード・高さ・余白を同じ長さで動かす）
let stack = null;

function injectStyle() {
  if (document.getElementById("status-badge-style")) return;
  const style = document.createElement("style");
  style.id = "status-badge-style";
  style.textContent = [
    "#status-badge-stack{position:fixed;left:12px;z-index:60;display:flex;flex-direction:column;align-items:flex-start;pointer-events:none}",
    /* 通知どうしの間隔は gap ではなく margin-bottom にしている（消えるときに間隔ごと縮めて、きれいに詰めるため） */
    ".status-badge{box-sizing:border-box;margin-bottom:6px;padding:.4rem .8rem;border-radius:10px;background:rgba(36,48,61,.9);color:#fff;font-size:.78rem;font-weight:700;line-height:1.4;box-shadow:0 4px 14px rgba(0,0,0,.2);white-space:nowrap}",
    ".status-badge.hidden{display:none}",
    ".status-badge-gauge{margin-top:.3rem;height:4px;border-radius:999px;background:rgba(255,255,255,.28);overflow:hidden}",
    ".status-badge-gauge-fill{height:100%;width:0;border-radius:999px;background:#fff;transition:width .2s ease}",
    /* ボタンの通知：クリックできる。ボタン標準の見た目を打ち消し、他の通知と同じ形にそろえる */
    "button.status-badge-button{pointer-events:auto;cursor:pointer;font-family:inherit;text-align:left;border:1px solid rgba(255,255,255,.4);-webkit-appearance:none;appearance:none}",
    "button.status-badge-button:active{transform:scale(.97)}"
  ].join("\n");
  document.head.appendChild(style);
}

function positionStack() {
  if (!stack) return;
  // ★ 問題投稿サイトの追加：「みんなで解く」の画面だけ、ヘッダーのIDが app-header ではなく live-header
  const header = document.getElementById("app-header") || document.getElementById("live-header");
  const bottom = header ? Math.max(header.getBoundingClientRect().bottom, 0) : 0;
  stack.style.top = (bottom + 8) + "px";
}

export function getStatusBadgeStack() {
  if (stack) return stack;
  injectStyle();
  stack = document.createElement("div");
  stack.id = "status-badge-stack";
  document.body.appendChild(stack);
  window.addEventListener("resize", positionStack);
  positionStack();
  return stack;
}

// ---------- 出入りのアニメーション ----------
const ANIMATED = ["height", "opacity", "marginBottom", "paddingTop", "paddingBottom"];
const prefersReducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

function transitionValue() {
  return ["height", "opacity", "margin-bottom", "padding-top", "padding-bottom"]
    .map((p) => `${p} ${DURATION}ms ease`).join(", ");
}

// アニメーション用に付けた inline スタイルとタイマーを取り除く（途中で止める／終わったあとの後始末）
function clearAnimation(el) {
  clearTimeout(el._animTimer);
  el._animTimer = null;
  ANIMATED.forEach((p) => { el.style[p] = ""; });
  el.style.overflow = "";
  el.style.transition = "";
}

// 消える：フェードアウトしながら、高さ・余白を0に縮める（→ 下の通知が同時に上に詰まる）
function animateOut(el) {
  const height = el.offsetHeight;
  el.style.overflow = "hidden";
  el.style.height = height + "px";
  void el.offsetHeight; // 縮め始める前の状態を確定させる
  el.style.transition = transitionValue();
  el.style.height = "0px";
  el.style.opacity = "0";
  el.style.marginBottom = "0px";
  el.style.paddingTop = "0px";
  el.style.paddingBottom = "0px";
  el._animTimer = setTimeout(() => {
    clearAnimation(el);
    el.classList.add("hidden");
  }, DURATION + 40);
}

// 出る：高さ0・透明の状態から、元の大きさまで広げながらフェードインする
function animateIn(el) {
  const cs = getComputedStyle(el);
  const target = { height: el.offsetHeight + "px", marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom };
  el.style.overflow = "hidden";
  el.style.height = "0px";
  el.style.opacity = "0";
  el.style.marginBottom = "0px";
  el.style.paddingTop = "0px";
  el.style.paddingBottom = "0px";
  void el.offsetHeight;
  el.style.transition = transitionValue();
  el.style.height = target.height;
  el.style.opacity = "1";
  el.style.marginBottom = target.marginBottom;
  el.style.paddingTop = target.paddingTop;
  el.style.paddingBottom = target.paddingBottom;
  el._animTimer = setTimeout(() => clearAnimation(el), DURATION + 40);
}

// ★ 通知の表示/非表示を切り替える（すでにその状態なら何もしない）。切り替えはアニメーション付き
export function setStatusBadgeVisible(el, visible) {
  const isShown = el.dataset.state === "shown";
  if (visible === isShown) return;
  clearAnimation(el); // 動いている途中なら、そこで止めて、反対向きに動かし直す
  el.dataset.state = visible ? "shown" : "hidden";

  if (visible) {
    positionStack();
    el.classList.remove("hidden");
    if (!prefersReducedMotion()) animateIn(el);
  } else if (prefersReducedMotion()) {
    el.classList.add("hidden");
  } else {
    animateOut(el);
  }
}

function prepareBadge(el, order) {
  el.classList.add("status-badge", "hidden"); // 作った時点では非表示
  el.dataset.state = "hidden";
  el.style.order = String(order);
  getStatusBadgeStack().appendChild(el);
  return el;
}

// ★ 文字だけの通知を作る（例：「通知の受信を準備中…」）。作った時点では非表示
export function createTextBadge(text, order) {
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.textContent = text;
  return prepareBadge(el, order);
}

// ★ 文字＋その下に進捗ゲージ付きの通知を作る（例：「画像を読み込み中…(12/87)」）。作った時点では非表示
//   set(文字, 割合0〜1) で内容を更新、show() / hide() で表示を切り替える
export function createGaugeBadge(order) {
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  const label = document.createElement("div");
  const gauge = document.createElement("div");
  gauge.className = "status-badge-gauge";
  const fill = document.createElement("div");
  fill.className = "status-badge-gauge-fill";
  gauge.appendChild(fill);
  el.appendChild(label);
  el.appendChild(gauge);
  prepareBadge(el, order);

  return {
    set(text, ratio) {
      label.textContent = text;
      fill.style.width = (Math.max(0, Math.min(1, ratio)) * 100) + "%";
    },
    show() { setStatusBadgeVisible(el, true); },
    hide() { setStatusBadgeVisible(el, false); }
  };
}

// ★ 押せる通知（ボタン）を作る（例：「計測結果をみる」）。作った時点では非表示
//   show() で表示、hide() で隠す、remove() でフェードアウトしてから要素ごと取り除く
export function createButtonBadge(text, onClick, order) {
  const el = document.createElement("button");
  el.type = "button";
  el.classList.add("status-badge-button");
  el.textContent = text;
  el.addEventListener("click", onClick);
  prepareBadge(el, order);

  return {
    show() { setStatusBadgeVisible(el, true); },
    hide() { setStatusBadgeVisible(el, false); },
    remove() {
      setStatusBadgeVisible(el, false);
      setTimeout(() => el.remove(), DURATION + 100);
    }
  };
}
