#!/usr/bin/env python3
"""Clean HomeStudy Market raw Firestore export into an analysis-ready CSV."""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

PROTO_TIMESTAMP_PATTERN = re.compile(r"seconds:\s*(\d+)\s+nanos:\s*(\d+)", re.MULTILINE)


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    proto_match = PROTO_TIMESTAMP_PATTERN.search(value)
    if proto_match:
        seconds = int(proto_match.group(1))
        nanos = int(proto_match.group(2))
        total_seconds = float(seconds) + (float(nanos) / 1_000_000_000)
        return datetime.fromtimestamp(total_seconds, tz=UTC)

    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def normalize_timestamp_string(value: str | None) -> str:
    parsed = parse_iso_datetime(value)
    if parsed is None:
        return value or ""
    return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(
            f"Raw export file not found: {path}. Run scripts/extract_firebase_data.py first."
        )
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


def get_all_property_ids(sessions: list[dict[str, Any]]) -> list[str]:
    property_ids = set()
    for session in sessions:
        property_ids.update(get_ratings(session).keys())
    return sorted(property_ids)


def bool_to_csv_value(value: Any) -> str:
    if value is True:
        return "TRUE"
    if value is False:
        return "FALSE"
    return ""


def serialize_timeline(timeline: list[dict[str, Any]]) -> str:
    return json.dumps(timeline, separators=(",", ":"), ensure_ascii=True)


def should_drop_session(
    row: dict[str, Any],
    allowed_user_ids: set[str] | None,
    min_created_at: datetime | None,
    max_created_at: datetime | None,
) -> bool:
    user_id = str(row.get("user_id") or "").strip()
    created_at = parse_iso_datetime(row.get("record_created_at"))

    if allowed_user_ids is not None and user_id not in allowed_user_ids:
        return True

    if min_created_at and created_at and created_at < min_created_at:
        return True

    if max_created_at and created_at and created_at > max_created_at:
        return True

    return False


def summarize_session(session: dict[str, Any], property_ids: list[str]) -> dict[str, Any]:
    metadata = get_session_metadata(session)
    ratings = get_ratings(session)
    phase1_timeline = get_timeline(session, "Phase1")
    phase2_timeline = get_timeline(session, "Phase2")
    outcome = get_purchase_outcome(session)

    purchase_price = safe_number(outcome.get("price"))
    rent_paid = safe_number(outcome.get("rentPaid"))
    total_months = safe_number(outcome.get("totalMonths"))
    final_money = safe_number(outcome.get("finalMoney"))
    final_month = safe_number(outcome.get("finalMonth"))

    row = {
        "session_id": session.get("session_id", ""),
        "user_id": metadata.get("userId", ""),
        "treatment_group_id": metadata.get("treatmentGroupId", ""),
        "record_created_at": normalize_timestamp_string(session.get("create_time")),
        "record_updated_at": normalize_timestamp_string(session.get("update_time")),
        "phase2_purchased_flag": int(bool(outcome.get("propertyId"))),
        "phase2_purchased_property_id": outcome.get("propertyId", ""),
        "phase2_purchased_address": outcome.get("address", ""),
        "phase2_purchase_price": purchase_price if purchase_price is not None else "",
        "phase2_rent_paid": rent_paid if rent_paid is not None else "",
        "phase2_total_months": int(total_months) if total_months is not None else "",
        "phase2_final_money": final_money if final_money is not None else "",
        "phase2_final_month": int(final_month) if final_month is not None else "",
        "phase1_actions_json": serialize_timeline(phase1_timeline),
        "phase2_actions_json": serialize_timeline(phase2_timeline),
    }

    for property_id in property_ids:
        rating = ratings.get(property_id, {})
        wtp_value = safe_number(rating.get("wtp"))
        row[f"{property_id}_wtp"] = wtp_value if wtp_value is not None else ""
        row[f"{property_id}_open_house"] = bool_to_csv_value(rating.get("openHouse"))

    return row


def write_csv(rows: list[dict[str, Any]], property_ids: list[str], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "session_id",
        "user_id",
        "treatment_group_id",
        "record_created_at",
        "record_updated_at",
        "phase2_purchased_flag",
        "phase2_purchased_property_id",
        "phase2_purchased_address",
        "phase2_purchase_price",
        "phase2_rent_paid",
        "phase2_total_months",
        "phase2_final_money",
        "phase2_final_month",
    ]
    for property_id in property_ids:
        fieldnames.append(f"{property_id}_wtp")
        fieldnames.append(f"{property_id}_open_house")
    fieldnames.extend([
        "phase1_actions_json",
        "phase2_actions_json",
    ])

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
    property_ids = get_all_property_ids(sessions)

    rows = []
    for session in sessions:
        row = summarize_session(session, property_ids)
        if should_drop_session(row, allowed_ids, min_created_at, max_created_at):
            continue
        rows.append(row)

    rows.sort(key=lambda row: (str(row["user_id"]), str(row["session_id"])))
    write_csv(rows, property_ids, output_path)
    print(f"Wrote {len(rows)} cleaned rows to {output_path}")


if __name__ == "__main__":
    main()
