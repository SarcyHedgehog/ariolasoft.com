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

Do not use the action's clean-slate option: the remote account may contain hosting-managed files outside this project.
