# Ariolasoft UK archive

Source for [www.ariolasoft.com](https://www.ariolasoft.com/), documenting games and software published by Ariolasoft UK.

## Structure

- `index.html` — project landing page.
- `titles.html` — searchable catalogue.
- `titles/` — one detail page per title.
- `images/` — site artwork and surviving catalogue images.
- `source-data/` — catalogue source and intermediate data.
- `tools/` — catalogue generation utilities.
- `archive/` — retained historical source that is not published.

## Publishing

Production is hosted by GoDaddy. The manual GitHub Actions workflow in `.github/workflows/deploy-godaddy.yml` publishes the site over FTPS after the repository secrets described there have been configured.

Development-only content (`source-data`, `tools`, `archive`, Git metadata and editor configuration) is excluded from deployment.

The `hare-and-tortoise-api` directory contains the small cross-origin group and leaderboard service used by the restored Sarcastic Hedgehog game. Its runtime data directory is protected from HTTP access and excluded from every deployment so publishing site updates cannot overwrite player data. Deploy it independently with the `Deploy Hare and Tortoise score service` workflow.

Do not use the action's clean-slate option: the remote account may contain hosting-managed files outside this project.

## Catalogue data and contributions

`catalogue.json` is the authoritative catalogue data used by the public table, detail-page generator and contribution editor. Visitors use `catalogue-editor.html`; they do not edit repository files. The form opens a pre-filled catalogue suggestion for confirmation, and nothing is published at that point.

Editorial review is deliberately two-stage:

1. Check the submitted evidence and add the `ready-for-catalogue-review` label.
2. GitHub Actions validates the structured suggestion and creates a pull request containing the exact data and generated-page changes.
3. Merge the pull request to accept it, or close the pull request and issue to reject it.

Run `python tools/catalogue.py validate` before committing manual catalogue changes. Run `python tools/catalogue.py build` after changing `catalogue.json`; generated title pages and the fallback table must be committed with the data.
