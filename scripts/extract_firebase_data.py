#!/usr/bin/env python3
"""Export HomeStudy Market data from Cloud Firestore to raw JSON.

This project stores participant records in Cloud Firestore under:

    Responses/{sessionId}/MetaData/Session
    Responses/{sessionId}/Ratings/{propertyId}
    Responses/{sessionId}/Action/Phase1
    Responses/{sessionId}/Action/Phase2
    Responses/{sessionId}/Purchases/Outcome

The script recursively exports each session document and its subcollections so
that the cleaning step can run from a stable raw snapshot.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google.cloud import firestore


def timestamp_to_iso(value: Any) -> str | None:
    if value is None:
        return None

    if hasattr(value, "isoformat"):
        try:
            return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
        except ValueError:
            return value.isoformat()

    return str(value)


def convert_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: convert_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [convert_value(item) for item in value]
    if isinstance(value, datetime):
        return timestamp_to_iso(value)
    return value


def export_document(doc_snapshot: firestore.DocumentSnapshot) -> dict[str, Any]:
    document_payload: dict[str, Any] = {
        "document_id": doc_snapshot.id,
        "fields": convert_value(doc_snapshot.to_dict() or {}),
        "create_time": timestamp_to_iso(doc_snapshot.create_time),
        "update_time": timestamp_to_iso(doc_snapshot.update_time),
        "subcollections": {},
    }

    for subcollection in doc_snapshot.reference.collections():
        sub_docs: dict[str, Any] = {}
        for child_snapshot in subcollection.stream():
            sub_docs[child_snapshot.id] = export_document(child_snapshot)
        document_payload["subcollections"][subcollection.id] = sub_docs

    return document_payload


def export_sessions(db: firestore.Client, collection_name: str) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []
    for session_snapshot in db.collection(collection_name).stream():
        session_record = export_document(session_snapshot)
        session_record["session_id"] = session_snapshot.id
        sessions.append(session_record)

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
    load_dotenv()
    parser = build_parser()
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

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
