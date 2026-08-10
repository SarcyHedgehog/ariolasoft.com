import os
import json
from bs4 import BeautifulSoup
import re

# Load titles.json
with open("titles.json", "r", encoding="utf-8") as f:
    titles_data = json.load(f)

# Prepare output dictionary
details = {}

# Path to HTML files
html_dir = "titles"

# Normalize title to filename slug
def title_to_slug(title):
    return re.sub(r'[^a-z0-9]', '', title.lower())

# Process each entry in titles.json
for entry in titles_data:
    title = entry["title"]
    slug = title_to_slug(title)
    filename = f"{slug}.html"
    filepath = os.path.join(html_dir, filename)

    # Defaults
    description = ""
    image = f"images/{slug}.png"

    # Try to extract from HTML if it exists
    if os.path.isfile(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            soup = BeautifulSoup(f, "html.parser")
            h2 = soup.find("h2")
            if h2:
                extracted_title = h2.get_text(strip=True)
                if extracted_title.lower() != slug:
                    title = extracted_title
            textarea = soup.find("textarea")
            if textarea:
                description = textarea.get_text(strip=True)
            img = soup.find("img")
            if img and img.get("src"):
                image = img["src"]

    # Pull year from 'platform' field
    year = entry.get("year")
    if not year and "platform" in entry and entry["platform"]:
        try:
            year = int(entry["platform"][0])
        except ValueError:
            year = None

    details[slug] = {
        "slug": slug,
        "title": title,
        "filename": filename,
        "year": year,
        "developer": entry.get("developer"),
        "label": entry.get("label"),
        "image": image,
        "description": description
    }

# Save to file
with open("details_raw.json", "w", encoding="utf-8") as f:
    json.dump(details, f, indent=2, ensure_ascii=False)

print(f"✅ Created details_raw.json with {len(details)} entries")
