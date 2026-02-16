const nameEl = document.getElementById("name");
const textEl = document.getElementById("text");
const progressEl = document.getElementById("progress");
const chapterTitleEl = document.getElementById("chapterTitle");
const chapterSubtitleEl = document.getElementById("chapterSubtitle");
const chapterPillEl = document.getElementById("chapterPill");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const saveBtn = document.getElementById("saveBtn");
const quickSaveBtn = document.getElementById("quickSaveBtn");
const loadBtn = document.getElementById("loadBtn");
const logBtn = document.getElementById("logBtn");
const skipBtn = document.getElementById("skipBtn");
const openBtn = document.getElementById("openBtn");
const fileInput = document.getElementById("fileInput");
const stage = document.getElementById("stage");
const sceneDim = document.getElementById("sceneDim");
const slotModal = document.getElementById("slotModal");
const slotGrid = document.getElementById("slotGrid");
const slotTitleEl = document.getElementById("slotTitle");
const slotCloseBtn = document.getElementById("slotCloseBtn");
const logModal = document.getElementById("logModal");
const logList = document.getElementById("logList");
const logCloseBtn = document.getElementById("logCloseBtn");

const state = {
  lines: [],
  index: 0,
  autoAdvanceTimer: null,
  dimTimer: null,
  typingTimer: null,
  typingText: "",
  typingIndex: 0,
  log: [],
  loggedIndices: new Set(),
};

const MAX_NARRATION_CHARS = 120;
const SAVE_KEY_PREFIX = "novel_game_save_v2";
const QUICK_SLOT = 0;
const SLOT_COUNT = 10;
const SPEAKER_THEMES = new Map([
  ["ことね", "theme-kotone"],
  ["咲季", "theme-saki"],
  ["手毬", "theme-temari"],
  ["清夏", "theme-kiyoka"],
  ["美鈴", "theme-misuzu"],
  ["星南", "theme-sena"],
]);

function pushNarrationScreens(screens, narration) {
  let buffer = "";
  for (let i = 0; i < narration.length; i += 1) {
    const ch = narration[i];
    buffer += ch;
    if (ch === "。" || ch === "！" || ch === "？" || ch === "!" || ch === "?" || ch === "\n") {
      const trimmed = buffer.trim();
      if (trimmed) {
        screens.push(trimmed);
      }
      buffer = "";
    }
  }
  const tail = buffer.trim();
  if (tail) {
    screens.push(tail);
  }
}

function cleanSpeakerName(name) {
  return name.replace(/[\s　:：]+$/g, "").trim();
}

function splitNarrationByParagraph(narration) {
  return narration
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function splitLongSentence(sentence, maxChars) {
  if (sentence.length <= maxChars) {
    return [sentence];
  }
  const parts = [];
  let start = 0;
  while (start < sentence.length) {
    parts.push(sentence.slice(start, start + maxChars));
    start += maxChars;
  }
  return parts;
}

function mergeNarration(screens, maxChars) {
  const merged = [];
  let buffer = "";
  for (const screen of screens) {
    const trimmed = screen.trim();
    if (!trimmed) {
      continue;
    }
    const pieces = splitLongSentence(trimmed, maxChars);
    for (const piece of pieces) {
      if (!buffer) {
        buffer = piece;
        continue;
      }
      if (buffer.length + piece.length <= maxChars) {
        buffer += piece;
      } else {
        merged.push(buffer);
        buffer = piece;
      }
    }
  }
  if (buffer) {
    merged.push(buffer);
  }
  return merged;
}

function isDarkenToken(text) {
  return text.replace(/\s+/g, "") === "[暗転]";
}

function parseMetaToken(text) {
  const trimmed = text.trim();
  const headingMatch = trimmed.match(/^\[見出し[:：](.+)\]$/);
  if (headingMatch) {
    const [titlePart, subtitlePart = ""] = headingMatch[1].split("｜");
    return {
      type: "heading",
      value: {
        title: (titlePart ?? "").trim(),
        subtitle: (subtitlePart ?? "").trim(),
      },
    };
  }
  const titleMatch = trimmed.match(/^\[タイトル[:：](.+)\]$/);
  if (titleMatch) {
    return { type: "title", value: titleMatch[1].trim() };
  }
  const subtitleMatch = trimmed.match(/^\[サブタイトル[:：](.+)\]$/);
  if (subtitleMatch) {
    return { type: "subtitle", value: subtitleMatch[1].trim() };
  }
  return null;
}

function buildScreensFromText(text) {
  const screens = [];
  let narration = "";
  let inDialogue = false;
  let dialogue = "";
  let speaker = "";

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!inDialogue && ch === "「") {
      if (narration.trim()) {
        const lastNewline = narration.lastIndexOf("\n");
        const before = lastNewline === -1 ? "" : narration.slice(0, lastNewline + 1);
        const tail = lastNewline === -1 ? narration : narration.slice(lastNewline + 1);
        const candidate = cleanSpeakerName(tail);
        if (candidate) {
          const paragraphs = splitNarrationByParagraph(before);
          for (const para of paragraphs) {
            const narrationScreens = [];
            pushNarrationScreens(narrationScreens, para);
            const merged = mergeNarration(narrationScreens, MAX_NARRATION_CHARS);
            screens.push(
              ...merged.map((line) => ({
                text: line,
                speaker: "",
                type: isDarkenToken(line) ? "darken" : "text",
              }))
            );
          }
          speaker = candidate;
          narration = "";
        } else {
          const paragraphs = splitNarrationByParagraph(narration);
          for (const para of paragraphs) {
            const narrationScreens = [];
            pushNarrationScreens(narrationScreens, para);
            const merged = mergeNarration(narrationScreens, MAX_NARRATION_CHARS);
            screens.push(
              ...merged.map((line) => ({
                text: line,
                speaker: "",
                type: isDarkenToken(line) ? "darken" : "text",
              }))
            );
          }
          narration = "";
          speaker = "";
        }
      } else {
        speaker = "";
      }
      inDialogue = true;
      dialogue = "「";
      continue;
    }

    if (inDialogue) {
      dialogue += ch;
      if (ch === "」") {
        const trimmed = dialogue.trim();
        if (trimmed) {
          screens.push({
            text: trimmed,
            speaker,
            type: isDarkenToken(trimmed) ? "darken" : "text",
          });
        }
        dialogue = "";
        inDialogue = false;
        speaker = "";
      }
      continue;
    }

    narration += ch;
  }

  if (dialogue.trim()) {
    screens.push({
      text: dialogue.trim(),
      speaker,
      type: isDarkenToken(dialogue.trim()) ? "darken" : "text",
    });
  }

  if (narration.trim()) {
    const paragraphs = splitNarrationByParagraph(narration);
    for (const para of paragraphs) {
      const narrationScreens = [];
      pushNarrationScreens(narrationScreens, para);
      const merged = mergeNarration(narrationScreens, MAX_NARRATION_CHARS);
      screens.push(
        ...merged.map((line) => ({
          text: line,
          speaker: "",
          type: isDarkenToken(line) ? "darken" : "text",
        }))
      );
    }
  }

  return screens;
}

function splitText(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const screens = [];
  const lines = normalized.split("\n");
  let buffer = "";

  for (const line of lines) {
    const trimmed = line.trim();
    const meta = parseMetaToken(trimmed);
    if (meta) {
      if (buffer.trim()) {
        screens.push(...buildScreensFromText(buffer));
        buffer = "";
      }
      screens.push({ text: trimmed, speaker: "", type: "meta", meta });
      continue;
    }
    if (isDarkenToken(trimmed)) {
      if (buffer.trim()) {
        screens.push(...buildScreensFromText(buffer));
        buffer = "";
      }
      screens.push({ text: trimmed, speaker: "", type: "darken" });
      continue;
    }
    buffer += line + "\n";
  }

  if (buffer.trim()) {
    screens.push(...buildScreensFromText(buffer));
  }

  return screens.filter((screen) => screen && screen.text);
}

function stripDialogueQuotes(text) {
  if (!text) {
    return "";
  }
  if (text.startsWith("「") && text.endsWith("」")) {
    return text.slice(1, -1);
  }
  return text;
}

function setText(value) {
  textEl.classList.remove("is-visible");
  void textEl.offsetWidth;
  const rawText = value?.text ?? "";
  textEl.textContent = stripDialogueQuotes(rawText);
  if (value?.speaker) {
    nameEl.textContent = value.speaker;
    const normalizedSpeaker = value.speaker.replace(/\s+/g, "");
    for (const theme of SPEAKER_THEMES.values()) {
      nameEl.classList.remove(theme);
    }
    const theme = SPEAKER_THEMES.get(normalizedSpeaker);
    if (theme) {
      nameEl.classList.add(theme);
    }
  } else {
    nameEl.textContent = "";
    for (const theme of SPEAKER_THEMES.values()) {
      nameEl.classList.remove(theme);
    }
  }
  textEl.classList.add("is-visible");
}

function addLogEntry(value, index) {
  if (!value || value.type !== "text") {
    return;
  }
  if (state.loggedIndices.has(index)) {
    return;
  }
  const rawText = value?.text ?? "";
  const cleanText = stripDialogueQuotes(rawText);
  state.log.push({
    speaker: value.speaker ?? "",
    text: cleanText,
  });
  state.loggedIndices.add(index);
}

function renderLog() {
  if (!logList) {
    return;
  }
  logList.innerHTML = "";
  for (const entry of state.log) {
    const card = document.createElement("div");
    card.className = "log-entry";
    if (entry.speaker) {
      const name = document.createElement("div");
      name.className = "log-name";
      name.textContent = entry.speaker;
      card.appendChild(name);
    }
    const text = document.createElement("div");
    text.className = "log-text";
    text.textContent = entry.text;
    card.appendChild(text);
    logList.appendChild(card);
  }
}

function openLog() {
  if (!logModal) {
    return;
  }
  renderLog();
  logModal.classList.add("is-open");
  logModal.setAttribute("aria-hidden", "false");
}

function closeLog() {
  if (!logModal) {
    return;
  }
  logModal.classList.remove("is-open");
  logModal.setAttribute("aria-hidden", "true");
}

function clearAutoTimers() {
  if (state.autoAdvanceTimer) {
    clearTimeout(state.autoAdvanceTimer);
    state.autoAdvanceTimer = null;
  }
  if (state.dimTimer) {
    clearTimeout(state.dimTimer);
    state.dimTimer = null;
  }
  if (state.typingTimer) {
    clearInterval(state.typingTimer);
    state.typingTimer = null;
  }
  state.typingText = "";
  state.typingIndex = 0;
}

function getCurrentTitleText() {
  return chapterTitleEl ? chapterTitleEl.textContent ?? "" : "";
}

function getCurrentSubtitleText() {
  return chapterSubtitleEl ? chapterSubtitleEl.textContent ?? "" : "";
}

function getSlotKey(slotIndex) {
  return `${SAVE_KEY_PREFIX}_${slotIndex}`;
}

function buildSavePayload() {
  return {
    index: state.index,
    title: getCurrentTitleText(),
    subtitle: getCurrentSubtitleText(),
    savedAt: new Date().toISOString(),
  };
}

function saveToSlot(slotIndex) {
  const payload = buildSavePayload();
  localStorage.setItem(getSlotKey(slotIndex), JSON.stringify(payload));
}

function loadFromSlot(slotIndex) {
  const raw = localStorage.getItem(getSlotKey(slotIndex));
  if (!raw) {
    return false;
  }
  try {
    const payload = JSON.parse(raw);
    if (typeof payload.index === "number") {
      state.index = Math.min(Math.max(payload.index, 0), Math.max(state.lines.length - 1, 0));
    }
    if (chapterTitleEl && typeof payload.title === "string" && payload.title) {
      chapterTitleEl.textContent = payload.title;
    }
    if (chapterSubtitleEl && typeof payload.subtitle === "string" && payload.subtitle) {
      chapterSubtitleEl.textContent = payload.subtitle;
    }
    render();
    return true;
  } catch (error) {
    return false;
  }
}

function getSlotLabel(slotIndex) {
  if (slotIndex === QUICK_SLOT) {
    return "クイックセーブ";
  }
  return `セーブ ${slotIndex}`;
}

function openSlotModal(mode) {
  if (!slotModal || !slotGrid || !slotTitleEl) {
    return;
  }
  slotTitleEl.textContent = mode === "save" ? "セーブ先を選択" : "ロード";
  slotGrid.innerHTML = "";
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const raw = localStorage.getItem(getSlotKey(i));
    const card = document.createElement("button");
    card.type = "button";
    card.className = "slot-card";
    const name = document.createElement("div");
    name.className = "slot-name";
    name.textContent = getSlotLabel(i);
    const meta = document.createElement("div");
    meta.className = "slot-meta";
    if (raw) {
      try {
        const payload = JSON.parse(raw);
        const title = payload.title || "";
        const subtitle = payload.subtitle || "";
        meta.textContent = `${title}${subtitle ? " / " + subtitle : ""}`;
      } catch (error) {
        meta.textContent = "読み込みエラー";
      }
    } else {
      meta.textContent = "空き";
      card.classList.add("is-empty");
    }
    card.appendChild(name);
    card.appendChild(meta);
    card.addEventListener("click", () => {
      if (mode === "save") {
        saveToSlot(i);
        closeSlotModal();
      } else {
        loadFromSlot(i);
        closeSlotModal();
      }
    });
    slotGrid.appendChild(card);
  }
  slotModal.classList.add("is-open");
  slotModal.setAttribute("aria-hidden", "false");
}

function closeSlotModal() {
  if (!slotModal) {
    return;
  }
  slotModal.classList.remove("is-open");
  slotModal.setAttribute("aria-hidden", "true");
}

function updateProgress() {
  const total = state.lines.length;
  const current = total === 0 ? 0 : state.index + 1;
  const suffix = total > 0 && state.index === total - 1 ? "  END" : "";
  progressEl.textContent = `${current}/${total}${suffix}`;
}

function updateButtons() {
  const currentType = state.lines[state.index]?.type;
  const isLocked = currentType === "darken" || currentType === "meta";
  prevBtn.disabled = state.index <= 0 || isLocked;
  nextBtn.disabled =
    state.lines.length === 0 || state.index >= state.lines.length - 1 || isLocked;
}

function render() {
  clearAutoTimers();
  stage.classList.remove("is-dimmed");
  if (state.lines.length === 0) {
    if (window.location.protocol === "file:") {
      setText({
        text:
          "本文が読み込めませんでした。ファイル直開き（file://）ではブラウザが同一フォルダの本文を読み込めません。\n\n" +
          "対処:\n" +
          "1. このフォルダで簡易サーバーを起動してから開く（例: python -m http.server）\n" +
          "2. 右下の『本文を選ぶ』で honbun.txt を指定する",
        speaker: "",
      });
    } else {
      setText({
        text: "本文が読み込めませんでした。右下の『本文を選ぶ』で honbun.txt を指定してください。",
        speaker: "",
      });
    }
  } else {
    const current = state.lines[state.index];
    if (current.type === "darken") {
      setText({ text: "", speaker: "" });
      stage.classList.add("is-dimmed");
      state.dimTimer = setTimeout(() => {
        stage.classList.remove("is-dimmed");
        state.autoAdvanceTimer = setTimeout(() => {
          goNext();
        }, 220);
      }, 820);
    } else if (current.type === "meta") {
      if (current.meta?.type === "heading") {
        if (chapterTitleEl && current.meta.value.title) {
          chapterTitleEl.textContent = current.meta.value.title;
        }
        if (chapterSubtitleEl && current.meta.value.subtitle) {
          chapterSubtitleEl.textContent = current.meta.value.subtitle;
          triggerChapterAnimation();
        }
      }
      if (current.meta?.type === "title" && chapterTitleEl) {
        chapterTitleEl.textContent = current.meta.value;
      }
      if (current.meta?.type === "subtitle" && chapterSubtitleEl) {
        chapterSubtitleEl.textContent = current.meta.value;
        triggerChapterAnimation();
      }
      setText({ text: "", speaker: "" });
      state.autoAdvanceTimer = setTimeout(() => {
        goNext();
      }, 220);
    } else {
      addLogEntry(current, state.index);
      startTypewriter(current);
    }
  }
  updateProgress();
  updateButtons();
}

function triggerChapterAnimation() {
  if (!chapterPillEl) {
    return;
  }
  chapterPillEl.classList.remove("is-animate");
  void chapterPillEl.offsetWidth;
  chapterPillEl.classList.add("is-animate");
}

function startTypewriter(value) {
  setText({ text: "", speaker: value?.speaker ?? "" });
  const rawText = value?.text ?? "";
  const cleanText = stripDialogueQuotes(rawText);
  state.typingText = cleanText;
  state.typingIndex = 0;
  const step = () => {
    state.typingIndex += 1;
    textEl.textContent = state.typingText.slice(0, state.typingIndex);
    if (state.typingIndex >= state.typingText.length) {
      clearInterval(state.typingTimer);
      state.typingTimer = null;
    }
  };
  if (cleanText.length === 0) {
    return;
  }
  textEl.classList.add("is-visible");
  state.typingTimer = setInterval(step, 16);
}

function completeTyping() {
  if (!state.typingTimer) {
    return false;
  }
  clearInterval(state.typingTimer);
  state.typingTimer = null;
  textEl.textContent = state.typingText;
  state.typingText = "";
  state.typingIndex = 0;
  return true;
}

function init(text) {
  state.lines = splitText(text);
  state.index = 0;
  state.log = [];
  state.loggedIndices = new Set();
  render();
}

function goNext() {
  if (completeTyping()) {
    return;
  }
  if (state.index < state.lines.length - 1) {
    state.index += 1;
    render();
  }
}

function goPrev() {
  if (completeTyping()) {
    return;
  }
  if (state.index > 0) {
    state.index -= 1;
    render();
  }
}

function decodeText(buffer) {
  let text = new TextDecoder("utf-8").decode(buffer);
  if (text.includes("\ufffd")) {
    try {
      text = new TextDecoder("shift_jis").decode(buffer);
    } catch (error) {
      // ignore and keep utf-8 result
    }
  }
  return text;
}

async function loadDefault() {
  try {
    const response = await fetch("honbun.txt");
    if (!response.ok) {
      throw new Error("fetch failed");
    }
    const buffer = await response.arrayBuffer();
    init(decodeText(buffer));
  } catch (error) {
    render();
  }
}

prevBtn.addEventListener("click", goPrev);
nextBtn.addEventListener("click", goNext);

stage.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLButtonElement || target instanceof HTMLInputElement) {
    return;
  }
  goNext();
});

window.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    goNext();
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    goPrev();
  }
});

openBtn.addEventListener("click", () => {
  fileInput.click();
});

saveBtn.addEventListener("click", () => {
  openSlotModal("save");
});

quickSaveBtn.addEventListener("click", () => {
  saveToSlot(QUICK_SLOT);
});

loadBtn.addEventListener("click", () => {
  openSlotModal("load");
});

skipBtn.addEventListener("click", () => {
  if (!state.lines.length) {
    return;
  }
  for (let i = state.index + 1; i < state.lines.length; i += 1) {
    const entry = state.lines[i];
    if (entry?.type === "meta" && entry.meta?.type === "subtitle") {
      state.index = i;
      render();
      return;
    }
  }
  state.index = state.lines.length - 1;
  render();
});

slotCloseBtn.addEventListener("click", () => {
  closeSlotModal();
});

slotModal.addEventListener("click", (event) => {
  if (event.target === slotModal) {
    closeSlotModal();
  }
});

logBtn.addEventListener("click", () => {
  openLog();
});

logCloseBtn.addEventListener("click", () => {
  closeLog();
});

logModal.addEventListener("click", (event) => {
  if (event.target === logModal) {
    closeLog();
  }
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) {
    return;
  }
  const buffer = await file.arrayBuffer();
  init(decodeText(buffer));
});

loadDefault();
