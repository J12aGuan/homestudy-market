Qualtrics.SurveyEngine.addOnReady(function () {
  var qthis = this;
  var container = qthis.getQuestionContainer();
  var input = container.querySelector("#userIdInput");
  var error = container.querySelector("#userIdError");
  var eligibilitySection = container.querySelector("#eligibilitySection");
  var eligibilityError = container.querySelector("#eligibilityError");
  var eligibilityButtons = container.querySelectorAll("[data-eligibility]");

  // Eligibility filter (spec Q1). Stored as Embedded Data so the question is
  // asked at most once per respondent: "1" = has purchased / is purchasing,
  // "0" = has not. When Phase 1 and Phase 2 become separate surveys, pass the
  // value into the Phase 2 survey (e.g. via a URL parameter captured into
  // this Embedded Data field) and the question will not be shown again.
  var ELIGIBILITY_FIELD = "eligiblePurchase";

  function getEmbeddedDataValue(fieldName) {
    if (typeof qthis.getEmbeddedData === "function") {
      var value = qthis.getEmbeddedData(fieldName);
      if (value) return String(value).trim();
    }

    if (window.Qualtrics &&
      window.Qualtrics.SurveyEngine &&
      typeof window.Qualtrics.SurveyEngine.getEmbeddedData === "function") {
      var globalValue = window.Qualtrics.SurveyEngine.getEmbeddedData(fieldName);
      if (globalValue) return String(globalValue).trim();
    }

    return "";
  }

  function getStoredEligibility() {
    var value = getEmbeddedDataValue(ELIGIBILITY_FIELD);
    return value === "1" || value === "0" ? value : "";
  }

  var eligibilityAnswer = getStoredEligibility();

  // Already answered (earlier in this survey, or carried in on the survey
  // link) — keep the stored value and skip the question entirely.
  if (eligibilityAnswer && eligibilitySection) {
    eligibilitySection.style.display = "none";
  }

  // Disable the core Qualtrics navigation button upon rendering
  if (typeof qthis.disableNextButton === "function") {
    qthis.disableNextButton();
  }

  function updateNextButtonState() {
    var userId = input ? input.value.trim() : "";
    if (userId && eligibilityAnswer) {
      if (typeof qthis.enableNextButton === "function") {
        qthis.enableNextButton();
      }
    } else if (typeof qthis.disableNextButton === "function") {
      qthis.disableNextButton();
    }
  }

  function updateUserId() {
    var userId = input ? input.value.trim() : "";
    // Map valid tracking string parameters into Qualtrics global dataset
    Qualtrics.SurveyEngine.setEmbeddedData("userId", userId);
    if (userId && error) {
      error.style.display = "none";
    }
    updateNextButtonState();
  }

  function styleEligibilityButton(button, selected) {
    button.style.backgroundColor = selected ? "#0f1f3d" : "#ffffff";
    button.style.color = selected ? "#ffffff" : "#17213a";
    button.style.borderColor = selected ? "#0f1f3d" : "#cfddf7";
  }

  function selectEligibility(value) {
    eligibilityAnswer = value;
    Qualtrics.SurveyEngine.setEmbeddedData(ELIGIBILITY_FIELD, value);
    Array.prototype.forEach.call(eligibilityButtons, function (button) {
      styleEligibilityButton(button, button.getAttribute("data-eligibility") === value);
    });
    if (eligibilityError) {
      eligibilityError.style.display = "none";
    }
    updateNextButtonState();
  }

  Array.prototype.forEach.call(eligibilityButtons, function (button) {
    button.addEventListener("click", function () {
      selectEligibility(button.getAttribute("data-eligibility"));
    });
  });

  // Bind key listeners onto user entry interface actions
  if (input) {
    input.addEventListener("input", updateUserId);
    input.addEventListener("blur", updateUserId);
    updateUserId(); // Run initially to capture values loaded via backward navigations
  }

  Qualtrics.SurveyEngine.addOnPageSubmit(function () {
    updateUserId();
    var userId = input ? input.value.trim() : "";
    if (!userId && error) {
      error.style.display = "block";
    }
    if (!eligibilityAnswer && eligibilityError) {
      eligibilityError.style.display = "block";
    }
  });
});
