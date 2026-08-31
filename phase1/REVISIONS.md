# Phase 1 standalone survey — revision list

Source: `Phase 1_revision_Aug2026.docx` (professor, Aug 2026). Phase I and Phase II
are now **two separate Qualtrics surveys**. This survey contains only the filtering
questions (ID, eligibility, housing profile) and Phase I. Everything Phase II moves
to `../phase2/`; the old joint survey is frozen in `../combined/`.

## Required changes

1. **Layout width** — the survey has too much whitespace on both sides. Go
   near-full-width, Zillow-style (https://www.zillow.com/). Applies to every page,
   not just the game.
2. **Delete the Phase 1 instructions page and the Phase 1 quiz entirely** — Phase 1
   is simple enough not to need them.
3. **New single instruction page** — move the "What is 'maximum willingness to pay'?"
   callout out of the rating page and make it the only instruction page.
4. **Reword that instruction** so the WTP definition is clearer.
5. **Rating page header** — title is just "Rate These Properties", plus the market
   type. No other instruction text on the page. Both fonts bigger.
6. **4 rounds** — progress reads "0 of 4 rounds completed", with 4 dots on the right,
   one per round.
7. **3 properties per round** (was 4 in one shot), all fonts bigger.
8. **Uniform house card structure** — every house follows House 1's layout:
   bed/bath/sqft on one line, house type on its own line, then walkability, cost of
   living, school district. No merged or reordered chips (House 2 in the screenshot
   merged "Condo" with the errands line).

## Open data issue

4 rounds x 3 properties = **12 houses per participant**. The current fake pool has
only **8 houses per market type**, so houses would repeat within a session. The real
house spreadsheet needs at least 12 (ideally more) per market type. Until then the
prototype draws without repeats while the pool lasts, then reuses.

## Reference

Professor's annotated screenshot: `assets/prof_phase1_reference.png`
