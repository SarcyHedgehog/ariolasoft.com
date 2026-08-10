#!/usr/bin/env python3
"""Import, validate and render the Ariolasoft catalogue.

The published ``catalogue.json`` is the canonical record. ``import`` is a
one-time migration helper for the historical hand-written HTML. ``build``
renders the detail pages and validates every record before writing anything.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / "catalogue.json"
PLATFORMS = [
    ("c64", "Commodore 64"),
    ("cpc", "Amstrad CPC"),
    ("spectrum", "ZX Spectrum"),
    ("atari8", "Atari 8-bit"),
    ("msx", "MSX"),
    ("msdos", "MS-DOS"),
    ("pcbooter", "PC Booter"),
    ("atarist", "Atari ST"),
    ("amiga", "Amiga"),
    ("apple2", "Apple II"),
    ("pcw", "Amstrad PCW"),
    ("c16", "Commodore 16"),
]


def clean(value: str) -> str:
    value = html.unescape(re.sub(r"<[^>]+>", "", value)).strip()
    return value.replace("BrÃƒÂ¸derbund", "Brøderbund").replace("BrÃ¸derbund", "Brøderbund")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def import_catalogue() -> list[dict]:
    source = read_text(ROOT / "titles.html")
    row_pattern = re.compile(
        r"<tr>\s*<td><a href=\"[^\"]*\" onclick=\"(?:return )?openPopup\('titles/(?P<file>[^']+\.html)'\)\">"
        r"(?P<title>.*?)</a></td>(?P<rest>.*?)</tr>",
        re.S,
    )
    records = []
    for match in row_pattern.finditer(source):
        cells = [clean(value) for value in re.findall(r"<td>(.*?)</td>", match.group("rest"), re.S)]
        if len(cells) != 15:
            raise ValueError(f"Unexpected column count for {clean(match.group('title'))}: {len(cells)}")

        filename = match.group("file")
        slug = Path(filename).stem
        detail_source = read_text(ROOT / "titles" / filename)
        description_match = re.search(r'<textarea[^>]*id="text-box"[^>]*>(.*?)</textarea>', detail_source, re.S)
        image_match = re.search(r'<img[^>]+src="([^"]+)"', detail_source, re.S)
        source_match = re.search(r"<!--\s*(Sources reviewed:.*?)\s*-->", detail_source, re.S)
        description = html.unescape(description_match.group(1)).strip() if description_match else ""
        image_path = image_match.group(1).strip() if image_match else ""

        records.append(
            {
                "slug": slug,
                "title": clean(match.group("title")),
                "year": int(cells[0]),
                "developer": cells[1],
                "label": cells[2],
                "platforms": [key for (key, _), flag in zip(PLATFORMS, cells[3:]) if flag.lower() == "yes"],
                "media": [],
                "description": description,
                "image": image_path,
                "imageCredit": "",
                "sources": source_match.group(1).strip() if source_match else "",
                "lastReviewed": "",
            }
        )
    validate(records)
    return records


def load_catalogue() -> list[dict]:
    records = json.loads(read_text(CATALOGUE))
    validate(records)
    return records


def validate(records: list[dict]) -> None:
    allowed_platforms = {key for key, _ in PLATFORMS}
    seen_slugs: set[str] = set()
    seen_titles: set[str] = set()
    errors: list[str] = []
    for index, record in enumerate(records, start=1):
        name = record.get("title") or f"record {index}"
        slug = record.get("slug", "")
        if not re.fullmatch(r"[a-z0-9]+", slug):
            errors.append(f"{name}: invalid slug {slug!r}")
        if slug in seen_slugs:
            errors.append(f"{name}: duplicate slug {slug!r}")
        if name.casefold() in seen_titles:
            errors.append(f"{name}: duplicate title")
        seen_slugs.add(slug)
        seen_titles.add(name.casefold())
        if not isinstance(record.get("year"), int) or not 1970 <= record["year"] <= 2000:
            errors.append(f"{name}: invalid year")
        unknown = set(record.get("platforms", [])) - allowed_platforms
        if unknown:
            errors.append(f"{name}: unknown platforms {sorted(unknown)}")
        if not record.get("developer") or not record.get("label"):
            errors.append(f"{name}: developer and label are required")
    if errors:
        raise ValueError("Catalogue validation failed:\n- " + "\n- ".join(errors))


def render_detail(record: dict) -> str:
    title = html.escape(record["title"])
    description = html.escape(record["description"], quote=False)
    image = record.get("image", "")
    sources = record.get("sources", "")
    if image:
        body = f'''    <div id="image-container">\n        <img src="{html.escape(image, quote=True)}" alt="{title}">\n    </div>\n    <div id="text-container">'''
    else:
        body = '    <div id="text-container" class="text-only">'
    source_comment = f"\n    <!-- {sources} -->" if sources else ""
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="stylesheet" href="titles.css">
</head>
<body>
{body}
        <h2 id="text-header">{title}</h2>
        <textarea id="text-box" readonly>{description}</textarea>
    </div>{source_comment}
</body>
</html>
'''


def render_rows(records: list[dict]) -> str:
    rows = []
    for record in records:
        title = html.escape(record["title"])
        filename = f"titles/{record['slug']}.html"
        cells = [
            f'  <td><a href="{filename}" onclick="return openPopup(\'{filename}\')">{title}</a></td>',
            f"  <td>{record['year']}</td>",
            f"  <td>{html.escape(record['developer'])}</td>",
            f"  <td>{html.escape(record['label'])}</td>",
        ]
        selected = set(record["platforms"])
        cells.extend(f"  <td>{'Yes' if key in selected else 'No'}</td>" for key, _ in PLATFORMS)
        rows.append("<tr>\n" + "\n".join(cells) + "\n</tr>")
    return "\n".join(rows)


def build(records: list[dict]) -> None:
    for record in records:
        (ROOT / "titles" / f"{record['slug']}.html").write_text(
            render_detail(record), encoding="utf-8", newline="\n"
        )
    catalogue_page = read_text(ROOT / "titles.html")
    replacement = "<tbody>\n" + render_rows(records) + "\n  </tbody>"
    catalogue_page, count = re.subn(r"<tbody>.*?</tbody>", replacement, catalogue_page, count=1, flags=re.S)
    if count != 1:
        raise ValueError("Could not locate the catalogue table body")
    (ROOT / "titles.html").write_text(catalogue_page, encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("import", "validate", "build"))
    args = parser.parse_args()
    if args.command == "import":
        records = import_catalogue()
        CATALOGUE.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Imported {len(records)} catalogue records to {CATALOGUE.name}.")
    else:
        records = load_catalogue()
        if args.command == "build":
            build(records)
            print(f"Built {len(records)} detail pages.")
        else:
            print(f"Validated {len(records)} catalogue records.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
