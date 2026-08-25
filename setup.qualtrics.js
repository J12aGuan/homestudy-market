Qualtrics.SurveyEngine.addOnReady(function () {
  var qthis = this;
  var container = qthis.getQuestionContainer();

  // Embedded Data fields written by this page (spec Q2-Q4).
  var MARKET_TYPE_CODE_FIELD = "market_type_code";
  var MARKET_TYPE_LABEL_FIELD = "market_type_label";
  var BEDROOMS_FIELD = "ideal_bedrooms";
  var BATHROOMS_FIELD = "ideal_bathrooms";
  var PRICE_FIELD = "self_reported_price";

  // Plausible price range. Leave as null until the study team supplies the
  // lower/upper bounds; null disables that side of the check.
  var PRICE_MIN = null;
  var PRICE_MAX = null;

  var marketButtons = container.querySelectorAll("[data-market-code]");
  var marketTypeError = container.querySelector("#marketTypeError");
  var bedroomsInput = container.querySelector("#bedroomsInput");
  var bathroomsInput = container.querySelector("#bathroomsInput");
  var roomsError = container.querySelector("#roomsError");
  var priceInput = container.querySelector("#priceInput");
  var priceError = container.querySelector("#priceError");
  var pipeMarketType = container.querySelector("#pipeMarketType");
  var pipeBedrooms = container.querySelector("#pipeBedrooms");
  var pipeBathrooms = container.querySelector("#pipeBathrooms");

  var selectedMarketCode = "";
  var selectedMarketLabel = "";

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

  function setEmbeddedDataValue(fieldName, value) {
    Qualtrics.SurveyEngine.setEmbeddedData(fieldName, String(value));
  }

  function parseRooms(rawValue) {
    var cleaned = String(rawValue).trim();
    if (!cleaned) return null;
    var parsed = Number(cleaned);
    return isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  // Numeric open entry in U.S. dollars: strip any dollar signs, commas, or
  // spaces the respondent types, and preserve the unrounded value.
  function parsePrice(rawValue) {
    var cleaned = String(rawValue).replace(/[$,\s]/g, "");
    if (!cleaned) return null;
    var parsed = Number(cleaned);
    if (!isFinite(parsed) || parsed <= 0) return null;
    if (PRICE_MIN !== null && parsed < PRICE_MIN) return null;
    if (PRICE_MAX !== null && parsed > PRICE_MAX) return null;
    return parsed;
  }

  function indefiniteArticle(label) {
    return /^[aeiou]/i.test(label) ? "an" : "a";
  }

  // Live piping into the Q4 wording so the price question always refers to
  // the respondent's current market type and bed/bath answers.
  function updatePipedText() {
    if (pipeMarketType) {
      // The question template already ends with the word "area", so strip a
      // trailing "area" from the label to avoid "rural area area".
      var pipedLabel = selectedMarketLabel ? selectedMarketLabel.replace(/\s+area$/i, "") : "";
      pipeMarketType.textContent = pipedLabel ?
        indefiniteArticle(pipedLabel) + " " + pipedLabel.toLowerCase() :
        "your selected market type";
    }

    var bedrooms = bedroomsInput ? parseRooms(bedroomsInput.value) : null;
    var bathrooms = bathroomsInput ? parseRooms(bathroomsInput.value) : null;
    if (pipeBedrooms) {
      pipeBedrooms.textContent = bedrooms !== null ? String(bedrooms) : "your ideal number of";
    }
    if (pipeBathrooms) {
      pipeBathrooms.textContent = bathrooms !== null ? String(bathrooms) : "your ideal number of";
    }
  }

  if (typeof qthis.disableNextButton === "function") {
    qthis.disableNextButton();
  }

  function updateNextButtonState() {
    var bedrooms = bedroomsInput ? parseRooms(bedroomsInput.value) : null;
    var bathrooms = bathroomsInput ? parseRooms(bathroomsInput.value) : null;
    var price = priceInput ? parsePrice(priceInput.value) : null;
    var ready = Boolean(selectedMarketCode) && bedrooms !== null && bathrooms !== null && price !== null;

    if (ready) {
      if (typeof qthis.enableNextButton === "function") {
        qthis.enableNextButton();
      }
    } else if (typeof qthis.disableNextButton === "function") {
      qthis.disableNextButton();
    }
  }

  function styleMarketButton(button, selected) {
    button.style.backgroundColor = selected ? "#0f1f3d" : "#ffffff";
    button.style.borderColor = selected ? "#0f1f3d" : "#cfddf7";
    button.style.color = selected ? "#ffffff" : "#17213a";
    var example = button.querySelector("[data-role='market-example']");
    if (example) {
      example.style.color = selected ? "rgba(255,255,255,0.75)" : "#5a6480";
    }
  }

  function selectMarketType(code, label) {
    selectedMarketCode = code;
    selectedMarketLabel = label;
    setEmbeddedDataValue(MARKET_TYPE_CODE_FIELD, code);
    setEmbeddedDataValue(MARKET_TYPE_LABEL_FIELD, label);
    Array.prototype.forEach.call(marketButtons, function (button) {
      styleMarketButton(button, button.getAttribute("data-market-code") === code);
    });
    if (marketTypeError) {
      marketTypeError.style.display = "none";
    }
    updatePipedText();
    updateNextButtonState();
  }

  Array.prototype.forEach.call(marketButtons, function (button) {
    button.addEventListener("click", function () {
      selectMarketType(
        button.getAttribute("data-market-code"),
        button.getAttribute("data-market-label")
      );
    });
  });

  function updateRooms() {
    var bedrooms = bedroomsInput ? parseRooms(bedroomsInput.value) : null;
    var bathrooms = bathroomsInput ? parseRooms(bathroomsInput.value) : null;
    setEmbeddedDataValue(BEDROOMS_FIELD, bedrooms !== null ? bedrooms : "");
    setEmbeddedDataValue(BATHROOMS_FIELD, bathrooms !== null ? bathrooms : "");
    if (bedrooms !== null && bathrooms !== null && roomsError) {
      roomsError.style.display = "none";
    }
    updatePipedText();
    updateNextButtonState();
  }

  function updatePrice() {
    var price = priceInput ? parsePrice(priceInput.value) : null;
    setEmbeddedDataValue(PRICE_FIELD, price !== null ? price : "");
    if (price !== null && priceError) {
      priceError.style.display = "none";
    }
    updateNextButtonState();
  }

  [bedroomsInput, bathroomsInput].forEach(function (roomInput) {
    if (roomInput) {
      roomInput.addEventListener("input", updateRooms);
      roomInput.addEventListener("blur", updateRooms);
    }
  });

  if (priceInput) {
    priceInput.addEventListener("input", updatePrice);
    priceInput.addEventListener("blur", updatePrice);
  }

  // Restore any previous answers (e.g. backward navigation) so the page does
  // not lose state and the piped wording matches the stored values.
  (function restoreFromEmbeddedData() {
    var storedCode = getEmbeddedDataValue(MARKET_TYPE_CODE_FIELD);
    Array.prototype.forEach.call(marketButtons, function (button) {
      if (button.getAttribute("data-market-code") === storedCode) {
        selectMarketType(storedCode, button.getAttribute("data-market-label"));
      }
    });

    var storedBedrooms = getEmbeddedDataValue(BEDROOMS_FIELD);
    if (bedroomsInput && storedBedrooms) {
      bedroomsInput.value = storedBedrooms;
    }

    var storedBathrooms = getEmbeddedDataValue(BATHROOMS_FIELD);
    if (bathroomsInput && storedBathrooms) {
      bathroomsInput.value = storedBathrooms;
    }

    var storedPrice = getEmbeddedDataValue(PRICE_FIELD);
    if (priceInput && storedPrice) {
      priceInput.value = storedPrice;
    }

    updateRooms();
    updatePrice();
  })();

  Qualtrics.SurveyEngine.addOnPageSubmit(function () {
    updateRooms();
    updatePrice();
    if (!selectedMarketCode && marketTypeError) {
      marketTypeError.style.display = "block";
    }
    var bedrooms = bedroomsInput ? parseRooms(bedroomsInput.value) : null;
    var bathrooms = bathroomsInput ? parseRooms(bathroomsInput.value) : null;
    if ((bedrooms === null || bathrooms === null) && roomsError) {
      roomsError.style.display = "block";
    }
    if (priceInput && parsePrice(priceInput.value) === null && priceError) {
      priceError.style.display = "block";
    }
  });
});
