# Qualtrics content updates — remaining tasks

Updated Aug 24 after the final full-preview verification run (userId
`TEST-CLAUDE-FINALPASS`). **All survey content is now up to date** with the design
doc and the Aug 2026 team-meeting decisions.

Verified in that run, end to end:

- ID + housing profile pages (console clean — the old `addOnPageSubmit` error is gone)
- Phase 1 & Phase 2 Instructions pages (new text + all annotated images)
- Core Strategy page (`core_strategy.html` live)
- Phase 1 quiz intro (`phase1_quiz_intro.html` live: Best Strategy hint, new image,
  working modals)
- Phase 2 quiz intro (`phase2_quiz_intro.html` live: Phase 2 heading, six bidding
  hints, three annotated images, working modals) — the earlier paste mix-up is fixed
- Phase 2 quiz questions (all four new; "hideen" typo fixed)
- Phase 1 game (new UI, saves)
- Phase 2 game (numbering matches Phase 1, full-width bidding card, second-price
  verified: $800,000 bid on House 1 → paid the seller's price of $552,401)
- Feedback page (all four Phase 2 questions match the new bidding wording exactly)
- Survey completes and records

---

## Findings from the Aug 24 branch/edge-case test (userIds `TEST-CLAUDE-BRANCH`, `TEST-CLAUDE-BRANCH2`)

Everything below was verified working: ID-page gating (Next disabled until ID +
eligibility), setup-page gating (empty/letters/invalid price all block), the
ineligible screen-out branch, wrong quiz answers blocked with "Incorrect Answer",
the relaxed bed/bath fallback (9 bd / 8 ba rural still produced 4 houses), WTP
input rejection (letters/negative/zero), re-rolls (counter 4→0, button disables,
fresh set numbered House 5–8, cycles back with correct numbers/prices), bid input
rejection, the 4-failed-rounds house removal, exit-market ending, and the full
Firestore record (per-round bids, hazard draws, phase 2 summary with config).

Three fixes came out of it — **all applied and re-verified on Aug 24**
(userIds `TEST-CLAUDE-SCREENOUT`, `TEST-CLAUDE-VERIFY3`):

1. ~~Survey Flow screen-out placement~~ — the `eligiblePurchase = 0` branch now
   sits right after the ID block; a "No" answer screens out immediately, before
   the housing-profile page. ✓
2. ~~`setup.qualtrics.js` piping~~ — re-pasted; the rural budget question now reads
   "in a lower-cost rural area" (no duplicate "area"), suburban unchanged. ✓
3. ~~`phase1.qualtrics.js` relaxedRoomFilter~~ — re-pasted; Firestore
   `MetaData/Session` now records `relaxedRoomFilter: true` for relaxed-match
   respondents (verified with a 9 bd / 8 ba rural profile). ✓

## 1. Clean up test data in Firestore (only remaining task)

Delete the test sessions under `Responses` with these `userId` values in
`MetaData/Session`: `TEST-CLAUDE-0822B`, `TEST-CLAUDE-P2`, `TEST-CLAUDE-P2-RETEST`,
`TEST-CLAUDE-SS`, `TEST-CLAUDE-WIDE`, `TEST-CLAUDE-FINAL`, `TEST-CLAUDE-FULLCHECK`,
`TEST-CLAUDE-FINALPASS`, `TEST-CLAUDE-BRANCH2`, `TEST-CLAUDE-VERIFY3`.
(`TEST-CLAUDE-BRANCH` and `TEST-CLAUDE-SCREENOUT` were screened out before Phase 1
and never wrote to Firestore — only Qualtrics responses.)

## Deferred until the updated design doc (from Wednesday's meeting)

- Re-rolls: keep, cap, or remove ("houses exit but do not enter")
- Round structure: per-house rounds (current) vs. global rounds
- Bid entry format: absolute dollars (current) vs. percentage increments
- Family-size dimension in the budget question
- Whether new houses can enter the market
- Q4 budget price bounds (placeholder constants ready in `setup.qualtrics.js`)
- Real house data + neighborhood-features sheet (currently 32 fake houses)
