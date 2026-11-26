(() => {
  "use strict";

  const STORAGE_KEY = "JLPT_N4_MASTER_STATE_V1";
  const EXAM_DATE = "2026-12-06";

  // N4 파트별 어휘 DB + 기존 확장 슬롯 자동 병합
  const RAW_VOCAB_LIST = [
    ...(typeof VOCAB_DB_PART1 !== "undefined" && Array.isArray(VOCAB_DB_PART1) ? VOCAB_DB_PART1 : []),
    ...(typeof VOCAB_DB_PART2 !== "undefined" && Array.isArray(VOCAB_DB_PART2) ? VOCAB_DB_PART2 : []),
    ...(typeof VOCAB_DB_PART3 !== "undefined" && Array.isArray(VOCAB_DB_PART3) ? VOCAB_DB_PART3 : []),
    ...(typeof VOCAB_DB_PART4 !== "undefined" && Array.isArray(VOCAB_DB_PART4) ? VOCAB_DB_PART4 : []),
    ...(typeof VOCAB_DB_PART5 !== "undefined" && Array.isArray(VOCAB_DB_PART5) ? VOCAB_DB_PART5 : []),
    ...(typeof VOCAB_DB_PART6 !== "undefined" && Array.isArray(VOCAB_DB_PART6) ? VOCAB_DB_PART6 : []),
    ...(typeof VOCAB_DB_EXTRA_EXAM !== "undefined" && Array.isArray(VOCAB_DB_EXTRA_EXAM) ? VOCAB_DB_EXTRA_EXAM : []),
    ...(Array.isArray(window.N4_VOCAB_KANJI_READING) ? window.N4_VOCAB_KANJI_READING : []),
    ...(Array.isArray(window.N4_VOCAB_NOTATION) ? window.N4_VOCAB_NOTATION : []),
    ...(Array.isArray(window.N4_VOCAB_CONTEXT) ? window.N4_VOCAB_CONTEXT : []),
    ...(Array.isArray(window.N4_VOCAB_SYNONYM) ? window.N4_VOCAB_SYNONYM : []),
    ...(Array.isArray(window.N4_VOCAB_USAGE) ? window.N4_VOCAB_USAGE : [])
  ];

  const RAW_GRAMMAR_LIST = [
    ...(Array.isArray(window.N4_GRAMMAR_DB) ? window.N4_GRAMMAR_DB : [])
  ];

  const RAW_READING_LIST = [
    ...(Array.isArray(window.N4_READING_DB) ? window.N4_READING_DB : [])
  ];

  // 동일 표기+읽기 어휘 중복 병합 및 기출 태그 통합
  function mergeVocabEntries(rawList) {
    const map = new Map();
    rawList.forEach((item, idx) => {
      if (!item || (!item.word && !item.kana)) return;
      const word = String(item.word || item.kana).trim();
      const kana = String(item.kana || item.word).trim();
      const key = `${word}::${kana}`;

      const incomingTags = Array.isArray(item.examTags)
        ? item.examTags
        : item.examTag
        ? [item.examTag]
        : [];

      if (!map.has(key)) {
        map.set(key, {
          id: String(item.id || `n4_v_${idx + 1}`),
          word,
          kana,
          meaning: String(item.meaning || ""),
          pos: String(item.pos || ""),
          category: String(item.category || "어휘"),
          quizType: String(item.quizType || "kanji_reading"),
          examTags: [...new Set(incomingTags)],
          example: String(item.example || ""),
          exampleKana: String(item.exampleKana || ""),
          exampleMeaning: String(item.exampleMeaning || ""),
          choices: Array.isArray(item.choices) ? item.choices : null,
          answerIndex: typeof item.answerIndex === "number" ? item.answerIndex : null,
          explanation: String(item.explanation || "")
        });
      } else {
        const existing = map.get(key);
        existing.examTags = [...new Set([...existing.examTags, ...incomingTags])];
        if (!existing.example && item.example) {
          existing.example = item.example;
          existing.exampleKana = item.exampleKana || "";
          existing.exampleMeaning = item.exampleMeaning || "";
        }
      }
    });
    return Array.from(map.values());
  }

  const VOCAB_DB = mergeVocabEntries(RAW_VOCAB_LIST);

  const GRAMMAR_DB = RAW_GRAMMAR_LIST.map((g, idx) => ({
    id: String(g.id || `n4_g_${idx + 1}`),
    word: String(g.word || g.pattern || ""),
    kana: String(g.kana || g.word || ""),
    meaning: String(g.meaning || ""),
    connection: String(g.connection || "문법"),
    category: String(g.category || "문법"),
    quizType: String(g.quizType || "grammar_q1"),
    explanation: String(g.explanation || ""),
    example: String(g.example || ""),
    exampleKana: String(g.exampleKana || ""),
    exampleMeaning: String(g.exampleMeaning || ""),
    compareGrammar: Array.isArray(g.compareGrammar) ? g.compareGrammar : [],
    choices: Array.isArray(g.choices) ? g.choices : null,
    answerIndex: typeof g.answerIndex === "number" ? g.answerIndex : null,
    starSegments: Array.isArray(g.starSegments) ? g.starSegments : null,
    starIndex: typeof g.starIndex === "number" ? g.starIndex : null
  }));

  const READING_DB = RAW_READING_LIST.map((r, idx) => ({
    ...r,
    id: String(r.id || `n4_r_${idx + 1}`)
  }));

  function createDefaultState() {
    return {
      version: 1,
      theme: "light",
      maskKana: false,
      maskMeaning: false,
      ttsRate: 1.0,
      progress: {},
      readingProgress: {},
      favorites: [],
      posNotes: {},
      customDecks: [],
      wrongStats: {}
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultState();
      const parsed = JSON.parse(raw);
      return {
        ...createDefaultState(),
        ...parsed,
        progress: parsed.progress && typeof parsed.progress === "object" ? parsed.progress : {},
        readingProgress:
          parsed.readingProgress && typeof parsed.readingProgress === "object"
            ? parsed.readingProgress
            : {},
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        posNotes: parsed.posNotes && typeof parsed.posNotes === "object" ? parsed.posNotes : {},
        customDecks: Array.isArray(parsed.customDecks) ? parsed.customDecks : [],
        wrongStats:
          parsed.wrongStats && typeof parsed.wrongStats === "object" ? parsed.wrongStats : {}
      };
    } catch (_) {
      return createDefaultState();
    }
  }

  function saveState(state) {
    const next = { ...createDefaultState(), ...state };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.error("상태 저장 실패:", err);
    }
    return next;
  }

  function resetAllData() {
    localStorage.removeItem(STORAGE_KEY);
    return createDefaultState();
  }

  function normalizeStatus(st) {
    return ["미학습", "모름", "애매함", "완벽함"].includes(st) ? st : "미학습";
  }

  function addDaysIso(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function calculateNextSrs(prevRecord, rating) {
    const status = normalizeStatus(rating);
    const prevInterval = Number(prevRecord?.intervalDays) || 0;
    const prevReps = Number(prevRecord?.reps) || 0;

    if (status === "미학습") {
      return { status: "미학습", intervalDays: 0, reps: 0, nextReviewDate: null };
    }
    if (status === "모름") {
      return { status: "모름", intervalDays: 1, reps: 0, nextReviewDate: addDaysIso(1) };
    }
    if (status === "애매함") {
      return { status: "애매함", intervalDays: 2, reps: prevReps, nextReviewDate: addDaysIso(2) };
    }
    const nextInterval = prevInterval < 3 ? 3 : Math.min(60, Math.round(prevInterval * 2.2));
    return {
      status: "완벽함",
      intervalDays: nextInterval,
      reps: prevReps + 1,
      nextReviewDate: addDaysIso(nextInterval)
    };
  }

  function isDueForReview(itemId, state) {
    const rec = state.progress?.[String(itemId)];
    if (!rec || !rec.nextReviewDate || rec.status === "미학습") return false;
    const todayStr = new Date().toISOString().slice(0, 10);
    return rec.nextReviewDate <= todayStr;
  }

  function isHiraganaOnly(str) {
    const s = String(str || "").trim();
    return s.length > 0 && /^[\u3040-\u309Fー〜・\s]+$/.test(s);
  }

  function extractKanjiChars(word) {
    const matches = String(word || "").match(/[\u4E00-\u9FAF]/g);
    return matches ? [...new Set(matches)] : [];
  }

  function findWordsByKanji(kanjiChar, excludeId = "") {
    if (!kanjiChar) return [];
    return VOCAB_DB.filter(
      (v) => String(v.id) !== String(excludeId) && String(v.word).includes(kanjiChar)
    );
  }

  function formatDuplicateExamLabel(examTags) {
    if (!Array.isArray(examTags) || examTags.length < 2) return "";
    return `중복출제 (${examTags.length}회)`;
  }

  function getVocabStatsSummary(state) {
    let due = 0, learned = 0, ambiguous = 0, unknown = 0, unlearned = 0;
    VOCAB_DB.forEach((v) => {
      const id = String(v.id);
      const st = normalizeStatus(state.progress?.[id]?.status);
      if (isDueForReview(id, state)) due += 1;
      if (st === "완벽함") learned += 1;
      else if (st === "애매함") ambiguous += 1;
      else if (st === "모름") unknown += 1;
      else unlearned += 1;
    });
    const wrongCount = Object.values(state.wrongStats || {}).filter((x) => x && x.count > 0).length;
    const total = VOCAB_DB.length;
    return {
      total,
      due,
      learned,
      ambiguous,
      unknown,
      unlearned,
      favorite: (state.favorites || []).length,
      wrong: wrongCount,
      rate: total > 0 ? Math.round((learned / total) * 100) : 0
    };
  }

  function getGrammarStatsSummary(state) {
    let due = 0, learned = 0, ambiguous = 0, unknown = 0, unstudied = 0;
    GRAMMAR_DB.forEach((g) => {
      const id = String(g.id);
      const st = normalizeStatus(state.progress?.[id]?.status);
      if (isDueForReview(id, state)) due += 1;
      if (st === "완벽함") learned += 1;
      else if (st === "애매함") ambiguous += 1;
      else if (st === "모름") unknown += 1;
      else unstudied += 1;
    });
    const total = GRAMMAR_DB.length;
    return {
      total,
      due,
      learned,
      ambiguous,
      unknown,
      unstudied,
      rate: total > 0 ? Math.round((learned / total) * 100) : 0
    };
  }

  function getOverallStatsSummary(state) {
    const vocab = getVocabStatsSummary(state);
    const grammar = getGrammarStatsSummary(state);
    const readingTotal = READING_DB.length;
    const readingCompleted = READING_DB.filter((r) =>
      Boolean(state.readingProgress?.[String(r.id)]?.completed)
    ).length;
    const readingRate = readingTotal > 0 ? Math.round((readingCompleted / readingTotal) * 100) : 0;

    const totalItems = vocab.total + grammar.total + readingTotal;
    const totalDone = vocab.learned + grammar.learned + readingCompleted;
    const overallRate = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;

    return {
      overallRate,
      vocab,
      grammar,
      reading: {
        total: readingTotal,
        completed: readingCompleted,
        incomplete: Math.max(0, readingTotal - readingCompleted),
        rate: readingRate
      },
      totalDue: vocab.due + grammar.due,
      weak: {
        ambiguousVocab: vocab.ambiguous,
        totalWrongRecords: vocab.wrong,
        incompleteReading: Math.max(0, readingTotal - readingCompleted)
      }
    };
  }

  function exportStateToJson(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jlpt-n4-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importStateFromJson(jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return saveState(parsed);
    } catch (_) {
      return null;
    }
  }

  window.JLPTData = {
    STORAGE_KEY,
    EXAM_DATE,
    VOCAB_DB,
    GRAMMAR_DB,
    READING_DB,
    loadState,
    saveState,
    resetAllData,
    normalizeStatus,
    calculateNextSrs,
    isDueForReview,
    isHiraganaOnly,
    extractKanjiChars,
    findWordsByKanji,
    formatDuplicateExamLabel,
    getVocabStatsSummary,
    getGrammarStatsSummary,
    getOverallStatsSummary,
    exportStateToJson,
    importStateFromJson
  };
})();
```[cite: 103, 104, 105]

### 적용 후 확인 방법
1. `index.html`에서 `n4-vocab-part1.js` ~ `part6.js`, `n4-vocab-extra.js`가 `data.js`와 `study.js`보다 **먼저** 로드되는지 확인해 주세요[cite: 103, 104, 105].
2. 브라우저에서 **어휘 → 단어 목록** 탭을 열었을 때 `window.JLPTData.VOCAB_DB.length`가 0이 아니라 수백 개로 잡히면 정상 병합된 것입니다[cite: 104, 105].

이 `data.js`로 교체한 뒤에도 단어가 보이지 않으면 콘솔에 뜨는 오류 메시지나 `window.JLPTData.VOCAB_DB.length` 값을 알려주시면 바로 이어서 봐드릴게요.
