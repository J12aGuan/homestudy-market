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

    ancestors.forEach(function (el) {
      el.style.maxWidth = "100%";
      el.style.width = "100%";
      el.style.overflow = "visible";
      el.style.boxSizing = "border-box";
    });

    root.style.width = "100%";
    root.style.maxWidth = "100%";
    root.style.marginLeft = "0";
    root.style.marginRight = "0";
  }

  expandQualtricsViewport();

  const RESPONSES_COLLECTION_PATH = "Responses";
  const ACTIONS_COLLECTION_PATH = "Action";
  const BIDS_COLLECTION_PATH = "Bids";
  const USER_ID_FIELD = "userId";
  const SESSION_ID_FIELD = "sessionId";
  const PROPERTY_ITEMS_FIELD = "propertyItems";
  const TREATMENT_FIELD = "treatmentGroupId";
  const FIREBASE_CONFIG_FIELD = "firebaseConfig";

  // Housing profile answers (spec Q2-Q4) and the Phase 1 assignment/ratings.
  const MARKET_TYPE_CODE_FIELD = "market_type_code";
  const MARKET_TYPE_LABEL_FIELD = "market_type_label";
  const SELF_REPORTED_PRICE_FIELD = "self_reported_price";
  const ASSIGNMENT_FIELD = "phase1Assignment";
  const PHASE1_RATINGS_FIELD = "phase1Ratings";
  const PHASE2_RESULT_FIELD = "phase2Result";

  // Bidding game parameters (spec section 4). Every value can be overridden
  // with an Embedded Data field of the same name; the defaults below follow
  // the spec's tentative numbers and are logged in pi_decisions.md.
  const CONFIG = {
    maxRounds: readNumberSetting("phase2MaxRounds", 4),          // bidding rounds per house
    maxRerolls: readNumberSetting("phase2MaxRerolls", 4),        // "see a different set" uses
    hazardRate: readNumberSetting("phase2HazardRate", 0.1),      // per-round expiration probability
    priceBand: readNumberSetting("phase2PriceBand", 0.2),        // algorithm price ~ U[ref*(1-band), ref*(1+band)]
    housesPerSet: 4
  };

  const UI_COPY = {
    boardTitle: "Choose a House to Bid On",
    boardSubtitle: "Each house shows a reference price. Bid on one house, ask to see a different set of houses, or exit the market.",
    biddingTitle: "Bidding",
    doneTitlePurchased: "Purchase Successful",
    doneTitleExited: "You Left the Market",
    doneTitleNoHouses: "No Houses Remaining"
  };

  const FIREBASE_SDK_URLS = [
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"
  ];

  // ---------------------------------------------------------------- state

  let respondentProfile = null;
  let orderedPool = [];          // all same-market houses, nearest price first
  let currentSet = [];           // houses currently on the board
  let shownPropertyIds = {};     // every house ever displayed
  let removedPropertyIds = {};   // expired or exhausted houses
  let rerollsUsed = 0;
  let bidAttempts = [];          // completed bid attempts (for the summary)
  let hazardDrawCount = 0;
  let hazardExpiredCount = 0;

  let screenState = "loading";   // loading | board | bidding | done | error
  let boardMessage = "";
  let errorMessage = "";
  let saveInFlight = false;

  let bidding = null;            // {property, round, lastBid, rounds: [], phase: "enter"|"failed"}
  let doneOutcome = null;        // {type: "purchased"|"exited"|"no_houses", ...}

  let phaseStartedAt = 0;
  let timelineEntries = [];
  let activeThinkingSegment = null;

  // Soft (non-blocking) time reminder on bidding screens: after this many
  // milliseconds on a round, a gentle nudge appears. Never blocks anything.
  const BID_REMINDER_DELAY_MS = 30000;
  let bidReminderHandle = null;

  function scheduleBidReminder() {
    if (bidReminderHandle) clearTimeout(bidReminderHandle);
    bidReminderHandle = setTimeout(function () {
      if (screenState === "bidding" && bidding && !bidding.showTimeReminder) {
        bidding.showTimeReminder = true;
        render();
      }
    }, BID_REMINDER_DELAY_MS);
  }

  function cancelBidReminder() {
    if (bidReminderHandle) {
      clearTimeout(bidReminderHandle);
      bidReminderHandle = null;
    }
  }

  // ---------------------------------------------------------------- style

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

    .hs-phase2-wrap {
      width: min(1360px, calc(100% - 40px));
      margin: 24px auto 0;
      box-sizing: border-box;
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

    .hs-market-banner {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #eef4ff;
      border: 1px solid #c8d8ff;
      color: #27417a;
      border-radius: 10px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 700;
      margin: 8px 0 2px 0;
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

    .hs-status.notice {
      background: #fff8e8;
      color: #7a5a17;
      border: 1px solid #f0dba8;
    }

    .hs-card-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 18px;
      align-items: stretch;
      margin-top: 14px;
    }

    @media (max-width: 1280px) {
      .hs-card-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
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
      transition: transform 140ms ease, box-shadow 140ms ease;
    }

    .hs-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 38px rgba(15,31,61,0.10);
    }

    .hs-card-image {
      height: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 44px;
    }

    .bg-blue { background: linear-gradient(135deg, #dbeafe, #bfdbfe); }
    .bg-amber { background: linear-gradient(135deg, #fef3c7, #fde68a); }
    .bg-green { background: linear-gradient(135deg, #d1fae5, #a7f3d0); }

    .hs-card-body {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .hs-address {
      font-size: 17px;
      font-weight: 800;
      color: #0f1f3d;
      margin-bottom: 2px;
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

    .hs-ref-price {
      background: #f8fbff;
      border: 1px solid #cfdcf4;
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 12px;
    }

    .hs-ref-price-label {
      font-size: 11px;
      font-weight: 700;
      color: #5a6480;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .hs-ref-price-value {
      font-size: 20px;
      font-weight: 800;
      color: #0f1f3d;
    }

    .hs-button {
      border: 0;
      border-radius: 10px;
      padding: 11px 15px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 120ms ease, opacity 120ms ease;
      font-family: inherit;
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
      box-shadow: 0 12px 20px rgba(36,81,183,0.20);
    }

    .hs-button.secondary {
      background: #eef2f8;
      color: #27417a;
      border: 1px solid #c8d8ff;
    }

    .hs-button.danger {
      background: #fff2ef;
      color: #8c3a2f;
      border: 1px solid #f3c4b8;
    }

    .hs-button.block {
      width: 100%;
      margin-top: auto;
    }

    .hs-board-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 22px;
      padding: 18px 20px;
      background: white;
      border: 1px solid #dde4f0;
      border-radius: 20px;
      box-shadow: 0 10px 28px rgba(15,31,61,0.05);
    }

    .hs-board-actions-note {
      font-size: 12px;
      color: #5a6480;
      font-weight: 600;
    }

    .hs-board-actions-buttons {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .hs-bid-panel {
      width: 100%;
      margin: 14px auto 0;
      background: white;
      border: 1px solid #dde4f0;
      border-radius: 20px;
      box-shadow: 0 10px 28px rgba(15,31,61,0.06);
      padding: 22px 24px;
      box-sizing: border-box;
    }

    .hs-round-steps {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 10px 0 14px 0;
    }

    .hs-round-step {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      background: #d8d1c4;
    }

    .hs-round-step.done { background: #b76e6e; }
    .hs-round-step.current { background: #2451b7; transform: scale(1.2); }

    .hs-bid-field {
      display: flex;
      align-items: stretch;
      max-width: 340px;
      border: 2px solid #cfddf7;
      border-radius: 8px;
      overflow: hidden;
      background: white;
      margin: 8px 0 14px 0;
    }

    .hs-bid-prefix {
      display: inline-flex;
      align-items: center;
      padding: 0 12px;
      font-size: 16px;
      font-weight: 700;
      color: #5a6480;
      background: #f4f6fb;
      border-right: 1px solid #e3e8f2;
    }

    .hs-bid-input {
      width: 100%;
      padding: 12px 14px;
      font-size: 16px;
      border: 0;
      outline: none;
      color: #17213a;
      font-weight: 700;
      font-family: Arial, sans-serif;
      min-width: 0;
    }

    .hs-bid-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 10px;
    }

    .hs-done-panel {
      width: min(100%, 720px);
      margin: 20px auto 0;
      background: white;
      border: 1px solid #dde4f0;
      border-radius: 20px;
      box-shadow: 0 10px 28px rgba(15,31,61,0.06);
      padding: 26px 28px;
      box-sizing: border-box;
    }

    .hs-summary-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid #eef2f8;
      font-size: 13px;
      color: #43506d;
    }

    .hs-summary-row strong {
      color: #0f1f3d;
    }
  `;
  document.head.appendChild(style);

  // ---------------------------------------------------------------- utils

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
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

  function readNumberSetting(fieldName, fallback) {
    const raw = getEmbeddedDataValue(fieldName);
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function formatCurrencyValue(value) {
    return Number(value).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    });
  }

  function parseBidValue(rawValue) {
    const cleaned = String(rawValue).replace(/[$,\s]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

  function getBackgroundClass(index) {
    const classes = ["bg-blue", "bg-amber", "bg-green"];
    return classes[index % classes.length];
  }

  // ---------------------------------------------------------------- firebase

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

  function getFirebaseConfig() {
    const raw = getEmbeddedDataValue(FIREBASE_CONFIG_FIELD);
    if (!raw) {
      throw new Error("Missing firebaseConfig embedded data. Add the Firebase web config JSON in Survey Flow.");
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("firebaseConfig must be a single JSON object.");
      }
      return parsed;
    } catch (error) {
      throw new Error("Invalid firebaseConfig embedded data. Check the Firebase web config JSON in Survey Flow.");
    }
  }

  function ensureFirebaseReady() {
    return FIREBASE_SDK_URLS.reduce(function (promise, src) {
      return promise.then(function () {
        return loadScript(src);
      });
    }, Promise.resolve()).then(function () {
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(getFirebaseConfig());
      }
      return window.firebase.firestore();
    });
  }

  function sanitizeFirestoreDocId(value) {
    const docId = String(value).trim().replace(/\//g, "_").replace(/\s+/g, "_");
    return docId === "." || docId === ".." ? "" : docId;
  }

  function createSessionId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "hs_" + window.crypto.randomUUID();
    }
    return "hs_" + Date.now() + "_" + Math.random().toString(36).slice(2, 12);
  }

  function getSessionId() {
    const existing = getEmbeddedDataValue(SESSION_ID_FIELD);
    if (existing) return existing;
    const generated = createSessionId();
    setEmbeddedDataValue(SESSION_ID_FIELD, generated);
    return generated;
  }

  function getResponseDoc(db) {
    const docId = sanitizeFirestoreDocId(getSessionId());
    if (!docId) throw new Error("Session ID is missing. Please restart the survey.");
    return db.collection(RESPONSES_COLLECTION_PATH).doc(docId);
  }

  // ---------------------------------------------------------------- timeline

  function padTimePart(value, size) {
    return String(value).padStart(size, "0");
  }

  function formatElapsedTime(milliseconds) {
    const safeMs = Math.max(0, Number(milliseconds) || 0);
    const hours = Math.floor(safeMs / 3600000);
    const minutes = Math.floor((safeMs % 3600000) / 60000);
    const seconds = Math.floor((safeMs % 60000) / 1000);
    const remainderMs = safeMs % 1000;
    return [padTimePart(hours, 2), padTimePart(minutes, 2), padTimePart(seconds, 2)].join(":") +
      "." + padTimePart(remainderMs, 3);
  }

  function nowOffsetMs() {
    return Math.max(0, Date.now() - phaseStartedAt);
  }

  function currentScreenTargetId() {
    if (screenState === "bidding" && bidding) {
      return "phase2_bidding_" + bidding.property.docId;
    }
    return "phase2_" + screenState;
  }

  function beginThinkingSegment() {
    activeThinkingSegment = {
      actionType: "thinking",
      targetType: "screen",
      targetId: currentScreenTargetId(),
      startOffsetMs: nowOffsetMs()
    };
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

  function recordAction(actionType, targetType, targetId) {
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
    beginThinkingSegment();
  }

  // ---------------------------------------------------------------- data setup

  function readRespondentProfile() {
    const code = getEmbeddedDataValue(MARKET_TYPE_CODE_FIELD);
    const label = getEmbeddedDataValue(MARKET_TYPE_LABEL_FIELD);
    const priceRaw = getEmbeddedDataValue(SELF_REPORTED_PRICE_FIELD);
    const price = priceRaw ? Number(priceRaw) : NaN;

    if (!code || !Number.isFinite(price) || price <= 0) {
      throw new Error(
        "Missing housing profile answers (market type or self-reported price). " +
        "The housing profile question must be completed before Phase 2."
      );
    }

    return {code: String(code), label: label || "", price: price};
  }

  function getPropertyId(item, index) {
    return String(item.propertyId || item.id || ("property-" + (index + 1)));
  }

  function getPropertyPrice(item) {
    const value = Number(item.price || item.phase2Price || item.askPrice);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function readPhase1Wtp() {
    const raw = getEmbeddedDataValue(PHASE1_RATINGS_FIELD);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      const wtpById = {};
      Object.keys(parsed || {}).forEach(function (propertyId) {
        const wtp = Number(parsed[propertyId] && parsed[propertyId].wtp);
        if (Number.isFinite(wtp) && wtp > 0) wtpById[propertyId] = wtp;
      });
      return wtpById;
    } catch (error) {
      return {};
    }
  }

  function readPhase1Assignment() {
    const raw = getEmbeddedDataValue(ASSIGNMENT_FIELD);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.properties)) return null;
      const ids = [];
      const attributesById = {};
      parsed.properties.forEach(function (entry) {
        const id = String(entry.propertyId);
        ids.push(id);
        if (entry.attributes) attributesById[id] = entry.attributes;
      });
      return {ids: ids, attributesById: attributesById};
    } catch (error) {
      return null;
    }
  }

  // Reference price rule (see pi_decisions.md item 7a). Adopted placeholder:
  // the respondent's own Phase 1 WTP for the house when available, otherwise
  // the underlying price scaled by a random factor in [0.9, 1.1].
  function buildReferencePrice(propertyId, underlyingPrice, wtpById) {
    if (wtpById[propertyId]) {
      return {referencePrice: Math.round(wtpById[propertyId]), referenceSource: "phase1_wtp"};
    }
    const scaled = underlyingPrice * (0.9 + Math.random() * 0.2);
    return {referencePrice: Math.round(scaled / 500) * 500, referenceSource: "random_placeholder"};
  }

  function shapeHouse(item, id, index, wtpById, phase1Attributes) {
    const underlyingPrice = getPropertyPrice(item);
    const reference = buildReferencePrice(id, underlyingPrice, wtpById);
    const metaParts = [];
    if (item.zip) metaParts.push(item.zip);
    if (item.city || item.state) {
      metaParts.push([item.city, item.state].filter(Boolean).join(", "));
    }

    // Keep the bed/bath counts the respondent saw in Phase 1 (the randomly
    // sampled display attributes) so the same house never changes size
    // between phases.
    const shown = phase1Attributes || null;

    return {
      docId: id,
      address: item.address || "Property",
      meta: metaParts.join(" · ") || "Market listing",
      beds: (shown && shown.beds) || item.beds || "",
      baths: (shown && shown.baths) || item.baths || "",
      sqft: item.sqft ? Number(item.sqft).toLocaleString("en-US") : "",
      icon: item.icon || "🏠",
      bgClass: item.bgClass || getBackgroundClass(index),
      underlyingPrice: underlyingPrice,
      referencePrice: reference.referencePrice,
      referenceSource: reference.referenceSource
    };
  }

  function buildPool() {
    const raw = getEmbeddedDataValue(PROPERTY_ITEMS_FIELD);
    if (!raw) {
      throw new Error("Missing propertyItems embedded data. Add the propertyItems JSON before Phase 2.");
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
      throw new Error("propertyItems must be a non-empty JSON array.");
    }

    respondentProfile = readRespondentProfile();
    const wtpById = readPhase1Wtp();
    const assignment = readPhase1Assignment();
    const attributesById = assignment ? assignment.attributesById : {};

    const candidates = [];
    parsed.forEach(function (item, index) {
      const marketCode = String(item.marketTypeCode || item.market_type_code || "");
      const price = getPropertyPrice(item);
      if (marketCode !== respondentProfile.code || price === null) return;
      const id = getPropertyId(item, index);
      candidates.push(shapeHouse(item, id, index, wtpById, attributesById[id]));
    });

    if (!candidates.length) {
      throw new Error("No properties available for market type " + respondentProfile.code + ".");
    }

    shuffleInPlace(candidates);
    candidates.sort(function (a, b) {
      return Math.abs(a.underlyingPrice - respondentProfile.price) -
        Math.abs(b.underlyingPrice - respondentProfile.price);
    });

    // Show the Phase 1 houses first when this runs in the same survey as
    // Phase 1; a standalone Phase 2 session just uses nearest-price order.
    if (assignment) {
      const assignedOrder = {};
      assignment.ids.forEach(function (id, position) { assignedOrder[id] = position; });
      const first = candidates
        .filter(function (house) { return assignedOrder[house.docId] !== undefined; })
        .sort(function (a, b) { return assignedOrder[a.docId] - assignedOrder[b.docId]; });
      const rest = candidates.filter(function (house) { return assignedOrder[house.docId] === undefined; });
      orderedPool = first.concat(rest);
    } else {
      orderedPool = candidates;
    }

    // Stable, neutral house labels (no addresses shown to respondents).
    // Because Phase 1 houses sort first, "House 1"-"House 4" here match the
    // numbers the respondent saw in Phase 1.
    orderedPool.forEach(function (house, index) {
      house.houseNumber = index + 1;
    });
  }

  function houseName(house) {
    return "House " + (house.houseNumber || "?");
  }

  function availableHouses() {
    return orderedPool.filter(function (house) {
      return !removedPropertyIds[house.docId];
    });
  }

  function unseenHouses() {
    return availableHouses().filter(function (house) {
      return !shownPropertyIds[house.docId];
    });
  }

  function dealSet() {
    // Prefer houses never shown before; top up with previously shown (but
    // still available) houses when the pool runs low.
    let next = unseenHouses().slice(0, CONFIG.housesPerSet);
    if (next.length < CONFIG.housesPerSet) {
      const currentIds = {};
      next.forEach(function (house) { currentIds[house.docId] = true; });
      const topUp = availableHouses().filter(function (house) {
        return !currentIds[house.docId];
      }).slice(0, CONFIG.housesPerSet - next.length);
      next = next.concat(topUp);
    }
    next = shuffleInPlace(next.slice());
    next.forEach(function (house) { shownPropertyIds[house.docId] = true; });
    return next;
  }

  // ---------------------------------------------------------------- saving

  function saveBidAttempt(attempt) {
    return ensureFirebaseReady().then(function (db) {
      return getResponseDoc(db)
        .collection(BIDS_COLLECTION_PATH)
        .doc("attempt-" + String(bidAttempts.length).padStart(2, "0") + "-" + attempt.propertyId)
        .set(attempt, {merge: true});
    }).catch(function (error) {
      console.error("Failed to save bid attempt.", error);
    });
  }

  function saveFinalOutcome(outcome) {
    closeThinkingSegment();
    const summary = {
      outcome: outcome.type,
      purchasedPropertyId: outcome.propertyId || null,
      // Second-price rule: purchasePrice is what was actually paid (the
      // algorithm price), with the winning bid recorded alongside.
      purchasePrice: outcome.pricePaid || null,
      winningBid: outcome.bid || null,
      referencePrice: outcome.referencePrice || null,
      algorithmPrice: outcome.algorithmPrice || null,
      roundsUsed: outcome.round || null,
      rerollsUsed: rerollsUsed,
      bidAttemptCount: bidAttempts.length,
      hazardDrawCount: hazardDrawCount,
      hazardExpiredCount: hazardExpiredCount,
      realizedHazardRate: hazardDrawCount > 0 ? hazardExpiredCount / hazardDrawCount : null,
      config: {
        maxRounds: CONFIG.maxRounds,
        maxRerolls: CONFIG.maxRerolls,
        hazardRate: CONFIG.hazardRate,
        priceBand: CONFIG.priceBand
      }
    };

    setEmbeddedDataValue(PHASE2_RESULT_FIELD, JSON.stringify(summary));

    return ensureFirebaseReady().then(function (db) {
      const responseDoc = getResponseDoc(db);
      const saveSummary = responseDoc
        .collection("MetaData")
        .doc("Session")
        .set({
          userId: getEmbeddedDataValue(USER_ID_FIELD) || "",
          treatmentGroupId: getEmbeddedDataValue(TREATMENT_FIELD) || "",
          phase2: summary
        }, {merge: true});
      const saveTimeline = responseDoc
        .collection(ACTIONS_COLLECTION_PATH)
        .doc("Phase2")
        .set({timeline: timelineEntries.slice()}, {merge: true});
      return Promise.all([saveSummary, saveTimeline]);
    });
  }

  // ---------------------------------------------------------------- game logic

  function startBidding(house) {
    bidding = {
      property: house,
      round: 1,
      lastBid: null,
      phase: "enter",
      failMessage: "",
      showTimeReminder: false,
      rounds: []
    };
    screenState = "bidding";
    recordAction("start_bidding", "property", house.docId);
    scheduleBidReminder();
    render();
  }

  function drawAlgorithmPrice(referencePrice) {
    const low = referencePrice * (1 - CONFIG.priceBand);
    const high = referencePrice * (1 + CONFIG.priceBand);
    return Math.round(low + Math.random() * (high - low));
  }

  function finishAttempt(outcomeType, extra) {
    const attempt = Object.assign({
      propertyId: bidding.property.docId,
      referencePrice: bidding.property.referencePrice,
      referenceSource: bidding.property.referenceSource,
      underlyingPrice: bidding.property.underlyingPrice,
      outcome: outcomeType,
      rounds: bidding.rounds.slice()
    }, extra || {});
    bidAttempts.push(attempt);
    saveBidAttempt(attempt);
    return attempt;
  }

  function resolveBid(bidValue) {
    const house = bidding.property;
    const algorithmPrice = drawAlgorithmPrice(house.referencePrice);
    const success = bidValue >= algorithmPrice;
    const roundRecord = {
      round: bidding.round,
      bid: bidValue,
      algorithmPrice: algorithmPrice,
      success: success,
      hazardDraw: null,
      houseExpired: false
    };

    bidding.lastBid = bidValue;
    recordAction("submit_bid", "property", house.docId);

    if (success) {
      bidding.rounds.push(roundRecord);
      finishAttempt("purchased");
      // Second-price rule: the winner pays the seller's (algorithm) price,
      // not their own bid, so truthful bidding is the best strategy.
      completeGame({
        type: "purchased",
        propertyId: house.docId,
        houseNumber: house.houseNumber,
        bid: bidValue,
        pricePaid: algorithmPrice,
        referencePrice: house.referencePrice,
        algorithmPrice: algorithmPrice,
        round: bidding.round
      });
      return;
    }

    // Failed round: the house survives to the next round only if it passes
    // the hazard draw (spec: u ~ U(0,1); expire when u < hazard rate).
    if (bidding.round >= CONFIG.maxRounds) {
      bidding.rounds.push(roundRecord);
      finishAttempt("rounds_exhausted");
      removedPropertyIds[house.docId] = true;
      returnToBoard("Your final bid on " + houseName(house) + " was not accepted. That house is no longer available.");
      return;
    }

    const hazardDraw = Math.random();
    hazardDrawCount += 1;
    roundRecord.hazardDraw = hazardDraw;

    if (hazardDraw < CONFIG.hazardRate) {
      hazardExpiredCount += 1;
      roundRecord.houseExpired = true;
      bidding.rounds.push(roundRecord);
      finishAttempt("expired");
      removedPropertyIds[house.docId] = true;
      returnToBoard(houseName(house) + " left the market before you could bid again.");
      return;
    }

    bidding.rounds.push(roundRecord);
    bidding.round += 1;
    bidding.phase = "failed";
    bidding.showTimeReminder = false;
    bidding.failMessage = "Your bid of " + formatCurrencyValue(bidValue) +
      " was not accepted. The house is still on the market.";
    scheduleBidReminder();
    render();
  }

  function exitDuringBidding() {
    finishAttempt("respondent_exited");
    recordAction("exit_market", "screen", "phase2_bidding");
    completeGame({type: "exited"});
  }

  function returnToBoard(message) {
    cancelBidReminder();
    currentSet = currentSet.filter(function (house) {
      return !removedPropertyIds[house.docId];
    });
    bidding = null;

    if (!currentSet.length && !unseenHouses().length && rerollsUsed >= CONFIG.maxRerolls) {
      completeGame({type: "no_houses"});
      return;
    }

    if (!currentSet.length && unseenHouses().length && rerollsUsed < CONFIG.maxRerolls) {
      // Nothing left on the board but the respondent still has re-rolls: deal
      // automatically so they always face a real choice.
      rerollsUsed += 1;
      currentSet = dealSet();
    }

    screenState = "board";
    boardMessage = message || "";
    render();
  }

  function rerollBoard() {
    if (rerollsUsed >= CONFIG.maxRerolls) return;
    rerollsUsed += 1;
    recordAction("reroll_houses", "screen", "phase2_board");
    currentSet = dealSet();
    boardMessage = "";
    render();
  }

  function exitFromBoard() {
    recordAction("exit_market", "screen", "phase2_board");
    completeGame({type: "exited"});
  }

  function completeGame(outcome) {
    cancelBidReminder();
    doneOutcome = outcome;
    screenState = "done";
    saveInFlight = true;

    // Kick off the save before rendering so a display problem can never
    // block the data from being written.
    const savePromise = saveFinalOutcome(outcome);
    render();

    savePromise
      .then(function () {
        saveInFlight = false;
        if (typeof qthis.showNextButton === "function") {
          qthis.showNextButton();
        }
        render();
      })
      .catch(function (error) {
        console.error("Failed to save Phase 2 outcome.", error);
        saveInFlight = false;
        errorMessage = error.message || "Failed to save your Phase 2 result.";
        render();
      });
  }

  // ---------------------------------------------------------------- rendering

  function renderPlatformHeader() {
    const header = createEl("div", "hs-platform-header");
    const logo = createEl("div", "hs-header-logo");
    logo.appendChild(createEl("span", "hs-header-logo-mark", "H"));
    logo.appendChild(document.createTextNode("HomeStudy"));
    header.appendChild(logo);

    const phaseIndicator = createEl("div", "hs-phase-indicator");
    phaseIndicator.appendChild(createEl("div", "hs-phase-tab", "Phase 1 · Rating"));
    phaseIndicator.appendChild(createEl("div", "hs-phase-tab active", "Phase 2 · Bidding"));
    header.appendChild(phaseIndicator);
    return header;
  }

  function renderPhaseBanner() {
    const banner = createEl("div", "hs-phase-banner");
    const text = createEl("div", "hs-phase-banner-text");
    text.appendChild(createEl("strong", "", "Phase 2 — Bidding: "));
    text.appendChild(document.createTextNode(
      "Each house shows a reference price. Place a bid to try to purchase a house. " +
      "If your bid is not accepted you can bid again, but houses can leave the market at any time."
    ));
    banner.appendChild(text);
    return banner;
  }

  function renderMarketBanner(parent) {
    if (respondentProfile && respondentProfile.label) {
      parent.appendChild(createEl("div", "hs-market-banner", "🏙 Market type: " + respondentProfile.label));
    }
  }

  function renderHouseCard(house, showBidButton) {
    const card = createEl("div", "hs-card");

    // No photo, icon, or address (meeting decision, Aug 2026) — houses keep
    // the same neutral number they had in Phase 1.
    const body = createEl("div", "hs-card-body");
    body.appendChild(createEl("div", "hs-address", houseName(house)));
    body.appendChild(createEl(
      "div",
      "hs-facts",
      [house.beds ? house.beds + " bd" : "", house.baths ? house.baths + " ba" : "", house.sqft ? house.sqft + " sqft" : ""]
        .filter(Boolean)
        .join(" | ")
    ));

    const refBox = createEl("div", "hs-ref-price");
    refBox.appendChild(createEl("div", "hs-ref-price-label", "Reference price"));
    refBox.appendChild(createEl("div", "hs-ref-price-value", formatCurrencyValue(house.referencePrice)));
    body.appendChild(refBox);

    if (showBidButton) {
      const bidButton = createEl("button", "hs-button primary block", "Bid on this house");
      bidButton.type = "button";
      bidButton.dataset.role = "start-bid";
      bidButton.dataset.propertyId = house.docId;
      body.appendChild(bidButton);
    }

    card.appendChild(body);
    return card;
  }

  function renderBoard(wrap) {
    const badge = createEl("div", "hs-badge");
    badge.appendChild(createEl("div", "hs-badge-dot"));
    badge.appendChild(document.createTextNode("PHASE 2 ACTIVE"));
    wrap.appendChild(badge);
    wrap.appendChild(createEl("h2", "hs-title", UI_COPY.boardTitle));
    wrap.appendChild(createEl("p", "hs-subtitle", UI_COPY.boardSubtitle));
    renderMarketBanner(wrap);

    if (boardMessage) {
      wrap.appendChild(createEl("div", "hs-status notice", boardMessage));
    }

    const grid = createEl("div", "hs-card-grid");
    currentSet.forEach(function (house) {
      grid.appendChild(renderHouseCard(house, true));
    });
    wrap.appendChild(grid);

    const actions = createEl("div", "hs-board-actions");
    const rerollsLeft = Math.max(0, CONFIG.maxRerolls - rerollsUsed);
    actions.appendChild(createEl(
      "div",
      "hs-board-actions-note",
      "Bid on a house above, or use the options here. You can view a different set of houses " +
      rerollsLeft + " more time" + (rerollsLeft === 1 ? "" : "s") + "."
    ));

    const buttons = createEl("div", "hs-board-actions-buttons");
    const rerollButton = createEl(
      "button",
      "hs-button secondary",
      "See a different set of houses (" + rerollsLeft + " left)"
    );
    rerollButton.type = "button";
    rerollButton.dataset.role = "reroll";
    rerollButton.disabled = rerollsLeft === 0 || !availableHouses().length;
    buttons.appendChild(rerollButton);

    const exitButton = createEl("button", "hs-button danger", "Exit the home purchasing market");
    exitButton.type = "button";
    exitButton.dataset.role = "exit-board";
    buttons.appendChild(exitButton);
    actions.appendChild(buttons);
    wrap.appendChild(actions);
  }

  function renderBidding(wrap) {
    const house = bidding.property;
    const badge = createEl("div", "hs-badge");
    badge.appendChild(createEl("div", "hs-badge-dot"));
    badge.appendChild(document.createTextNode("BIDDING · ROUND " + bidding.round + " OF " + CONFIG.maxRounds));
    wrap.appendChild(badge);
    wrap.appendChild(createEl("h2", "hs-title", UI_COPY.biddingTitle + ": " + houseName(house)));
    wrap.appendChild(createEl(
      "p",
      "hs-subtitle",
      "Reference price " + formatCurrencyValue(house.referencePrice) +
      ". If your bid meets the seller's hidden price, you purchase the house and pay the seller's price — " +
      "not your bid. If not, you can bid again — but the house may leave the market between rounds."
    ));
    renderMarketBanner(wrap);

    const panel = createEl("div", "hs-bid-panel");

    const steps = createEl("div", "hs-round-steps");
    for (let i = 1; i <= CONFIG.maxRounds; i += 1) {
      let className = "hs-round-step";
      if (i < bidding.round) className += " done";
      if (i === bidding.round) className += " current";
      steps.appendChild(createEl("div", className));
    }
    panel.appendChild(steps);

    if (bidding.phase === "failed") {
      panel.appendChild(createEl("div", "hs-status notice", bidding.failMessage));
    }

    if (bidding.showTimeReminder) {
      panel.appendChild(createEl(
        "div",
        "hs-status loading",
        "⏱ Friendly reminder: take the time you need, but most decisions take about 20–30 seconds."
      ));
    }

    const label = createEl("div", "", "Your bid for round " + bidding.round + ":");
    label.style.fontWeight = "700";
    label.style.fontSize = "14px";
    label.style.color = "#0f1f3d";
    label.style.marginTop = "8px";
    panel.appendChild(label);

    const field = createEl("div", "hs-bid-field");
    field.appendChild(createEl("span", "hs-bid-prefix", "$"));
    const input = document.createElement("input");
    input.className = "hs-bid-input";
    input.type = "text";
    input.inputMode = "numeric";
    input.placeholder = "Enter bid amount";
    input.value = bidding.lastBid !== null ? String(bidding.lastBid) : "";
    input.dataset.role = "bid-input";
    field.appendChild(input);
    panel.appendChild(field);

    const bidError = createEl("div", "hs-status error", "Please enter a valid bid amount.");
    bidError.style.display = "none";
    bidError.dataset.role = "bid-error";
    panel.appendChild(bidError);

    const actions = createEl("div", "hs-bid-actions");
    const submit = createEl(
      "button",
      "hs-button primary",
      bidding.phase === "failed" ? "Bid again (round " + bidding.round + ")" : "Place bid"
    );
    submit.type = "button";
    submit.dataset.role = "submit-bid";
    actions.appendChild(submit);

    const exitButton = createEl("button", "hs-button danger", "Exit the home purchasing market");
    exitButton.type = "button";
    exitButton.dataset.role = "exit-bidding";
    actions.appendChild(exitButton);
    panel.appendChild(actions);

    wrap.appendChild(panel);
  }

  function renderDone(wrap) {
    const badge = createEl("div", "hs-badge");
    badge.appendChild(createEl("div", "hs-badge-dot"));
    badge.appendChild(document.createTextNode("PHASE 2 COMPLETE"));
    wrap.appendChild(badge);

    const titles = {
      purchased: UI_COPY.doneTitlePurchased,
      exited: UI_COPY.doneTitleExited,
      no_houses: UI_COPY.doneTitleNoHouses
    };
    wrap.appendChild(createEl("h2", "hs-title", titles[doneOutcome.type] || "Phase 2 Complete"));

    const panel = createEl("div", "hs-done-panel");

    if (doneOutcome.type === "purchased") {
      panel.appendChild(createEl(
        "div",
        "hs-status success",
        "Congratulations! Your bid was accepted and you purchased House " + doneOutcome.houseNumber +
        " at the seller's price of " + formatCurrencyValue(doneOutcome.pricePaid) + "."
      ));
      const rows = [
        ["House", "House " + doneOutcome.houseNumber],
        ["Price paid (seller's price)", formatCurrencyValue(doneOutcome.pricePaid)],
        ["Your bid", formatCurrencyValue(doneOutcome.bid)],
        ["Reference price", formatCurrencyValue(doneOutcome.referencePrice)],
        ["Round", String(doneOutcome.round) + " of " + CONFIG.maxRounds]
      ];
      rows.forEach(function (pair) {
        const row = createEl("div", "hs-summary-row");
        row.appendChild(createEl("span", "", pair[0]));
        const value = createEl("strong", "", pair[1]);
        row.appendChild(value);
        panel.appendChild(row);
      });
    } else if (doneOutcome.type === "exited") {
      panel.appendChild(createEl(
        "div",
        "hs-status notice",
        "You exited the home purchasing market without buying a house."
      ));
    } else {
      panel.appendChild(createEl(
        "div",
        "hs-status notice",
        "There are no houses left to bid on. Phase 2 is complete."
      ));
    }

    if (saveInFlight) {
      panel.appendChild(createEl("div", "hs-status loading", "Saving your Phase 2 results..."));
    } else if (errorMessage) {
      panel.appendChild(createEl("div", "hs-status error", errorMessage));
    } else {
      panel.appendChild(createEl(
        "div",
        "hs-status success",
        "Your Phase 2 results are saved. Use the survey's Next button to continue."
      ));
    }

    wrap.appendChild(panel);
  }

  function render() {
    root.innerHTML = "";
    root.appendChild(renderPlatformHeader());
    root.appendChild(renderPhaseBanner());
    const wrap = createEl("div", "hs-phase2-wrap");

    if (screenState === "loading") {
      wrap.appendChild(createEl("h2", "hs-title", "Loading the housing market..."));
      wrap.appendChild(createEl("div", "hs-status loading", "Preparing your Phase 2 houses."));
    } else if (screenState === "error") {
      wrap.appendChild(createEl("h2", "hs-title", "Phase 2"));
      wrap.appendChild(createEl("div", "hs-status error", errorMessage));
    } else if (screenState === "board") {
      renderBoard(wrap);
    } else if (screenState === "bidding") {
      renderBidding(wrap);
    } else if (screenState === "done") {
      renderDone(wrap);
    }

    root.appendChild(wrap);
  }

  // ---------------------------------------------------------------- events

  function handleInteraction(event) {
    const startBidButton = event.target.closest("[data-role='start-bid']");
    if (startBidButton && root.contains(startBidButton) && screenState === "board") {
      const propertyId = startBidButton.dataset.propertyId;
      const house = currentSet.find(function (candidate) {
        return candidate.docId === propertyId;
      });
      if (house) startBidding(house);
      return;
    }

    const rerollButton = event.target.closest("[data-role='reroll']");
    if (rerollButton && root.contains(rerollButton) && screenState === "board") {
      if (!rerollButton.disabled) rerollBoard();
      return;
    }

    const exitBoardButton = event.target.closest("[data-role='exit-board']");
    if (exitBoardButton && root.contains(exitBoardButton) && screenState === "board") {
      exitFromBoard();
      return;
    }

    const submitBidButton = event.target.closest("[data-role='submit-bid']");
    if (submitBidButton && root.contains(submitBidButton) && screenState === "bidding") {
      const input = root.querySelector("[data-role='bid-input']");
      const bidError = root.querySelector("[data-role='bid-error']");
      const bidValue = input ? parseBidValue(input.value) : null;
      if (bidValue === null) {
        if (bidError) bidError.style.display = "block";
        return;
      }
      resolveBid(bidValue);
      return;
    }

    const exitBiddingButton = event.target.closest("[data-role='exit-bidding']");
    if (exitBiddingButton && root.contains(exitBiddingButton) && screenState === "bidding") {
      exitDuringBidding();
    }
  }

  // ---------------------------------------------------------------- boot

  render();
  root.addEventListener("click", handleInteraction);
  phaseStartedAt = Date.now();
  beginThinkingSegment();

  try {
    buildPool();
    currentSet = dealSet();
    screenState = "board";
    render();
  } catch (error) {
    console.error("Failed to start Phase 2 bidding.", error);
    screenState = "error";
    errorMessage = error.message || "Phase 2 could not be started. Check the survey configuration.";
    render();
  }
});
