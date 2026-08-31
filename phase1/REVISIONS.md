# Phase 1 standalone survey

Source: `assets/Phase1_revision_Aug2026.docx` (professor, Aug 2026). Phase I and
Phase II are now **two separate Qualtrics surveys**. This survey contains only the
filtering questions (ID, eligibility, housing profile), one instruction page, and
the Phase I rating task. The old joint survey is frozen in `../combined/`.

## Files to paste into Qualtrics

| Qualtrics question | HTML | JavaScript |
| --- | --- | --- |
| Welcome / participant ID + eligibility | `id.html` | `id.qualtrics.js` |
| Housing profile (market type, beds/baths, budget) | `setup.html` | `setup.qualtrics.js` |
| Instructions (the only one) | `phase1_instructions.html` | — |
| Rating task | `phase1.html` | `phase1.qualtrics.js` |

Also paste `survey_wide.css` into **Look & Feel → Style → Custom CSS** — that is
what removes the side whitespace on the pages that are plain Qualtrics questions.

There is **no** instructions sequence and **no** Phase 1 quiz any more, and no
Phase 2 blocks: the old `phase1_quiz_intro.html`, quiz questions, and core-strategy
page are not part of this survey.

## Professor's list — status

1. ~~Too much whitespace on both sides (compare zillow.com)~~ — the rating page now
   draws full-bleed (its wrappers give up their width caps and side padding), and
   `survey_wide.css` widens the rest of the survey. The ID and housing-profile
   cards grew from 680px to 900px so they sit well in the wider shell. ✓
2. ~~Remove all Phase 1 instructions and the quiz~~ — not carried into this
   folder. ✓
3. ~~Move the "what is maximum willingness to pay?" callout to its own instruction
   page~~ — `phase1_instructions.html`, and it is gone from the rating page. ✓
4. ~~Make that wording clearer~~ — rewritten as "your maximum price": the highest
   price you would still be happy to pay, with three short cards on how to decide
   and a note that there are no right answers. The card label on the rating page
   changed from "Maximum WTP" to "Your maximum price" to match. ✓
5. ~~Title is just "Rate These Properties" + market type, no other instructions,
   both fonts bigger~~ — the subtitle, the dark phase banner, and the "Prices
   Hidden" badge are gone; the title is 34px and the market-type chip 20px. ✓
6. ~~4 rounds, "0 of 4 rounds completed", one dot per round~~ ✓
7. ~~3 properties per round, all fonts bigger~~ — chips 15px, price input 17px,
   house name 24px, buttons 17px. ✓
8. ~~Uniform house-card structure~~ — every card is now bed/bath/sqft on one line,
   then house type, walkability, cost of living, and school district each on their
   own line. Attributes no longer wrap into each other. ✓

Previews: `assets/preview_rating_round1.png`, `assets/preview_instructions.png`.

## What changed under the hood

- **Rounds.** The assignment now picks 12 houses (4 rounds x 3) instead of 4:
  same market type first, bed/bath within ±1 first, ranked by closeness to the
  respondent's stated budget. Houses that fail the bed/bath filter are only used
  to top the list up, and that is still recorded as `relaxedRoomFilter`.
- **Repeats.** If a market type has fewer than 12 usable houses, houses repeat
  across rounds — never twice inside one round — and the session records
  `reusedProperties: true` plus `uniquePropertyCount`.
- **Stable descriptions.** Display attributes are sampled once per house, so a
  house that appears in two rounds is described identically both times.
- **Saving per round.** Each round is written to Firestore when the respondent
  continues, so a drop-out still leaves usable data for completed rounds.
  Ratings documents are now `Ratings/round-{n}-{propertyId}` and carry `round`,
  `propertyId`, and `displayOrder` (1-3 within the round).
- **Embedded data.** `phase1Assignment` now stores `rounds` (an array of 4 arrays
  of 3 entries) instead of a flat `properties` list. `phase1Ratings` is now keyed
  `round1..round4` then by propertyId.
- `scripts/clean_firebase_data.py` still runs, but its per-property columns will
  now be named after the round-prefixed document ids. Worth revisiting when the
  real data collection starts.

## Open questions for the professor

- **Pool size.** 4 rounds x 3 properties needs **12 houses per participant**; the
  current fake pool has only **8 per market type**, so houses repeat. The real
  spreadsheet should have at least 12 per market type, ideally more so two
  participants in the same market do not see near-identical sets.
- **Incentive wording.** The old instruction said a winning bidder pays the market
  price rather than their bid, which is why honest reporting pays. That is a Phase
  II mechanic, so the standalone Phase 1 instruction asks for honest values without
  it. If Phase 1 should still carry an incentive statement, we need wording that is
  true for a survey with no bidding.
- **Repeated houses.** Is showing the same house in two rounds acceptable as a
  fallback, or should short markets show fewer rounds instead?
