Qualtrics.SurveyEngine.addOnReady(function () {
  const qthis = this;
  const questionContainer = qthis.getQuestionContainer();
  const root = questionContainer.querySelector("#qualtrics-root");

  if (!root) {
    console.error("Could not find #qualtrics-root inside this question.");
    return;
  }

  if (typeof qthis.hideNextButton === "function") {
    qthis.hideNextButton();
  }

  function expandQualtricsViewport() {
    const ancestors = [];
    let node = questionContainer;
    let depth = 0;

    while (node && node !== document.body && depth < 8) {
      ancestors.push(node);
      node = node.parentElement;
      depth += 1;
    }

    // The Qualtrics skin centers a narrow column; Phase 1 draws its own
    // full-bleed layout, so the wrappers give up their width caps and side
    // padding (professor's Aug 2026 note about whitespace on both sides).
    ancestors.forEach(function (el) {
      el.style.maxWidth = "100%";
      el.style.width = "100%";
      el.style.overflow = "visible";
      el.style.boxSizing = "border-box";
      el.style.paddingLeft = "0";
      el.style.paddingRight = "0";
      el.style.marginLeft = "0";
      el.style.marginRight = "0";
    });

    root.style.width = "100%";
    root.style.maxWidth = "100%";
    root.style.marginLeft = "0";
    root.style.marginRight = "0";
  }

  expandQualtricsViewport();

  const RESPONSES_COLLECTION_PATH = "Responses";
  const ACTIONS_COLLECTION_PATH = "Action";
  const USER_ID_FIELD = "userId";
  const SESSION_ID_FIELD = "sessionId";
  const PROPERTY_ITEMS_FIELD = "propertyItems";
  const TREATMENT_FIELD = "treatmentGroupId";
  const FIREBASE_CONFIG_FIELD = "firebaseConfig";

  // Housing profile answers collected on the setup page (spec Q2-Q4).
  const MARKET_TYPE_CODE_FIELD = "market_type_code";
  const MARKET_TYPE_LABEL_FIELD = "market_type_label";
  const IDEAL_BEDROOMS_FIELD = "ideal_bedrooms";
  const IDEAL_BATHROOMS_FIELD = "ideal_bathrooms";
  const SELF_REPORTED_PRICE_FIELD = "self_reported_price";

  // House assignment (spec section 2, revised Aug 2026): houses come from the
  // respondent's market type, bed/bath within +-1 of the ideal, nearest in
  // underlying price to self_reported_price, shown in random order. Phase 1 now
  // runs as ROUND_COUNT rounds of PROPERTIES_PER_ROUND houses each. The realized
  // assignment (and the randomly sampled display attributes from spec section 3)
  // is persisted here so a page reload keeps the same houses and rounds.
  const ASSIGNMENT_FIELD = "phase1Assignment";
  const ROUND_COUNT = 4;
  const PROPERTIES_PER_ROUND = 3;
  const TOTAL_PROPERTY_SLOTS = ROUND_COUNT * PROPERTIES_PER_ROUND;

  // Randomly sampled display attributes (spec section 3).
  const WALKABILITY_LEVELS = [
    "Daily errands do not require a car.",
    "Most errands can be accomplished on foot.",
    "Some errands can be accomplished on foot.",
    "Most errands require a car.",
    "Almost all errands require a car."
  ];
  const TRANSIT_LEVELS = [
    "World-class public transportation.",
    "Transit is convenient for most trips.",
    "Many nearby public transportation options.",
    "A few nearby public transportation options.",
    "It is possible to get on a bus."
  ];
  const COST_OF_LIVING_LEVELS = [
    "Comfortable relative to median income in the area",
    "Challenging relative to median income in the area"
  ];
  const SCHOOL_RATINGS = ["Excellent", "Great", "Good", "Needs Improvement"];
  const PROPERTY_TYPES_URBAN_METRO = ["Single Family House", "Townhouse", "Condo", "Apartment"];
  const PROPERTY_TYPES_OTHER = ["Single Family House", "Townhouse", "Condo"];

  const UI_COPY = {
    title: "Rate These Properties",
    finish: "Finish Phase 1",
    nextRound: "Continue to Round ",
    saving: "Saving your response...",
    complete: "All property responses are saved. You can continue to the next survey page.",
    completeTitle: "Phase 1 Complete",
    completeSubtitle: "You have entered a maximum price for every property. Use the survey's Next button to continue."
  };

  const FIREBASE_SDK_URLS = [
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"
  ];

  let loadedProperties = [];
  let respondentProfile = null;
  let runtimeResponses = [];
  let currentRoundIndex = 0;
  let savedRounds = {};
  let saveInFlight = false;
  let saveErrorMessage = "";
  let completionMessage = "";
  let phaseStartedAt = 0;
  let timelineEntries = [];
  let activeThinkingSegment = null;

  const style = document.createElement("style");
  style.textContent = `
    #qualtrics-root {
      font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: #1a1a2e;
      background: #f6f7fb;
      min-height: 100vh;
      box-sizing: border-box;
      padding-bottom: 40px;
    }

    .hs-platform-header {
      background: white;
      border-bottom: 1px solid #e2e8f3;
      min-height: 68px;
      padding: 0 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 4;
    }

    .hs-header-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #0f1f3d;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .hs-header-logo-mark {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: linear-gradient(135deg, #2451b7, #3a6fe8);
      color: white;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      box-shadow: 0 8px 16px rgba(36,81,183,0.18);
    }

    .hs-header-right {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }

    .hs-top-progress {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .hs-top-progress-label {
      font-size: 12px;
      font-weight: 700;
      color: #5a6480;
      white-space: nowrap;
    }

    .hs-top-progress-track {
      width: 116px;
      height: 8px;
      background: #dbe3f0;
      border-radius: 999px;
      overflow: hidden;
    }

    .hs-top-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #2451b7, #3a6fe8);
      border-radius: inherit;
    }

    .hs-phase1-wrap {
      width: 100%;
      margin: 22px 0 0;
      padding: 0 28px;
      box-sizing: border-box;
    }

    .hs-section-header {
      margin-bottom: 12px;
    }

    .hs-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #0f1f3d;
      color: #ffc444;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    .hs-badge-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ffc444;
    }

    .hs-title {
      font-size: 34px;
      font-weight: 700;
      color: #0f1f3d;
      margin: 0 0 4px 0;
    }

    .hs-subtitle {
      font-size: 13px;
      color: #5a6480;
      margin: 0;
      line-height: 1.35;
    }

    .hs-status {
      margin-top: 10px;
      padding: 9px 11px;
      border-radius: 10px;
      font-size: 12px;
      line-height: 1.3;
    }

    .hs-status.loading {
      background: #eef4ff;
      color: #27417a;
      border: 1px solid #c8d8ff;
    }

    .hs-status.error {
      background: #fff2ef;
      color: #8c3a2f;
      border: 1px solid #f3c4b8;
    }

    .hs-status.success {
      background: #edf8f0;
      color: #246342;
      border: 1px solid #b8e2c8;
    }

    .hs-progress {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 10px 0 10px 0;
      gap: 12px;
    }

    .hs-progress-copy {
      font-size: 17px;
      color: #5a6480;
      font-weight: 600;
    }

    .hs-progress-steps {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .hs-progress-step {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: #d8d1c4;
      transition: background 140ms ease, transform 140ms ease;
    }

    .hs-progress-step.done {
      background: #78a0ff;
    }

    .hs-progress-step.current {
      background: #3a6fe8;
      transform: scale(1.15);
    }

    .hs-card-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 22px;
      align-items: stretch;
    }

    .hs-market-banner {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #eef4ff;
      border: 1px solid #c8d8ff;
      color: #27417a;
      border-radius: 10px;
      padding: 10px 18px;
      font-size: 20px;
      font-weight: 700;
      margin: 10px 0 2px 0;
    }

    @media (max-width: 1100px) {
      .hs-card-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .hs-complete-panel {
      width: min(100%, 860px);
      margin: 0 auto;
    }

    .hs-card {
      background: #ffffff;
      border: 1px solid #dde4f0;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 28px rgba(15,31,61,0.06);
      display: flex;
      flex-direction: column;
      height: 100%;
      transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
    }

    .hs-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 38px rgba(15,31,61,0.10);
    }

    .hs-card.featured {
      border-color: #3a6fe8;
    }

    .hs-card-image {
      height: 188px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      font-size: 48px;
      overflow: hidden;
    }

    .bg-blue {
      background: linear-gradient(135deg, #dbeafe, #bfdbfe);
    }

    .bg-amber {
      background: linear-gradient(135deg, #fef3c7, #fde68a);
    }

    .bg-green {
      background: linear-gradient(135deg, #d1fae5, #a7f3d0);
    }

    .hs-card-body {
      padding: 20px 22px;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .hs-address {
      font-size: 24px;
      font-weight: 800;
      color: #0f1f3d;
      margin-bottom: 2px;
    }

    .hs-broker-line {
      color: #6a738c;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .hs-meta {
      font-size: 12px;
      color: #5a6480;
      margin-bottom: 8px;
    }

    .hs-facts {
      color: #0f1f3d;
      font-size: 13px;
      font-weight: 800;
      margin-bottom: 10px;
    }

    .hs-attrs {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 14px;
    }

    .hs-attr-row {
      display: flex;
      flex-wrap: nowrap;
      gap: 8px;
    }

    .hs-attr-row .hs-chip {
      flex: 1 1 0;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .hs-attr-row.full .hs-chip {
      flex: 1 1 100%;
      text-align: left;
      white-space: normal;
      overflow: visible;
      min-height: 44px;
      display: flex;
      align-items: center;
    }

    .hs-chip {
      background: #f4f7fb;
      border: 1px solid #e2eaf5;
      border-radius: 999px;
      padding: 8px 13px;
      font-size: 15px;
      color: #44506c;
      transition: transform 120ms ease, background 120ms ease, box-shadow 120ms ease;
      cursor: default;
    }

    .hs-chip:hover {
      background: #eef4ff;
      transform: translateY(-1px);
      box-shadow: 0 4px 10px rgba(15,31,61,0.08);
    }

    .hs-price-hidden {
      background: #f8fbff;
      border: 1px dashed #cfdcf4;
      border-radius: 12px;
      padding: 10px;
      font-size: 11px;
      color: #516180;
      text-align: center;
      margin-bottom: 10px;
      font-weight: 700;
    }

    .hs-wtp-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 15px;
      color: #5a6480;
      margin-bottom: 6px;
    }

    .hs-wtp-value {
      font-weight: 700;
      color: #e8a317;
      white-space: nowrap;
    }

    .hs-wtp-field {
      display: flex;
      align-items: center;
      border: 1.5px solid #d6deeb;
      border-radius: 12px;
      background: white;
      margin-bottom: 10px;
      overflow: hidden;
    }

    .hs-wtp-prefix {
      padding: 0 13px;
      color: #5a6480;
      font-size: 17px;
      font-weight: 700;
      background: #f4f6fb;
      border-right: 1px solid #e3e8f2;
      align-self: stretch;
      display: inline-flex;
      align-items: center;
    }

    .hs-wtp-input {
      width: 100%;
      border: 0;
      padding: 13px 14px;
      font-size: 17px;
      color: #0f1f3d;
      font-weight: 700;
      outline: none;
      background: white;
      font-family: Arial, sans-serif;
      min-width: 0;
    }

    .hs-wtp-input::placeholder {
      color: #5a6480;
      font-weight: 400;
      font-size: 16px;
    }

    .hs-open-house {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f5f8fc;
      border-radius: 12px;
      padding: 13px 14px;
      font-size: 15px;
      cursor: pointer;
      margin-bottom: 10px;
      border: 1px solid #ece3d3;
    }

    .hs-open-house span {
      line-height: 1.25;
    }

    .hs-toggle {
      width: 40px;
      height: 22px;
      border: 0;
      border-radius: 999px;
      position: relative;
      flex-shrink: 0;
      background: #ddd8cc;
      cursor: pointer;
      padding: 0;
      appearance: none;
      transition: background 140ms ease;
    }

    .hs-toggle.on {
      background: #1e8c5a;
    }

    .hs-toggle-knob {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: white;
      position: absolute;
      top: 3px;
      left: 3px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      transition: left 140ms ease;
      pointer-events: none;
    }

    .hs-toggle.on .hs-toggle-knob {
      left: 21px;
    }

    .hs-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-top: 22px;
      padding: 18px 20px;
      background: white;
      border: 1px solid #dde4f0;
      border-radius: 20px;
      box-shadow: 0 10px 28px rgba(15,31,61,0.05);
      position: sticky;
      bottom: 18px;
    }

    .hs-note {
      font-size: 15px;
      color: #7a7488;
    }

    .hs-button {
      border: 0;
      border-radius: 10px;
      padding: 14px 22px;
      font-size: 17px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 120ms ease, opacity 120ms ease, background 120ms ease;
    }

    .hs-button:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .hs-button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    .hs-button.primary {
      background: #2451b7;
      color: white;
      min-width: 168px;
      box-shadow: 0 12px 20px rgba(36,81,183,0.20);
    }

    @media (max-width: 900px) {
      .hs-platform-header {
        padding-left: 18px;
        padding-right: 18px;
      }

      .hs-phase1-wrap {
        padding-left: 16px;
        padding-right: 16px;
      }

      .hs-card-grid {
        grid-template-columns: 1fr;
      }

      .hs-actions {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `;
  document.head.appendChild(style);

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }

  function createChip(text) {
    return createEl("div", "hs-chip", text);
  }

  function renderPlatformHeader(completedRounds) {
    const header = createEl("div", "hs-platform-header");
    const logo = createEl("div", "hs-header-logo");
    logo.appendChild(createEl("span", "hs-header-logo-mark", "H"));
    logo.appendChild(document.createTextNode("HomeStudy"));
    header.appendChild(logo);

    const right = createEl("div", "hs-header-right");
    const topProgress = createEl("div", "hs-top-progress");
    topProgress.appendChild(createEl(
      "div",
      "hs-top-progress-label",
      completedRounds + " / " + ROUND_COUNT + " rounds"
    ));
    const track = createEl("div", "hs-top-progress-track");
    const fill = createEl("div", "hs-top-progress-fill");
    fill.style.width = Math.round((completedRounds / ROUND_COUNT) * 100) + "%";
    track.appendChild(fill);
    topProgress.appendChild(track);
    right.appendChild(topProgress);

    header.appendChild(right);
    return header;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (src.indexOf("firebase-app-compat") !== -1 && window.firebase) {
        resolve();
        return;
      }

      if (src.indexOf("firebase-firestore-compat") !== -1 &&
        window.firebase &&
        window.firebase.firestore) {
        resolve();
        return;
      }

      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        existing.addEventListener("load", resolve, {once: true});
        existing.addEventListener("error", reject, {once: true});
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.addEventListener("load", resolve, {once: true});
      script.addEventListener("error", function () {
        reject(new Error("Failed to load script: " + src));
      }, {once: true});
      document.head.appendChild(script);
    });
  }

  function ensureFirebaseReady() {
    return FIREBASE_SDK_URLS.reduce(function (promise, src) {
      return promise.then(function () {
        return loadScript(src);
      });
    }, Promise.resolve()).then(function () {
      const firebaseConfig = getFirebaseConfig();
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(firebaseConfig);
      }

      return window.firebase.firestore();
    });
  }

  function getFirebaseConfig() {
    const raw = getEmbeddedDataValue(FIREBASE_CONFIG_FIELD);
    if (!raw) {
      throw new Error(
        "Missing firebaseConfig embedded data. Add the Firebase web config JSON in Survey Flow."
      );
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("firebaseConfig must be a single JSON object.");
      }

      const requiredKeys = [
        "apiKey",
        "authDomain",
        "projectId",
        "storageBucket",
        "messagingSenderId",
        "appId"
      ];

      requiredKeys.forEach(function (key) {
        if (!parsed[key]) {
          throw new Error("firebaseConfig is missing required key: " + key);
        }
      });

      return parsed;
    } catch (error) {
      throw new Error(
        "Invalid firebaseConfig embedded data. Check the Firebase web config JSON in Survey Flow."
      );
    }
  }

  function getEmbeddedDataValue(fieldName) {
    if (typeof qthis.getEmbeddedData === "function") {
      const value = qthis.getEmbeddedData(fieldName);
      if (value) return String(value).trim();
    }

    if (window.Qualtrics &&
      window.Qualtrics.SurveyEngine &&
      typeof window.Qualtrics.SurveyEngine.getEmbeddedData === "function") {
      const value = window.Qualtrics.SurveyEngine.getEmbeddedData(fieldName);
      if (value) return String(value).trim();
    }

    return "";
  }

  function setEmbeddedDataValue(fieldName, value) {
    if (window.Qualtrics &&
      window.Qualtrics.SurveyEngine &&
      typeof window.Qualtrics.SurveyEngine.setEmbeddedData === "function") {
      window.Qualtrics.SurveyEngine.setEmbeddedData(fieldName, String(value));
    }
  }

  function sanitizeFirestoreDocId(value) {
    const docId = String(value)
      .trim()
      .replace(/\//g, "_")
      .replace(/\s+/g, "_");

    return docId === "." || docId === ".." ? "" : docId;
  }

  function getUserId() {
    return getEmbeddedDataValue(USER_ID_FIELD);
  }

  function createSessionId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "hs_" + window.crypto.randomUUID();
    }

    return "hs_" + Date.now() + "_" + Math.random().toString(36).slice(2, 12);
  }

  function ensureSessionId() {
    const existing = getEmbeddedDataValue(SESSION_ID_FIELD);
    if (existing) return existing;

    const generated = createSessionId();
    setEmbeddedDataValue(SESSION_ID_FIELD, generated);
    return generated;
  }

  function getSessionId() {
    return ensureSessionId();
  }

  function getResponseDocId() {
    const sessionId = getSessionId();
    if (sessionId) {
      return sanitizeFirestoreDocId(sessionId);
    }

    return "";
  }

  function getActionCollection() {
    const responseDocId = getResponseDocId();
    if (!responseDocId) return null;

    return ensureFirebaseReady().then(function (readyDb) {
      return readyDb
        .collection(RESPONSES_COLLECTION_PATH)
        .doc(responseDocId)
        .collection(ACTIONS_COLLECTION_PATH);
    });
  }

  function padTimePart(value, size) {
    return String(value).padStart(size, "0");
  }

  function formatElapsedTime(milliseconds) {
    const safeMs = Math.max(0, Number(milliseconds) || 0);
    const hours = Math.floor(safeMs / 3600000);
    const minutes = Math.floor((safeMs % 3600000) / 60000);
    const seconds = Math.floor((safeMs % 60000) / 1000);
    const remainderMs = safeMs % 1000;
    return [
      padTimePart(hours, 2),
      padTimePart(minutes, 2),
      padTimePart(seconds, 2)
    ].join(":") + "." + padTimePart(remainderMs, 3);
  }

  function nowOffsetMs() {
    return Math.max(0, Date.now() - phaseStartedAt);
  }

  function getCurrentScreenTarget() {
    return {
      targetType: "screen",
      targetId: "phase1_rating"
    };
  }

  function beginThinkingSegment(targetType, targetId) {
    activeThinkingSegment = {
      actionType: "thinking",
      targetType: targetType,
      targetId: targetId,
      startOffsetMs: nowOffsetMs()
    };
  }

  function ensureThinkingSegment() {
    if (!activeThinkingSegment) {
      const screenTarget = getCurrentScreenTarget();
      beginThinkingSegment(screenTarget.targetType, screenTarget.targetId);
    }
  }

  function closeThinkingSegment() {
    if (!activeThinkingSegment) return;

    const endOffsetMs = nowOffsetMs();
    timelineEntries.push({
      actionType: activeThinkingSegment.actionType,
      targetType: activeThinkingSegment.targetType,
      targetId: activeThinkingSegment.targetId,
      startOffsetMs: activeThinkingSegment.startOffsetMs,
      endOffsetMs: endOffsetMs,
      startTime: formatElapsedTime(activeThinkingSegment.startOffsetMs),
      endTime: formatElapsedTime(endOffsetMs)
    });
    activeThinkingSegment = null;
  }

  function recordAction(actionType, targetType, targetId, shouldResumeThinking) {
    closeThinkingSegment();
    const offsetMs = nowOffsetMs();
    timelineEntries.push({
      actionType: actionType,
      targetType: targetType,
      targetId: targetId,
      startOffsetMs: offsetMs,
      endOffsetMs: offsetMs,
      startTime: formatElapsedTime(offsetMs),
      endTime: formatElapsedTime(offsetMs)
    });
    if (shouldResumeThinking === false) {
      return;
    }

    const screenTarget = getCurrentScreenTarget();
    beginThinkingSegment(screenTarget.targetType, screenTarget.targetId);
  }

  function saveActionTimeline() {
    return getActionCollection().then(function (actionsCollection) {
      if (!actionsCollection) {
        throw new Error("Session ID is missing. Please restart the survey before continuing.");
      }

      closeThinkingSegment();
      return actionsCollection.doc("Phase1").set({
        timeline: timelineEntries.slice()
      }, {merge: true});
    });
  }

  function formatMeta(property) {
    const parts = [];
    if (property.zip) parts.push(property.zip);
    if (property.city || property.state) {
      parts.push([property.city, property.state].filter(Boolean).join(", "));
    }

    return parts.join(" · ") || "Market listing";
  }

  function formatSqft(sqft) {
    return Number(sqft).toLocaleString("en-US");
  }

  function getBackgroundClass(index) {
    const classes = ["bg-blue", "bg-amber", "bg-green"];
    return classes[index % classes.length];
  }

  function shapePropertyData(data, fallbackId, index) {
    const docId = data.propertyId || data.id || fallbackId || "property-" + (index + 1);

    return {
      docId: docId,
      address: data.address || "Property",
      meta: formatMeta(data),
      beds: data.beds || "",
      baths: data.baths || "",
      sqft: data.sqft ? formatSqft(data.sqft) : "",
      icon: data.icon || "🏠",
      bgClass: data.bgClass || getBackgroundClass(index),
      featured: Boolean(data.featured)
    };
  }

  function shapeProperty(doc, index) {
    return shapePropertyData(doc.data() || {}, doc.id, index);
  }

  function readRespondentProfile() {
    const code = getEmbeddedDataValue(MARKET_TYPE_CODE_FIELD);
    const label = getEmbeddedDataValue(MARKET_TYPE_LABEL_FIELD);
    const bedroomsRaw = getEmbeddedDataValue(IDEAL_BEDROOMS_FIELD);
    const bathroomsRaw = getEmbeddedDataValue(IDEAL_BATHROOMS_FIELD);
    const priceRaw = getEmbeddedDataValue(SELF_REPORTED_PRICE_FIELD);

    const bedrooms = bedroomsRaw ? Number(bedroomsRaw) : NaN;
    const bathrooms = bathroomsRaw ? Number(bathroomsRaw) : NaN;
    const price = priceRaw ? Number(priceRaw) : NaN;

    if (!code ||
      !Number.isFinite(bedrooms) ||
      !Number.isFinite(bathrooms) ||
      !Number.isFinite(price) ||
      price <= 0) {
      throw new Error(
        "Missing housing profile answers (market type, ideal bedrooms/bathrooms, or price). " +
        "The housing profile question must be completed before Phase 1."
      );
    }

    return {
      code: String(code),
      label: label || "",
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      price: price
    };
  }

  function getPropertyId(item, index) {
    return String(item.propertyId || item.id || ("property-" + (index + 1)));
  }

  function getPropertyPrice(item) {
    const value = Number(item.price || item.phase2Price || item.askPrice);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function shuffleInPlace(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
    return list;
  }

  function sampleFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function sampleAroundIdeal(ideal) {
    const delta = Math.floor(Math.random() * 3) - 1;
    return Math.max(1, ideal + delta);
  }

  function roomCountWithinOne(value, ideal) {
    if (value === undefined || value === null || value === "") return true;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.abs(parsed - ideal) <= 1 : true;
  }

  // Spec section 3: every display attribute is randomly sampled per
  // respondent. Type 2 (suburban/metropolitan) shows a transit score;
  // all other market types show a walkability score.
  function generateDisplayAttributes(profile) {
    const usesTransit = profile.code === "2";
    const usesApartments = profile.code === "1" || profile.code === "2";
    return {
      walkTransitType: usesTransit ? "transit" : "walkability",
      walkTransitText: sampleFrom(usesTransit ? TRANSIT_LEVELS : WALKABILITY_LEVELS),
      costOfLiving: sampleFrom(COST_OF_LIVING_LEVELS),
      schoolRating: sampleFrom(SCHOOL_RATINGS),
      beds: sampleAroundIdeal(profile.bedrooms),
      baths: sampleAroundIdeal(profile.bathrooms),
      propertyType: sampleFrom(usesApartments ? PROPERTY_TYPES_URBAN_METRO : PROPERTY_TYPES_OTHER)
    };
  }

  // Spec section 2 (revised Aug 2026): candidate pool = same market type,
  // bed/bath within +-1 of the ideal, ranked by closeness in underlying price to
  // self_reported_price. Phase 1 needs TOTAL_PROPERTY_SLOTS houses (ROUND_COUNT
  // rounds x PROPERTIES_PER_ROUND). Houses that match the bed/bath filter are
  // used first; if there are not enough, the filter is relaxed only to top the
  // list up (recorded via relaxedRoomFilter). If the market type still has fewer
  // unique houses than there are slots, houses repeat across rounds -- never
  // twice inside the same round -- and that is recorded via reusedProperties.
  function buildRoundAssignment(items, profile) {
    const candidates = [];
    items.forEach(function (item, index) {
      const price = getPropertyPrice(item);
      const marketCode = String(item.marketTypeCode || item.market_type_code || "");
      if (price === null || marketCode !== profile.code) return;
      candidates.push({item: item, id: getPropertyId(item, index), price: price});
    });

    if (candidates.length < PROPERTIES_PER_ROUND) {
      throw new Error(
        "Only " + candidates.length + " properties are available for market type " + profile.code +
        ". propertyItems needs at least " + PROPERTIES_PER_ROUND + " properties per market type."
      );
    }

    function byPriceDistance(a, b) {
      return Math.abs(a.price - profile.price) - Math.abs(b.price - profile.price);
    }

    const matchesRooms = function (entry) {
      return roomCountWithinOne(entry.item.beds, profile.bedrooms) &&
        roomCountWithinOne(entry.item.baths, profile.bathrooms);
    };

    const strictPool = shuffleInPlace(candidates.filter(matchesRooms)).sort(byPriceDistance);
    const relaxedPool = shuffleInPlace(candidates.filter(function (entry) {
      return !matchesRooms(entry);
    })).sort(byPriceDistance);

    const unique = strictPool.slice(0, TOTAL_PROPERTY_SLOTS);
    const relaxedUsed = unique.length < TOTAL_PROPERTY_SLOTS && relaxedPool.length > 0;
    while (unique.length < TOTAL_PROPERTY_SLOTS && relaxedPool.length) {
      unique.push(relaxedPool.shift());
    }

    // Cycle through the same shuffled order when the pool is short. A cycle of
    // at least PROPERTIES_PER_ROUND entries guarantees no house repeats inside a
    // single round.
    shuffleInPlace(unique);
    const slots = [];
    while (slots.length < TOTAL_PROPERTY_SLOTS) {
      slots.push(unique[slots.length % unique.length]);
    }

    const rounds = [];
    for (let roundIndex = 0; roundIndex < ROUND_COUNT; roundIndex += 1) {
      rounds.push(slots.slice(roundIndex * PROPERTIES_PER_ROUND, (roundIndex + 1) * PROPERTIES_PER_ROUND));
    }

    return {
      rounds: rounds,
      relaxedRoomFilter: relaxedUsed,
      reusedProperties: unique.length < TOTAL_PROPERTY_SLOTS,
      uniquePropertyCount: unique.length
    };
  }

  function decorateAssignedProperty(shapedProperty, baseItem, attributes) {
    shapedProperty.attributes = attributes;
    shapedProperty.beds = attributes.beds;
    shapedProperty.baths = attributes.baths;
    shapedProperty.underlyingPrice = getPropertyPrice(baseItem);
    return shapedProperty;
  }

  function readStoredAssignment(baseById) {
    const raw = getEmbeddedDataValue(ASSIGNMENT_FIELD);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.rounds) || parsed.rounds.length !== ROUND_COUNT) {
        return null;
      }
      const allKnown = parsed.rounds.every(function (round) {
        return Array.isArray(round) &&
          round.length === PROPERTIES_PER_ROUND &&
          round.every(function (entry) {
            return entry && entry.propertyId && baseById[entry.propertyId] && entry.attributes;
          });
      });
      return allKnown ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  // Flattens the per-round assignment into one list of TOTAL_PROPERTY_SLOTS
  // entries. Each entry keeps its round and its position inside that round, so
  // the rest of the page can keep addressing properties by a single index.
  function flattenRounds(rounds, baseById) {
    const flat = [];
    rounds.forEach(function (round, roundIndex) {
      round.forEach(function (entry, slotIndex) {
        const base = baseById[entry.propertyId] || {};
        const shaped = decorateAssignedProperty(
          shapePropertyData(base, entry.propertyId, slotIndex),
          base,
          entry.attributes
        );
        shaped.roundIndex = roundIndex;
        shaped.slotIndex = slotIndex;
        flat.push(shaped);
      });
    });
    return flat;
  }

  function readPropertiesFromEmbeddedData() {
    const raw = getEmbeddedDataValue(PROPERTY_ITEMS_FIELD);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) {
        throw new Error("propertyItems must be a non-empty JSON array.");
      }

      respondentProfile = readRespondentProfile();

      const baseById = {};
      parsed.forEach(function (item, index) {
        baseById[getPropertyId(item, index)] = item || {};
      });

      const storedAssignment = readStoredAssignment(baseById);
      if (storedAssignment) {
        return flattenRounds(storedAssignment.rounds, baseById);
      }

      const assignment = buildRoundAssignment(parsed, respondentProfile);

      // Display attributes are sampled once per house, so a house that appears
      // in more than one round is described identically both times.
      const attributesByPropertyId = {};
      const storedRounds = assignment.rounds.map(function (round) {
        return round.map(function (entry) {
          if (!attributesByPropertyId[entry.id]) {
            attributesByPropertyId[entry.id] = generateDisplayAttributes(respondentProfile);
          }
          return {propertyId: entry.id, attributes: attributesByPropertyId[entry.id]};
        });
      });

      setEmbeddedDataValue(ASSIGNMENT_FIELD, JSON.stringify({
        marketTypeCode: respondentProfile.code,
        relaxedRoomFilter: assignment.relaxedRoomFilter,
        reusedProperties: assignment.reusedProperties,
        uniquePropertyCount: assignment.uniquePropertyCount,
        rounds: storedRounds
      }));

      return flattenRounds(storedRounds, baseById);
    } catch (error) {
      console.error("Could not build the Phase 1 property assignment.", error);
      throw new Error(error.message || "Property data in Qualtrics could not be parsed. Check the propertyItems JSON.");
    }
  }

  function updateRuntimeResponse(index, nextValues) {
    runtimeResponses[index] = Object.assign({}, runtimeResponses[index], nextValues);
    window.__housingRuntimeResponses = runtimeResponses;
  }

  function saveRatingsToEmbeddedData() {
    const ratingsByRound = {};
    runtimeResponses.forEach(function (state) {
      const key = "round" + (state.roundIndex + 1);
      if (!ratingsByRound[key]) ratingsByRound[key] = {};
      ratingsByRound[key][state.docId] = {
        wtp: state.wtp,
        openHouse: state.openHouse
      };
    });

    setEmbeddedDataValue("phase1Ratings", JSON.stringify(ratingsByRound));
  }

  function indicesForRound(roundIndex) {
    const indices = [];
    runtimeResponses.forEach(function (state, index) {
      if (state.roundIndex === roundIndex) indices.push(index);
    });
    return indices;
  }

  function roundIsComplete(roundIndex) {
    const indices = indicesForRound(roundIndex);
    return indices.length > 0 && indices.every(function (index) {
      return runtimeResponses[index].wtp !== null;
    });
  }

  function completedRoundCount() {
    let completed = 0;
    for (let roundIndex = 0; roundIndex < ROUND_COUNT; roundIndex += 1) {
      if (roundIsComplete(roundIndex)) completed += 1;
    }
    return completed;
  }

  function isLastRound() {
    return currentRoundIndex >= ROUND_COUNT - 1;
  }

  function parseWtpValue(rawValue) {
    const cleaned = String(rawValue).replace(/[$,\s]/g, "");
    if (!cleaned) return null;

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function formatCurrencyValue(value) {
    return Number(value).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    });
  }

  function saveResponsesThroughRound(roundIndex, includeSessionMetadata) {
    const userId = getUserId();
    const responseDocId = getResponseDocId();

    if (!roundIsComplete(roundIndex)) {
      return Promise.reject(new Error("A WTP value is required for every property before saving."));
    }

    if (!responseDocId) {
      return Promise.reject(new Error("Session ID is missing. Please restart the survey before continuing."));
    }

    saveRatingsToEmbeddedData();

    return ensureFirebaseReady().then(function (db) {
      const metadataDoc = db
        .collection(RESPONSES_COLLECTION_PATH)
        .doc(responseDocId)
        .collection("MetaData")
        .doc("Session");
      const ratingsCollection = db
        .collection(RESPONSES_COLLECTION_PATH)
        .doc(responseDocId)
        .collection("Ratings");

      let relaxedRoomFilter = null;
      let reusedProperties = null;
      try {
        const storedAssignmentRaw = getEmbeddedDataValue(ASSIGNMENT_FIELD);
        if (storedAssignmentRaw) {
          const storedAssignment = JSON.parse(storedAssignmentRaw);
          relaxedRoomFilter = Boolean(storedAssignment.relaxedRoomFilter);
          reusedProperties = Boolean(storedAssignment.reusedProperties);
        }
      } catch (assignmentError) {
        relaxedRoomFilter = null;
        reusedProperties = null;
      }

      const saveMetadata = includeSessionMetadata ? metadataDoc.set({
        userId: userId || "",
        treatmentGroupId: getEmbeddedDataValue(TREATMENT_FIELD) || "",
        eligiblePurchase: getEmbeddedDataValue("eligiblePurchase") || "",
        marketTypeCode: respondentProfile ? respondentProfile.code : "",
        marketTypeLabel: respondentProfile ? respondentProfile.label : "",
        idealBedrooms: respondentProfile ? respondentProfile.bedrooms : null,
        idealBathrooms: respondentProfile ? respondentProfile.bathrooms : null,
        selfReportedPrice: respondentProfile ? respondentProfile.price : null,
        relaxedRoomFilter: relaxedRoomFilter,
        reusedProperties: reusedProperties,
        roundCount: ROUND_COUNT,
        propertiesPerRound: PROPERTIES_PER_ROUND,
        assignedPropertyIds: loadedProperties.map(function (property) {
          return property.docId;
        })
      }, {merge: true}) : Promise.resolve();

      const saveRatings = indicesForRound(roundIndex).map(function (index) {
        const state = runtimeResponses[index];
        const property = loadedProperties[index] || {};
        return ratingsCollection
          .doc("round-" + (roundIndex + 1) + "-" + state.docId)
          .set({
            propertyId: state.docId,
            round: roundIndex + 1,
            wtp: state.wtp,
            openHouse: state.openHouse,
            displayOrder: property.slotIndex !== undefined ? property.slotIndex + 1 : null,
            underlyingPrice: property.underlyingPrice !== undefined ? property.underlyingPrice : null,
            attributes: property.attributes || null
          }, {merge: true});
      });

      return Promise.all([saveMetadata].concat(saveRatings)).then(function () {
        return saveActionTimeline();
      });
    });
  }

  function fetchProperties() {
    const embeddedProperties = readPropertiesFromEmbeddedData();
    if (embeddedProperties) {
      return Promise.resolve(embeddedProperties);
    }

    return Promise.reject(new Error("Missing propertyItems embedded data. Add the propertyItems JSON before Phase 1."));
  }

  function renderLoadingState() {
    root.innerHTML = "";
    root.appendChild(renderPlatformHeader(0));
    const wrap = createEl("div", "hs-phase1-wrap");
    wrap.appendChild(createEl("h2", "hs-title", "Loading properties..."));
    wrap.appendChild(createEl(
      "div",
      "hs-status loading",
      "Loading the current property set before the game begins."
    ));
    root.appendChild(wrap);
  }

  function renderErrorState(message) {
    root.innerHTML = "";
    root.appendChild(renderPlatformHeader(0));
    const wrap = createEl("div", "hs-phase1-wrap");
    wrap.appendChild(createEl("h2", "hs-title", UI_COPY.title));
    wrap.appendChild(createEl("div", "hs-status error", message));
    root.appendChild(wrap);
  }

  function renderCompletionScreen() {
    root.innerHTML = "";
    root.appendChild(renderPlatformHeader(ROUND_COUNT));

    const wrap = createEl("div", "hs-phase1-wrap");
    const header = createEl("div", "hs-section-header");
    const badge = createEl("div", "hs-badge");
    badge.appendChild(createEl("div", "hs-badge-dot"));
    badge.appendChild(document.createTextNode("PHASE 1 COMPLETE"));
    header.appendChild(badge);
    header.appendChild(createEl("h2", "hs-title", UI_COPY.completeTitle));
    header.appendChild(createEl("p", "hs-subtitle", UI_COPY.completeSubtitle));

    const panel = createEl("div", "hs-complete-panel");
    const card = createEl("div", "hs-card featured");
    const body = createEl("div", "hs-card-body");
    body.appendChild(createEl("div", "hs-status success", UI_COPY.complete));
    body.appendChild(createEl(
      "div",
      "hs-note",
      "Your answers for all " + ROUND_COUNT + " rounds are locked in."
    ));
    card.appendChild(body);
    panel.appendChild(card);

    wrap.appendChild(header);
    wrap.appendChild(panel);
    root.appendChild(wrap);
  }

  function renderPropertyCard(property, state, index) {
    const card = createEl("div", "hs-card" + (property.featured ? " featured" : ""));
    card.dataset.index = String(index);

    // Cards intentionally show no photo, icon, or address (meeting decision,
    // Aug 2026): houses are identified by a neutral number and described only
    // by aggregate neighborhood/property chips.
    const body = createEl("div", "hs-card-body");
    const houseNumber = (property.slotIndex !== undefined ? property.slotIndex : index) + 1;
    body.appendChild(createEl("div", "hs-address", "House " + houseNumber));

    // Every card uses the same row structure so the houses line up when read
    // side by side: bed/bath/sqft together, then one attribute per line.
    const attrs = createEl("div", "hs-attrs");

    const facts = createEl("div", "hs-attr-row");
    facts.appendChild(createChip("🛏 " + property.beds + " bed"));
    facts.appendChild(createChip("🚿 " + property.baths + " bath"));
    if (property.sqft) {
      facts.appendChild(createChip("📐 " + property.sqft + " sqft"));
    }
    attrs.appendChild(facts);

    if (property.attributes) {
      [
        "🏠 " + property.attributes.propertyType,
        (property.attributes.walkTransitType === "transit" ? "🚌 " : "🚶 ") +
          property.attributes.walkTransitText,
        "💰 Cost of living: " + property.attributes.costOfLiving,
        "🎓 School district: " + property.attributes.schoolRating
      ].forEach(function (text) {
        const row = createEl("div", "hs-attr-row full");
        row.appendChild(createChip(text));
        attrs.appendChild(row);
      });
    }
    body.appendChild(attrs);

    const wtpLabel = createEl("div", "hs-wtp-label");
    wtpLabel.appendChild(createEl("span", "", "Your maximum price"));
    wtpLabel.appendChild(createEl(
      "span",
      "hs-wtp-value",
      state.wtp !== null ? formatCurrencyValue(state.wtp) : "Required"
    ));
    body.appendChild(wtpLabel);
    const wtpField = createEl("div", "hs-wtp-field");
    wtpField.appendChild(createEl("span", "hs-wtp-prefix", "$"));
    const wtpInput = document.createElement("input");
    wtpInput.className = "hs-wtp-input";
    wtpInput.type = "text";
    wtpInput.inputMode = "numeric";
    wtpInput.placeholder = "Enter max price";
    wtpInput.value = state.wtp !== null ? String(state.wtp) : "";
    wtpInput.dataset.index = String(index);
    wtpInput.dataset.role = "wtp-input";
    wtpInput.setAttribute("aria-label", "Enter maximum willingness to pay for house " + houseNumber);
    function updateWtpPreview(shouldRecordAction) {
      saveErrorMessage = "";
      clearErrorStatusUi();
      const parsedWtp = parseWtpValue(wtpInput.value);
      updateRuntimeResponse(index, {
        wtp: parsedWtp
      });
      wtpLabel.lastChild.textContent = parsedWtp !== null ? formatCurrencyValue(parsedWtp) : "Required";
      syncLiveUiState();

      if (shouldRecordAction) {
        recordAction("update_wtp", "property", property.docId || "unknown_property");
      }
    }
    wtpInput.oninput = function () {
      updateWtpPreview(false);
    };
    wtpInput.onkeyup = function () {
      updateWtpPreview(false);
    };
    wtpInput.onchange = function () {
      updateWtpPreview(true);
    };
    wtpField.appendChild(wtpInput);
    body.appendChild(wtpField);

    const openHouse = createEl("div", "hs-open-house");
    openHouse.dataset.index = String(index);
    openHouse.appendChild(createEl("span", "", "Would attend open house?"));
    const toggle = createEl("button", "hs-toggle" + (state.openHouse ? " on" : ""));
    toggle.type = "button";
    toggle.dataset.index = String(index);
    toggle.setAttribute("aria-pressed", state.openHouse ? "true" : "false");
    toggle.appendChild(createEl("div", "hs-toggle-knob"));
    openHouse.appendChild(toggle);
    body.appendChild(openHouse);

    card.appendChild(body);
    return card;
  }

  function advanceButtonLabel() {
    if (saveInFlight) return UI_COPY.saving;
    return isLastRound() ? UI_COPY.finish : UI_COPY.nextRound + (currentRoundIndex + 2);
  }

  function advanceNoteText() {
    if (!roundIsComplete(currentRoundIndex)) {
      return "Enter a price for all " + PROPERTIES_PER_ROUND + " properties to continue.";
    }
    return isLastRound() ?
      "Your answers will be saved when you finish." :
      "Your answers for this round will be saved when you continue.";
  }

  function renderPropertyComparison() {
    if (!completionMessage && typeof qthis.hideNextButton === "function") {
      qthis.hideNextButton();
    }

    const completedRounds = completedRoundCount();

    root.innerHTML = "";
    root.appendChild(renderPlatformHeader(completedRounds));

    const wrap = createEl("div", "hs-phase1-wrap");
    const header = createEl("div", "hs-section-header");
    const badge = createEl("div", "hs-badge");
    badge.appendChild(createEl("div", "hs-badge-dot"));
    badge.appendChild(document.createTextNode("PHASE 1 ACTIVE"));
    header.appendChild(badge);

    // Revised Aug 2026: the page carries no instructions -- only the title and
    // the respondent's market type. The willingness-to-pay explanation lives on
    // its own instruction page before this one.
    header.appendChild(createEl("h2", "hs-title", UI_COPY.title));
    if (respondentProfile && respondentProfile.label) {
      header.appendChild(createEl("div", "hs-market-banner", "🏙 Market type: " + respondentProfile.label));
    }

    const progress = createEl("div", "hs-progress");
    progress.appendChild(
      createEl(
        "div",
        "hs-progress-copy",
        completedRounds + " of " + ROUND_COUNT + " rounds completed"
      )
    );
    const progressSteps = createEl("div", "hs-progress-steps");
    for (let roundIndex = 0; roundIndex < ROUND_COUNT; roundIndex += 1) {
      let className = "hs-progress-step";
      if (roundIsComplete(roundIndex)) {
        className += " done";
      } else if (roundIndex === currentRoundIndex) {
        className += " current";
      }
      progressSteps.appendChild(createEl("div", className));
    }
    progress.appendChild(progressSteps);

    if (saveErrorMessage) {
      header.appendChild(createEl("div", "hs-status error", saveErrorMessage));
    }

    if (completionMessage) {
      header.appendChild(createEl("div", "hs-status success", completionMessage));
    }

    const cardGrid = createEl("div", "hs-card-grid");
    indicesForRound(currentRoundIndex).forEach(function (index) {
      cardGrid.appendChild(renderPropertyCard(loadedProperties[index], runtimeResponses[index], index));
    });

    const actions = createEl("div", "hs-actions");
    actions.appendChild(createEl("div", "hs-note", advanceNoteText()));
    const nextButton = createEl("button", "hs-button primary", advanceButtonLabel());
    nextButton.type = "button";
    nextButton.disabled = !roundIsComplete(currentRoundIndex) || saveInFlight;
    nextButton.dataset.role = "finish-ratings";
    actions.appendChild(nextButton);

    wrap.appendChild(header);
    wrap.appendChild(progress);
    wrap.appendChild(cardGrid);
    wrap.appendChild(actions);
    root.appendChild(wrap);
  }

  function syncLiveUiState() {
    const completedRounds = completedRoundCount();

    const progressCopy = root.querySelector(".hs-progress-copy");
    if (progressCopy) {
      progressCopy.textContent = completedRounds + " of " + ROUND_COUNT + " rounds completed";
    }

    const topProgressLabel = root.querySelector(".hs-top-progress-label");
    if (topProgressLabel) {
      topProgressLabel.textContent = completedRounds + " / " + ROUND_COUNT + " rounds";
    }

    const topProgressFill = root.querySelector(".hs-top-progress-fill");
    if (topProgressFill) {
      topProgressFill.style.width = Math.round((completedRounds / ROUND_COUNT) * 100) + "%";
    }

    const progressSteps = root.querySelectorAll(".hs-progress-step");
    progressSteps.forEach(function (step, roundIndex) {
      step.className = "hs-progress-step";
      if (roundIsComplete(roundIndex)) {
        step.classList.add("done");
      } else if (roundIndex === currentRoundIndex) {
        step.classList.add("current");
      }
    });

    const note = root.querySelector(".hs-note");
    if (note) {
      note.textContent = advanceNoteText();
    }

    const nextButton = root.querySelector("[data-role='finish-ratings']");
    if (nextButton) {
      nextButton.disabled = !roundIsComplete(currentRoundIndex) || saveInFlight;
      nextButton.textContent = advanceButtonLabel();
    }
  }

  function clearErrorStatusUi() {
    const errorStatus = root.querySelector(".hs-status.error");
    if (errorStatus) {
      errorStatus.remove();
    }
  }

  function handleInteraction(event) {
    const wtpInput = event.target.closest("[data-role='wtp-input']");
    if (wtpInput && root.contains(wtpInput)) {
      if (event.type === "click") {
        return;
      }
      return;
    }

    const openHouseRow = event.target.closest(".hs-open-house");
    if (openHouseRow && root.contains(openHouseRow)) {
      const index = Number(openHouseRow.dataset.index);
      saveErrorMessage = "";
      clearErrorStatusUi();
      const propertyId = runtimeResponses[index] ? runtimeResponses[index].docId : "unknown_property";
      updateRuntimeResponse(index, {
        openHouse: !runtimeResponses[index].openHouse
      });
      recordAction("toggle_open_house", "property", propertyId);
      renderPropertyComparison();
      return;
    }

    const nextButton = event.target.closest("[data-role='finish-ratings']");
    if (nextButton && root.contains(nextButton)) {
      if (saveInFlight || !roundIsComplete(currentRoundIndex)) {
        return;
      }

      const roundToSave = currentRoundIndex;
      const lastRound = isLastRound();

      saveErrorMessage = "";
      recordAction(
        lastRound ? "finish_phase1" : "finish_round",
        lastRound ? "button" : "round",
        lastRound ? "finish_phase1" : "round_" + (roundToSave + 1),
        false
      );
      saveInFlight = true;
      renderPropertyComparison();

      // Each round is written as it finishes, so a respondent who drops out
      // partway through still leaves usable data for the rounds they completed.
      saveResponsesThroughRound(roundToSave, true)
        .then(function () {
          saveInFlight = false;
          savedRounds[roundToSave] = true;

          if (lastRound) {
            completionMessage = UI_COPY.complete;
            renderCompletionScreen();
            if (typeof qthis.showNextButton === "function") {
              qthis.showNextButton();
            }
            return;
          }

          currentRoundIndex = roundToSave + 1;
          recordAction("start_round", "round", "round_" + (currentRoundIndex + 1));
          renderPropertyComparison();
          if (typeof window.scrollTo === "function") {
            window.scrollTo(0, 0);
          }
        })
        .catch(function (error) {
          console.error("Failed to save response.", error);
          saveInFlight = false;
          saveErrorMessage = error.message || "Failed to save your response.";
          renderPropertyComparison();
        });
    }
  }

  renderLoadingState();
  root.addEventListener("click", handleInteraction);
  phaseStartedAt = Date.now();
  ensureThinkingSegment();

  fetchProperties()
    .then(function (properties) {
      loadedProperties = properties;
      runtimeResponses = properties.map(function (property) {
        return {
          docId: property.docId,
          roundIndex: property.roundIndex,
          wtp: null,
          openHouse: false
        };
      });
      window.__housingRuntimeResponses = runtimeResponses;
      currentRoundIndex = 0;
      recordAction("start_round", "round", "round_1");
      renderPropertyComparison();
    })
    .catch(function (error) {
      console.error("Failed to load properties.", error);
      renderErrorState(
        error.message ||
        "Property data could not be loaded. Check the propertyItems JSON and the housing profile answers."
      );
    });
});
