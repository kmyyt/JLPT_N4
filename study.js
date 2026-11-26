const VOCAB_DB = [
  ...(typeof VOCAB_DB_PART1 !== "undefined" && Array.isArray(VOCAB_DB_PART1) ? VOCAB_DB_PART1 : []),
  ...(typeof VOCAB_DB_PART2 !== "undefined" && Array.isArray(VOCAB_DB_PART2) ? VOCAB_DB_PART2 : []),
  ...(typeof VOCAB_DB_PART3 !== "undefined" && Array.isArray(VOCAB_DB_PART3) ? VOCAB_DB_PART3 : []),
  ...(typeof VOCAB_DB_PART4 !== "undefined" && Array.isArray(VOCAB_DB_PART4) ? VOCAB_DB_PART4 : []),
  ...(typeof VOCAB_DB_PART5 !== "undefined" && Array.isArray(VOCAB_DB_PART5) ? VOCAB_DB_PART5 : []),
  ...(typeof VOCAB_DB_PART6 !== "undefined" && Array.isArray(VOCAB_DB_PART6) ? VOCAB_DB_PART6 : []),
  ...(typeof VOCAB_DB_EXTRA_EXAM !== "undefined" && Array.isArray(VOCAB_DB_EXTRA_EXAM) ? VOCAB_DB_EXTRA_EXAM : [])
];

window.JLPTData = {
  ...(window.JLPTData || {}),
  VOCAB_DB
};

(() => {
  "use strict";

  const DATA = window.JLPTData;
  if (!DATA) {
    console.error("window.JLPTData가 로드되지 않았습니다. data.js 로드 순서를 확인하세요.");
    return;
  }

  const VOCAB_PAGE_SIZE = 50;

  let appState = DATA.loadState();

  let activeMainTab = "main-dashboard";
  let activeVocabSubTab = "vocab-dashboard";
  let activeGrammarSubTab = "grammar-dashboard";
  let activeReadingCategory = "ALL"; // "ALL" | "단문" | "중문" | "정보검색"
  let selectedReadingId = DATA.READING_DB?.[0]?.id ?? null;
  let readingShowTranslation = false;

  let vocabRenderedCount = VOCAB_PAGE_SIZE;
  let vocabInitialized = false;
  let selectedVocabIds = new Set();

  let fcScope = "ALL";
  let fcDeck = [];
  let fcIndex = 0;
  let fcFlipped = false;
  let fcShowExKana = false;
  let fcShowExMeaning = false;
  let fcActiveKanji = null;

  let gfcScope = "ALL";
  let gfcDeck = [];
  let gfcIndex = 0;
  let gfcFlipped = false;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeRegExp(str) {
    return String(str ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlightKeywordInHtml(text, keyword) {
    const safeText = escapeHtml(text || "");
    const kw = String(keyword || "").trim();
    if (!kw) return safeText;
    try {
      const regex = new RegExp(`(${escapeRegExp(kw)})`, "g");
      return safeText.replace(regex, '<mark class="kw-highlight" lang="ja">$1</mark>');
    } catch (_) {
      return safeText;
    }
  }

  function stopInternalTts() {
    if (typeof window.speechSynthesis === "undefined") return;
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  }

  function speakJapanese(text, rate = appState.ttsRate) {
    const cleanText = String(text || "").replace(/〜/g, "").trim();
    if (!cleanText) return;
    if (typeof window.speechSynthesis === "undefined") {
      console.warn("이 브라우저는 내부 TTS(speechSynthesis)를 지원하지 않습니다.");
      return;
    }
    try {
      stopInternalTts();
      const utter = new SpeechSynthesisUtterance(cleanText);
      utter.lang = "ja-JP";
      const numericRate = Number(rate);
      utter.rate = Number.isFinite(numericRate) ? Math.max(0.5, Math.min(2.0, numericRate)) : 1.0;

      const voices = window.speechSynthesis.getVoices();
      const jaVoice =
        voices.find((v) => v.lang && v.lang.toLowerCase() === "ja-jp") ||
        voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("ja"));
      if (jaVoice) utter.voice = jaVoice;

      window.speechSynthesis.speak(utter);
    } catch (err) {
      console.error("내부 TTS 재생 오류:", err);
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  }

  function setBarWidth(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${Math.max(0, Math.min(100, Number(pct) || 0))}%`;
  }

  function getItemStatus(itemId) {
    const rec = appState.progress[String(itemId)];
    return rec ? DATA.normalizeStatus(rec.status) : "미학습";
  }

  function updateDdayBadge() {
    const badge = document.getElementById("dday-badge");
    if (!badge) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exam = new Date(`${DATA.EXAM_DATE}T00:00:00`);
    const diffDays = Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) badge.textContent = `D-${diffDays}`;
    else if (diffDays === 0) badge.textContent = "D-Day";
    else badge.textContent = `D+${Math.abs(diffDays)}`;
  }

  function applyThemeAndGlobalMasks() {
    const isDark = appState.theme === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    document.body.classList.toggle("dark-mode", isDark);
    document.body.classList.toggle("mask-kana-active", Boolean(appState.maskKana));
    document.body.classList.toggle("mask-meaning-active", Boolean(appState.maskMeaning));

    const themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) {
      themeBtn.setAttribute("aria-pressed", String(isDark));
      themeBtn.textContent = isDark ? "☀️ 라이트 모드" : "🌙 다크 모드";
    }

    const kanaBtn = document.getElementById("mask-kana-btn");
    if (kanaBtn) {
      kanaBtn.setAttribute("aria-pressed", String(Boolean(appState.maskKana)));
      kanaBtn.textContent = appState.maskKana ? "👀 히라가나 보이기" : "🙈 히라가나 가림";
    }

    const meaningBtn = document.getElementById("mask-meaning-btn");
    if (meaningBtn) {
      meaningBtn.setAttribute("aria-pressed", String(Boolean(appState.maskMeaning)));
      meaningBtn.textContent = appState.maskMeaning ? "👀 뜻 보이기" : "👁️ 뜻 가림";
    }

    const rateSelect = document.getElementById("tts-rate-select");
    if (rateSelect) rateSelect.value = String(appState.ttsRate);
  }

  function persistState() {
    appState = DATA.saveState(appState);
    applyThemeAndGlobalMasks();
    renderMainDashboard();
  }

  function refreshAllViews() {
    appState = DATA.loadState();
    applyThemeAndGlobalMasks();
    renderMainDashboard();
    if (activeMainTab === "vocab-section") {
      if (activeVocabSubTab === "vocab-dashboard") renderVocabDashboard();
      else if (activeVocabSubTab === "vocab-list") renderVocabList();
      else if (activeVocabSubTab === "vocab-flashcard") renderFlashcard();
      else if (activeVocabSubTab === "vocab-wrong") renderWrongNotes();
    } else if (activeMainTab === "grammar-section") {
      if (activeGrammarSubTab === "grammar-dashboard") renderGrammarDashboard();
      else if (activeGrammarSubTab === "grammar-list") renderGrammarList();
      else if (activeGrammarSubTab === "grammar-flashcard") renderGrammarFlashcard();
    } else if (activeMainTab === "reading-section") {
      renderReadingSection();
    }
  }

  function switchMainTab(tabName, options = {}) {
    const validTabs = ["main-dashboard", "vocab-section", "grammar-section", "reading-section", "guide-section"];
    if (!validTabs.includes(tabName)) return;
    activeMainTab = tabName;

    document.querySelectorAll(".nav-item[data-main-tab]").forEach((btn) => {
      const isActive = btn.getAttribute("data-main-tab") === tabName;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });

    document.querySelectorAll(".main-panel").forEach((panel) => {
      const isTarget = panel.id === `panel-${tabName}`;
      panel.classList.toggle("active", isTarget);
      panel.hidden = !isTarget;
    });

    if (tabName === "main-dashboard") renderMainDashboard();
    else if (tabName === "vocab-section") switchVocabSubTab(options.vocabSubTab || "vocab-dashboard", options);
    else if (tabName === "grammar-section") switchGrammarSubTab(options.grammarSubTab || "grammar-dashboard", options);
    else if (tabName === "reading-section") {
      if (options.readingCategory) switchReadingCategory(options.readingCategory);
      else renderReadingSection();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function switchVocabSubTab(subTabName, options = {}) {
    const validSubTabs = ["vocab-dashboard", "vocab-list", "vocab-flashcard", "vocab-quiz", "vocab-wrong"];
    if (!validSubTabs.includes(subTabName)) subTabName = "vocab-dashboard";
    activeVocabSubTab = subTabName;

    document.querySelectorAll(".sub-tab-item[data-vocab-subtab]").forEach((btn) => {
      const isActive = btn.getAttribute("data-vocab-subtab") === subTabName;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });

    document.querySelectorAll(".vocab-subpanel").forEach((panel) => {
      const isTarget = panel.id === `subpanel-${subTabName}`;
      panel.classList.toggle("active", isTarget);
      panel.hidden = !isTarget;
    });

    if (subTabName === "vocab-dashboard") renderVocabDashboard();
    else if (subTabName === "vocab-list") {
      if (!vocabInitialized) {
        populateVocabFilterOptions();
        vocabInitialized = true;
      }
      if (options.resetPage !== false) vocabRenderedCount = VOCAB_PAGE_SIZE;
      renderVocabList();
    } else if (subTabName === "vocab-flashcard") {
      if (options.scope) {
        fcScope = options.scope;
        const scopeEl = document.getElementById("fc-scope-select");
        if (scopeEl) scopeEl.value = fcScope;
      }
      buildFlashcardDeck(Boolean(options.shuffle));
      renderFlashcard();
    } else if (subTabName === "vocab-wrong") {
      renderWrongNotes();
    }
  }

  function switchGrammarSubTab(subTabName, options = {}) {
    const validSubTabs = ["grammar-dashboard", "grammar-list", "grammar-flashcard", "grammar-quiz"];
    if (!validSubTabs.includes(subTabName)) subTabName = "grammar-dashboard";
    activeGrammarSubTab = subTabName;

    document.querySelectorAll(".sub-tab-item[data-grammar-subtab]").forEach((btn) => {
      const isActive = btn.getAttribute("data-grammar-subtab") === subTabName;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });

    document.querySelectorAll(".grammar-subpanel").forEach((panel) => {
      const isTarget = panel.id === `subpanel-${subTabName}`;
      panel.classList.toggle("active", isTarget);
      panel.hidden = !isTarget;
    });

    if (subTabName === "grammar-dashboard") renderGrammarDashboard();
    else if (subTabName === "grammar-list") renderGrammarList();
    else if (subTabName === "grammar-flashcard") {
      if (options.scope) {
        gfcScope = options.scope;
        const sel = document.getElementById("gfc-scope-select");
        if (sel) sel.value = gfcScope;
      }
      buildGrammarFlashcardDeck(Boolean(options.shuffle));
      renderGrammarFlashcard();
    } else if (subTabName === "grammar-quiz") {
      if (options.autoStartCount && typeof window.JLPTQuiz?.startGrammarQuiz === "function") {
        window.JLPTQuiz.startGrammarQuiz(options.autoStartCount, "grammar-quiz-runner");
      }
    }
  }

  function renderMainDashboard() {
    const summary = DATA.getOverallStatsSummary(appState);

    setText("overall-progress-text", `${summary.overallRate}%`);
    setBarWidth("overall-progress-fill", summary.overallRate);

    setText("dash-vocab-rate", `${summary.vocab.rate}%`);
    setText("dash-vocab-learned", summary.vocab.learned);
    setText("dash-vocab-total", summary.vocab.total);
    setBarWidth("dash-vocab-bar", summary.vocab.rate);

    setText("dash-grammar-rate", `${summary.grammar.rate}%`);
    setText("dash-grammar-learned", summary.grammar.learned);
    setText("dash-grammar-total", summary.grammar.total);
    setBarWidth("dash-grammar-bar", summary.grammar.rate);

    setText("dash-reading-rate", `${summary.reading.rate}%`);
    setText("dash-reading-done", summary.reading.completed);
    setText("dash-reading-total", summary.reading.total);
    setBarWidth("dash-reading-bar", summary.reading.rate);

    setText("dash-due-total", `${summary.totalDue}개`);
    setText("dash-due-vocab", summary.vocab.due);
    setText("dash-due-grammar", summary.grammar.due);

    setText("dash-weak-ambiguous", summary.weak.ambiguousVocab);
    setText("dash-weak-wrong", summary.weak.totalWrongRecords);
    setText("dash-weak-reading", summary.weak.incompleteReading);
  }

  function renderVocabDashboard() {
    const stats = DATA.getVocabStatsSummary(appState);
    setText("stat-vocab-total", stats.total);
    setText("stat-vocab-due", stats.due);
    setText("stat-vocab-learned", stats.learned);
    setText("stat-vocab-ambiguous", stats.ambiguous);
    setText("stat-vocab-unknown", stats.unknown);
    setText("stat-vocab-unlearned", stats.unlearned);
    setText("stat-vocab-favorite", stats.favorite);
    setText("stat-vocab-wrong", stats.wrong);

    renderCustomDecksList();
    syncDeckSelectOptions();
  }

  function renderCustomDecksList() {
    const ul = document.getElementById("custom-deck-list");
    if (!ul) return;
    if (!appState.customDecks.length) {
      ul.innerHTML = '<li class="helper-text">아직 생성된 커스텀 단어장이 없습니다.</li>';
      return;
    }
    ul.innerHTML = appState.customDecks
      .map(
        (deck) => `
      <li class="custom-deck-item">
        <span><strong>${escapeHtml(deck.name)}</strong> (${deck.wordIds.length}단어)</span>
        <div class="quick-action-row">
          <button type="button" class="chip-btn" data-open-deck="${escapeHtml(deck.id)}">단어장에서 보기</button>
          <button type="button" class="chip-btn" data-delete-deck="${escapeHtml(deck.id)}">삭제</button>
        </div>
      </li>
    `
      )
      .join("");
  }

  function syncDeckSelectOptions() {
    const filterSel = document.getElementById("vocab-deck-filter");
    const batchSel = document.getElementById("batch-target-deck-select");

    if (filterSel) {
      const prev = filterSel.value;
      filterSel.innerHTML =
        '<option value="ALL">전체 단어장</option>' +
        appState.customDecks
          .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`)
          .join("");
      if ([...filterSel.options].some((o) => o.value === prev)) filterSel.value = prev;
    }

    if (batchSel) {
      batchSel.innerHTML =
        '<option value="">커스텀 단어장 선택...</option>' +
        appState.customDecks
          .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`)
          .join("");
    }
  }

  function populateVocabFilterOptions() {
    const catSel = document.getElementById("vocab-category-filter");
    if (!catSel) return;
    const tagSet = new Set();
    DATA.VOCAB_DB.forEach((item) => {
      if (item.category) tagSet.add(item.category);
      if (Array.isArray(item.examTags)) item.examTags.forEach((t) => tagSet.add(t));
    });
    const sorted = [...tagSet].sort();
    catSel.innerHTML =
      '<option value="ALL">전체 분류/기출</option>' +
      sorted.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  }

  function getFilteredAndSortedVocab() {
    const q = (document.getElementById("vocab-search-input")?.value || "").trim().toLowerCase();
    const cat = document.getElementById("vocab-category-filter")?.value || "ALL";
    const status = document.getElementById("vocab-status-filter")?.value || "ALL";
    const deckId = document.getElementById("vocab-deck-filter")?.value || "ALL";
    const sortBy = document.getElementById("vocab-sort-select")?.value || "default";

    const deckObj =
      deckId !== "ALL" ? appState.customDecks.find((d) => String(d.id) === String(deckId)) : null;
    const deckIdSet = deckObj ? new Set(deckObj.wordIds.map(String)) : null;
    const favSet = new Set(appState.favorites.map(String));

    let list = DATA.VOCAB_DB.filter((item) => {
      const idStr = String(item.id);
      const curStatus = getItemStatus(idStr);

      if (cat !== "ALL") {
        const matchCat = item.category === cat;
        const matchTag = Array.isArray(item.examTags) && item.examTags.includes(cat);
        if (!matchCat && !matchTag) return false;
      }

      if (status === "DUE" && !DATA.isDueForReview(idStr, appState)) return false;
      if (status === "FAVORITE" && !favSet.has(idStr)) return false;
      if (["미학습", "모름", "애매함", "완벽함"].includes(status) && curStatus !== status) return false;
      if (deckIdSet && !deckIdSet.has(idStr)) return false;

      if (q) {
        const memo = (appState.posNotes[idStr] || "").toLowerCase();
        const hay = `${item.word || ""} ${item.kana || ""} ${item.meaning || ""} ${memo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const statusRank = { 모름: 0, 애매함: 1, 미학습: 2, 완벽함: 3 };
    if (sortBy === "kana") {
      list = [...list].sort((a, b) => String(a.kana || "").localeCompare(String(b.kana || ""), "ja"));
    } else if (sortBy === "status") {
      list = [...list].sort((a, b) => (statusRank[getItemStatus(a.id)] ?? 2) - (statusRank[getItemStatus(b.id)] ?? 2));
    } else if (sortBy === "wrong") {
      list = [...list].sort((a, b) => (appState.wrongStats[String(b.id)]?.count || 0) - (appState.wrongStats[String(a.id)]?.count || 0));
    }

    return list;
  }

  function renderVocabList() {
    const container = document.getElementById("vocab-list-container");
    const infoEl = document.getElementById("vocab-pagination-info");
    const moreBtn = document.getElementById("btn-load-more-vocab");
    if (!container) return;

    const filtered = getFilteredAndSortedVocab();
    const visibleItems = filtered.slice(0, vocabRenderedCount);

    if (!visibleItems.length) {
      container.innerHTML = '<div class="card helper-text">등록된 N4 단어가 없거나 조건에 맞는 단어가 없습니다.</div>';
      if (infoEl) infoEl.textContent = "0 / 0개 표시 중";
      if (moreBtn) moreBtn.hidden = true;
      updateBatchSelectionUI();
      return;
    }

    container.innerHTML = visibleItems
      .map((item) => {
        const idStr = String(item.id);
        const status = getItemStatus(idStr);
        const isFav = appState.favorites.map(String).includes(idStr);
        const isChecked = selectedVocabIds.has(idStr);
        const dupLabel = DATA.formatDuplicateExamLabel(item.examTags);
        const kanaOnly = DATA.isHiraganaOnly(item.word);
        const memo = appState.posNotes[idStr] || "";

        return `
        <article class="vocab-row-card" data-vocab-id="${escapeHtml(idStr)}">
          <div class="vocab-row-main">
            <input type="checkbox" class="vocab-row-check" value="${escapeHtml(idStr)}" ${isChecked ? "checked" : ""} />
            <div>
              <div class="vocab-word-line">
                <span class="vocab-word-jp maskable-target" lang="ja">${escapeHtml(item.word)}</span>
                <span class="vocab-kana-jp maskable-kana ${kanaOnly ? "is-kana-only-headword" : ""}" lang="ja">${escapeHtml(item.kana)}</span>
                <span class="badge">${escapeHtml(item.category || "어휘")}</span>
                ${dupLabel ? `<span class="dup-badge">${escapeHtml(dupLabel)}</span>` : ""}
              </div>
              <div class="vocab-meaning-ko maskable-meaning">${escapeHtml(item.meaning)}</div>
              <div class="vocab-memo-row">
                <input type="text" class="vocab-memo-input" data-memo-id="${escapeHtml(idStr)}" value="${escapeHtml(memo)}" placeholder="품사/암기 메모..." />
              </div>
            </div>
          </div>

          <div class="vocab-row-actions">
            <button type="button" class="chip-btn" data-speak-word="${escapeHtml(item.word || item.kana)}">🔊</button>
            <button type="button" class="icon-btn" data-toggle-fav="${escapeHtml(idStr)}" aria-pressed="${isFav}">${isFav ? "★" : "☆"}</button>
            <select class="vocab-status-select" data-status-id="${escapeHtml(idStr)}">
              <option value="미학습" ${status === "미학습" ? "selected" : ""}>미학습</option>
              <option value="모름" ${status === "모름" ? "selected" : ""}>모름</option>
              <option value="애매함" ${status === "애매함" ? "selected" : ""}>애매함</option>
              <option value="완벽함" ${status === "완벽함" ? "selected" : ""}>완벽함</option>
            </select>
          </div>
        </article>
      `;
      })
      .join("");

    if (infoEl) infoEl.textContent = `${visibleItems.length} / ${filtered.length}개 표시 중`;
    if (moreBtn) {
      const remaining = filtered.length - visibleItems.length;
      if (remaining > 0) {
        moreBtn.hidden = false;
        moreBtn.textContent = `더 보기 (+${Math.min(VOCAB_PAGE_SIZE, remaining)}개)`;
      } else {
        moreBtn.hidden = true;
      }
    }
    updateBatchSelectionUI();
  }

  function updateBatchSelectionUI() {
    const countEl = document.getElementById("vocab-selected-count");
    if (countEl) countEl.textContent = String(selectedVocabIds.size);
  }

  function getVocabByScope(scope) {
    const favSet = new Set(appState.favorites.map(String));
    return DATA.VOCAB_DB.filter((item) => {
      const idStr = String(item.id);
      const status = getItemStatus(idStr);
      if (scope === "DUE") return DATA.isDueForReview(idStr, appState);
      if (scope === "FAVORITE") return favSet.has(idStr);
      if (["미학습", "모름", "애매함", "완벽함"].includes(scope)) return status === scope;
      return true;
    });
  }

  function buildFlashcardDeck(shuffle = false) {
    const list = getVocabByScope(fcScope);
    fcDeck = list.length ? [...list] : [...DATA.VOCAB_DB];
    if (shuffle) {
      for (let i = fcDeck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [fcDeck[i], fcDeck[j]] = [fcDeck[j], fcDeck[i]];
      }
    }
    fcIndex = 0;
    fcFlipped = false;
    fcShowExKana = false;
    fcShowExMeaning = false;
    fcActiveKanji = null;
  }

  function renderFlashcard() {
    if (!fcDeck.length) {
      setText("fc-counter", "0 / 0");
      setText("fc-word", "DB 대기 중");
      setText("fc-kana", "어휘 DB를 연결해 주세요");
      return;
    }
    const item = fcDeck[fcIndex % fcDeck.length];
    const idStr = String(item.id);
    const status = getItemStatus(idStr);
    const isFav = appState.favorites.map(String).includes(idStr);
    const dupLabel = DATA.formatDuplicateExamLabel(item.examTags);
    const kanaOnly = DATA.isHiraganaOnly(item.word);

    setText("fc-counter", `${fcIndex + 1} / ${fcDeck.length}`);
    setText("fc-status-badge", status);
    setText("fc-category-badge", item.category || "어휘");

    const dupBadge = document.getElementById("fc-dup-badge");
    if (dupBadge) {
      dupBadge.textContent = dupLabel;
      dupBadge.hidden = !dupLabel;
    }

    const favBtn = document.getElementById("btn-fc-favorite");
    if (favBtn) {
      favBtn.textContent = isFav ? "★" : "☆";
      favBtn.setAttribute("aria-pressed", String(isFav));
    }

    setText("fc-word", item.word || "");
    const kanaEl = document.getElementById("fc-kana");
    if (kanaEl) {
      kanaEl.textContent = item.kana || "";
      kanaEl.classList.toggle("is-kana-only-headword", kanaOnly);
      kanaEl.classList.remove("is-revealed");
    }

    const memoInput = document.getElementById("fc-simple-memo");
    if (memoInput) memoInput.value = appState.posNotes[idStr] || "";

    const frontEl = document.getElementById("fc-front");
    const backEl = document.getElementById("fc-back");
    if (frontEl) frontEl.hidden = fcFlipped;
    if (backEl) backEl.hidden = !fcFlipped;

    const meaningEl = document.getElementById("fc-meaning");
    if (meaningEl) {
      meaningEl.textContent = item.meaning || "";
      meaningEl.classList.remove("is-revealed");
    }
    setText("fc-pos", item.pos || "품사 미표기");

    const exEl = document.getElementById("fc-example");
    const exKanaEl = document.getElementById("fc-example-kana");
    const exMeaningEl = document.getElementById("fc-example-meaning");
    if (exEl) exEl.innerHTML = highlightKeywordInHtml(item.example || "예문 없음", item.word);
    if (exKanaEl) {
      exKanaEl.textContent = item.exampleKana || "";
      exKanaEl.hidden = !fcShowExKana || !item.exampleKana;
    }
    if (exMeaningEl) {
      exMeaningEl.textContent = item.exampleMeaning || "";
      exMeaningEl.hidden = !fcShowExMeaning || !item.exampleMeaning;
    }

    const kanjiChars = DATA.extractKanjiChars(item.word);
    const chipsWrap = document.getElementById("fc-kanji-chips");
    const relatedBox = document.getElementById("fc-kanji-related");
    if (chipsWrap) {
      chipsWrap.innerHTML = kanjiChars.length
        ? kanjiChars
            .map(
              (ch) =>
                `<button type="button" class="kanji-chip ${fcActiveKanji === ch ? "active" : ""}" data-kanji-char="${escapeHtml(ch)}" lang="ja">${escapeHtml(ch)}</button>`
            )
            .join("")
        : '<span class="helper-text">추출할 한자가 없습니다.</span>';
    }
    if (relatedBox) {
      if (fcActiveKanji) {
        const matches = DATA.findWordsByKanji(fcActiveKanji, idStr).slice(0, 8);
        relatedBox.hidden = false;
        relatedBox.innerHTML = matches.length
          ? `<strong>「${escapeHtml(fcActiveKanji)}」 포함 어휘:</strong> ` +
            matches.map((m) => `<span class="badge" lang="ja">${escapeHtml(m.word)} (${escapeHtml(m.kana)}) · ${escapeHtml(m.meaning)}</span>`).join(" ")
          : `「${escapeHtml(fcActiveKanji)}」를 포함한 다른 등록 어휘가 없습니다.`;
      } else {
        relatedBox.hidden = true;
      }
    }
  }

  function flipFlashcard(forceState = null) {
    fcFlipped = typeof forceState === "boolean" ? forceState : !fcFlipped;
    renderFlashcard();
  }

  function moveFlashcard(delta) {
    if (!fcDeck.length) return;
    fcIndex = (fcIndex + delta + fcDeck.length) % fcDeck.length;
    fcFlipped = false;
    fcShowExKana = false;
    fcShowExMeaning = false;
    fcActiveKanji = null;
    renderFlashcard();
  }

  function rateCurrentFlashcard(rating) {
    if (!fcDeck.length) return;
    const item = fcDeck[fcIndex % fcDeck.length];
    const idStr = String(item.id);
    appState.progress[idStr] = {
      type: "vocab",
      ...DATA.calculateNextSrs(appState.progress[idStr] || null, rating)
    };
    persistState();
    moveFlashcard(1);
  }

  function renderGrammarDashboard() {
    const stats = DATA.getGrammarStatsSummary(appState);
    setText("stat-grammar-total", stats.total);
    setText("stat-grammar-due", stats.due);
    setText("stat-grammar-learned", stats.learned);
    setText("stat-grammar-ambiguous", stats.ambiguous);
    setText("stat-grammar-unknown", stats.unknown);
    setText("stat-grammar-unstudied", stats.unstudied);
  }

  function renderGrammarList() {
    renderGrammarDashboard();
    const container = document.getElementById("grammar-card-list");
    if (!container) return;

    const q = (document.getElementById("grammar-search-input")?.value || "").trim().toLowerCase();
    const connFilter = document.getElementById("grammar-connection-filter")?.value || "ALL";
    const statusFilter = document.getElementById("grammar-status-filter")?.value || "ALL";

    const filtered = DATA.GRAMMAR_DB.filter((g) => {
      const idStr = String(g.id);
      const curStatus = getItemStatus(idStr);
      if (connFilter !== "ALL" && !String(g.connection || "").includes(connFilter)) return false;
      if (statusFilter === "DUE" && !DATA.isDueForReview(idStr, appState)) return false;
      if (["미학습", "모름", "애매함", "완벽함"].includes(statusFilter) && curStatus !== statusFilter) return false;
      if (q) {
        const hay = `${g.word} ${g.kana} ${g.meaning} ${g.connection} ${g.example} ${g.explanation}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      container.innerHTML = '<div class="card helper-text">등록된 N4 문법 항목이 없거나 필터 조건에 맞는 문법이 없습니다.</div>';
      return;
    }

    container.innerHTML = filtered
      .map((g) => {
        const idStr = String(g.id);
        const status = getItemStatus(idStr);
        const compares = Array.isArray(g.compareGrammar) ? g.compareGrammar : [];
        return `
        <article class="card grammar-card">
          <div class="card-header">
            <span class="grammar-pattern-title" lang="ja">${escapeHtml(g.word)}</span>
            <span class="badge badge-conn">${escapeHtml(g.connection || "문법")}</span>
          </div>
          <p class="grammar-meaning maskable-meaning"><strong>${escapeHtml(g.meaning)}</strong></p>
          ${g.explanation ? `<p class="helper-text">${escapeHtml(g.explanation)}</p>` : ""}
          ${g.example ? `<p class="fc-example-jp" lang="ja">${escapeHtml(g.example)}</p><p class="helper-text maskable-meaning">${escapeHtml(g.exampleMeaning || "")}</p>` : ""}
          <div class="quick-action-row">
            ${compares
              .map((cg) => `<button type="button" class="compare-chip" data-open-grammar-compare="${escapeHtml(idStr)}" data-compare-item="${escapeHtml(cg)}" lang="ja">유사 비교: ${escapeHtml(cg)}</button>`)
              .join("")}
            <select class="vocab-status-select" data-grammar-status-id="${escapeHtml(idStr)}">
              <option value="미학습" ${status === "미학습" ? "selected" : ""}>미학습</option>
              <option value="모름" ${status === "모름" ? "selected" : ""}>모름</option>
              <option value="애매함" ${status === "애매함" ? "selected" : ""}>애매함</option>
              <option value="완벽함" ${status === "완벽함" ? "selected" : ""}>완벽함</option>
            </select>
          </div>
        </article>
      `;
      })
      .join("");
  }

  function getGrammarByScope(scope) {
    return DATA.GRAMMAR_DB.filter((g) => {
      const idStr = String(g.id);
      const status = getItemStatus(idStr);
      if (scope === "DUE") return DATA.isDueForReview(idStr, appState);
      if (["미학습", "모름", "애매함", "완벽함"].includes(scope)) return status === scope;
      return true;
    });
  }

  function buildGrammarFlashcardDeck(shuffle = false) {
    const list = getGrammarByScope(gfcScope);
    gfcDeck = list.length ? [...list] : [...DATA.GRAMMAR_DB];
    if (shuffle) {
      for (let i = gfcDeck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [gfcDeck[i], gfcDeck[j]] = [gfcDeck[j], gfcDeck[i]];
      }
    }
    gfcIndex = 0;
    gfcFlipped = false;
  }

  function renderGrammarFlashcard() {
    if (!gfcDeck.length) {
      setText("gfc-counter", "0 / 0");
      setText("gfc-pattern", "DB 대기 중");
      setText("gfc-kana", "문법 DB를 연결해 주세요");
      return;
    }
    const item = gfcDeck[gfcIndex % gfcDeck.length];
    const idStr = String(item.id);
    const status = getItemStatus(idStr);

    setText("gfc-counter", `${gfcIndex + 1} / ${gfcDeck.length}`);
    setText("gfc-status-badge", status);
    setText("gfc-connection-badge", item.connection || "접속");
    setText("gfc-category-badge", item.category || "문법");

    setText("gfc-pattern", item.word || "");
    const kanaEl = document.getElementById("gfc-kana");
    if (kanaEl) {
      kanaEl.textContent = item.kana || item.word || "";
      kanaEl.classList.remove("is-revealed");
    }

    const memoEl = document.getElementById("gfc-simple-memo");
    if (memoEl) memoEl.value = appState.posNotes[idStr] || "";

    const frontEl = document.getElementById("gfc-front");
    const backEl = document.getElementById("gfc-back");
    if (frontEl) frontEl.hidden = gfcFlipped;
    if (backEl) backEl.hidden = !gfcFlipped;

    const meaningEl = document.getElementById("gfc-meaning");
    if (meaningEl) {
      meaningEl.textContent = item.meaning || "";
      meaningEl.classList.remove("is-revealed");
    }

    setText("gfc-back-connection", item.connection || "접속");
    setText("gfc-explanation", item.explanation || "");
    setText("gfc-example", item.example || "");
    setText("gfc-example-kana", item.exampleKana || "");
    setText("gfc-example-meaning", item.exampleMeaning || "");

    const compBox = document.getElementById("gfc-compare-chips");
    if (compBox) {
      const comps = Array.isArray(item.compareGrammar) ? item.compareGrammar : [];
      compBox.innerHTML = comps
        .map((cg) => `<button type="button" class="compare-chip" data-open-grammar-compare="${escapeHtml(idStr)}" data-compare-item="${escapeHtml(cg)}" lang="ja">비교: ${escapeHtml(cg)}</button>`)
        .join("");
    }
  }

  function flipGrammarFlashcard(forceState = null) {
    gfcFlipped = typeof forceState === "boolean" ? forceState : !gfcFlipped;
    renderGrammarFlashcard();
  }

  function moveGrammarFlashcard(delta) {
    if (!gfcDeck.length) return;
    gfcIndex = (gfcIndex + delta + gfcDeck.length) % gfcDeck.length;
    gfcFlipped = false;
    renderGrammarFlashcard();
  }

  function rateCurrentGrammarCard(rating) {
    if (!gfcDeck.length) return;
    const item = gfcDeck[gfcIndex % gfcDeck.length];
    const idStr = String(item.id);
    appState.progress[idStr] = {
      type: "grammar",
      ...DATA.calculateNextSrs(appState.progress[idStr], rating)
    };
    persistState();
    renderGrammarDashboard();
    moveGrammarFlashcard(1);
  }

  function openGrammarCompareModal(grammarId, compareText = "") {
    const modal = document.getElementById("grammar-compare-modal");
    const body = document.getElementById("grammar-compare-body");
    if (!modal || !body) return;
    const baseItem = DATA.GRAMMAR_DB.find((g) => String(g.id) === String(grammarId));
    if (!baseItem) return;

    body.innerHTML = `
      <div class="compare-grid">
        <div class="card">
          <strong lang="ja">${escapeHtml(baseItem.word)}</strong>
          <p class="helper-text">접속: ${escapeHtml(baseItem.connection)}</p>
          <p>${escapeHtml(baseItem.meaning)}</p>
          ${baseItem.explanation ? `<p class="helper-text">${escapeHtml(baseItem.explanation)}</p>` : ""}
        </div>
        <div class="card">
          <strong lang="ja">${escapeHtml(compareText || "비교 대상 문형")}</strong>
          <p class="helper-text">접속 형태 및 문맥상 뉘앙스 차이를 비교하세요.</p>
          <p>${escapeHtml(baseItem.explanation || "시제·접속·의미 차이를 대조해 보세요.")}</p>
        </div>
      </div>
    `;
    modal.hidden = false;
  }

  function renderWrongNotes() {
    const listEl = document.getElementById("vocab-wrong-list");
    if (!listEl) return;
    const wrongEntries = Object.entries(appState.wrongStats)
      .filter(([, s]) => s && Number(s.count) > 0)
      .sort((a, b) => Number(b[1].count) - Number(a[1].count));

    if (!wrongEntries.length) {
      listEl.innerHTML = '<p class="helper-text">기록된 오답이 없습니다. 퀴즈를 풀면 자동 누적됩니다.</p>';
      return;
    }

    const combinedMap = new Map([
      ...DATA.VOCAB_DB.map((v) => [String(v.id), v]),
      ...DATA.GRAMMAR_DB.map((g) => [String(g.id), g])
    ]);

    listEl.innerHTML = wrongEntries
      .map(([id, stat]) => {
        const item = combinedMap.get(String(id));
        const label = item
          ? `<strong lang="ja">${escapeHtml(item.word)}</strong> <span lang="ja">(${escapeHtml(item.kana || "")})</span> — ${escapeHtml(item.meaning)}`
          : `항목 ID: ${escapeHtml(id)}`;
        return `
        <div class="vocab-row-card">
          <div>${label}</div>
          <div class="quick-action-row">
            <span class="badge badge-alert">오답 ${Number(stat.count)}회</span>
            <button type="button" class="chip-btn" data-remove-wrong="${escapeHtml(id)}">제거</button>
          </div>
        </div>
      `;
      })
      .join("");
  }

  function getFilteredReadingPassages(category = activeReadingCategory) {
    const db = Array.isArray(DATA.READING_DB) ? DATA.READING_DB : [];
    if (!category || category === "ALL") return db.slice();
    return db.filter((item) => String(item.category) === String(category));
  }

  function getReadingProgressEntry(readingId) {
    const key = String(readingId || "");
    appState.readingProgress = appState.readingProgress || {};
    const raw = appState.readingProgress[key];
    return {
      completed: Boolean(raw?.completed),
      solvedQuestions: raw && typeof raw.solvedQuestions === "object" ? { ...raw.solvedQuestions } : {},
      completedAt: raw?.completedAt || null
    };
  }

  function formatReadingPassageHtml(rawText) {
    const escaped = escapeHtml(rawText || "");
    const withUnderline = escaped.replace(/\[\[u\]\]([\s\S]*?)\[\[\/u\]\]/g, '<span class="reading-underline" lang="ja">$1</span>');
    const withBlank = withUnderline.replace(/\[\[blank\]\]([\s\S]*?)\[\[\/blank\]\]/g, '<span class="reading-blank" lang="ja">$1</span>');
    const paragraphs = withBlank.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
    if (!paragraphs.length) return `<p lang="ja"></p>`;
    return paragraphs.map((p) => `<p lang="ja">${p.replace(/\n/g, "<br />")}</p>`).join("");
  }

  function renderReadingSection() {
    document.querySelectorAll("#panel-reading-section [data-reading-category]").forEach((btn) => {
      const isMatch = btn.getAttribute("data-reading-category") === activeReadingCategory;
      btn.classList.toggle("active", isMatch);
      btn.setAttribute("aria-selected", String(isMatch));
    });

    const passages = getFilteredReadingPassages(activeReadingCategory);
    const listCol = document.getElementById("reading-passage-list");
    const detailCol = document.getElementById("reading-detail-view");
    if (!listCol || !detailCol) return;

    if (!passages.length) {
      listCol.innerHTML = `<div class="card-header"><span>지문 목록</span><span class="badge">0편</span></div><p class="helper-text">등록된 N4 독해 지문이 없습니다.</p>`;
      detailCol.innerHTML = `<p class="helper-text">독해 DB를 연결하면 본문과 문제, 어휘·문법 연계 해설이 표시됩니다.</p>`;
      return;
    }

    listCol.innerHTML = `
      <div class="card-header"><span>${activeReadingCategory === "ALL" ? "전체 지문" : activeReadingCategory}</span><span class="badge">${passages.length}편</span></div>
      ${passages
        .map((item) => {
          const idStr = String(item.id);
          const entry = getReadingProgressEntry(idStr);
          const isActive = idStr === String(selectedReadingId);
          return `
            <button type="button" class="reading-list-btn ${isActive ? "active" : ""}" data-select-reading="${escapeHtml(idStr)}">
              <div class="reading-item-top">
                <span class="badge">${escapeHtml(item.category || "독해")}</span>
                <span class="badge ${entry.completed ? "reading-status-done" : ""}">${entry.completed ? "완료" : "미완료"}</span>
              </div>
              <div class="reading-item-title">${escapeHtml(item.title || "")}</div>
              <div class="reading-item-meta"><span>⏱ ${Number(item.estimatedMinutes) || 3}분 · ${(item.questions || []).length}문항</span></div>
            </button>
          `;
        })
        .join("")}
    `;

    const current = passages.find((r) => String(r.id) === String(selectedReadingId)) || passages[0];
    selectedReadingId = String(current.id);
    const entry = getReadingProgressEntry(current.id);
    const questions = Array.isArray(current.questions) ? current.questions : [];

    const questionsHtml = questions
      .map((q, qIdx) => {
        const qKey = String(q.qId || `${current.id}-q${qIdx + 1}`);
        const selectedIdx = entry.solvedQuestions[qKey];
        const hasAnswered = selectedIdx !== undefined && selectedIdx !== null;
        const answerIdx = Number(q.answerIndex);

        const choicesHtml = (Array.isArray(q.choices) ? q.choices : [])
          .map((choiceText, cIdx) => {
            let stateClass = "";
            if (hasAnswered) {
              if (cIdx === answerIdx) stateClass = "is-correct";
              else if (cIdx === Number(selectedIdx)) stateClass = "is-wrong";
            }
            return `<button type="button" class="reading-choice-btn ${stateClass}" data-reading-id="${escapeHtml(current.id)}" data-question-id="${escapeHtml(qKey)}" data-choice-index="${cIdx}"><span lang="ja">${escapeHtml(choiceText)}</span></button>`;
          })
          .join("");

        const explHtml = hasAnswered
          ? `
            <div class="reading-explanation-box">
              <div class="${Number(selectedIdx) === answerIdx ? "feedback-ok" : "feedback-err"}">
                <strong>${Number(selectedIdx) === answerIdx ? "✓ 정답입니다!" : `✕ 오답입니다. (정답: ${answerIdx + 1}번)`}</strong>
              </div>
              ${q.clueSentence ? `<div class="reading-clue-box"><div class="label-sm">정답 근거 문장</div><div lang="ja">${escapeHtml(q.clueSentence)}</div></div>` : ""}
              <div style="margin-top:6px;"><strong>해설:</strong> ${escapeHtml(q.explanation || "")}</div>
            </div>
          `
          : "";

        return `
          <div class="reading-question-block">
            <p class="reading-question-stem" lang="ja"><strong>Q${qIdx + 1}. ${escapeHtml(q.question || "")}</strong></p>
            <div class="reading-choices-list">${choicesHtml}</div>
            ${explHtml}
          </div>
        `;
      })
      .join("");

    const relatedChipsHtml =
      Array.isArray(current.relatedVocabGrammar) && current.relatedVocabGrammar.length
        ? `<div class="reading-link-chips">${current.relatedVocabGrammar
            .map((e) => `<div class="reading-link-chip"><strong lang="ja">${escapeHtml(e.term || "")}</strong> <span class="maskable-meaning">— ${escapeHtml(e.meaning || "")}</span></div>`)
            .join("")}</div>`
        : "";

    detailCol.innerHTML = `
      <div class="reading-passage-header">
        <div>
          <span class="badge">${escapeHtml(current.category || "독해")}</span>
          <h2 lang="ja">${escapeHtml(current.title || "")}</h2>
        </div>
        <div class="reading-toolbar-actions">
          <button type="button" class="btn" id="btn-reading-tts" data-reading-id="${escapeHtml(current.id)}">🔊 지문 듣기</button>
          <button type="button" class="btn ${readingShowTranslation ? "btn-secondary" : ""}" id="btn-reading-toggle-translation">${readingShowTranslation ? "해석 숨기기" : "전체 해석"}</button>
          <button type="button" class="btn ${entry.completed ? "btn-secondary" : "btn-primary"}" id="btn-complete-reading" data-reading-id="${escapeHtml(current.id)}">${entry.completed ? "✓ 완료됨" : "완료 표시"}</button>
        </div>
      </div>
      <div class="${current.category === "정보검색" ? "reading-info-box" : "reading-passage-body"}">${formatReadingPassageHtml(current.passage)}</div>
      ${readingShowTranslation ? `<div class="reading-translation-box maskable-meaning"><strong>전체 해석:</strong> ${escapeHtml(current.translation || "")}</div>` : ""}
      ${relatedChipsHtml}
      <div style="margin-top:16px;">${questionsHtml}</div>
    `;
  }

  function switchReadingCategory(category) {
    const allowed = new Set(["ALL", "단문", "중문", "정보검색"]);
    activeReadingCategory = allowed.has(category) ? category : "ALL";
    const candidates = getFilteredReadingPassages(activeReadingCategory);
    if (candidates.length && !candidates.some((r) => String(r.id) === String(selectedReadingId))) {
      selectedReadingId = String(candidates[0].id);
    }
    renderReadingSection();
  }

  function bindEvents() {
    document.addEventListener("jlpt:state-updated", refreshAllViews);

    document.getElementById("brand-home-btn")?.addEventListener("click", () => switchMainTab("main-dashboard"));
    document.querySelectorAll(".nav-item[data-main-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchMainTab(btn.getAttribute("data-main-tab")));
    });
    document.querySelectorAll(".domain-card[data-jump-main]").forEach((card) => {
      card.addEventListener("click", () => switchMainTab(card.getAttribute("data-jump-main")));
    });

    document.getElementById("btn-quick-start-vocab")?.addEventListener("click", () => switchMainTab("vocab-section", { vocabSubTab: "vocab-flashcard", scope: "DUE" }));
    document.getElementById("btn-quick-start-flashcard")?.addEventListener("click", () => switchMainTab("vocab-section", { vocabSubTab: "vocab-flashcard", scope: "ALL" }));
    document.getElementById("btn-quick-start-grammar")?.addEventListener("click", () => switchMainTab("grammar-section", { grammarSubTab: "grammar-dashboard" }));

    document.getElementById("jump-backup-btn")?.addEventListener("click", () => {
      switchMainTab("main-dashboard");
      setTimeout(() => document.getElementById("backup-restore-section")?.scrollIntoView({ behavior: "smooth" }), 60);
    });

    document.getElementById("btn-export-json")?.addEventListener("click", () => {
      DATA.exportStateToJson(appState);
      setText("backup-status-msg", "JSON 백업 파일을 내보냈습니다.");
    });

    document.getElementById("input-import-json")?.addEventListener("change", (e) => {
      const file = e.target?.files?.[0];
      if (!file || typeof DATA.importStateFromJson !== "function") return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = DATA.importStateFromJson(String(reader.result || ""), appState);
          if (imported) {
            appState = DATA.saveState(imported);
            refreshAllViews();
            setText("backup-status-msg", "JSON 백업 데이터를 복원했습니다.");
          } else {
            setText("backup-status-msg", "올바르지 않은 백업 파일 형식입니다.");
          }
        } catch (err) {
          console.error(err);
          setText("backup-status-msg", "백업 파일을 불러오는 중 오류가 발생했습니다.");
        } finally {
          e.target.value = "";
        }
      };
      reader.readAsText(file, "utf-8");
    });

    document.getElementById("btn-reset-all")?.addEventListener("click", () => {
      if (!confirm("모든 학습 기록과 커스텀 단어장을 초기화할까요?")) return;
      if (typeof DATA.resetState === "function") {
        appState = DATA.resetState();
      } else {
        appState = DATA.saveState({
          theme: appState.theme,
          maskKana: false,
          maskMeaning: false,
          ttsRate: appState.ttsRate || 1.0,
          progress: {},
          favorites: [],
          customDecks: [],
          posNotes: {},
          wrongStats: {},
          readingProgress: {}
        });
      }
      selectedVocabIds.clear();
      refreshAllViews();
      setText("backup-status-msg", "학습 데이터가 초기화되었습니다.");
    });

    document.getElementById("theme-toggle-btn")?.addEventListener("click", () => {
      appState.theme = appState.theme === "dark" ? "light" : "dark";
      persistState();
    });

    document.getElementById("mask-kana-btn")?.addEventListener("click", () => {
      appState.maskKana = !appState.maskKana;
      persistState();
    });

    document.getElementById("mask-meaning-btn")?.addEventListener("click", () => {
      appState.maskMeaning = !appState.maskMeaning;
      persistState();
    });

    document.getElementById("tts-rate-select")?.addEventListener("change", (e) => {
      const nextRate = Number(e.target.value);
      appState.ttsRate = Number.isFinite(nextRate) ? nextRate : 1.0;
      persistState();
    });

    document.querySelectorAll(".sub-tab-item[data-vocab-subtab]").forEach((btn) => {
      btn.addEventListener("click", () => switchVocabSubTab(btn.getAttribute("data-vocab-subtab")));
    });

    document.querySelectorAll(".sub-tab-item[data-grammar-subtab]").forEach((btn) => {
      btn.addEventListener("click", () => switchGrammarSubTab(btn.getAttribute("data-grammar-subtab")));
    });

    ["vocab-search-input", "vocab-category-filter", "vocab-status-filter", "vocab-deck-filter", "vocab-sort-select"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const evtName = id === "vocab-search-input" ? "input" : "change";
      el.addEventListener(evtName, () => {
        vocabRenderedCount = VOCAB_PAGE_SIZE;
        renderVocabList();
      });
    });

    document.getElementById("btn-load-more-vocab")?.addEventListener("click", () => {
      vocabRenderedCount += VOCAB_PAGE_SIZE;
      renderVocabList();
    });

    document.getElementById("btn-create-deck")?.addEventListener("click", () => {
      const input = document.getElementById("input-new-deck-name");
      const name = String(input?.value || "").trim();
      if (!name) return;
      appState.customDecks = appState.customDecks || [];
      appState.customDecks.push({
        id: `deck-${Date.now()}`,
        name,
        wordIds: []
      });
      if (input) input.value = "";
      persistState();
      renderCustomDecksList();
      syncDeckSelectOptions();
    });

    document.getElementById("custom-deck-list")?.addEventListener("click", (e) => {
      const openId = e.target.closest("[data-open-deck]")?.getAttribute("data-open-deck");
      if (openId) {
        switchVocabSubTab("vocab-list", { resetPage: true });
        const deckSel = document.getElementById("vocab-deck-filter");
        if (deckSel) {
          deckSel.value = openId;
          renderVocabList();
        }
        return;
      }

      const delId = e.target.closest("[data-delete-deck]")?.getAttribute("data-delete-deck");
      if (delId) {
        appState.customDecks = (appState.customDecks || []).filter((d) => String(d.id) !== String(delId));
        persistState();
        renderCustomDecksList();
        syncDeckSelectOptions();
        renderVocabList();
      }
    });

    document.getElementById("btn-select-all-visible")?.addEventListener("click", () => {
      getFilteredAndSortedVocab()
        .slice(0, vocabRenderedCount)
        .forEach((item) => selectedVocabIds.add(String(item.id)));
      renderVocabList();
    });

    document.getElementById("btn-clear-selection")?.addEventListener("click", () => {
      selectedVocabIds.clear();
      renderVocabList();
    });

    document.getElementById("btn-add-to-deck")?.addEventListener("click", () => {
      const targetDeckId = document.getElementById("batch-target-deck-select")?.value;
      if (!targetDeckId || !selectedVocabIds.size) return;
      const deck = (appState.customDecks || []).find((d) => String(d.id) === String(targetDeckId));
      if (!deck) return;
      const merged = new Set([...(deck.wordIds || []).map(String), ...selectedVocabIds]);
      deck.wordIds = [...merged];
      persistState();
      renderCustomDecksList();
      alert(`선택한 ${selectedVocabIds.size}개 단어를 "${deck.name}" 단어장에 추가했습니다.`);
    });

    document.getElementById("btn-batch-set-status")?.addEventListener("click", () => {
      const nextStatus = document.getElementById("batch-status-select")?.value;
      if (!nextStatus || !selectedVocabIds.size) return;
      selectedVocabIds.forEach((idStr) => {
        appState.progress[idStr] = {
          type: "vocab",
          ...(typeof DATA.calculateNextSrs === "function"
            ? DATA.calculateNextSrs(appState.progress[idStr] || null, nextStatus)
            : { status: nextStatus })
        };
      });
      persistState();
      renderVocabList();
      renderVocabDashboard();
    });

    const vocabListEl = document.getElementById("vocab-list-container");
    vocabListEl?.addEventListener("click", (e) => {
      const speakWord = e.target.closest("[data-speak-word]")?.getAttribute("data-speak-word");
      if (speakWord) {
        speakJapanese(speakWord);
        return;
      }

      const favId = e.target.closest("[data-toggle-fav]")?.getAttribute("data-toggle-fav");
      if (favId) {
        const favs = new Set((appState.favorites || []).map(String));
        if (favs.has(String(favId))) favs.delete(String(favId));
        else favs.add(String(favId));
        appState.favorites = [...favs];
        persistState();
        renderVocabList();
        renderVocabDashboard();
        return;
      }

      const checkEl = e.target.closest(".vocab-row-check");
      if (checkEl) {
        const val = String(checkEl.value);
        if (checkEl.checked) selectedVocabIds.add(val);
        else selectedVocabIds.delete(val);
        updateBatchSelectionUI();
      }
    });

    vocabListEl?.addEventListener("change", (e) => {
      const statusId = e.target.closest("[data-status-id]")?.getAttribute("data-status-id");
      if (statusId) {
        const nextStatus = e.target.value;
        appState.progress[String(statusId)] = {
          type: "vocab",
          ...(typeof DATA.calculateNextSrs === "function"
            ? DATA.calculateNextSrs(appState.progress[String(statusId)] || null, nextStatus)
            : { status: nextStatus })
        };
        persistState();
        renderVocabDashboard();
      }
    });

    vocabListEl?.addEventListener("input", (e) => {
      const memoId = e.target.closest("[data-memo-id]")?.getAttribute("data-memo-id");
      if (memoId) {
        appState.posNotes = appState.posNotes || {};
        appState.posNotes[String(memoId)] = e.target.value;
        appState = DATA.saveState(appState);
      }
    });

    document.getElementById("fc-scope-select")?.addEventListener("change", (e) => {
      fcScope = e.target.value;
      buildFlashcardDeck(false);
      renderFlashcard();
    });
    document.getElementById("btn-fc-shuffle")?.addEventListener("click", () => {
      buildFlashcardDeck(true);
      renderFlashcard();
    });
    document.getElementById("btn-fc-flip")?.addEventListener("click", () => flipFlashcard());
    document.getElementById("fc-front")?.addEventListener("click", () => flipFlashcard(true));
    document.getElementById("btn-fc-prev")?.addEventListener("click", () => moveFlashcard(-1));
    document.getElementById("btn-fc-next")?.addEventListener("click", () => moveFlashcard(1));
    document.getElementById("btn-fc-speak")?.addEventListener("click", () => {
      const cur = fcDeck[fcIndex % fcDeck.length];
      if (cur) speakJapanese(cur.word || cur.kana);
    });
    document.getElementById("btn-fc-favorite")?.addEventListener("click", () => {
      const cur = fcDeck[fcIndex % fcDeck.length];
      if (!cur) return;
      const idStr = String(cur.id);
      const favs = new Set((appState.favorites || []).map(String));
      if (favs.has(idStr)) favs.delete(idStr);
      else favs.add(idStr);
      appState.favorites = [...favs];
      persistState();
      renderFlashcard();
    });
    document.getElementById("btn-fc-toggle-ex-kana")?.addEventListener("click", () => {
      fcShowExKana = !fcShowExKana;
      renderFlashcard();
    });
    document.getElementById("btn-fc-toggle-ex-meaning")?.addEventListener("click", () => {
      fcShowExMeaning = !fcShowExMeaning;
      renderFlashcard();
    });
    document.getElementById("fc-simple-memo")?.addEventListener("input", (e) => {
      const cur = fcDeck[fcIndex % fcDeck.length];
      if (!cur) return;
      appState.posNotes = appState.posNotes || {};
      appState.posNotes[String(cur.id)] = e.target.value;
      appState = DATA.saveState(appState);
    });
    document.querySelectorAll("[data-fc-rate]").forEach((btn) => {
      btn.addEventListener("click", () => rateCurrentFlashcard(btn.getAttribute("data-fc-rate")));
    });
    document.getElementById("fc-kanji-chips")?.addEventListener("click", (e) => {
      const ch = e.target.closest("[data-kanji-char]")?.getAttribute("data-kanji-char");
      if (!ch) return;
      fcActiveKanji = fcActiveKanji === ch ? null : ch;
      renderFlashcard();
    });

    ["grammar-search-input", "grammar-connection-filter", "grammar-status-filter"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(id === "grammar-search-input" ? "input" : "change", renderGrammarList);
    });

    const grammarListEl = document.getElementById("grammar-card-list");
    grammarListEl?.addEventListener("click", (e) => {
      const cmpBtn = e.target.closest("[data-open-grammar-compare]");
      if (cmpBtn) {
        openGrammarCompareModal(
          cmpBtn.getAttribute("data-open-grammar-compare"),
          cmpBtn.getAttribute("data-compare-item") || ""
        );
      }
    });
    grammarListEl?.addEventListener("change", (e) => {
      const gId = e.target.closest("[data-grammar-status-id]")?.getAttribute("data-grammar-status-id");
      if (gId) {
        appState.progress[String(gId)] = {
          type: "grammar",
          ...(typeof DATA.calculateNextSrs === "function"
            ? DATA.calculateNextSrs(appState.progress[String(gId)] || null, e.target.value)
            : { status: e.target.value })
        };
        persistState();
        renderGrammarDashboard();
      }
    });

    document.getElementById("btn-close-compare-modal")?.addEventListener("click", () => {
      const modal = document.getElementById("grammar-compare-modal");
      if (modal) modal.hidden = true;
    });
    document.getElementById("grammar-compare-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "grammar-compare-modal") e.target.hidden = true;
    });

    document.getElementById("gfc-scope-select")?.addEventListener("change", (e) => {
      gfcScope = e.target.value;
      buildGrammarFlashcardDeck(false);
      renderGrammarFlashcard();
    });
    document.getElementById("btn-gfc-shuffle")?.addEventListener("click", () => {
      buildGrammarFlashcardDeck(true);
      renderGrammarFlashcard();
    });
    document.getElementById("btn-gfc-flip")?.addEventListener("click", () => flipGrammarFlashcard());
    document.getElementById("gfc-front")?.addEventListener("click", () => flipGrammarFlashcard(true));
    document.getElementById("btn-gfc-prev")?.addEventListener("click", () => moveGrammarFlashcard(-1));
    document.getElementById("btn-gfc-next")?.addEventListener("click", () => moveGrammarFlashcard(1));
    document.getElementById("btn-gfc-speak")?.addEventListener("click", () => {
      const cur = gfcDeck[gfcIndex % gfcDeck.length];
      if (cur) speakJapanese(cur.example || cur.word || cur.kana);
    });
    document.getElementById("gfc-simple-memo")?.addEventListener("input", (e) => {
      const cur = gfcDeck[gfcIndex % gfcDeck.length];
      if (!cur) return;
      appState.posNotes = appState.posNotes || {};
      appState.posNotes[String(cur.id)] = e.target.value;
      appState = DATA.saveState(appState);
    });
    document.querySelectorAll("[data-gfc-rate]").forEach((btn) => {
      btn.addEventListener("click", () => rateCurrentGrammarCard(btn.getAttribute("data-gfc-rate")));
    });
    document.getElementById("gfc-compare-chips")?.addEventListener("click", (e) => {
      const cmpBtn = e.target.closest("[data-open-grammar-compare]");
      if (cmpBtn) {
        openGrammarCompareModal(
          cmpBtn.getAttribute("data-open-grammar-compare"),
          cmpBtn.getAttribute("data-compare-item") || ""
        );
      }
    });

    document.getElementById("vocab-wrong-list")?.addEventListener("click", (e) => {
      const remId = e.target.closest("[data-remove-wrong]")?.getAttribute("data-remove-wrong");
      if (!remId) return;
      delete appState.wrongStats[String(remId)];
      persistState();
      renderWrongNotes();
    });

    document.getElementById("btn-clear-wrong-notes")?.addEventListener("click", () => {
      appState.wrongStats = {};
      persistState();
      renderWrongNotes();
    });

    document.querySelectorAll("#panel-reading-section [data-reading-category]").forEach((btn) => {
      btn.addEventListener("click", () => switchReadingCategory(btn.getAttribute("data-reading-category")));
    });

    const readingPanel = document.getElementById("panel-reading-section");
    readingPanel?.addEventListener("click", (e) => {
      const selBtn = e.target.closest("[data-select-reading]");
      if (selBtn) {
        selectedReadingId = selBtn.getAttribute("data-select-reading");
        readingShowTranslation = false;
        renderReadingSection();
        return;
      }

      const choiceBtn = e.target.closest(".reading-choice-btn");
      if (choiceBtn) {
        const rId = String(choiceBtn.getAttribute("data-reading-id") || "");
        const qId = String(choiceBtn.getAttribute("data-question-id") || "");
        const cIdx = Number(choiceBtn.getAttribute("data-choice-index"));
        const passage = (DATA.READING_DB || []).find((r) => String(r.id) === rId);
        if (!passage) return;

        const entry = getReadingProgressEntry(rId);
        entry.solvedQuestions[qId] = cIdx;

        const questions = Array.isArray(passage.questions) ? passage.questions : [];
        const allAnswered = questions.every((q, idx) => {
          const key = String(q.qId || `${rId}-q${idx + 1}`);
          return entry.solvedQuestions[key] !== undefined && entry.solvedQuestions[key] !== null;
        });
        if (allAnswered && !entry.completed) {
          entry.completed = true;
          entry.completedAt = new Date().toISOString();
        }

        appState.readingProgress[rId] = entry;
        persistState();
        renderReadingSection();
        return;
      }

      if (e.target.closest("#btn-reading-tts")) {
        const rId = String(e.target.closest("#btn-reading-tts").getAttribute("data-reading-id") || "");
        const passage = (DATA.READING_DB || []).find((r) => String(r.id) === rId);
        if (passage) {
          const plain = String(passage.passage || "").replace(/\[\[\/?(?:u|blank)\]\]/g, "");
          speakJapanese(plain);
        }
        return;
      }

      if (e.target.closest("#btn-reading-toggle-translation")) {
        readingShowTranslation = !readingShowTranslation;
        renderReadingSection();
        return;
      }

      const doneBtn = e.target.closest("#btn-complete-reading");
      if (doneBtn) {
        const rId = String(doneBtn.getAttribute("data-reading-id") || "");
        const entry = getReadingProgressEntry(rId);
        entry.completed = !entry.completed;
        entry.completedAt = entry.completed ? new Date().toISOString() : null;
        appState.readingProgress[rId] = entry;
        persistState();
        renderReadingSection();
      }
    });

    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (activeMainTab === "vocab-section" && activeVocabSubTab === "vocab-flashcard") {
        if (e.code === "Space" || e.key === "Enter") {
          e.preventDefault();
          flipFlashcard();
        } else if (e.key === "ArrowLeft") {
          moveFlashcard(-1);
        } else if (e.key === "ArrowRight") {
          moveFlashcard(1);
        } else if (e.key === "1") {
          rateCurrentFlashcard("모름");
        } else if (e.key === "2") {
          rateCurrentFlashcard("애매함");
        } else if (e.key === "3") {
          rateCurrentFlashcard("완벽함");
        }
      } else if (activeMainTab === "grammar-section" && activeGrammarSubTab === "grammar-flashcard") {
        if (e.code === "Space" || e.key === "Enter") {
          e.preventDefault();
          flipGrammarFlashcard();
        } else if (e.key === "ArrowLeft") {
          moveGrammarFlashcard(-1);
        } else if (e.key === "ArrowRight") {
          moveGrammarFlashcard(1);
        }
      }
    });
  }

  function init() {
    updateDdayBadge();
    applyThemeAndGlobalMasks();
    bindEvents();
    renderMainDashboard();

    window.JLPTStudy = {
      switchMainTab,
      switchVocabSubTab,
      switchGrammarSubTab,
      switchReadingCategory,
      speakJapanese,
      stopInternalTts,
      refreshAllViews,
      getState: () => appState
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
