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

  const RESPONSES_COLLECTION_PATH = "Responses";
  const ACTIONS_COLLECTION_PATH = "Action";
  const USER_ID_FIELD = "userId";
  const SESSION_ID_FIELD = "sessionId";
  const PROPERTY_ITEMS_FIELD = "propertyItems";
  const TREATMENT_FIELD = "treatmentGroupId";
  const TREATMENT_ITEM_FIELD = "treatmentGroupItem";
  const FIREBASE_CONFIG_FIELD = "firebaseConfig";

  const UI_COPY = {
    title: "Rate These Properties",
    subtitle: "Compare the properties side by side and enter the maximum price you would pay for each one before moving on.",
    finish: "Finish Phase 1",
    saving: "Saving your response...",
    complete: "All property responses are saved. You can continue to the next survey page.",
    completeTitle: "Phase 1 Complete",
    completeSubtitle: "You have submitted a maximum WTP for every property in Phase 1. Use the survey's Next button to move into Phase 2."
  };

  const FIREBASE_SDK_URLS = [
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"
  ];

  let loadedProperties = [];
  let runtimeResponses = [];
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
      margin: 0 -12px;
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

    .hs-phase-indicator {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #eef2f8;
      border-radius: 10px;
      padding: 4px;
    }

    .hs-phase-tab {
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      color: #5a6480;
      white-space: nowrap;
    }

    .hs-phase-tab.active {
      background: #0f1f3d;
      color: white;
      box-shadow: 0 8px 16px rgba(15,31,61,0.14);
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

    .hs-phase-banner {
      background: linear-gradient(135deg, #0f1f3d, #1a3260);
      padding: 14px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .hs-phase-banner-text {
      color: rgba(255,255,255,0.78);
      font-size: 13px;
      line-height: 1.45;
      max-width: 860px;
    }

    .hs-phase-banner-text strong {
      color: white;
    }

    .hs-no-price-badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: rgba(232,163,23,0.18);
      border: 1px solid rgba(255,196,68,0.48);
      color: #ffe39b;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .hs-phase1-wrap {
      width: min(1360px, calc(100% - 40px));
      margin: 24px auto 0;
      padding: 0;
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
      font-size: 24px;
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
      font-size: 12px;
      color: #5a6480;
      font-weight: 600;
    }

    .hs-progress-steps {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .hs-progress-step {
      width: 10px;
      height: 10px;
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
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .hs-address {
      font-size: 18px;
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
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }

    .hs-chip {
      background: #f4f7fb;
      border: 1px solid #e2eaf5;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 11px;
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
      font-size: 11px;
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
      padding: 0 10px;
      color: #5a6480;
      font-size: 12px;
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
      padding: 10px 11px;
      font-size: 12px;
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
      font-size: 12px;
    }

    .hs-open-house {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f5f8fc;
      border-radius: 12px;
      padding: 11px 12px;
      font-size: 12px;
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
      font-size: 11px;
      color: #7a7488;
    }

    .hs-button {
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 13px;
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
      .hs-platform-header,
      .hs-phase-banner {
        padding-left: 18px;
        padding-right: 18px;
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

  function renderPlatformHeader(ratedCount, totalCount) {
    const header = createEl("div", "hs-platform-header");
    const logo = createEl("div", "hs-header-logo");
    logo.appendChild(createEl("span", "hs-header-logo-mark", "H"));
    logo.appendChild(document.createTextNode("HomeStudy"));
    header.appendChild(logo);

    const right = createEl("div", "hs-header-right");
    const phaseIndicator = createEl("div", "hs-phase-indicator");
    phaseIndicator.appendChild(createEl("div", "hs-phase-tab active", "Phase 1 · Rating"));
    phaseIndicator.appendChild(createEl("div", "hs-phase-tab", "Phase 2 · Market"));
    right.appendChild(phaseIndicator);

    const topProgress = createEl("div", "hs-top-progress");
    topProgress.appendChild(createEl("div", "hs-top-progress-label", ratedCount + " / " + totalCount + " rated"));
    const track = createEl("div", "hs-top-progress-track");
    const fill = createEl("div", "hs-top-progress-fill");
    fill.style.width = (totalCount ? Math.round((ratedCount / totalCount) * 100) : 0) + "%";
    track.appendChild(fill);
    topProgress.appendChild(track);
    right.appendChild(topProgress);

    header.appendChild(right);
    return header;
  }

  function renderPhaseBanner() {
    const banner = createEl("div", "hs-phase-banner");
    const text = createEl("div", "hs-phase-banner-text");
    text.appendChild(createEl("strong", "", "Phase 1 — Preference Elicitation: "));
    text.appendChild(document.createTextNode(
      "Rate each property and indicate open house interest. Prices stay hidden so we capture your baseline preferences before the market opens."
    ));
    banner.appendChild(text);
    const badge = createEl("div", "hs-no-price-badge", "Prices Hidden");
    badge.prepend(document.createTextNode("🔒 "));
    banner.appendChild(badge);
    return banner;
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

  function readPropertiesFromEmbeddedData() {
    const raw = getEmbeddedDataValue(PROPERTY_ITEMS_FIELD);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) {
        throw new Error("propertyItems must be a non-empty JSON array.");
      }
      const treatmentItem = readTreatmentItemFromEmbeddedData() || {};
      const propertyIds = Array.isArray(treatmentItem.propertyIds) ? treatmentItem.propertyIds.map(String) : [];
      if (!propertyIds.length) {
        throw new Error("treatmentGroupItem must include a non-empty propertyIds array.");
      }

      const propertyMap = {};
      parsed.forEach(function (item, index) {
        const id = String(item.propertyId || item.id || ("property-" + (index + 1)));
        propertyMap[id] = item || {};
      });

      return propertyIds.map(function (propertyId, index) {
        const property = propertyMap[propertyId];
        if (!property) {
          throw new Error("Property ID " + propertyId + " is listed in treatmentGroupItem but missing from propertyItems.");
        }
        return shapePropertyData(property, propertyId, index);
      });
    } catch (error) {
      console.error("Could not parse propertyItems embedded data.", error);
      throw new Error(error.message || "Property data in Qualtrics could not be parsed. Check the propertyItems JSON.");
    }
  }

  function updateRuntimeResponse(index, nextValues) {
    runtimeResponses[index] = Object.assign({}, runtimeResponses[index], nextValues);
    window.__housingRuntimeResponses = runtimeResponses;
  }

  function saveRatingsToEmbeddedData() {
    const ratingsByPropertyId = {};
    runtimeResponses.forEach(function (state) {
      ratingsByPropertyId[state.docId] = {
        wtp: state.wtp,
        openHouse: state.openHouse
      };
    });

    setEmbeddedDataValue("phase1Ratings", JSON.stringify(ratingsByPropertyId));
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

  function saveAllResponses() {
    const userId = getUserId();
    const sessionId = getSessionId();
    const responseDocId = getResponseDocId();

    if (runtimeResponses.some(function (state) { return state.wtp === null; })) {
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

      const saveMetadata = metadataDoc.set({
        userId: userId || "",
        treatmentGroupId: getEmbeddedDataValue(TREATMENT_FIELD) || ""
      }, {merge: true});

      const saveRatings = runtimeResponses.map(function (state) {
        return ratingsCollection
          .doc(state.docId)
          .set({
            wtp: state.wtp,
            openHouse: state.openHouse
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

  function readTreatmentItemFromEmbeddedData() {
    const raw = getEmbeddedDataValue(TREATMENT_ITEM_FIELD);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("treatmentGroupItem must be a single JSON object.");
      }
      return parsed;
    } catch (error) {
      throw new Error("Invalid treatmentGroupItem embedded data. Check the JSON for this treatment branch.");
    }
  }

  function renderLoadingState() {
    root.innerHTML = "";
    root.appendChild(renderPlatformHeader(0, 0));
    root.appendChild(renderPhaseBanner());
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
    root.appendChild(renderPlatformHeader(0, 0));
    root.appendChild(renderPhaseBanner());
    const wrap = createEl("div", "hs-phase1-wrap");
    wrap.appendChild(createEl("h2", "hs-title", UI_COPY.title));
    wrap.appendChild(createEl("div", "hs-status error", message));
    root.appendChild(wrap);
  }

  function renderCompletionScreen() {
    root.innerHTML = "";
    root.appendChild(renderPlatformHeader(loadedProperties.length, loadedProperties.length));
    root.appendChild(renderPhaseBanner());

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
      "Phase 1 is locked in. Continue only when you're ready to begin Phase 2."
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

    const image = createEl("div", "hs-card-image " + property.bgClass);
    image.textContent = property.icon;

    const body = createEl("div", "hs-card-body");
    body.appendChild(createEl("div", "hs-address", property.address));
    body.appendChild(createEl("div", "hs-broker-line", "Previewed in the HomeStudy market"));
    body.appendChild(createEl("div", "hs-meta", property.meta));
    body.appendChild(createEl(
      "div",
      "hs-facts",
      [property.beds ? property.beds + " bd" : "", property.baths ? property.baths + " ba" : "", property.sqft ? property.sqft + " sqft" : ""]
        .filter(Boolean)
        .join(" | ")
    ));

    const attrs = createEl("div", "hs-attrs");
    attrs.appendChild(createChip("🛏 " + property.beds + " bed"));
    attrs.appendChild(createChip("🚿 " + property.baths + " bath"));
    if (property.sqft) {
      attrs.appendChild(createChip("📐 " + property.sqft + " sqft"));
    }
    body.appendChild(attrs);

    body.appendChild(createEl("div", "hs-price-hidden", "🔒 Price revealed in Phase 2"));

    const wtpLabel = createEl("div", "hs-wtp-label");
    wtpLabel.appendChild(createEl("span", "", "Maximum WTP"));
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
    wtpInput.setAttribute("aria-label", "Enter maximum willingness to pay for property " + (index + 1));
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

    card.appendChild(image);
    card.appendChild(body);
    return card;
  }

  function renderPropertyComparison() {
    if (!completionMessage && typeof qthis.hideNextButton === "function") {
      qthis.hideNextButton();
    }

    const ratedCount = runtimeResponses.filter(function (state) {
      return state.wtp !== null;
    }).length;

    root.innerHTML = "";
    root.appendChild(renderPlatformHeader(ratedCount, loadedProperties.length));
    root.appendChild(renderPhaseBanner());

    const wrap = createEl("div", "hs-phase1-wrap");
    const header = createEl("div", "hs-section-header");
    const badge = createEl("div", "hs-badge");
    badge.appendChild(createEl("div", "hs-badge-dot"));
    badge.appendChild(document.createTextNode("PHASE 1 ACTIVE"));
    header.appendChild(badge);
    header.appendChild(createEl("h2", "hs-title", UI_COPY.title));
    header.appendChild(createEl("p", "hs-subtitle", UI_COPY.subtitle));

    const allRated = loadedProperties.length > 0 && ratedCount === loadedProperties.length;
    const firstUnratedIndex = runtimeResponses.findIndex(function (state) {
      return state.wtp === null;
    });

    const progress = createEl("div", "hs-progress");
    progress.appendChild(
      createEl(
        "div",
        "hs-progress-copy",
        ratedCount + " of " + loadedProperties.length + " properties rated"
      )
    );
    const progressSteps = createEl("div", "hs-progress-steps");
    loadedProperties.forEach(function (_, index) {
      let className = "hs-progress-step";
      if (runtimeResponses[index].wtp !== null) {
        className += " done";
      } else if (index === firstUnratedIndex) {
        className += " current";
      }
      progressSteps.appendChild(createEl("div", className));
    });
    progress.appendChild(progressSteps);

    if (saveErrorMessage) {
      header.appendChild(createEl("div", "hs-status error", saveErrorMessage));
    }

    if (completionMessage) {
      header.appendChild(createEl("div", "hs-status success", completionMessage));
    }

    const cardGrid = createEl("div", "hs-card-grid");
    loadedProperties.forEach(function (property, index) {
      cardGrid.appendChild(renderPropertyCard(property, runtimeResponses[index], index));
    });

    const actions = createEl("div", "hs-actions");
    actions.appendChild(createEl(
      "div",
      "hs-note",
      allRated ?
        "Your selections will be saved when you finish." :
        "Enter a WTP amount for every property to unlock the next survey page."
    ));
    const nextButton = createEl(
      "button",
      "hs-button primary",
      UI_COPY.finish
    );
    nextButton.type = "button";
    nextButton.disabled = !allRated || saveInFlight;
    nextButton.dataset.role = "finish-ratings";
    if (saveInFlight) {
      nextButton.textContent = UI_COPY.saving;
    }
    actions.appendChild(nextButton);

    wrap.appendChild(header);
    wrap.appendChild(progress);
    wrap.appendChild(cardGrid);
    wrap.appendChild(actions);
    root.appendChild(wrap);
  }

  function syncLiveUiState() {
    const ratedCount = runtimeResponses.filter(function (state) {
      return state.wtp !== null;
    }).length;
    const allRated = loadedProperties.length > 0 && ratedCount === loadedProperties.length;
    const firstUnratedIndex = runtimeResponses.findIndex(function (state) {
      return state.wtp === null;
    });

    const progressCopy = root.querySelector(".hs-progress-copy");
    if (progressCopy) {
      progressCopy.textContent = ratedCount + " of " + loadedProperties.length + " properties rated";
    }

    const progressSteps = root.querySelectorAll(".hs-progress-step");
    progressSteps.forEach(function (step, index) {
      step.className = "hs-progress-step";
      if (runtimeResponses[index].wtp !== null) {
        step.classList.add("done");
      } else if (index === firstUnratedIndex) {
        step.classList.add("current");
      }
    });

    const note = root.querySelector(".hs-note");
    if (note) {
      note.textContent = allRated ?
        "Your selections will be saved when you finish." :
        "Enter a WTP amount for every property to unlock the next survey page.";
    }

    const nextButton = root.querySelector("[data-role='finish-ratings']");
    if (nextButton) {
      nextButton.disabled = !allRated || saveInFlight;
      nextButton.textContent = saveInFlight ? UI_COPY.saving : UI_COPY.finish;
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
      const allRated = runtimeResponses.every(function (state) {
        return state.wtp !== null;
      });

      if (saveInFlight || !allRated) {
        return;
      }

      saveErrorMessage = "";
      recordAction("finish_phase1", "button", "finish_phase1", false);
      saveInFlight = true;
      renderPropertyComparison();

      saveAllResponses()
        .then(function () {
          saveInFlight = false;
          completionMessage = UI_COPY.complete;
          renderCompletionScreen();
          if (typeof qthis.showNextButton === "function") {
            qthis.showNextButton();
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
          wtp: null,
          openHouse: false
        };
      });
      window.__housingRuntimeResponses = runtimeResponses;
      renderPropertyComparison();
    })
    .catch(function (error) {
      console.error("Failed to load properties from Firebase.", error);
      renderErrorState(
        "Property data could not be loaded from Firebase. Check that the PropertyItems documents exist and are readable."
      );
    });
});
