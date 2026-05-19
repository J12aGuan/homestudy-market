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

  const FIREBASE_CONFIG = {
    apiKey: "REDACTED_FIREBASE_WEB_API_KEY",
    authDomain: "housing-experiment-mockups.firebaseapp.com",
    projectId: "housing-experiment-mockups",
    storageBucket: "housing-experiment-mockups.firebasestorage.app",
    messagingSenderId: "420999777383",
    appId: "1:420999777383:web:14919e023497fd762218c2"
  };

  const RESPONSES_COLLECTION_PATH = "Responses";
  const ACTIONS_COLLECTION_PATH = "Action";
  const USER_ID_FIELD = "userId";
  const SESSION_ID_FIELD = "sessionId";
  const PROPERTY_ITEMS_FIELD = "propertyItems";
  const TREATMENT_FIELD = "treatmentGroupId";
  const TREATMENT_ITEM_FIELD = "treatmentGroupItem";
  const MARKET_PRESSURE_FIELD = "marketPressure";
  const TREND_SCALE_FIELD = "trendScale";
  const MONTH_FIELD = "month";
  const LEGACY_ROUND_FIELD = "round";
  const TIME_PER_ROUND_FIELD = "timePerMonth";
  const FIREBASE_SDK_URLS = [
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"
  ];

  const GAME_CONFIG = {
    baseMoney: 360000,
    monthlyRent: 2500,
    maxTurns: 6,
    defaultInitialVisibleCount: 4
  };

  let db = null;
  let userId = "";
  let sessionId = "";
  let responseDocId = "";
  let treatment = "1";
  let startingMoney = GAME_CONFIG.baseMoney;
  let availableMoney = GAME_CONFIG.baseMoney;
  let monthlyRent = GAME_CONFIG.monthlyRent;
  let maxTurns = GAME_CONFIG.maxTurns;
  let marketPressure = 0.0015;
  let trendScale = 0.007;
  let timePerRoundSeconds = 0;
  let disappearByPropertyId = {};
  let currentTurn = 1;
  let selectedPropertyId = null;
  let activeOverlay = "";
  let statusMessage = "";
  let statusClass = "";
  let loading = true;
  let gameOver = false;
  let gameOutcome = null;
  let purchasedPropertyId = null;
  let properties = [];
  let ratingsByPropertyId = {};
  let treatmentItem = null;
  let timerDeadlineAt = 0;
  let timerIntervalId = null;
  let timerTurn = 0;
  let isAdvancingTurn = false;
  let autoAdvancedTurns = [];
  let phaseStartedAt = 0;
  let timelineEntries = [];
  let activeThinkingSegment = null;
  let skipCountdownIntervalId = null;
  let skipCountdownDeadlineAt = 0;
  let skipCountdownMonth = 0;
  let skipCountdownStartOffsetMs = 0;
  let skipCountdownRemainingSecondsAtStart = 0;

  const style = document.createElement("style");
  style.textContent = `
    #qualtrics-root {
      font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: #17213a;
      font-size: 17px;
      background: #f6f7fb;
      min-height: 100vh;
      box-sizing: border-box;
      padding-bottom: 48px;
      overflow-x: clip;
    }

    .p2-platform-header {
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
      z-index: 10;
    }

    .p2-header-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #0f1f3d;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .p2-header-logo-mark {
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

    .p2-header-right {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }

    .p2-phase-indicator {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #eef2f8;
      border-radius: 10px;
      padding: 4px;
    }

    .p2-phase-tab {
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      color: #5a6480;
      white-space: nowrap;
    }

    .p2-phase-tab.active {
      background: #0f1f3d;
      color: white;
      box-shadow: 0 8px 16px rgba(15,31,61,0.14);
    }

    .p2-banner {
      background: linear-gradient(135deg, #0f1f3d, #1a3260);
      padding: 14px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .p2-banner-text {
      color: rgba(255,255,255,0.78);
      font-size: 13px;
      line-height: 1.45;
      max-width: 900px;
    }

    .p2-banner-text strong {
      color: white;
    }

    .p2-wrap {
      width: min(1320px, calc(100% - 32px));
      margin: 24px auto 0;
      padding: 0;
      box-sizing: border-box;
    }

    .p2-header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      margin-bottom: 14px;
    }

    .p2-title {
      margin: 0 0 4px;
      color: #0f1f3d;
      font-size: 28px;
      line-height: 1.1;
    }

    .p2-subtitle {
      margin: 0;
      color: #5a6480;
      font-size: 14px;
      line-height: 1.45;
      max-width: 760px;
    }

    .p2-pill-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .p2-pill {
      background: white;
      border: 1px solid #d9e2f0;
      border-radius: 999px;
      padding: 8px 12px;
      color: #43506d;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      box-shadow: 0 8px 20px rgba(15,31,61,0.05);
    }

    .p2-pill.timer {
      color: #8c3a2f;
      border-color: #f3c4b8;
      background: #fff2ef;
    }

    .p2-pill.timer.low {
      color: #7d2519;
      border-color: #e59f90;
      background: #ffdcd5;
    }

    .p2-status {
      border-radius: 10px;
      padding: 10px 12px;
      margin: 12px 0;
      font-size: 14px;
      line-height: 1.35;
    }

    .p2-status.info {
      color: #27417a;
      background: #eef4ff;
      border: 1px solid #c8d8ff;
    }

    .p2-status.error {
      color: #8c3a2f;
      background: #fff2ef;
      border: 1px solid #f3c4b8;
    }

    .p2-status.success {
      color: #246342;
      background: #edf8f0;
      border: 1px solid #b8e2c8;
    }

    .p2-layout {
      display: grid;
      grid-template-columns: 290px minmax(0, 1fr);
      gap: 18px;
      align-items: start;
    }

    .p2-sidebar {
      background:
        linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0)),
        #0f1f3d;
      color: white;
      border-radius: 18px;
      padding: 16px;
      box-shadow: 0 18px 42px rgba(15,31,61,0.22);
      overflow: hidden;
      margin-bottom: 16px;
      cursor: pointer;
      border: 0;
      width: 100%;
      text-align: left;
      font: inherit;
      transition: transform 120ms ease, box-shadow 120ms ease;
      position: sticky;
      top: 106px;
    }

    .p2-sidebar:hover {
      transform: translateY(-1px);
      box-shadow: 0 22px 48px rgba(15,31,61,0.26);
    }

    .p2-wallet-compact {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
    }

    .p2-wallet-kicker {
      color: rgba(255,255,255,0.62);
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-weight: 800;
      margin-bottom: 4px;
    }

    .p2-wallet-title {
      color: white;
      font-size: 18px;
      font-weight: 800;
      margin-bottom: 0;
    }

    .p2-money-card {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px;
      padding: 14px;
      margin-bottom: 12px;
    }

    .p2-payout-card {
      background: linear-gradient(135deg, #eef4ff, #dbeafe);
      border: 1px solid #bfd5ff;
      border-radius: 18px;
      padding: 18px;
      margin: 16px 0 18px;
      box-shadow: 0 10px 26px rgba(58, 111, 232, 0.10);
    }

    .p2-payout-kicker {
      color: #4b5b86;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-weight: 800;
      margin-bottom: 6px;
    }

    .p2-payout-value {
      color: #0f1f3d;
      font-size: 44px;
      font-weight: 900;
      line-height: 1;
      margin-bottom: 10px;
    }

    .p2-payout-value.negative {
      color: #8c3a2f;
    }

    .p2-payout-sub {
      color: #4b5b86;
      font-size: 14px;
      line-height: 1.45;
    }

    .p2-payout-note {
      color: #7d2519;
      font-size: 13px;
      line-height: 1.45;
      margin-top: 10px;
      font-weight: 700;
    }

    .p2-wallet-open {
      color: #ffc444;
      font-size: 13px;
      font-weight: 900;
      white-space: nowrap;
    }

    .p2-money-top {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
    }

    .p2-money-ring {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background:
        conic-gradient(#ffc444 var(--money-progress), rgba(255,255,255,0.14) 0);
      position: relative;
    }

    .p2-money-ring::before {
      content: "";
      position: absolute;
      width: 66px;
      height: 66px;
      border-radius: 50%;
      background: #0f1f3d;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
    }

    .p2-ring-value {
      position: relative;
      color: #ffc444;
      font-size: 19px;
      font-weight: 900;
    }

    .p2-money-label {
      color: rgba(255,255,255,0.68);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 5px;
    }

    .p2-money {
      font-size: 30px;
      font-weight: 900;
      line-height: 1;
      margin-bottom: 7px;
      color: white;
    }

    .p2-money-sub {
      color: rgba(255,255,255,0.68);
      font-size: 13px;
      line-height: 1.4;
    }

    .p2-pressure {
      background: rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 10px;
      margin-top: 12px;
    }

    .p2-pressure-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 14px;
      font-weight: 800;
      margin-bottom: 8px;
    }

    .p2-pressure-head span:last-child {
      color: #ffc444;
      white-space: nowrap;
    }

    .p2-pressure-track {
      height: 8px;
      border-radius: 999px;
      background: rgba(255,255,255,0.14);
      overflow: hidden;
    }

    .p2-pressure-fill {
      height: 100%;
      width: var(--turn-progress);
      border-radius: inherit;
      background: linear-gradient(90deg, #73e0aa, #ffc444);
    }

    .p2-stat-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .p2-stat {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 10px;
      font-size: 12px;
      color: rgba(255,255,255,0.62);
      min-height: 56px;
    }

    .p2-stat b {
      display: block;
      color: white;
      font-size: 15px;
      margin-top: 5px;
      line-height: 1.1;
    }

    .p2-market-shell {
      background: white;
      border: 1px solid #dde4f0;
      border-radius: 22px;
      box-shadow: 0 14px 34px rgba(15,31,61,0.06);
      padding: 20px;
    }

    .p2-market-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 18px;
      padding-bottom: 16px;
      border-bottom: 1px solid #ebf0f7;
    }

    .p2-market-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .p2-market-title {
      color: #0f1f3d;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .p2-market-subtitle {
      color: #5a6480;
      font-size: 13px;
      line-height: 1.4;
    }

    .p2-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .p2-btn {
      border: 0;
      border-radius: 12px;
      padding: 11px 15px;
      background: #3a6fe8;
      color: white;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 120ms ease, opacity 120ms ease;
      box-shadow: 0 12px 22px rgba(58,111,232,0.18);
    }

    .p2-btn:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .p2-btn:disabled {
      opacity: 0.48;
      cursor: not-allowed;
    }

    .p2-btn.secondary {
      background: #f8fbff;
      color: #2451b7;
      border: 1px solid #cfddf7;
      box-shadow: none;
    }

    .p2-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }

    .p2-card {
      background: white;
      border: 1px solid #dde4f0;
      border-radius: 20px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 390px;
      cursor: pointer;
      text-align: left;
      padding: 0;
      transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease, opacity 120ms ease;
      box-shadow: 0 10px 26px rgba(15,31,61,0.06);
    }

    .p2-card:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 18px 38px rgba(15,31,61,0.10);
    }

    .p2-card.selected {
      border-color: #3a6fe8;
      box-shadow: 0 0 0 3px rgba(58,111,232,0.13);
    }

    .p2-card.unavailable {
      opacity: 0.58;
      cursor: not-allowed;
    }

    .p2-img {
      height: 190px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      font-size: 46px;
      overflow: hidden;
    }

    .p2-photo-bar {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .p2-photo-pill,
    .p2-save-pill {
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 800;
      backdrop-filter: blur(10px);
    }

    .p2-photo-pill {
      background: rgba(255,255,255,0.9);
      color: #0f1f3d;
    }

    .p2-save-pill {
      background: rgba(15,31,61,0.72);
      color: white;
    }

    .bg-blue { background: linear-gradient(135deg, #dbeafe, #bfdbfe); }
    .bg-amber { background: linear-gradient(135deg, #fef3c7, #fde68a); }
    .bg-green { background: linear-gradient(135deg, #d1fae5, #a7f3d0); }
    .bg-purple { background: linear-gradient(135deg, #ede9fe, #ddd6fe); }
    .bg-rose { background: linear-gradient(135deg, #ffe4e6, #fecdd3); }

    .p2-tag {
      position: absolute;
      left: 12px;
      top: 12px;
      border-radius: 999px;
      padding: 5px 9px;
      background: rgba(15,31,61,0.76);
      color: white;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .p2-tag.comp-low,
    .p2-chip.comp-low {
      background: rgba(30, 140, 90, 0.86);
      color: white;
    }

    .p2-tag.comp-medium,
    .p2-chip.comp-medium {
      background: rgba(232, 163, 23, 0.9);
      color: white;
    }

    .p2-tag.comp-high,
    .p2-chip.comp-high {
      background: rgba(192, 57, 43, 0.9);
      color: white;
    }

    .p2-body {
      padding: 16px 16px 18px;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .p2-price-row {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 7px;
    }

    .p2-price {
      color: #0f1f3d;
      font-size: 31px;
      font-weight: 900;
      line-height: 1;
    }

    .p2-price-change {
      font-size: 12px;
      color: #1e8c5a;
      font-weight: 800;
      line-height: 1.3;
    }

    .p2-price-change.up {
      color: #c0392b;
    }

    .p2-address {
      color: #0f1f3d;
      font-size: 20px;
      font-weight: 800;
      margin-bottom: 3px;
    }

    .p2-broker-line {
      color: #6a738c;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 7px;
    }

    .p2-meta {
      color: #5a6480;
      font-size: 13px;
      line-height: 1.35;
      margin-bottom: 8px;
    }

    .p2-facts {
      color: #0f1f3d;
      font-size: 13px;
      font-weight: 800;
      margin-bottom: 10px;
    }

    .p2-initial-price {
      color: #5a6480;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 10px;
    }

    .p2-card-footer {
      display: flex;
      gap: 7px;
      flex-wrap: wrap;
      margin-top: auto;
    }

    .p2-chip {
      border-radius: 999px;
      background: #f4f7fb;
      color: #33415f;
      border: 1px solid #e2eaf5;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 700;
    }

    .p2-chip.strong {
      background: #eef4ff;
      color: #2451b7;
      border-color: #cfe0ff;
    }

    .p2-overlay-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(10,16,26,0.46);
      z-index: 9998;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .p2-overlay {
      width: min(100%, 920px);
      max-height: min(88vh, 760px);
      overflow: auto;
      background: #fbfdff;
      border-radius: 18px;
      box-shadow: 0 28px 80px rgba(0,0,0,0.28);
      border: 1px solid #dde4f0;
    }

    .p2-overlay-top {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: center;
      padding: 14px 16px;
      background: white;
      border-bottom: 1px solid #ebf0f7;
      position: sticky;
      top: 0;
      z-index: 1;
    }

    .p2-overlay-kicker {
      color: #5a6480;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 3px;
    }

    .p2-overlay-title {
      color: #0f1f3d;
      font-size: 21px;
      font-weight: 900;
    }

    .p2-overlay-close {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      border: 1px solid #dbe5f2;
      background: #f8fbff;
      color: #5a6480;
      font-size: 20px;
      cursor: pointer;
    }

    .p2-overlay-body {
      padding: 16px;
    }

    .p2-house-canvas {
      display: grid;
      grid-template-columns: minmax(220px, 0.82fr) minmax(0, 1.18fr);
      gap: 14px;
    }

    .p2-house-hero {
      border-radius: 16px;
      min-height: 240px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      font-size: 68px;
      overflow: hidden;
    }

    .p2-house-hero .p2-tag {
      left: 14px;
      top: auto;
      bottom: 14px;
      font-size: 11px;
      padding: 7px 10px;
    }

    .p2-canvas-panel {
      background: white;
      border: 1px solid #dde4f0;
      border-radius: 16px;
      padding: 15px;
    }

    .p2-canvas-price {
      color: #0f1f3d;
      font-size: 36px;
      line-height: 1;
      font-weight: 900;
      margin-bottom: 8px;
    }

    .p2-canvas-copy {
      color: #5a6480;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 14px;
    }

    .p2-wallet-canvas {
      display: grid;
      grid-template-columns: minmax(260px, 0.75fr) minmax(0, 1.25fr);
      gap: 16px;
    }

    .p2-wallet-big {
      background:
        linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0)),
        #0f1f3d;
      color: white;
      border-radius: 16px;
      padding: 18px;
    }

    .p2-wallet-big .p2-money-ring {
      width: 132px;
      height: 132px;
      margin: 6px auto 16px;
    }

    .p2-wallet-big .p2-money-ring::before {
      width: 100px;
      height: 100px;
    }

    .p2-wallet-big .p2-ring-value {
      font-size: 28px;
    }

    .p2-wallet-ledger {
      background: white;
      border: 1px solid #dde4f0;
      border-radius: 16px;
      padding: 15px;
    }

    .p2-ledger-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid #ebf0f7;
      padding: 11px 0;
      color: #5a6480;
      font-size: 14px;
    }

    .p2-ledger-row:last-child {
      border-bottom: 0;
    }

    .p2-ledger-row b {
      color: #0f1f3d;
      white-space: nowrap;
    }

    .p2-detail-title {
      color: #0f1f3d;
      font-size: 19px;
      font-weight: 800;
      margin-bottom: 6px;
    }

    .p2-detail-copy {
      color: #5a6480;
      font-size: 14px;
      line-height: 1.45;
      margin-bottom: 12px;
    }

    .p2-detail-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }

    .p2-detail-stat {
      border-radius: 10px;
      background: #f5f8fc;
      padding: 9px 10px;
      font-size: 13px;
      color: #5a6480;
      min-width: 0;
    }

    .p2-detail-stat b {
      display: block;
      color: #0f1f3d;
      font-size: 15px;
      margin-top: 3px;
      line-height: 1.25;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .p2-skip-grid {
      grid-template-columns: repeat(3, minmax(140px, 1fr));
    }

    @media (max-width: 1200px) {
      .p2-layout {
        grid-template-columns: 1fr;
      }

      .p2-sidebar {
        position: static;
        margin-bottom: 16px;
      }

      .p2-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .p2-detail-grid,
      .p2-skip-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .p2-house-canvas,
      .p2-wallet-canvas {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 1100px) {
      .p2-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 900px) {
      .p2-platform-header,
      .p2-banner {
        padding-left: 18px;
        padding-right: 18px;
      }

      .p2-header,
      .p2-market-head,
      .p2-layout {
        display: block;
      }

      .p2-pill-row,
      .p2-actions {
        justify-content: flex-start;
        margin-top: 10px;
      }

      .p2-market-shell {
        padding: 16px;
      }

      .p2-grid,
      .p2-wallet-compact,
      .p2-skip-grid {
        grid-template-columns: 1fr;
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

  function renderPlatformHeader() {
    const header = createEl("div", "p2-platform-header");
    const logo = createEl("div", "p2-header-logo");
    logo.appendChild(createEl("span", "p2-header-logo-mark", "H"));
    logo.appendChild(document.createTextNode("HomeStudy"));
    header.appendChild(logo);

    const right = createEl("div", "p2-header-right");
    const phaseIndicator = createEl("div", "p2-phase-indicator");
    phaseIndicator.appendChild(createEl("div", "p2-phase-tab", "Phase 1 · Rating"));
    phaseIndicator.appendChild(createEl("div", "p2-phase-tab active", "Phase 2 · Market"));
    right.appendChild(phaseIndicator);
    header.appendChild(right);
    return header;
  }

  function renderMarketBanner() {
    const banner = createEl("div", "p2-banner");
    const text = createEl("div", "p2-banner-text");
    text.appendChild(createEl("strong", "", "Phase 2 — Dynamic Market: "));
    text.appendChild(document.createTextNode(
      "Browse live listings, compare your Phase 1 value benchmark with current asking prices, and decide whether to buy now or wait."
    ));
    banner.appendChild(text);
    return banner;
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
    const docId = String(value).trim().replace(/\//g, "_").replace(/\s+/g, "_");
    return docId === "." || docId === ".." ? "" : docId;
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

  function getCurrentMonthIndex() {
    return currentTurn;
  }

  function buildTimelineEntry(config) {
    const entry = {
      actionType: config.actionType,
      targetType: config.targetType,
      targetId: config.targetId,
      monthIndex: config.monthIndex || getCurrentMonthIndex(),
      startOffsetMs: config.startOffsetMs,
      endOffsetMs: config.endOffsetMs,
      startTime: formatElapsedTime(config.startOffsetMs),
      endTime: formatElapsedTime(config.endOffsetMs)
    };

    if (config.metadata && Object.keys(config.metadata).length) {
      entry.metadata = config.metadata;
    }

    return entry;
  }

  function getSkipCountdownSecondsRemaining() {
    if (!skipCountdownDeadlineAt) return 0;
    return Math.max(0, Math.ceil((skipCountdownDeadlineAt - Date.now()) / 1000));
  }

  function getCurrentScreenTarget() {
    if (skipCountdownDeadlineAt) {
      return {
        targetType: "screen",
        targetId: "month_countdown"
      };
    }

    if (activeOverlay === "house") {
      return {
        targetType: "screen",
        targetId: selectedPropertyId ? "house_overlay_" + selectedPropertyId : "house_overlay"
      };
    }

    if (activeOverlay === "wallet") {
      return {
        targetType: "screen",
        targetId: "wallet_overlay"
      };
    }

    return {
      targetType: "screen",
      targetId: "phase2_market"
    };
  }

  function beginThinkingSegment(targetType, targetId) {
    activeThinkingSegment = {
      actionType: "thinking",
      targetType: targetType,
      targetId: targetId,
      monthIndex: getCurrentMonthIndex(),
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
    timelineEntries.push(buildTimelineEntry({
      actionType: activeThinkingSegment.actionType,
      targetType: activeThinkingSegment.targetType,
      targetId: activeThinkingSegment.targetId,
      monthIndex: activeThinkingSegment.monthIndex,
      startOffsetMs: activeThinkingSegment.startOffsetMs,
      endOffsetMs: endOffsetMs
    }));
    activeThinkingSegment = null;
  }

  function recordAction(actionType, targetType, targetId, options) {
    closeThinkingSegment();
    const config = options || {};
    const startOffsetMs = config.startOffsetMs !== undefined ? config.startOffsetMs : nowOffsetMs();
    const endOffsetMs = config.endOffsetMs !== undefined ? config.endOffsetMs : startOffsetMs;
    timelineEntries.push(buildTimelineEntry({
      actionType: actionType,
      targetType: targetType,
      targetId: targetId,
      monthIndex: config.monthIndex,
      startOffsetMs: startOffsetMs,
      endOffsetMs: endOffsetMs,
      metadata: config.metadata
    }));
    if (config.shouldResumeThinking === false) {
      return;
    }

    const screenTarget = getCurrentScreenTarget();
    beginThinkingSegment(screenTarget.targetType, screenTarget.targetId);
  }

  function saveActionTimeline() {
    if (!db || !responseDocId) {
      return Promise.reject(new Error("Action timeline could not be saved because the session is missing."));
    }

    closeThinkingSegment();
    return db
      .collection(RESPONSES_COLLECTION_PATH)
      .doc(responseDocId)
      .collection(ACTIONS_COLLECTION_PATH)
      .doc("Phase2")
      .set({
        timeline: timelineEntries.slice()
      }, {merge: true});
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
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(FIREBASE_CONFIG);
      }

      return window.firebase.firestore();
    });
  }

  function money(value) {
    return Number(value).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
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
    const classes = ["bg-blue", "bg-green", "bg-amber", "bg-purple", "bg-rose"];
    return classes[index % classes.length];
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getPositiveNumber(value, defaultValue) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  }

  function getPositiveInteger(value, defaultValue) {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  }

  function formatCountdownLabel(secondsRemaining) {
    const clampedSeconds = Math.max(0, secondsRemaining);
    return clampedSeconds + "s left";
  }

  function getSecondsRemaining() {
    if (timePerRoundSeconds <= 0 || !timerDeadlineAt) return 0;
    return Math.max(0, Math.ceil((timerDeadlineAt - Date.now()) / 1000));
  }

  function getActiveCountdownSecondsRemaining() {
    if (skipCountdownDeadlineAt) {
      return getSkipCountdownSecondsRemaining();
    }
    return getSecondsRemaining();
  }

  function updateTimerPill() {
    const pill = root.querySelector("[data-role='month-timer']");
    if (!pill) return;

    const secondsRemaining = getActiveCountdownSecondsRemaining();
    pill.textContent = formatCountdownLabel(secondsRemaining);
    pill.classList.toggle("low", secondsRemaining <= 10);
  }

  function clearTurnTimer() {
    if (timerIntervalId) {
      window.clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    timerDeadlineAt = 0;
    timerTurn = 0;
  }

  function clearSkipCountdown() {
    if (skipCountdownIntervalId) {
      window.clearInterval(skipCountdownIntervalId);
      skipCountdownIntervalId = null;
    }
    skipCountdownDeadlineAt = 0;
    skipCountdownMonth = 0;
    skipCountdownStartOffsetMs = 0;
    skipCountdownRemainingSecondsAtStart = 0;
  }

  function recordAutoAdvanceTurn(turnNumber) {
    autoAdvancedTurns.push(turnNumber);
    setEmbeddedDataValue("phase2AutoAdvanceTurns", JSON.stringify(autoAdvancedTurns));
    setEmbeddedDataValue("phase2AutoAdvanceMonths", JSON.stringify(autoAdvancedTurns));
  }

  function startTurnTimer() {
    if (loading || gameOver || timePerRoundSeconds <= 0 || skipCountdownDeadlineAt) {
      clearTurnTimer();
      return;
    }

    if (timerTurn !== currentTurn || !timerDeadlineAt) {
      timerTurn = currentTurn;
      timerDeadlineAt = Date.now() + (timePerRoundSeconds * 1000);
    }

    if (timerIntervalId) return;

    timerIntervalId = window.setInterval(function () {
      const secondsRemaining = getSecondsRemaining();
      updateTimerPill();

      if (secondsRemaining > 0 || isAdvancingTurn || gameOver) {
        return;
      }

      clearTurnTimer();
      waitOneTurn(true);
    }, 250);
  }

  function getBasePrice(data, docId) {
    if (data.phase2Price !== undefined) return toNumber(data.phase2Price);
    if (data.price !== undefined) return toNumber(data.price);
    if (data.askPrice !== undefined) return toNumber(data.askPrice);

    throw new Error(
      "Missing phase2Price for property " +
      (data.address || data.propertyId || docId || "unknown") +
      "."
    );
  }

  function roundToNearestThousand(value) {
    return Math.round(value / 1000) * 1000;
  }

  function getHouseTrend(property) {
    const timeOnMarket = Math.max(1, property.disappearAfterTurn - property.showRound);
    const riseThreshold = Math.max(1, maxTurns / 3);
    const fallThreshold = Math.max(riseThreshold + 1, (2 * maxTurns) / 3);

    if (timeOnMarket <= riseThreshold) {
      return trendScale;
    }

    if (timeOnMarket >= fallThreshold) {
      return -trendScale;
    }

    const midpoint = (riseThreshold + fallThreshold) / 2;
    const halfRange = Math.max(0.5, (fallThreshold - riseThreshold) / 2);
    return trendScale * ((midpoint - timeOnMarket) / halfRange);
  }

  function priceAtTurn(property, turn) {
    const turnOffset = Math.max(0, turn - property.showRound);
    const houseTrend = getHouseTrend(property);
    const rawPrice = property.basePrice * (
      1 + houseTrend * turnOffset + (marketPressure * 0.35) * turnOffset * turnOffset
    );
    return roundToNearestThousand(rawPrice);
  }

  function priceForTurn(property) {
    return priceAtTurn(property, currentTurn);
  }

  function priceChangeForTurn(property) {
    if (currentTurn <= property.showRound) return 0;
    return priceAtTurn(property, currentTurn) - priceAtTurn(property, currentTurn - 1);
  }

  function unavailableReason(property) {
    if (purchasedPropertyId && property.docId === purchasedPropertyId) return "Purchased";
    if (currentTurn < property.showRound) return "Arrives in month " + property.showRound;
    if (currentTurn >= property.disappearAfterTurn) return "No longer available";
    if (priceForTurn(property) > availableMoney) return "Insufficient funds";
    return "";
  }

  function isAvailable(property) {
    return !unavailableReason(property);
  }

  function getCompetitionLevel(property) {
    if (currentTurn < property.showRound || currentTurn >= property.disappearAfterTurn) {
      return null;
    }

    const turnsLeft = property.disappearAfterTurn - currentTurn;
    if (turnsLeft <= 1) {
      return {label: "High competition", className: "comp-high"};
    }
    if (turnsLeft <= 3) {
      return {label: "Medium competition", className: "comp-medium"};
    }
    if (turnsLeft <= 5) {
      return {label: "Low competition", className: "comp-low"};
    }

    return {label: "No competition", className: ""};
  }

  function shapePropertyData(data, fallbackId, index) {
    const docId = data.propertyId || data.id || fallbackId || "property-" + (index + 1);
    const disappearAfterTurn = Number(disappearByPropertyId[docId]);
    const initialVisibleCount = getPositiveInteger(
      treatmentItem && treatmentItem.initialVisibleCount,
      Math.min(properties.length || GAME_CONFIG.defaultInitialVisibleCount, GAME_CONFIG.defaultInitialVisibleCount)
    );
    const newListingRate = getPositiveInteger(treatmentItem && treatmentItem.newListingRate, 0);
    const showRound = index < initialVisibleCount || newListingRate <= 0 ?
      1 :
      2 + Math.floor((index - initialVisibleCount) / newListingRate);

    if (!Number.isFinite(disappearAfterTurn) || disappearAfterTurn <= 0) {
      throw new Error(
        "Missing disappearByPropertyId entry for property " + docId + "."
      );
    }

    return {
      docId: docId,
      marketIndex: index,
      showRound: showRound,
      address: data.address || "Property " + (index + 1),
      meta: data.zip ? formatMeta(data) : "Market listing",
      beds: data.beds || "",
      baths: data.baths || "",
      sqft: data.sqft ? formatSqft(data.sqft) : "",
      icon: data.icon || "🏠",
      bgClass: data.bgClass || getBackgroundClass(index),
      featured: Boolean(data.featured),
      basePrice: getBasePrice(data, docId),
      disappearAfterTurn: disappearAfterTurn
    };
  }

  function shapeProperty(doc, index) {
    return shapePropertyData(doc.data() || {}, doc.id, index);
  }

  function readTreatmentItemFromEmbeddedData() {
    const raw = getEmbeddedDataValue(TREATMENT_ITEM_FIELD);
    if (!raw) {
      throw new Error("Missing treatmentGroupItem embedded data. Add the treatment JSON in the selected treatment branch.");
    }

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

  function readGameSetup() {
    userId = getEmbeddedDataValue(USER_ID_FIELD);
    sessionId = ensureSessionId();
    responseDocId = sanitizeFirestoreDocId(sessionId);
    treatment = getEmbeddedDataValue(TREATMENT_FIELD) || "1";
    treatmentItem = readTreatmentItemFromEmbeddedData();
    startingMoney = getPositiveNumber(
      treatmentItem.startingCash,
      GAME_CONFIG.baseMoney
    );
    monthlyRent = getPositiveNumber(
      treatmentItem.monthlyRent,
      GAME_CONFIG.monthlyRent
    );
    maxTurns = getPositiveNumber(
      getEmbeddedDataValue(MONTH_FIELD) || getEmbeddedDataValue(LEGACY_ROUND_FIELD),
      getPositiveNumber(treatmentItem.maxTurns, GAME_CONFIG.maxTurns)
    );
    marketPressure = getPositiveNumber(
      getEmbeddedDataValue(MARKET_PRESSURE_FIELD),
      0.0015
    );
    trendScale = getPositiveNumber(
      getEmbeddedDataValue(TREND_SCALE_FIELD),
      0.007
    );
    maxTurns = getPositiveNumber(
      maxTurns,
      GAME_CONFIG.maxTurns
    );
    timePerRoundSeconds = getPositiveInteger(
      getEmbeddedDataValue(TIME_PER_ROUND_FIELD),
      getPositiveInteger(treatmentItem.timePerMonth, 0)
    );
    disappearByPropertyId = treatmentItem.disappearByPropertyId || {};
    availableMoney = startingMoney;
    autoAdvancedTurns = [];
    setEmbeddedDataValue("phase2AutoAdvanceTurns", "[]");
    setEmbeddedDataValue("phase2AutoAdvanceMonths", "[]");
    setEmbeddedDataValue("phase2TimePerMonth", timePerRoundSeconds);
  }

  function fetchPhaseOneRatings() {
    const embeddedRatings = getEmbeddedDataValue("phase1Ratings");
    if (embeddedRatings) {
      try {
        return Promise.resolve(JSON.parse(embeddedRatings));
      } catch (error) {
        console.warn("Could not parse phase1Ratings embedded data.", error);
      }
    }

    if (window.__housingRuntimeResponses && Array.isArray(window.__housingRuntimeResponses)) {
      const runtimeRatings = {};
      window.__housingRuntimeResponses.forEach(function (state) {
        runtimeRatings[state.docId] = {
          wtp: state.wtp,
          openHouse: state.openHouse
        };
      });
      return Promise.resolve(runtimeRatings);
    }

    return db
      .collection(RESPONSES_COLLECTION_PATH)
      .doc(responseDocId)
      .collection("Ratings")
      .get()
      .then(function (snapshot) {
        const ratings = {};
        snapshot.docs.forEach(function (doc) {
          ratings[doc.id] = doc.data() || {};
        });
        return ratings;
      })
      .catch(function (error) {
        console.warn("Could not read Phase 1 ratings from Firebase.", error);
        statusClass = "info";
        statusMessage = "Phase 2 started, but Phase 1 WTP responses could not be loaded from Firebase.";
        return {};
      });
  }

  function readPropertiesFromEmbeddedData() {
    const raw = getEmbeddedDataValue(PROPERTY_ITEMS_FIELD);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) {
        throw new Error("propertyItems must be a non-empty JSON array.");
      }
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

  function fetchProperties() {
    const embeddedProperties = readPropertiesFromEmbeddedData();
    if (embeddedProperties) {
      return Promise.resolve(embeddedProperties);
    }

    return Promise.reject(new Error("Missing propertyItems embedded data. Add the propertyItems JSON before Phase 2."));
  }

  function filterPropertiesToPhaseOneSet(allProperties, phaseOneRatings) {
    const propertyIds = Object.keys(phaseOneRatings || {});
    if (!propertyIds.length) {
      return allProperties;
    }

    const idLookup = {};
    propertyIds.forEach(function (id) {
      idLookup[String(id)] = true;
    });

    return allProperties.filter(function (property) {
      return idLookup[String(property.docId)];
    });
  }

  function renderLoadingState(message) {
    root.innerHTML = "";
    root.appendChild(renderPlatformHeader());
    root.appendChild(renderMarketBanner());
    const wrap = createEl("div", "p2-wrap");
    wrap.appendChild(createEl("h2", "p2-title", "Loading Phase 2..."));
    wrap.appendChild(createEl("div", "p2-status info", message));
    root.appendChild(wrap);
  }

  function renderErrorState(message) {
    root.innerHTML = "";
    root.appendChild(renderPlatformHeader());
    root.appendChild(renderMarketBanner());
    const wrap = createEl("div", "p2-wrap");
    wrap.appendChild(createEl("h2", "p2-title", "Phase 2 could not start"));
    wrap.appendChild(createEl("div", "p2-status error", message));
    root.appendChild(wrap);
  }

  function computeFinalPayout() {
    const totalRent = Math.max(0, currentTurn - 1) * monthlyRent;
    const purchasedProperty = purchasedPropertyId ? properties.find(function (item) {
      return item.docId === purchasedPropertyId;
    }) : null;
    const ratingState = purchasedProperty ? (ratingsByPropertyId[purchasedProperty.docId] || {}) : {};
    const valueBenchmark = purchasedProperty &&
      ratingState.wtp !== undefined &&
      ratingState.wtp !== null ?
      Number(ratingState.wtp) :
      0;
    const purchasePrice = purchasedProperty && gameOutcome && gameOutcome.price ?
      Number(gameOutcome.price) :
      0;
    const preferencePenalty = 0;
    const finalPayout = purchasedProperty ?
      (valueBenchmark - purchasePrice - totalRent - preferencePenalty) :
      (0 - totalRent - preferencePenalty);

    return {
      totalRent: totalRent,
      purchasePrice: purchasePrice,
      preferencePenalty: preferencePenalty,
      finalPayout: finalPayout
    };
  }

  function renderFinishScreen() {
    root.innerHTML = "";
    root.appendChild(renderPlatformHeader());
    root.appendChild(renderMarketBanner());

    const payoutSummary = computeFinalPayout();
    const wrap = createEl("div", "p2-wrap");
    const title = gameOutcome && gameOutcome.success ? "Phase 2 Complete" : "Market Closed";
    const tone = gameOutcome && gameOutcome.success ? "success" : "error";
    const subtitle = gameOutcome && gameOutcome.message ?
      gameOutcome.message :
      "Your results are ready. Continue when you are ready.";

    wrap.appendChild(createEl("h2", "p2-title", title));
    wrap.appendChild(createEl("div", "p2-status " + tone, subtitle));

    const payoutPanel = createEl("div", "p2-payout-card");
    payoutPanel.appendChild(createEl("div", "p2-payout-kicker", "Final Payout"));
    payoutPanel.appendChild(createEl(
      "div",
      "p2-payout-value" + (payoutSummary.finalPayout < 0 ? " negative" : ""),
      money(payoutSummary.finalPayout)
    ));
    payoutPanel.appendChild(createEl(
      "div",
      "p2-payout-sub",
      "Calculated from your hidden preference benchmark, the purchase price, and accumulated rent."
    ));
    if (payoutSummary.finalPayout < 0) {
      payoutPanel.appendChild(createEl(
        "div",
        "p2-payout-note",
        "A negative payout means the house price and waiting costs were higher than your hidden value benchmark for this outcome."
      ));
    }
    wrap.appendChild(payoutPanel);

    const ledger = createEl("div", "p2-wallet-ledger");
    [
      ["Final balance", money(availableMoney)],
      ["Rent paid", money(payoutSummary.totalRent)],
      ["Final month", String(currentTurn)],
      ["Purchased house", gameOutcome && gameOutcome.address ? gameOutcome.address : "None"],
      ["Purchase price", gameOutcome && gameOutcome.price ? money(gameOutcome.price) : "—"],
      ["Preference-match adjustment", payoutSummary.preferencePenalty ? money(-payoutSummary.preferencePenalty) : "None"],
      ["Final payout", money(payoutSummary.finalPayout)]
    ].forEach(function (item) {
      const row = createEl("div", "p2-ledger-row");
      row.appendChild(createEl("span", "", item[0]));
      row.appendChild(createEl("b", "", item[1]));
      ledger.appendChild(row);
    });

    wrap.appendChild(ledger);
    wrap.appendChild(createEl(
      "div",
      "p2-detail-copy",
      "Use the survey's Next button to continue."
    ));
    root.appendChild(wrap);
  }

  function renderPropertyCard(property) {
    const currentPrice = priceForTurn(property);
    const priceDelta = priceChangeForTurn(property);
    const reason = unavailableReason(property);
    const competition = getCompetitionLevel(property);
    const ratingState = ratingsByPropertyId[property.docId] || {};
    const wtp = ratingState.wtp !== undefined && ratingState.wtp !== null ?
      money(ratingState.wtp) :
      "—";

    const card = createEl(
      "button",
      "p2-card" +
        (selectedPropertyId === property.docId ? " selected" : "") +
        (reason ? " unavailable" : "")
    );
    card.type = "button";
    card.dataset.role = "select-property";
    card.dataset.propertyId = property.docId;
    card.disabled = gameOver;

    const image = createEl("div", "p2-img " + property.bgClass);
    image.textContent = property.icon;
    image.appendChild(createEl("div", "p2-tag", reason || (currentTurn === property.showRound ? "New this month" : "Available")));
    const photoBar = createEl("div", "p2-photo-bar");
    photoBar.appendChild(createEl("div", "p2-photo-pill", 18 + (property.marketIndex % 5) * 6 + " photos"));
    photoBar.appendChild(createEl("div", "p2-save-pill", "Portal view"));
    image.appendChild(photoBar);
    card.appendChild(image);

    const body = createEl("div", "p2-body");
    const priceRow = createEl("div", "p2-price-row");
    const changeText = currentTurn <= property.showRound ?
      "Starting price" :
      (priceDelta >= 0 ? "+" : "-") + money(Math.abs(priceDelta)) + " since last month";
    const changeClass = "p2-price-change" + (priceDelta > 0 ? " up" : "");
    priceRow.appendChild(createEl("div", "p2-price", money(currentPrice)));
    priceRow.appendChild(createEl("div", changeClass, changeText));
    body.appendChild(priceRow);
    body.appendChild(createEl("div", "p2-address", property.address));
    body.appendChild(createEl("div", "p2-broker-line", "Listed in the HomeStudy market"));
    body.appendChild(createEl("div", "p2-meta", property.meta));
    body.appendChild(createEl(
      "div",
      "p2-facts",
      [property.beds ? property.beds + " bd" : "", property.baths ? property.baths + " ba" : "", property.sqft ? property.sqft + " sqft" : ""]
        .filter(Boolean)
        .join(" | ")
    ));
    body.appendChild(createEl("div", "p2-initial-price", "Initial price: " + money(property.basePrice)));

    const footer = createEl("div", "p2-card-footer");
    footer.appendChild(createEl("div", "p2-chip strong", "Your WTP: " + wtp));
    if (competition) {
      footer.appendChild(createEl("div", "p2-chip " + competition.className, competition.label));
    }
    footer.appendChild(createEl("div", "p2-chip", property.beds + " bed"));
    footer.appendChild(createEl("div", "p2-chip", property.baths + " bath"));
    if (property.sqft) footer.appendChild(createEl("div", "p2-chip", property.sqft + " sqft"));
    body.appendChild(footer);

    card.appendChild(body);
    return card;
  }

  function renderOverlayShell(kicker, title, body, options) {
    const config = options || {};
    const backdrop = createEl("div", "p2-overlay-backdrop");
    if (config.closable !== false) {
      backdrop.dataset.role = "close-overlay";
    }
    const overlay = createEl("div", "p2-overlay");
    const top = createEl("div", "p2-overlay-top");
    const copy = document.createElement("div");
    copy.appendChild(createEl("div", "p2-overlay-kicker", kicker));
    copy.appendChild(createEl("div", "p2-overlay-title", title));
    top.appendChild(copy);
    if (config.closable !== false) {
      const close = createEl("button", "p2-overlay-close", "×");
      close.type = "button";
      close.dataset.role = "close-overlay";
      close.setAttribute("aria-label", "Close detail panel");
      top.appendChild(close);
    }
    overlay.appendChild(top);
    const overlayBody = createEl("div", "p2-overlay-body");
    overlayBody.appendChild(body);
    overlay.appendChild(overlayBody);
    backdrop.appendChild(overlay);
    return backdrop;
  }

  function renderHouseOverlay() {
    const property = properties.find(function (item) {
      return item.docId === selectedPropertyId;
    });

    if (!property || activeOverlay !== "house") return null;

    const ratingState = ratingsByPropertyId[property.docId] || {};
    const currentPrice = priceForTurn(property);
    const reason = unavailableReason(property);
    const competition = getCompetitionLevel(property);
    const canvas = createEl("div", "p2-house-canvas");

    const hero = createEl("div", "p2-house-hero " + property.bgClass);
    hero.textContent = property.icon;
    hero.appendChild(createEl("div", "p2-tag" + (competition && !reason ? " " + competition.className : ""), reason || (competition ? competition.label : "Available")));
    canvas.appendChild(hero);

    const panel = createEl("div", "p2-canvas-panel");
    panel.appendChild(createEl("div", "p2-canvas-price", money(currentPrice)));
    panel.appendChild(createEl(
      "div",
      "p2-canvas-copy",
      "Use your Phase 1 maximum willingness to pay, the current price, and your remaining money to decide whether to buy now or wait. Internal value calculations stay hidden."
    ));

    const grid = createEl("div", "p2-detail-grid");
    const stats = [
      ["Price", money(currentPrice)],
      ["Competition", competition ? competition.label : "No competition"],
      ["Your WTP", ratingState.wtp !== undefined && ratingState.wtp !== null ? money(ratingState.wtp) : "—"],
      ["Open house", ratingState.openHouse ? "Yes" : "No"],
      ["Availability", reason || "Available"],
      ["Appears", "Month " + property.showRound],
      ["Bedrooms", property.beds || "—"],
      ["Bathrooms", property.baths || "—"],
      ["Square feet", property.sqft || "—"],
      ["Disappears", "Month " + property.disappearAfterTurn]
    ];
    stats.forEach(function (item) {
      const box = createEl("div", "p2-detail-stat", item[0]);
      box.appendChild(createEl("b", "", item[1]));
      grid.appendChild(box);
    });
    panel.appendChild(grid);

    const actions = createEl("div", "p2-actions");
    const buyButton = createEl("button", "p2-btn", "Buy This House");
    buyButton.type = "button";
    buyButton.dataset.role = "buy-property";
    buyButton.dataset.propertyId = property.docId;
    buyButton.disabled = Boolean(reason) || gameOver;
    actions.appendChild(buyButton);
    panel.appendChild(actions);

    canvas.appendChild(panel);
    return renderOverlayShell("Listing Detail", property.address, canvas);
  }

  function renderWalletOverlay(moneyProgress, turnProgress, totalRent) {
    if (activeOverlay !== "wallet") return null;

    const canvas = createEl("div", "p2-wallet-canvas");
    const big = createEl("div", "p2-wallet-big");
    big.style.setProperty("--money-progress", moneyProgress + "%");
    big.style.setProperty("--turn-progress", turnProgress + "%");
    big.appendChild(createEl("div", "p2-wallet-kicker", "Cash Remaining"));
    const ring = createEl("div", "p2-money-ring");
    ring.appendChild(createEl("div", "p2-ring-value", moneyProgress + "%"));
    big.appendChild(ring);
    big.appendChild(createEl("div", "p2-money", money(availableMoney)));
    big.appendChild(createEl("div", "p2-money-sub", "Treatment " + treatment + " start: " + money(startingMoney)));
    const pressure = createEl("div", "p2-pressure");
    const pressureHead = createEl("div", "p2-pressure-head");
    pressureHead.appendChild(createEl("span", "", "Market pressure"));
    pressureHead.appendChild(createEl("span", "", "Month " + currentTurn + " / " + maxTurns));
    pressure.appendChild(pressureHead);
    const pressureTrack = createEl("div", "p2-pressure-track");
    pressureTrack.appendChild(createEl("div", "p2-pressure-fill"));
    pressure.appendChild(pressureTrack);
    big.appendChild(pressure);
    canvas.appendChild(big);

    const ledger = createEl("div", "p2-wallet-ledger");
    const rows = [
      ["Starting cash", money(startingMoney)],
      ["Available money", money(availableMoney)],
      ["Rent paid so far", money(totalRent)],
      ["Monthly rent penalty", money(monthlyRent)],
      ["Months elapsed", String(currentTurn - 1)],
      ["Months remaining", String(Math.max(0, maxTurns - currentTurn))]
    ];
    rows.forEach(function (item) {
      const row = createEl("div", "p2-ledger-row");
      row.appendChild(createEl("span", "", item[0]));
      row.appendChild(createEl("b", "", item[1]));
      ledger.appendChild(row);
    });
    canvas.appendChild(ledger);

    return renderOverlayShell("Player Wallet", "Budget And Rent Pressure", canvas);
  }

  function renderSkipCountdownOverlay() {
    if (!skipCountdownDeadlineAt) return null;

    const secondsRemaining = getSkipCountdownSecondsRemaining();
    const body = createEl("div", "p2-wallet-canvas");
    body.appendChild(createEl("div", "p2-overlay-kicker", "Waiting For Next Month"));
    body.appendChild(createEl("div", "p2-overlay-title", "Month " + skipCountdownMonth + " is still running"));
    body.appendChild(createEl(
      "div",
      "p2-canvas-copy",
      "You chose to skip ahead, so this countdown preserves the time cost of waiting. The next month will begin automatically when the current one ends."
    ));
    body.appendChild(createEl("div", "p2-canvas-price", formatCountdownLabel(secondsRemaining)));

    const metaGrid = createEl("div", "p2-detail-grid p2-skip-grid");
    [
      ["Current month", String(skipCountdownMonth)],
      ["Monthly rent", money(monthlyRent)],
      ["Available money", money(availableMoney)]
    ].forEach(function (item) {
      const box = createEl("div", "p2-detail-stat", item[0]);
      box.appendChild(createEl("b", "", item[1]));
      metaGrid.appendChild(box);
    });
    body.appendChild(metaGrid);

    return renderOverlayShell("Month Countdown", "Waiting Out The Month", body, {closable: false});
  }

  function renderScreen() {
    if (loading) {
      renderLoadingState("Loading properties and your Phase 1 WTP responses.");
      return;
    }

    if (gameOver) {
      renderFinishScreen();
      return;
    }

    root.innerHTML = "";
    root.appendChild(renderPlatformHeader());
    root.appendChild(renderMarketBanner());

    const totalRent = (currentTurn - 1) * monthlyRent;
    const availableCount = properties.filter(isAvailable).length;

    const wrap = createEl("div", "p2-wrap");
    const header = createEl("div", "p2-header");
    const headerCopy = document.createElement("div");
    headerCopy.appendChild(createEl("h2", "p2-title", "Phase 2 Housing Market"));
    headerCopy.appendChild(createEl(
      "p",
      "p2-subtitle",
      "Buy one house before the market closes. Waiting costs fixed rent each month, listings may expire, and new listings can appear over time."
    ));
    header.appendChild(headerCopy);

    const pills = createEl("div", "p2-pill-row");
    pills.appendChild(createEl("div", "p2-pill", "Treatment " + treatment));
    pills.appendChild(createEl("div", "p2-pill", "Month " + currentTurn + " / " + maxTurns));
    pills.appendChild(createEl("div", "p2-pill", availableCount + " available"));
    if (timePerRoundSeconds > 0) {
      const activeCountdownSeconds = getActiveCountdownSecondsRemaining();
      const timerPill = createEl(
        "div",
        "p2-pill timer" + (activeCountdownSeconds <= 10 ? " low" : ""),
        formatCountdownLabel(activeCountdownSeconds || timePerRoundSeconds)
      );
      timerPill.dataset.role = "month-timer";
      pills.appendChild(timerPill);
    }
    header.appendChild(pills);
    wrap.appendChild(header);

    if (statusMessage) {
      wrap.appendChild(createEl("div", "p2-status " + statusClass, statusMessage));
    }

    const layout = createEl("div", "p2-layout");
    const moneyProgress = startingMoney > 0 ?
      Math.max(0, Math.min(100, Math.round((availableMoney / startingMoney) * 100))) :
      0;
    const turnProgress = maxTurns > 0 ?
      Math.max(0, Math.min(100, Math.round((currentTurn / maxTurns) * 100))) :
      0;
    const sidebar = createEl("button", "p2-sidebar");
    sidebar.type = "button";
    sidebar.dataset.role = "open-wallet";
    sidebar.style.setProperty("--money-progress", moneyProgress + "%");
    sidebar.style.setProperty("--turn-progress", turnProgress + "%");
    const compact = createEl("div", "p2-wallet-compact");
    const ring = createEl("div", "p2-money-ring");
    ring.appendChild(createEl("div", "p2-ring-value", moneyProgress + "%"));
    compact.appendChild(ring);
    const moneyCopy = document.createElement("div");
    moneyCopy.appendChild(createEl("div", "p2-wallet-kicker", "Player Wallet"));
    moneyCopy.appendChild(createEl("div", "p2-wallet-title", "Available Money"));
    moneyCopy.appendChild(createEl("div", "p2-money-label", "Cash Remaining"));
    moneyCopy.appendChild(createEl("div", "p2-money", money(availableMoney)));
    moneyCopy.appendChild(createEl("div", "p2-money-sub", "Treatment " + treatment + " start: " + money(startingMoney)));
    compact.appendChild(moneyCopy);
    compact.appendChild(createEl("div", "p2-wallet-open", "View wallet"));
    sidebar.appendChild(compact);

    const stats = [
      ["Starting cash", money(startingMoney)],
      ["Rent paid", money(totalRent)],
      ["Monthly rent", money(monthlyRent)],
      ["Months left", String(Math.max(0, maxTurns - currentTurn))]
    ];
    const statGrid = createEl("div", "p2-stat-grid");
    stats.forEach(function (item) {
      const row = createEl("div", "p2-stat");
      row.appendChild(document.createTextNode(item[0]));
      row.appendChild(createEl("b", "", item[1]));
      statGrid.appendChild(row);
    });
    sidebar.appendChild(statGrid);
    layout.appendChild(sidebar);

    const marketShell = createEl("div", "p2-market-shell");
    const market = document.createElement("div");
    const marketHead = createEl("div", "p2-market-head");
    const marketTitleWrap = createEl("div", "p2-market-title-wrap");
    marketTitleWrap.appendChild(createEl("div", "p2-market-title", "Homes For You"));
    marketTitleWrap.appendChild(createEl(
      "div",
      "p2-market-subtitle",
      "Current asking prices reflect this month's market. Open any listing to compare against your Phase 1 maximum WTP."
    ));
    marketHead.appendChild(marketTitleWrap);
    const marketActions = createEl("div", "p2-actions");
    const waitButton = createEl(
      "button",
      "p2-btn secondary",
      currentTurn >= maxTurns ?
        "End Market" :
        (timePerRoundSeconds > 0 ? "Skip To Month End" : "Wait One Month")
    );
    waitButton.type = "button";
    waitButton.dataset.role = "wait-turn";
    waitButton.disabled = gameOver || Boolean(skipCountdownDeadlineAt);
    marketActions.appendChild(waitButton);
    marketHead.appendChild(marketActions);
    market.appendChild(marketHead);

    const grid = createEl("div", "p2-grid");
    properties.forEach(function (property) {
      grid.appendChild(renderPropertyCard(property));
    });
    market.appendChild(grid);

    marketShell.appendChild(market);
    layout.appendChild(marketShell);
    wrap.appendChild(layout);
    const houseOverlay = renderHouseOverlay();
    if (houseOverlay) wrap.appendChild(houseOverlay);
    const walletOverlay = renderWalletOverlay(moneyProgress, turnProgress, totalRent);
    if (walletOverlay) wrap.appendChild(walletOverlay);
    const skipOverlay = renderSkipCountdownOverlay();
    if (skipOverlay) wrap.appendChild(skipOverlay);
    root.appendChild(wrap);
    updateTimerPill();
    startTurnTimer();
  }

  function finishPhase2(property, finalPrice) {
    gameOver = true;
    clearTurnTimer();
    clearSkipCountdown();
    setEmbeddedDataValue("phase2PurchasedPropertyId", property ? property.docId : "");
    setEmbeddedDataValue("phase2PurchasedAddress", property ? property.address : "");
    setEmbeddedDataValue("phase2PurchasePrice", property ? finalPrice : "");
    setEmbeddedDataValue("phase2FinalMoney", availableMoney);
    setEmbeddedDataValue("phase2FinalTurn", currentTurn);
    setEmbeddedDataValue("phase2FinalMonth", currentTurn);
    recordAction(
      property ? "complete_purchase" : "complete_no_purchase",
      property ? "property" : "screen",
      property ? property.docId : "phase2_market_closed",
      {shouldResumeThinking: false}
    );

    if (db && responseDocId) {
      const saveMetadata = db
        .collection(RESPONSES_COLLECTION_PATH)
        .doc(responseDocId)
        .collection("MetaData")
        .doc("Session")
        .set({
          userId: userId || "",
          treatmentGroupId: treatment || ""
        }, {merge: true});

      const savePurchase = db
        .collection(RESPONSES_COLLECTION_PATH)
        .doc(responseDocId)
        .collection("Purchases")
        .doc("Outcome")
        .set({
          propertyId: property ? property.docId : "",
          address: property ? property.address : "",
          price: property ? finalPrice : "",
          rentPaid: Math.max(0, currentTurn - 1) * monthlyRent,
          totalMonths: currentTurn,
          finalMoney: availableMoney,
          finalMonth: currentTurn
        }, {merge: true});

      const saveActions = saveActionTimeline();

      Promise.all([saveMetadata, savePurchase, saveActions]).catch(function (error) {
          console.warn("Failed to update session metadata for Phase 2.", error);
        });
    }

    if (typeof qthis.showNextButton === "function") {
      qthis.showNextButton();
    }
  }

  function buySelectedProperty(property) {
    const currentPrice = priceForTurn(property);
    const reason = unavailableReason(property);
    if (reason) {
      statusClass = "error";
      statusMessage = reason + ". Choose another listing or wait.";
      renderScreen();
      return;
    }

    purchasedPropertyId = property.docId;
    availableMoney -= currentPrice;
    activeOverlay = "wallet";
    gameOutcome = {
      success: true,
      message: "You bought " + property.address + " for " + money(currentPrice) + ".",
      address: property.address,
      price: currentPrice
    };
    statusClass = "success";
    statusMessage = "Purchase complete: " + property.address + " for " + money(currentPrice) + ". Continue to the next survey page.";
    finishPhase2(property, currentPrice);
    renderScreen();
  }

  function waitOneTurn(triggeredByTimer) {
    if (gameOver || isAdvancingTurn) return;
    isAdvancingTurn = true;
    clearTurnTimer();
    clearSkipCountdown();

    if (triggeredByTimer) {
      recordAutoAdvanceTurn(currentTurn);
    }

    if (currentTurn >= maxTurns) {
      gameOver = true;
      gameOutcome = {
        success: false,
        message: "You reached the end of the market without buying a house.",
        address: "",
        price: ""
      };
      statusClass = "error";
      statusMessage = triggeredByTimer ?
        "Time expired on the final month, so the market closed automatically. Continue to the next survey page." :
        "The market closed before you bought a house. Continue to the next survey page.";
      finishPhase2(null, "");
      renderScreen();
      isAdvancingTurn = false;
      return;
    }

    currentTurn += 1;
    availableMoney -= monthlyRent;
    selectedPropertyId = null;
    activeOverlay = "";
    recordAction("advance_month", "month", "month_" + currentTurn, {
      monthIndex: currentTurn,
      metadata: {
        source: triggeredByTimer ? "timer_expired" : "completed_wait"
      }
    });

    const availableCount = properties.filter(isAvailable).length;
    if (availableCount === 0) {
      gameOver = true;
      gameOutcome = {
        success: false,
        message: "All remaining listings became unavailable before you bought a house.",
        address: "",
        price: ""
      };
      statusClass = "error";
      statusMessage = triggeredByTimer ?
        "Time expired and all remaining listings are now unavailable. Continue to the next survey page." :
        "All remaining listings are unavailable. Continue to the next survey page.";
      finishPhase2(null, "");
    } else {
      statusClass = "info";
      statusMessage = triggeredByTimer ?
        timePerRoundSeconds + " seconds expired, so we moved to the next month automatically. Rent was deducted and the market updated." :
        "One month passed. Rent was deducted and the market updated.";
    }

    renderScreen();
    isAdvancingTurn = false;
  }

  function beginSkipCountdown() {
    if (gameOver || isAdvancingTurn || skipCountdownDeadlineAt) return;

    if (timePerRoundSeconds <= 0) {
      recordAction("skip_month", "button", "skip_month", {
        metadata: {
          countdownSeconds: 0
        },
        shouldResumeThinking: false
      });
      waitOneTurn(false);
      return;
    }

    const secondsRemaining = getSecondsRemaining();
    if (secondsRemaining <= 0) {
      waitOneTurn(true);
      return;
    }

    activeOverlay = "";
    clearTurnTimer();
    skipCountdownMonth = currentTurn;
    skipCountdownDeadlineAt = Date.now() + (secondsRemaining * 1000);
    skipCountdownStartOffsetMs = nowOffsetMs();
    skipCountdownRemainingSecondsAtStart = secondsRemaining;
    recordAction("skip_month", "button", "skip_month", {
      metadata: {
        countdownSeconds: secondsRemaining
      },
      shouldResumeThinking: false
    });
    renderScreen();

    skipCountdownIntervalId = window.setInterval(function () {
      renderScreen();
      if (getSkipCountdownSecondsRemaining() > 0 || gameOver || isAdvancingTurn) {
        return;
      }

      const countdownStartOffsetMs = skipCountdownStartOffsetMs;
      const countdownMonthIndex = skipCountdownMonth;
      const countdownSeconds = skipCountdownRemainingSecondsAtStart;
      clearSkipCountdown();
      recordAction("skip_month_consequence", "screen", "month_countdown", {
        monthIndex: countdownMonthIndex,
        startOffsetMs: countdownStartOffsetMs,
        endOffsetMs: nowOffsetMs(),
        metadata: {
          countdownSeconds: countdownSeconds
        },
        shouldResumeThinking: false
      });
      recordAction("countdown_complete", "screen", "month_countdown", {
        monthIndex: countdownMonthIndex,
        metadata: {
          countdownSeconds: countdownSeconds
        },
        shouldResumeThinking: false
      });
      waitOneTurn(false);
    }, 250);
  }

  root.addEventListener("click", function (event) {
    const select = event.target.closest("[data-role='select-property']");
    if (select && root.contains(select) && !skipCountdownDeadlineAt) {
      selectedPropertyId = select.dataset.propertyId;
      activeOverlay = "house";
      statusMessage = "";
      recordAction("select_property", "property", selectedPropertyId || "unknown_property");
      renderScreen();
      return;
    }

    const wallet = event.target.closest("[data-role='open-wallet']");
    if (wallet && root.contains(wallet) && !skipCountdownDeadlineAt) {
      activeOverlay = "wallet";
      recordAction("open_wallet", "button", "wallet");
      renderScreen();
      return;
    }

    const buy = event.target.closest("[data-role='buy-property']");
    if (buy && root.contains(buy) && !skipCountdownDeadlineAt) {
      const property = properties.find(function (item) {
        return item.docId === buy.dataset.propertyId;
      });
      if (property) {
        recordAction("buy_property", "property", property.docId);
        buySelectedProperty(property);
      }
      return;
    }

    const closeOverlay = event.target.closest("[data-role='close-overlay']");
    if (closeOverlay && root.contains(closeOverlay) && !skipCountdownDeadlineAt) {
      const clickedBackdrop = event.target.classList.contains("p2-overlay-backdrop");
      const clickedCloseButton = event.target.classList.contains("p2-overlay-close");
      if (clickedBackdrop || clickedCloseButton) {
        const overlayTargetId = activeOverlay === "house" && selectedPropertyId ?
          "house_overlay_" + selectedPropertyId :
          (activeOverlay === "wallet" ? "wallet_overlay" : "overlay");
        recordAction("close_overlay", "button", overlayTargetId);
        activeOverlay = "";
        renderScreen();
      }
      return;
    }

    const wait = event.target.closest("[data-role='wait-turn']");
    if (wait && root.contains(wait) && !skipCountdownDeadlineAt) {
      beginSkipCountdown();
    }
  });

  renderLoadingState("Loading properties and your Phase 1 WTP responses.");
  readGameSetup();
  phaseStartedAt = Date.now();
  ensureThinkingSegment();

  if (!responseDocId) {
    renderErrorState("Session ID is missing. Please restart the survey before continuing.");
    return;
  }

  ensureFirebaseReady()
    .then(function (readyDb) {
      db = readyDb;
      return Promise.all([fetchProperties(), fetchPhaseOneRatings()]);
    })
    .then(function (results) {
      ratingsByPropertyId = results[1];
      properties = filterPropertiesToPhaseOneSet(results[0], ratingsByPropertyId);
      loading = false;
      statusClass = "info";
      statusMessage = timePerRoundSeconds > 0 ?
        "Phase 1 WTP responses loaded. You have " + timePerRoundSeconds + " seconds each month before the survey moves on automatically." :
        "Phase 1 WTP responses loaded. Choose a house or wait one month.";
      renderScreen();
    })
    .catch(function (error) {
      console.error("Failed to load Phase 2.", error);
      renderErrorState(error.message || "Phase 2 could not load.");
    });

  if (typeof qthis.addOnUnload === "function") {
    qthis.addOnUnload(function () {
      clearTurnTimer();
    });
  }
});
