#!/usr/bin/env python3
"""Apply a reviewed catalogue suggestion from a GitHub issue body."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from catalogue import CATALOGUE, build, load_catalogue, validate


MARKER = re.compile(r"<!--\s*ARIOLASOFT_CATALOGUE_SUGGESTION\s*(\{.*?\})\s*-->", re.S)
EDITABLE = ("title", "year", "developer", "label", "platforms", "description", "sources")


def bounded_text(payload: dict, key: str, maximum: int, required: bool = False) -> str:
    value = payload.get(key, "")
    if not isinstance(value, str):
        raise ValueError(f"{key} must be text")
    value = value.strip()
    if required and not value:
        raise ValueError(f"{key} is required")
    if len(value) > maximum:
        raise ValueError(f"{key} is longer than {maximum} characters")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("issue_body", type=Path)
    parser.add_argument("--check-only", action="store_true", help="validate without writing files")
    args = parser.parse_args()
    body = args.issue_body.read_text(encoding="utf-8")
    marker = MARKER.search(body)
    if not marker:
        raise ValueError("No Ariolasoft catalogue suggestion was found in the issue")
    payload = json.loads(marker.group(1))
    if payload.get("schema") != 1:
        raise ValueError("Unsupported suggestion schema")

    slug = bounded_text(payload, "slug", 80, required=True)
    records = load_catalogue()
    record = next((item for item in records if item["slug"] == slug), None)
    if record is None:
        raise ValueError(f"Unknown catalogue record: {slug}")

    proposed = {
        "title": bounded_text(payload, "title", 150, required=True),
        "year": payload.get("year"),
        "developer": bounded_text(payload, "developer", 150, required=True),
        "label": bounded_text(payload, "label", 150, required=True),
        "platforms": payload.get("platforms", []),
        "description": bounded_text(payload, "description", 8000),
        "sources": bounded_text(payload, "sources", 3000),
    }
    if not isinstance(proposed["year"], int):
        raise ValueError("year must be a number")
    if not isinstance(proposed["platforms"], list) or not all(isinstance(item, str) for item in proposed["platforms"]):
        raise ValueError("platforms must be a list")

    for key in EDITABLE:
        record[key] = proposed[key]
    validate(records)
    if args.check_only:
        print(f"Validated suggestion for {record['title']} ({slug}).")
        return 0
    CATALOGUE.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    build(records)
    print(f"Applied reviewed suggestion for {record['title']} ({slug}).")
    image = bounded_text(payload, "imageSuggestion", 1000)
    notes = bounded_text(payload, "notes", 3000)
    if image:
        print(f"Suggested image (not automatically published): {image}")
    if notes:
        print(f"Contributor notes: {notes}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
