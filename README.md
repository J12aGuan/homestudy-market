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

- `phase1.html` and `phase1.qualtrics.js`: Phase 1 valuation task
- `phase2.html` and `phase2.qualtrics.js`: Phase 2 market simulation
- `scripts/extract_firebase_data.py`: exports raw Firestore data to JSON
- `scripts/clean_firebase_data.py`: converts the raw export to CSV
- `sample_data/homestudy_market_clean_sample.csv`: example cleaned output

## How to run it locally

This project is designed to run **inside Qualtrics**, not as a standalone web app. The `.html` files by themselves only provide the root container and page title.

1. Create or open the Qualtrics survey for the study.
2. Add one question for Phase 1 and one question for Phase 2.
3. In the Phase 1 question:
   - paste the contents of `phase1.html` into the question HTML
   - paste the contents of `phase1.qualtrics.js` into the question JavaScript editor
4. In the Phase 2 question:
   - paste the contents of `phase2.html` into the question HTML
   - paste the contents of `phase2.qualtrics.js` into the question JavaScript editor
5. Define the required Embedded Data fields in Survey Flow before the game questions run.
6. Preview the survey from the beginning and complete both phases end to end.

## Required Qualtrics Embedded Data

The scripts expect the following Embedded Data fields.

### Required in both phases

- `userId`
- `sessionId`
- `propertyItems`
- `treatmentGroupId`
- `treatmentGroupItem`

### Also used in Phase 2

- `marketPressure`
- `trendScale`
- `month` or legacy `round`
- `timePerMonth`
- `phase1Ratings` from Phase 1

## Expected data structure

### `propertyItems`

`propertyItems` must be a JSON array. Typical fields:

- `propertyId` or `id`
- `address`
- `zip`
- `city`
- `state`
- `beds`
- `baths`
- `sqft`
- `icon`
- `bgClass`
- `featured`
- `phase2Price` or `price` or `askPrice`

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

## How Qualtrics survey flow should be structured

Recommended flow:

1. Consent / intro
2. Set Embedded Data
   - assign `userId`
   - assign or generate `sessionId`
   - assign `treatmentGroupId`
   - assign `propertyItems`
   - assign `treatmentGroupItem`
   - assign Phase 2 tuning values like `marketPressure`, `trendScale`, `month`, and `timePerMonth`
3. Instructions / comprehension screen
4. **Phase 1 question**
5. Transition page
6. **Phase 2 question**
7. Post-task questions / demographics / debrief

The game sits in the survey as two separate Qualtrics questions. Phase 1 writes `phase1Ratings`, and Phase 2 reads it back from Embedded Data or Firestore.

## How it connects to Firebase

Project ID: `housing-experiment-mockups`

This project writes to **Cloud Firestore**, not Realtime Database.

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
