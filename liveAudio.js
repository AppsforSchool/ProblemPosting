// ★ 効果音はWeb Audio APIでその場で合成し、BGMは音源ファイル(BGM/marbletechno2.mp3)を再生するモジュール。
//   liveHost.html / liveAnswer.html の両方から <script> で読み込み、グローバルの LiveAudio として使う。
const LiveAudio = (() => {
  const BGM_SRC = "BGM/marbletechno2.mp3";

  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let bgmAudioEl = null;
  let muted = localStorage.getItem("liveAudioMuted") === "1";

  function ensureContext() {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      ctx = new AudioContextClass();

      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.35;
      sfxGain.connect(masterGain);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // ★ BGM用の<audio>要素を用意する(効果音とは別に、通常のHTMLAudio再生でループさせる)
  function ensureBgmAudio() {
    if (!bgmAudioEl) {
      bgmAudioEl = new Audio(BGM_SRC);
      bgmAudioEl.loop = true;
      bgmAudioEl.preload = "auto";
      bgmAudioEl.volume = 0.35;
    }
    bgmAudioEl.muted = muted;
    return bgmAudioEl;
  }

  // ★ ブラウザの自動再生制限対策。ページ内の最初のタップ/クリックで音声を解禁する
  function unlock() {
    ensureContext();
    ensureBgmAudio();
  }
  ["click", "touchstart"].forEach(evt => {
    document.addEventListener(evt, unlock, { once: true, passive: true });
  });

  // ---- 基本パーツ(効果音用) ----
  function playTone(freq, duration, type, delay, gainValue, destination) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(gainValue || 0.3, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(destination || sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
    return osc;
  }

  // ★ 音程を滑らかに変化させる(トロンボーン風の「ワウン」やお祝いの「タラーン」に使う)
  function playSlide(freqFrom, freqTo, duration, type, delay, gainValue, destination) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sawtooth";
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(gainValue || 0.3, t0 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(destination || sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  // ---- 効果音 ----
  function playCountdownTick(isFinal) {
    ensureContext();
    if (isFinal) {
      // 最後の1つ手前は上ずったダブルブリップで期待感を演出
      playTone(880, 0.12, "square", 0, 0.4);
      playTone(1175, 0.28, "square", 0.1, 0.45);
    } else {
      playTone(660, 0.14, "square", 0, 0.28);
    }
  }

  function playQuestionStart() {
    ensureContext();
    // 軽快な上昇3連符で「はじまるよ!」感を出す
    [523.25, 659.25, 987.77].forEach((f, i) => playTone(f, 0.14, "triangle", i * 0.07, 0.28));
  }

  function playLock() {
    ensureContext();
    playSlide(420, 160, 0.35, "sawtooth", 0, 0.22);
  }

  function playReveal() {
    ensureContext();
    playTone(660, 0.1, "sine", 0, 0.22);
    playTone(880, 0.18, "sine", 0.09, 0.24);
  }

  function playCorrect() {
    ensureContext();
    // ピコピコ上昇アルペジオ + キラッと1音add
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playTone(f, 0.16, "square", i * 0.075, 0.26));
    playTone(1568, 0.35, "sine", 0.32, 0.18);
  }

  function playIncorrect() {
    ensureContext();
    // コミカルな「ワウ〜ン」下降スライド(悲しいトロンボーン風)
    playSlide(330, 110, 0.55, "sawtooth", 0, 0.22);
    playSlide(220, 90, 0.5, "sawtooth", 0.08, 0.12);
  }

  function playFanfare() {
    ensureContext();
    const melody = [523.25, 523.25, 523.25, 659.25, 783.99, 659.25, 783.99, 1046.5];
    const timing = [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.84, 1.0];
    melody.forEach((f, i) => {
      playTone(f, 0.3, "triangle", timing[i], 0.32);
      playTone(f / 2, 0.3, "square", timing[i], 0.12);
    });
    // 締めのキラキラ
    [1568, 1975.5, 2093].forEach((f, i) => playTone(f, 0.5, "sine", 1.15 + i * 0.09, 0.16));
  }

  // ---- BGM: 音源ファイル(BGM/marbletechno2.mp3)をループ再生する ----
  function startBgm() {
    ensureContext();
    const audio = ensureBgmAudio();
    audio.muted = muted;
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // ★ 自動再生がブロックされた場合、次のクリック/タップで再度試みる
        const retryPlay = () => {
          audio.play().catch(() => {});
        };
        document.addEventListener("click", retryPlay, { once: true, passive: true });
        document.addEventListener("touchstart", retryPlay, { once: true, passive: true });
      });
    }
  }
  function stopBgm() {
    if (bgmAudioEl) {
      bgmAudioEl.pause();
      bgmAudioEl.currentTime = 0;
    }
  }

  function setMuted(value) {
    muted = value;
    localStorage.setItem("liveAudioMuted", muted ? "1" : "0");
    if (masterGain) masterGain.gain.value = muted ? 0 : 1;
    if (bgmAudioEl) bgmAudioEl.muted = muted;
  }
  function toggleMuted() {
    setMuted(!muted);
    return muted;
  }
  function isMuted() {
    return muted;
  }

  // ---- アイコン(絵文字ではなく独自SVG。角を丸めた線画スタイル) ----
  function iconMarkup(isMutedIcon) {
    if (isMutedIcon) {
      return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M4 9.5H7L12 5.5V18.5L7 14.5H4C3.4 14.5 3 14.1 3 13.5V10.5C3 9.9 3.4 9.5 4 9.5Z"/>' +
        '<path d="M16.5 9.2L21 13.8M21 9.2L16.5 13.8"/>' +
        "</svg>"
      );
    }
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 9.5H7L12 5.5V18.5L7 14.5H4C3.4 14.5 3 14.1 3 13.5V10.5C3 9.9 3.4 9.5 4 9.5Z"/>' +
      '<path d="M15.3 9C16.4 10.1 16.4 13.9 15.3 15"/>' +
      '<path d="M17.6 6.6C20 9 20 15 17.6 17.4" opacity="0.7"/>' +
      "</svg>"
    );
  }

  return {
    unlock,
    playCountdownTick,
    playQuestionStart,
    playLock,
    playReveal,
    playCorrect,
    playIncorrect,
    playFanfare,
    startBgm,
    stopBgm,
    toggleMuted,
    isMuted,
    iconMarkup
  };
})();
