# HomeStudy Market

Suggested folder name: `games/homestudy-market-spring26/`

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

- `phase1.html`: HTML shell for the Phase 1 Qualtrics question
- `phase1.qualtrics.js`: Phase 1 interface, valuation logic, and Firebase save logic
- `phase2.html`: HTML shell for the Phase 2 Qualtrics question
- `phase2.qualtrics.js`: Phase 2 market simulation, timing logic, and Firebase save logic
- `research_design_doc.md`: research memo describing the experiment design

## How to run it locally

This project is designed to run **inside Qualtrics**, not as a standalone web app. The `.html` files by themselves only provide the root container and page title.

### Option 1: Quick local file preview

Use this only to inspect the basic HTML shell.

1. Open `phase1.html` or `phase2.html` in a browser.
2. You will only see the page heading and the `#qualtrics-root` container.
3. The full game will **not** run this way because the JavaScript depends on the Qualtrics runtime (`Qualtrics.SurveyEngine`) and survey embedded data.

### Option 2: Real testing flow in Qualtrics

Use this for actual testing.

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

`propertyItems` must be a JSON array. Each item should include enough information for display and pricing. Typical fields are:

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

`treatmentGroupItem` must be a single JSON object. It should include:

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

The game sits in the survey as two separate Qualtrics questions, with Phase 1 first and Phase 2 second. Phase 1 writes `phase1Ratings`, which Phase 2 then reads back from Embedded Data or Firebase.

## How it connects to Firebase

Both phases initialize the same Firebase project:

- Project ID: `housing-experiment-mockups`

The code writes to these Firestore paths:

- `Responses/{sessionId}/MetaData/Session`
- `Responses/{sessionId}/Ratings/{propertyId}` for Phase 1 WTP data
- `Responses/{sessionId}/Purchases/Purchase` for the final Phase 2 purchase outcome
- `Action/{sessionId}/Timeline/Phase1`
- `Action/{sessionId}/Timeline/Phase2`

Phase 1 saves:

- participant metadata
- WTP values for each property
- open-house toggles
- Phase 1 action timeline

Phase 2 saves:

- participant metadata
- purchase outcome
- final money, final month, and purchased property details in Embedded Data
- Phase 2 action timeline

## Known bugs, limitations, or unfinished pieces

- This is not a standalone app yet; full functionality depends on Qualtrics.
- There is no local mock harness for `Qualtrics.SurveyEngine`, so browser-only testing is limited.
- The README documents the expected survey structure, but collaborator access and Survey Flow configuration must still be confirmed in the live Qualtrics project.
- Vercel deployment is not applicable for the current codebase unless the project is later wrapped in a standalone web app.
- This folder is not currently inside a Git repository in the local workspace, so GitHub push / branch confirmation / transfer steps still need to be completed from the actual repo copy.

## Final submission checklist

- Move this project into a clearly named folder such as `games/homestudy-market-spring26/`
- Push the final code to the shared BOBALAB GitHub repository
- Make sure the final branch is the designated submission branch
- Confirm the Qualtrics survey flow matches the structure documented above
- Add Park (`parksinchaisri@berkeley.edu`) as a Qualtrics collaborator if not already added
- Preview the full survey from start to finish
- If a production deployment is later created, add the URL here and transfer the Vercel project if needed
