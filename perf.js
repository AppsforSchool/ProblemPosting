// ★ ページ読み込みの各段階にかかった時間を計測し、読み込み完了後に「管理者のときだけ」結果を表示する。
//   時刻はすべて performance.now()（= ページ遷移を開始した時点からの経過ミリ秒）で記録する。
//
//   perfMark("名前")          … 直前のマークから今までを1つの区間として記録する（メインの直列処理用）
//   perfStart("名前") → end() … 並行して走る処理の開始〜終了を記録する（OneSignalなど）
//   perfSample("名前", ms)    … 同じ種類の処理を何度も行うもの（未読数クエリなど）の件数・平均・最大をまとめる
//   perfNote("文字列")        … 件数などの補足メモ
//   perfShowReport({isAdmin}) … 管理者なら画面に結果を出す（1ページにつき1回だけ）

const spans = [];     // { label, start, end|null, kind: "main" | "parallel" }
const samples = {};   // label -> { count, sum, max }
const notes = [];
let lastMainEnd = 0;  // 直前のメイン処理が終わった時刻（最初はページ遷移の開始 = 0）
let shown = false;

const now = () => performance.now();

export function perfMark(label) {
  const end = now();
  spans.push({ label, start: lastMainEnd, end, kind: "main" });
  lastMainEnd = end;
}

// ★ 「最後に完了した段階」を取得する（読み込みが止まったとき、どこで止まっているかを表示するため）
export function perfLastMarkLabel() {
  const main = spans.filter((x) => x.kind === "main");
  return main.length ? main[main.length - 1].label : "（開始直後）";
}

// ★ 一定時間たっても読み込みが終わらないとき、onStall(経過秒, 最後に完了した段階) を呼ぶ（以後も5秒ごと）
export function perfWatchStall(isDone, onStall, firstMs = 12000) {
  const tick = () => {
    if (isDone()) return;
    onStall(Math.round(now() / 1000), perfLastMarkLabel());
    setTimeout(tick, 5000);
  };
  setTimeout(tick, firstMs);
}

export function perfStart(label) {
  const span = { label, start: now(), end: null, kind: "parallel" };
  spans.push(span);
  return () => { if (span.end === null) span.end = now(); };
}

export function perfSample(label, ms) {
  const s = samples[label] || (samples[label] = { count: 0, sum: 0, max: 0 });
  s.count++;
  s.sum += ms;
  if (ms > s.max) s.max = ms;
}

export function perfNote(text) {
  notes.push(text);
}

// ---------- 表示用の整形 ----------
const fmt = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(2) + " 秒" : Math.round(ms) + " ms");

function shortUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 38 ? "…" + u.pathname.slice(-37) : u.pathname;
    return u.host + path;
  } catch (e) {
    return url;
  }
}

function collectBrowserTimings() {
  const rows = [];
  const nav = performance.getEntriesByType("navigation")[0];
  if (nav) {
    rows.push(["サーバー応答開始(TTFB)", nav.responseStart]);
    rows.push(["HTML取得完了", nav.responseEnd]);
    rows.push(["DOM構築完了(DOMContentLoaded)", nav.domContentLoadedEventEnd]);
    if (nav.loadEventEnd > 0) rows.push(["load完了(画像・CSS等)", nav.loadEventEnd]);
  }
  return rows;
}

function collectSlowResources() {
  const entries = performance.getEntriesByType("resource")
    .map((r) => ({ name: shortUrl(r.name), type: r.initiatorType, start: r.startTime, duration: r.duration, size: r.transferSize || 0, proto: r.nextHopProtocol || "" }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);
  return entries;
}

function buildReport(page) {
  const end = Math.max(lastMainEnd, ...spans.map((s) => s.end || 0));
  const lines = [];
  lines.push(`【読み込み計測】${page}  合計 ${fmt(lastMainEnd)}（ページ遷移開始から表示完了まで）`);
  lines.push("");
  lines.push("■ 段階ごとの所要時間（開始〜終了 / 所要）");
  spans.forEach((s) => {
    const dur = s.end === null ? null : s.end - s.start;
    const tag = s.kind === "parallel" ? "[並行] " : "";
    lines.push(`${tag}${s.label}: ${fmt(s.start)} → ${s.end === null ? "未完了" : fmt(s.end)} / ${dur === null ? "(表示時点で未完了)" : fmt(dur)}`);
  });
  const sampleKeys = Object.keys(samples);
  if (sampleKeys.length) {
    lines.push("");
    lines.push("■ 繰り返し処理の集計");
    sampleKeys.forEach((k) => {
      const s = samples[k];
      lines.push(`${k}: ${s.count}回 / 平均 ${fmt(s.sum / s.count)} / 最大 ${fmt(s.max)} / 合計 ${fmt(s.sum)}`);
    });
  }
  if (notes.length) {
    lines.push("");
    lines.push("■ メモ");
    notes.forEach((n) => lines.push(n));
  }
  lines.push("");
  lines.push("■ ブラウザ計測");
  collectBrowserTimings().forEach(([label, ms]) => lines.push(`${label}: ${fmt(ms)}`));
  lines.push("");
  lines.push("■ 通信が遅かったリソース上位10件（所要時間 / 開始時刻 / サイズ）");
  collectSlowResources().forEach((r) => {
    lines.push(`${r.name} [${r.type}${r.proto ? "/" + r.proto : ""}]: ${fmt(r.duration)} / 開始 ${fmt(r.start)}${r.size ? " / " + Math.round(r.size / 1024) + "KB" : ""}`);
  });
  return { text: lines.join("\n"), total: end };
}

function injectStyle() {
  if (document.getElementById("perf-report-style")) return;
  const style = document.createElement("style");
  style.id = "perf-report-style";
  style.textContent = [
    "#perf-report{position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:12px}",
    "#perf-report .perf-box{background:#1e232a;color:#e8edf2;width:100%;max-width:760px;max-height:90vh;display:flex;flex-direction:column;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.4);font-family:ui-monospace,Menlo,Consolas,monospace}",
    "#perf-report .perf-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;border-bottom:1px solid #3a424c;font-weight:700;font-size:14px;position:sticky;top:0}",
    "#perf-report .perf-head button{font:inherit;font-size:12px;padding:6px 10px;border:none;border-radius:6px;cursor:pointer;background:#3a424c;color:#fff;margin-left:6px}",
    "#perf-report pre{margin:0;padding:12px 14px;overflow:auto;font-size:11.5px;line-height:1.6;white-space:pre-wrap;word-break:break-all}"
  ].join("\n");
  document.head.appendChild(style);
}

// ★ 読み込みが終わったあとに呼ぶ。管理者でなければ何も表示しない
export function perfShowReport({ isAdmin, page, diagnostics }) {
  if (shown) return;
  shown = true;
  if (!isAdmin) return;

  const { text: baseText } = buildReport(page || location.pathname.split("/").pop() || "page");
  let fullText = baseText;
  window.__perfReport = fullText;
  console.log(baseText);

  injectStyle();
  const wrap = document.createElement("div");
  wrap.id = "perf-report";
  const diagButton = diagnostics ? '<button type="button" data-act="diag">通信診断を実行</button>' : "";
  wrap.innerHTML =
    '<div class="perf-box">' +
      '<div class="perf-head"><span>読み込み計測（管理者のみ）</span>' +
        "<span>" + diagButton +
        '<button type="button" data-act="copy">コピー</button>' +
        '<button type="button" data-act="close">閉じる</button></span></div>' +
      "<pre></pre>" +
    "</div>";
  const pre = wrap.querySelector("pre");
  pre.textContent = fullText;

  wrap.addEventListener("click", async (e) => {
    const target = e.target;
    const act = target && target.getAttribute && target.getAttribute("data-act");
    if (act === "close" || target === wrap) wrap.remove();
    if (act === "copy") {
      try { await navigator.clipboard.writeText(fullText); target.textContent = "コピーしました"; }
      catch (err) { target.textContent = "コピー失敗"; }
    }
    if (act === "diag" && diagnostics) {
      target.disabled = true;
      target.textContent = "診断中...（最大1〜2分）";
      let lines;
      try { lines = await diagnostics(); }
      catch (err) { lines = ["診断に失敗しました: " + (err && err.message ? err.message : err)]; }
      fullText = fullText + "\n\n■ 通信診断\n" + lines.join("\n");
      window.__perfReport = fullText;
      pre.textContent = fullText;
      target.textContent = "診断完了";
    }
  });
  document.body.appendChild(wrap);
}
