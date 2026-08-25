# HomeStudy Market

## What this game is

HomeStudy Market is a two-phase housing-market experiment built for Qualtrics.

- **Phase 1: Property valuation.** Participants review a fixed set of homes and report the maximum price they would be willing to pay for each one.
- **Phase 2: Dynamic market simulation.** Participants move through a month-by-month housing market where prices change over time, rent reduces available cash, listings can appear later or disappear, and the participant can buy at most one home.

## What behavior it studies

This experiment studies how participants behave under different housing-pricing rules, especially a comparison between a baseline pricing condition and an RL-style dynamic pricing condition.

The main behaviors captured are:

- willingness to pay in a low-pressure setting
- waiting versus buying in a dynamic market
- reactions to rising or falling prices
- search intensity and inspection behavior
- purchase timing, purchase price, and end-of-game payout

## Project files

- `id.html` and `id.qualtrics.js`: welcome screen with participant ID entry and the eligibility filter question
- `setup.html` and `setup.qualtrics.js`: housing profile page (preferred market type, ideal bedrooms/bathrooms, self-reported reasonable purchase price)
- `phase1.html` and `phase1.qualtrics.js`: Phase 1 valuation task
- `phase2.html` and `phase2.qualtrics.js`: Phase 2 bidding game
- `phase1_instructions.html` and `phase2_instructions.html`: instruction pages shown before the games (static HTML, no JavaScript)
- `instruction_assets/`: annotated screenshots referenced by the instruction pages
- `scripts/extract_firebase_data.py`: exports raw Firestore data to JSON
- `scripts/clean_firebase_data.py`: converts the raw export to CSV
- `sample_data/homestudy_market_clean_sample.csv`: example cleaned output

## How to run it locally

This project is designed to run **inside Qualtrics**, not as a standalone web app. The `.html` files by themselves only provide the root container and page title.

1. Create or open the Qualtrics survey for the study.
2. Add one question for the ID/eligibility screen, one for the housing profile, one for Phase 1, and one for Phase 2. Keep the ID/eligibility question and the housing profile question on separate pages so the eligibility screen-out branch can run between them.
3. In the ID/eligibility question:
   - paste the contents of `id.html` into the question HTML
   - paste the contents of `id.qualtrics.js` into the question JavaScript editor
4. In the housing profile question:
   - paste the contents of `setup.html` into the question HTML
   - paste the contents of `setup.qualtrics.js` into the question JavaScript editor
5. In the Phase 1 question:
   - paste the contents of `phase1.html` into the question HTML
   - paste the contents of `phase1.qualtrics.js` into the question JavaScript editor
6. In the Phase 2 question:
   - paste the contents of `phase2.html` into the question HTML
   - paste the contents of `phase2.qualtrics.js` into the question JavaScript editor
7. Define the required Embedded Data fields in Survey Flow before the game questions run.
8. Add a Survey Flow branch after the ID/eligibility block: if `eligiblePurchase` equals `0`, go to an End of Survey element customized as a screen-out.
9. Preview the survey from the beginning and complete both phases end to end.

## Required Qualtrics Embedded Data

The scripts expect the following Embedded Data fields.

### Set by the ID/eligibility question (`id.*`)

- `userId`: the participant ID typed on the welcome screen
- `eligiblePurchase`: eligibility filter answer (`1` = has purchased or is purchasing a residential property, `0` = has not). The question only displays the eligibility filter when this field is empty, so declare it in Survey Flow before the ID/eligibility block. When Phase 1 and Phase 2 are split into separate surveys, pass the value into the Phase 2 survey link as a URL parameter (for example `...?userId=X&eligiblePurchase=1`) so the question is not asked twice.

### Set by the housing profile question (`setup.*`)

These use the snake_case names from the build specification:

- `market_type_code`: preferred market type, `1`-`4` (older/lower-income urban, suburban/metropolitan, high-income resort, lower-cost rural)
- `market_type_label`: the matching label, piped live into the purchase price question wording
- `ideal_bedrooms` and `ideal_bathrooms`: housing requirements only — do **not** use them to filter the stimulus pool unless the research team explicitly confirms that rule
- `self_reported_price`: unrounded numeric price in U.S. dollars (dollar signs/commas stripped). The plausible range check lives in `setup.qualtrics.js` as `PRICE_MIN`/`PRICE_MAX`, currently disabled (`null`) until the study team supplies bounds.

### Required in both phases

- `userId`
- `sessionId`
- `propertyItems`
- `treatmentGroupId`
- `treatmentGroupItem`
- `firebaseConfig`

### Set by the Phase 1 question

- `phase1Assignment`: JSON record of the four assigned houses and their randomly sampled display attributes. Written by `phase1.qualtrics.js`; declare it blank in Survey Flow. It also makes the assignment stable if the respondent reloads the Phase 1 page.
- `phase1Ratings`: WTP and open-house answers per property.

Phase 1 no longer takes its four houses from `treatmentGroupItem.propertyIds`. It builds them per respondent: filter `propertyItems` to the respondent's `market_type_code` and bed/bath ±1, take the four nearest in `price` to `self_reported_price`, and randomize their display order. `treatmentGroupItem` is currently only consumed by Phase 2.

### Also used in Phase 2 (bidding game)

- `phase1Ratings` from Phase 1: used to derive reference prices (own WTP per house)
- `phase2Result`: set by the Phase 2 question with the outcome summary; declare it blank

Optional tuning fields (JS defaults in parentheses; declare only to override):

- `phase2MaxRounds` (4): bidding rounds per house
- `phase2MaxRerolls` (4): times the respondent can ask for a different set of houses
- `phase2HazardRate` (0.1): per-round probability the house leaves the market
- `phase2PriceBand` (0.2): algorithm price drawn from U[ref×(1−band), ref×(1+band)]

The legacy market-simulation fields (`marketPressure`, `trendScale`, `month`, `timePerMonth`,
and `treatmentGroupItem`'s propertyIds/cash/rent settings) are no longer read by Phase 2.

## Expected data structure

### `propertyItems`

`propertyItems` must be a JSON array. Fields used by the Phase 1 assignment (spec section 2):

- `propertyId` or `id`
- `marketTypeCode`: `1`-`4`, matched against the respondent's `market_type_code` (required)
- `price` (or `phase2Price` / `askPrice`): underlying price used for nearest-price matching to `self_reported_price` (required)
- `beds` and `baths`: if present, the candidate pool is limited to properties within ±1 of the respondent's ideal; if the strict pool has fewer than 4 houses the bed/bath filter is relaxed and `relaxedRoomFilter: true` is recorded in `phase1Assignment`

Display fields:

- `address`, `zip`, `city`, `state`, `sqft`, `icon`, `bgClass`, `featured`

Note that displayed bedrooms/bathrooms, property type, walkability/transit, cost of living, and school rating are **randomly sampled per respondent** (spec section 3), not read from the property data. The sampled values are stored in `phase1Assignment` and saved to Firestore with each rating.

Fake placeholder data (32 houses, 8 per market type) lives in `sample_data/property_items_fake.json`; paste `sample_data/property_items_fake.min.json` into the `propertyItems` embedded data value until the real house data arrives.

### `treatmentGroupItem`

`treatmentGroupItem` must be a single JSON object. Required fields:

- `propertyIds`: ordered array of property IDs shown in the condition
- `startingCash`
- `monthlyRent`
- `maxTurns`
- `timePerMonth`
- `initialVisibleCount`
- `newListingRate`
- `disappearByPropertyId`: object mapping each property ID to the month when it becomes unavailable

### `firebaseConfig`

`firebaseConfig` must be a single JSON object containing the Firebase web config used by the Qualtrics scripts:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

Use the current Firebase web config for the project in Qualtrics Survey Flow rather than hardcoding it in the JavaScript files.

## How Qualtrics survey flow should be structured

Recommended flow:

1. Set Embedded Data: declare `eligiblePurchase` (empty by default, or filled from a URL parameter when the phases are split into separate surveys)
2. Consent / **ID + eligibility question** (`id.*`; the eligibility filter is skipped automatically when `eligiblePurchase` already has a value)
3. Branch: if `eligiblePurchase` equals `0`, End of Survey (screen-out)
4. **Housing profile question** (`setup.*`: market type, ideal bedrooms/bathrooms, self-reported price — on its own page so it only shows after the screen-out branch)
5. Set Embedded Data
   - assign `userId`
   - assign or generate `sessionId`
   - assign `treatmentGroupId`
   - assign `propertyItems`
   - assign `treatmentGroupItem`
   - assign `firebaseConfig`
   - assign Phase 2 tuning values like `marketPressure`, `trendScale`, `month`, and `timePerMonth`
6. Instructions / comprehension screen
7. **Phase 1 question**
8. Transition page
9. **Phase 2 question**
10. Post-task questions / demographics / debrief

The game sits in the survey as two separate Qualtrics questions. Phase 1 writes `phase1Ratings` and `phase1Assignment`; Phase 2 (the bidding game) reads them to build reference prices and to show the Phase 1 houses first. Phase 2 records every bid attempt to Firestore (`Responses/{sessionId}/Bids`), the outcome summary to `MetaData/Session.phase2` and the `phase2Result` embedded data field, and its action timeline to `Action/Phase2`. The design decisions currently adopted for the bidding rules are tracked in the team's `pi_decisions.md` (item 7).

## How it connects to Firebase

Project ID: `housing-experiment-mockups`

This project writes to **Cloud Firestore**, not Realtime Database.

The Qualtrics scripts do not store the Firebase web config in source. Instead, they read it from the `firebaseConfig` Embedded Data field at runtime.

The code writes to these Firestore paths:

- `Responses/{sessionId}/MetaData/Session`
- `Responses/{sessionId}/Ratings/{propertyId}` for Phase 1 WTP data
- `Responses/{sessionId}/Purchases/Outcome` for the final Phase 2 purchase outcome
- `Responses/{sessionId}/Action/Phase1`
- `Responses/{sessionId}/Action/Phase2`

Phase 1 saves ratings, open-house choices, metadata, and the Phase 1 action timeline. Phase 2 saves purchase outcome, money/month outcome fields, metadata, and the Phase 2 action timeline.

## Data extraction and cleaning

### Credentials and setup

1. Create a local `.env` file in the project root.
2. Copy the format from `.env.example`.
3. Set `GOOGLE_APPLICATION_CREDENTIALS` to the absolute path of your Firebase service account JSON file.
4. Install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

The `.env` file is ignored by git and should never be committed.

### Step 1: Export raw Firebase data

Run:

```bash
python3 scripts/extract_firebase_data.py --project-id housing-experiment-mockups --output data/raw/firestore_export.json
```

This writes `data/raw/firestore_export.json`.

### Step 2: Clean the raw export into CSV

Run:

```bash
python3 scripts/clean_firebase_data.py --input data/raw/firestore_export.json --output data/cleaned/homestudy_market_participants.csv
```

This writes `data/cleaned/homestudy_market_participants.csv` with one row per participant session.

Optional filters:

- `--allowed-user-id-file path/to/real_ids.txt`
- `--min-created-at 2026-05-01T00:00:00Z`
- `--max-created-at 2026-05-31T23:59:59Z`

The allowlist file should contain one real participant ID per line.

### Output structure

The cleaned CSV includes:

- `session_id`, `user_id`, `treatment_group_id`
- Phase 2 outcome columns such as purchase flag, purchased property, price, rent paid, total months, and final money
- one `*_wtp` column and one `*_open_house` column for each property in the export
- `phase1_actions_json`
- `phase2_actions_json`

### Filtering

By default, the cleaning script keeps every session in the raw export. Optional filters:

- a newline-delimited allowlist of participant IDs with `--allowed-user-id-file`
- a minimum record timestamp with `--min-created-at`
- a maximum record timestamp with `--max-created-at`

### Missing values

The cleaning script does not impute missing values. Missing values are left blank in the CSV.

### Sample output

Example file: `sample_data/homestudy_market_clean_sample.csv`

## Known bugs, limitations, or unfinished pieces

- This is not a standalone app yet; full functionality depends on Qualtrics.
- There is no local mock harness for `Qualtrics.SurveyEngine`, so browser-only testing is limited.
- Vercel deployment is not applicable for the current codebase unless the project is later wrapped in a standalone web app.
