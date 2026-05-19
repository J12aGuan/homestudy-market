#!/usr/bin/env python3
"""Export HomeStudy Market data from Cloud Firestore to raw JSON.

This project stores participant records in Cloud Firestore under:

    Responses/{sessionId}/MetaData/Session
    Responses/{sessionId}/Ratings/{propertyId}
    Responses/{sessionId}/Action/Phase1
    Responses/{sessionId}/Action/Phase2
    Responses/{sessionId}/Purchases/Outcome

Important implementation detail:
the game writes directly to subcollections, but it does not write fields to the
parent `Responses/{sessionId}` document. In Firestore, that means listing the
top-level `Responses` collection returns zero documents even though the nested
subcollections contain real data. For that reason, this exporter reconstructs
sessions from collection-group queries instead of streaming the top-level
collection.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google.cloud import firestore


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV_PATH = PROJECT_ROOT / ".env"
PROTO_TIMESTAMP_PATTERN = re.compile(r"seconds:\s*(\d+)\s+nanos:\s*(\d+)", re.MULTILINE)


def timestamp_to_iso(value: Any) -> str | None:
    if value is None:
        return None

    if hasattr(value, "isoformat"):
        try:
            return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
        except ValueError:
            return value.isoformat()

    if hasattr(value, "seconds") and hasattr(value, "nanos"):
        total_seconds = float(value.seconds) + (float(value.nanos) / 1_000_000_000)
        return datetime.fromtimestamp(total_seconds, tz=UTC).isoformat().replace("+00:00", "Z")

    text_value = str(value)
    match = PROTO_TIMESTAMP_PATTERN.search(text_value)
    if match:
        seconds = int(match.group(1))
        nanos = int(match.group(2))
        total_seconds = float(seconds) + (float(nanos) / 1_000_000_000)
        return datetime.fromtimestamp(total_seconds, tz=UTC).isoformat().replace("+00:00", "Z")

    return text_value


def convert_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: convert_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [convert_value(item) for item in value]
    if isinstance(value, datetime):
        return timestamp_to_iso(value)
    return value


def export_document(doc_snapshot: firestore.DocumentSnapshot) -> dict[str, Any]:
    return {
        "document_id": doc_snapshot.id,
        "fields": convert_value(doc_snapshot.to_dict() or {}),
        "create_time": timestamp_to_iso(doc_snapshot.create_time),
        "update_time": timestamp_to_iso(doc_snapshot.update_time),
    }


def parse_session_path(doc_snapshot: firestore.DocumentSnapshot, root_collection: str) -> tuple[str, str]:
    path_parts = doc_snapshot.reference.path.split("/")
    if len(path_parts) < 4 or path_parts[0] != root_collection:
        raise ValueError(
            f"Unexpected document path {doc_snapshot.reference.path}; expected "
            f"{root_collection}/{{sessionId}}/{{subcollection}}/{{documentId}}"
        )

    return path_parts[1], path_parts[2]


def ensure_session_record(session_map: dict[str, dict[str, Any]], session_id: str) -> dict[str, Any]:
    session_record = session_map.setdefault(
        session_id,
        {
            "session_id": session_id,
            "document_id": session_id,
            "create_time": None,
            "update_time": None,
            "fields": {},
            "subcollections": {},
        },
    )
    return session_record


def update_session_timestamps(session_record: dict[str, Any], doc_payload: dict[str, Any]) -> None:
    create_time = doc_payload.get("create_time")
    update_time = doc_payload.get("update_time")

    if create_time and (session_record["create_time"] is None or create_time < session_record["create_time"]):
        session_record["create_time"] = create_time

    if update_time and (session_record["update_time"] is None or update_time > session_record["update_time"]):
        session_record["update_time"] = update_time


def export_sessions(db: firestore.Client, root_collection: str) -> list[dict[str, Any]]:
    session_map: dict[str, dict[str, Any]] = {}

    for subcollection_name in ("MetaData", "Ratings", "Action", "Purchases"):
        for doc_snapshot in db.collection_group(subcollection_name).stream():
            session_id, parsed_subcollection_name = parse_session_path(doc_snapshot, root_collection)
            session_record = ensure_session_record(session_map, session_id)
            doc_payload = export_document(doc_snapshot)
            update_session_timestamps(session_record, doc_payload)

            session_record["subcollections"].setdefault(parsed_subcollection_name, {})
            session_record["subcollections"][parsed_subcollection_name][doc_snapshot.id] = doc_payload

            if parsed_subcollection_name == "MetaData" and doc_snapshot.id == "Session":
                session_record["fields"] = dict(doc_payload.get("fields", {}))

    sessions = list(session_map.values())
    sessions.sort(key=lambda record: record["session_id"])
    return sessions


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Export HomeStudy Market Cloud Firestore data to raw JSON."
    )
    parser.add_argument(
        "--project-id",
        default=os.getenv("FIREBASE_PROJECT_ID"),
        help="Firestore project ID. If omitted, the Google client default is used.",
    )
    parser.add_argument(
        "--collection",
        default="Responses",
        help="Top-level Firestore collection to export. Default: Responses",
    )
    parser.add_argument(
        "--output",
        default="data/raw/firestore_export.json",
        help="Path to the raw JSON export file.",
    )
    return parser


def main() -> None:
    load_dotenv(DEFAULT_ENV_PATH)
    parser = build_parser()
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if not credentials_path:
        raise SystemExit(
            "Missing GOOGLE_APPLICATION_CREDENTIALS. Add it to .env and point it to "
            "your Firebase service-account JSON file."
        )

    if not Path(credentials_path).expanduser().exists():
        raise SystemExit(
            "The service-account file was not found at "
            f"{credentials_path}. Update GOOGLE_APPLICATION_CREDENTIALS in .env."
        )

    db = firestore.Client(project=args.project_id)
    sessions = export_sessions(db, args.collection)

    payload = {
        "exported_at_utc": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "project_id": db.project,
        "source_collection": args.collection,
        "session_count": len(sessions),
        "sessions": sessions,
    }

    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Exported {len(sessions)} sessions to {output_path}")


if __name__ == "__main__":
    main()
