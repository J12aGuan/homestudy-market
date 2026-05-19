# Research Design Memo: Incentive-Compatible Housing Market Simulation

## Working Title

Evaluating RL-Based Dynamic Housing Pricing in an Incentive-Compatible Simulated Housing Market

## Purpose

This memo summarizes the research design, experimental flow, measurement strategy, and empirical analysis plan for a two-phase housing-market experiment. The goal is to provide a clean foundation for writing the eventual paper, while preserving a clear link between the experimental design and the theoretical motivation behind it.

## 1. Research Question

The core question is whether a reinforcement-learning-based dynamic pricing policy leads to different participant behavior and market outcomes than a baseline pricing policy in a stylized but incentive-compatible housing search environment.

More specifically, the project asks:

1. Do participants make systematically different purchase decisions under RL-based pricing than under the baseline?
2. Does RL pricing alter search behavior, waiting behavior, and timing of purchase?
3. Does RL pricing generate higher realized seller revenue, different buyer surplus, or different rates of missed purchase?
4. How do stated preferences from an initial elicitation phase relate to revealed choices in a dynamic market phase?

## 2. Motivation

Housing purchase decisions are dynamic, high-stakes, and path-dependent. A participant may value a given property highly but still rationally delay purchase if she expects better opportunities or more favorable prices later. This makes a static willingness-to-pay measure incomplete on its own.

The experiment therefore separates:

1. A preference elicitation phase that measures baseline valuations.
2. A dynamic market phase in which participants face time pressure, budget depletion, listing expiration, and changing prices.

This separation is useful for both conceptual and methodological reasons. It allows the study to distinguish between stated value and dynamic revealed choice, and it also keeps the initial elicitation task relatively simple. That simplicity is desirable because the belief-elicitation literature emphasizes that excessive complexity can reduce data quality and participant comprehension (Charness, Gneezy, and Rasocha, 2021).

## 3. Conceptual Framework

The design assumes that participants enter the market with latent preferences over homes. Phase 1 elicits these preferences in a low-complexity setting. Phase 2 then embeds those same participants in a dynamic environment where decisions depend not only on property value, but also on timing, expectations, budget constraints, opportunity cost of delay, and market pressure.

Under this framework:

1. Phase 1 measures a participant-level valuation anchor.
2. Phase 2 measures strategic adaptation to a dynamic pricing environment.
3. Differences across treatment arms reveal how the pricing algorithm changes behavior conditional on preferences.

## 4. Experimental Design

### 4.1 Overview

Participants complete a two-phase experiment.

1. **Phase 1: Property valuation**
   Participants review a fixed set of properties and report the maximum price they would be willing to pay for each one.

2. **Phase 2: Dynamic market simulation**
   Participants enter a multi-month housing market in which they can inspect properties, wait, or purchase. Each month has a fixed duration. Waiting reduces available money through rent and may cause desirable listings to disappear or become more expensive.

### 4.2 Treatment Arms

The main treatment variation is the pricing mechanism applied in Phase 2.

1. **Baseline pricing treatment**
   Property prices evolve according to the benchmark rule.

2. **RL pricing treatment**
   Property prices evolve according to the reinforcement-learning-based pricing policy.

Additional treatment dimensions may be layered in later if desired, but the main paper should likely focus on the cleanest comparison between RL pricing and baseline pricing.

### 4.3 Unit of Randomization

The participant is the unit of randomization. Each participant is assigned to exactly one treatment condition.

## 5. Phase 1: Preference Elicitation

### 5.1 Objective

Phase 1 is designed to collect participant-specific valuations for a common set of homes. These measures serve as a baseline for later purchase behavior.

### 5.2 Design Principles

Phase 1 should remain simple, untimed, and low in cognitive burden. This is consistent with the methodological recommendation that belief or valuation elicitation should avoid unnecessary complexity when possible, since participant confusion can reduce reliability (Charness et al., 2021).

### 5.3 Task

For each property, the participant records:

1. Maximum willingness to pay.
2. Optional indicators such as whether they would attend an open house or view more detail.

### 5.4 Why No Hard Timer

Phase 1 should not impose a strict countdown. A hard timer would risk changing the construct from “valuation” to “valuation under pressure.” The cleaner interpretation is to let participants finish at their own pace while recording time spent and interaction patterns for analysis.

### 5.5 Data Collected

1. Property-level WTP.
2. Interaction timeline, including valuation edits and time spent thinking.
3. Optional auxiliary engagement signals such as open-house toggles.

## 6. Phase 2: Dynamic Housing Market

### 6.1 Objective

Phase 2 is the core behavioral task. It translates static preferences into dynamic decision-making under changing prices, budget constraints, and time pressure.

### 6.2 Market Rules

1. Participants begin with a fixed cash endowment.
2. Each month lasts a fixed number of seconds.
3. Waiting one month reduces available cash through rent.
4. Listings may appear later, expire, or become unavailable.
5. Participants may purchase at most one house.
6. If a participant actively skips to month end, the interface enforces a countdown so the time cost of waiting remains real.

### 6.3 Why Month-Based Timing Matters

The experiment operationalizes dynamic housing search through repeated month-level decisions. This creates a tractable, comparable decision cycle while preserving the logic of real market delay: waiting has consequences.

### 6.4 Current Behavioral Logging

Phase 2 now records timeline data at the session level, including:

1. Thinking periods.
2. Property selection.
3. Wallet opening.
4. Overlay closing.
5. Buy attempts.
6. Skip-month actions.
7. Countdown waiting time.
8. Automatic month advancement.
9. Final purchase or market close outcome.

These logs are valuable because they support richer process analysis beyond end outcomes alone.

## 7. Outcome Measures

### 7.1 Primary Outcomes

1. Whether the participant purchases a home.
2. Final purchase price.
3. Final month of purchase.
4. Final remaining money.
5. Rent paid.
6. Total seller revenue under each pricing regime.

### 7.2 Secondary Behavioral Outcomes

1. Number of months waited before purchase.
2. Number of listings inspected.
3. Number of skip-to-month-end actions.
4. Time spent on property detail views.
5. Time spent in countdown waiting.
6. Whether the participant times out without purchase.
7. Whether the participant buys below, near, or above their own Phase 1 WTP benchmark.

### 7.3 Derived Measures

1. **Valuation gap**: purchase price minus Phase 1 WTP for the purchased property.
2. **Delay sensitivity**: how strongly participants respond to rent pressure and time loss.
3. **Search intensity**: number of property inspections and total deliberation time.
4. **Purchase discipline**: extent to which a participant avoids purchasing properties above stated WTP.

## 8. Beliefs And Elicitation Strategy

If the final study includes belief questions, they should be implemented sparingly and simply.

The most useful design lesson from Charness et al. (2021) is that more complex elicitation methods do not necessarily perform better in practice, and may instead reduce comprehension. For this reason:

1. Belief elicitation should be limited to a few central questions.
2. If incentivized, it should use simple bonus rules rather than mathematically complex scoring rules.
3. Belief bonuses should be paid separately from in-game housing earnings to reduce hedging concerns.

Candidate belief questions include:

1. In which month do you expect to buy?
2. Do you expect your preferred home’s price to rise, fall, or stay similar next month?
3. What purchase-price range do you expect to end up paying?

## 9. Comprehension And Internal Validity

The JEBO paper is especially useful here. Charness et al. (2021) argue that complexity can impair elicitation and recommend simpler presentation and understanding checks.

Accordingly, before Phase 2, participants should complete a short comprehension module covering:

1. What happens when a month ends.
2. What happens if they wait.
3. What happens if they cannot afford a listing.
4. How rent affects their final payoff.
5. Whether skipping to month end still consumes time.

This will strengthen the eventual paper by showing that observed behavior is less likely to reflect confusion.

## 10. Identification Strategy

The core identification strategy is randomized treatment assignment between RL pricing and baseline pricing.

Let:

1. \( i \) index participants.
2. \( T_i \) indicate assignment to RL pricing.
3. \( Y_i \) denote an outcome of interest, such as purchase price, purchase timing, or final money.

The main estimating equation can be written as:

\[
Y_i = \alpha + \beta T_i + \gamma X_i + \varepsilon_i
\]

where \( X_i \) may include pre-treatment controls such as:

1. Average Phase 1 WTP.
2. Dispersion of WTP across properties.
3. Demographic covariates if collected.

The coefficient of interest is \( \beta \), which estimates the effect of RL pricing relative to baseline pricing.

## 11. Empirical Analysis Plan

### 11.1 Main Comparisons

1. Compare purchase prices across treatment arms.
2. Compare purchase timing across treatment arms.
3. Compare no-purchase rates across treatment arms.
4. Compare realized seller revenue and participant surplus proxies across treatment arms.

### 11.2 Linking Phase 1 To Phase 2

The paper should explicitly analyze whether Phase 1 valuations predict Phase 2 choices.

Useful specifications include:

1. Probability of purchase as a function of own WTP rank for the property.
2. Purchase timing as a function of valuation dispersion.
3. Whether RL pricing induces more deviations from Phase 1 WTP benchmarks than the baseline.

### 11.3 Process Analysis Using Timeline Data

The new action timeline permits a stronger process section in the paper.

Examples:

1. Time spent deliberating before purchase.
2. Whether RL pricing increases waiting and inspection behavior.
3. Whether participants in one treatment rely more heavily on skipping or passive countdown waiting.
4. Whether early purchase under RL pricing appears rushed or deliberate.

## 12. Threats To Interpretation

### 12.1 Complexity And Confusion

Participants may misunderstand dynamic pricing, rent penalties, or timing rules. This is why comprehension checks are important and why the interface should remain simple.

### 12.2 Elicitation Effects

As reviewed by Charness et al. (2021), asking for beliefs or valuations can itself affect later behavior. This means the paper should be careful not to overclaim that Phase 1 is a passive measurement step.

### 12.3 Hedging

If belief reports are incentivized using the same reward pool as purchase outcomes, participants may hedge. The paper should avoid this by separating belief bonuses from purchase payoffs whenever beliefs are paid.

### 12.4 External Validity

The environment is intentionally stylized. The contribution is not that the experiment perfectly reproduces the real housing market, but that it creates a controlled dynamic decision environment in which alternative pricing algorithms can be compared.

## 13. Contribution

The study can contribute in at least three ways.

1. **Substantive contribution**
   It evaluates whether RL-based pricing changes buyer behavior and market outcomes relative to a baseline.

2. **Methodological contribution**
   It separates stated valuations from dynamic revealed choices in a controlled market environment.

3. **Measurement contribution**
   It combines choice data with fine-grained action timelines, enabling process analysis of search, waiting, and purchase behavior.

## 14. Suggested Paper Structure

1. Introduction
2. Related literature on dynamic pricing, experimental housing choice, and belief elicitation
3. Experimental design
4. Data and measures
5. Main treatment effects
6. Process evidence from timeline data
7. Robustness and heterogeneity
8. Conclusion

## 15. Recommended Near-Term Implementation Priorities

1. Keep Phase 1 untimed and simple.
2. Add Phase 2 comprehension checks.
3. Preserve separate logging for both phases.
4. Keep month-based timing and enforced countdown on skip actions.
5. If beliefs are added, use simple and easily explained tasks with separate bonus payments.

## References

Charness, Gary, Uri Gneezy, and Vlastimil Rasocha. 2021. “Experimental methods: Eliciting beliefs.” *Journal of Economic Behavior & Organization* 189: 234–256. https://doi.org/10.1016/j.jebo.2021.06.032

Project design source: *Experimental Design: Incentive-Compatible Market Simulation*, internal working document dated March 31, 2026.
