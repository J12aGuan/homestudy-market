#!/usr/bin/env python3
"""Clean HomeStudy Market raw Firestore export into an analysis-ready CSV."""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any


TEST_PATTERN = re.compile(
    r"(test|dev|debug|pilot|demo|practice|preview|sandbox)",
    re.IGNORECASE,
)


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_allowed_ids(path: Path | None) -> set[str] | None:
    if path is None:
        return None
    values = {
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }
    return values


def safe_number(value: Any) -> float | None:
    if value in ("", None):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def count_actions(timeline: list[dict[str, Any]], action_type: str) -> int:
    return sum(1 for item in timeline if item.get("actionType") == action_type)


def count_thinking_segments(timeline: list[dict[str, Any]]) -> int:
    return sum(1 for item in timeline if item.get("actionType") == "thinking")


def get_subdoc(session: dict[str, Any], subcollection: str, document_id: str) -> dict[str, Any]:
    return (
        session.get("subcollections", {})
        .get(subcollection, {})
        .get(document_id, {})
        .get("fields", {})
    )


def get_session_metadata(session: dict[str, Any]) -> dict[str, Any]:
    return get_subdoc(session, "MetaData", "Session")


def get_ratings(session: dict[str, Any]) -> dict[str, dict[str, Any]]:
    ratings_docs = session.get("subcollections", {}).get("Ratings", {})
    return {
        property_id: doc_payload.get("fields", {})
        for property_id, doc_payload in ratings_docs.items()
    }


def get_timeline(session: dict[str, Any], phase_doc_id: str) -> list[dict[str, Any]]:
    action_fields = get_subdoc(session, "Action", phase_doc_id)
    timeline = action_fields.get("timeline", [])
    return timeline if isinstance(timeline, list) else []


def get_purchase_outcome(session: dict[str, Any]) -> dict[str, Any]:
    return get_subdoc(session, "Purchases", "Outcome")


def should_drop_session(
    row: dict[str, Any],
    allowed_user_ids: set[str] | None,
    min_created_at: datetime | None,
    max_created_at: datetime | None,
) -> bool:
    user_id = str(row.get("user_id") or "").strip()
    session_id = str(row.get("session_id") or "").strip()
    created_at = parse_iso_datetime(row.get("record_created_at"))

    if allowed_user_ids is not None and user_id not in allowed_user_ids:
        return True

    combined = " ".join([user_id, session_id])
    if TEST_PATTERN.search(combined):
        return True

    if min_created_at and created_at and created_at < min_created_at:
        return True

    if max_created_at and created_at and created_at > max_created_at:
        return True

    if not row.get("phase1_property_count") and not row.get("phase2_timeline_event_count"):
        return True

    return False


def summarize_session(session: dict[str, Any]) -> dict[str, Any]:
    metadata = get_session_metadata(session)
    ratings = get_ratings(session)
    phase1_timeline = get_timeline(session, "Phase1")
    phase2_timeline = get_timeline(session, "Phase2")
    outcome = get_purchase_outcome(session)

    wtp_values = [
        safe_number(rating.get("wtp"))
        for rating in ratings.values()
        if safe_number(rating.get("wtp")) is not None
    ]
    open_house_count = sum(1 for rating in ratings.values() if bool(rating.get("openHouse")))

    purchase_price = safe_number(outcome.get("price"))
    rent_paid = safe_number(outcome.get("rentPaid"))
    total_months = safe_number(outcome.get("totalMonths"))
    final_money = safe_number(outcome.get("finalMoney"))
    final_month = safe_number(outcome.get("finalMonth"))

    row = {
        "session_id": session.get("session_id", ""),
        "user_id": metadata.get("userId", ""),
        "treatment_group_id": metadata.get("treatmentGroupId", ""),
        "record_created_at": session.get("create_time", ""),
        "record_updated_at": session.get("update_time", ""),
        "phase1_property_count": len(ratings),
        "phase1_completed_count": len(wtp_values),
        "phase1_mean_wtp": round(mean(wtp_values), 2) if wtp_values else "",
        "phase1_min_wtp": min(wtp_values) if wtp_values else "",
        "phase1_max_wtp": max(wtp_values) if wtp_values else "",
        "phase1_open_house_count": open_house_count,
        "phase1_timeline_event_count": len(phase1_timeline),
        "phase1_thinking_segment_count": count_thinking_segments(phase1_timeline),
        "phase2_purchased_flag": int(bool(outcome.get("propertyId"))),
        "phase2_purchased_property_id": outcome.get("propertyId", ""),
        "phase2_purchased_address": outcome.get("address", ""),
        "phase2_purchase_price": purchase_price if purchase_price is not None else "",
        "phase2_rent_paid": rent_paid if rent_paid is not None else "",
        "phase2_total_months": int(total_months) if total_months is not None else "",
        "phase2_final_money": final_money if final_money is not None else "",
        "phase2_final_month": int(final_month) if final_month is not None else "",
        "phase2_timeline_event_count": len(phase2_timeline),
        "phase2_thinking_segment_count": count_thinking_segments(phase2_timeline),
        "phase2_select_property_count": count_actions(phase2_timeline, "select_property"),
        "phase2_open_wallet_count": count_actions(phase2_timeline, "open_wallet"),
        "phase2_buy_attempt_count": count_actions(phase2_timeline, "buy_property"),
        "phase2_skip_month_count": count_actions(phase2_timeline, "skip_month"),
        "phase2_advance_month_count": count_actions(phase2_timeline, "advance_month"),
        "phase2_countdown_complete_count": count_actions(phase2_timeline, "countdown_complete"),
        "missing_phase1_ratings_flag": int(len(ratings) == 0),
        "missing_phase2_outcome_flag": int(len(outcome) == 0),
    }
    return row


def write_csv(rows: list[dict[str, Any]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "session_id",
        "user_id",
        "treatment_group_id",
        "record_created_at",
        "record_updated_at",
        "phase1_property_count",
        "phase1_completed_count",
        "phase1_mean_wtp",
        "phase1_min_wtp",
        "phase1_max_wtp",
        "phase1_open_house_count",
        "phase1_timeline_event_count",
        "phase1_thinking_segment_count",
        "phase2_purchased_flag",
        "phase2_purchased_property_id",
        "phase2_purchased_address",
        "phase2_purchase_price",
        "phase2_rent_paid",
        "phase2_total_months",
        "phase2_final_money",
        "phase2_final_month",
        "phase2_timeline_event_count",
        "phase2_thinking_segment_count",
        "phase2_select_property_count",
        "phase2_open_wallet_count",
        "phase2_buy_attempt_count",
        "phase2_skip_month_count",
        "phase2_advance_month_count",
        "phase2_countdown_complete_count",
        "missing_phase1_ratings_flag",
        "missing_phase2_outcome_flag",
    ]

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Convert HomeStudy Market raw Firestore export into a clean CSV."
    )
    parser.add_argument(
        "--input",
        default="data/raw/firestore_export.json",
        help="Path to the raw JSON export produced by extract_firebase_data.py",
    )
    parser.add_argument(
        "--output",
        default="data/cleaned/homestudy_market_participants.csv",
        help="Path to the cleaned CSV output.",
    )
    parser.add_argument(
        "--allowed-user-id-file",
        default=None,
        help="Optional newline-delimited allowlist of real participant user IDs.",
    )
    parser.add_argument(
        "--min-created-at",
        default=None,
        help="Optional ISO timestamp. Drop sessions created before this time.",
    )
    parser.add_argument(
        "--max-created-at",
        default=None,
        help="Optional ISO timestamp. Drop sessions created after this time.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    raw_path = Path(args.input)
    output_path = Path(args.output)
    allowed_ids = load_allowed_ids(Path(args.allowed_user_id_file)) if args.allowed_user_id_file else None
    min_created_at = parse_iso_datetime(args.min_created_at)
    max_created_at = parse_iso_datetime(args.max_created_at)

    payload = load_json(raw_path)
    sessions = payload.get("sessions", [])

    rows = []
    for session in sessions:
        row = summarize_session(session)
        if should_drop_session(row, allowed_ids, min_created_at, max_created_at):
            continue
        rows.append(row)

    rows.sort(key=lambda row: (str(row["user_id"]), str(row["session_id"])))
    write_csv(rows, output_path)
    print(f"Wrote {len(rows)} cleaned rows to {output_path}")


if __name__ == "__main__":
    main()
