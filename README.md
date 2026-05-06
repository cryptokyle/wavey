# Gulf of Mexico Wave Field

This page is built to stay static while still showing fresh NOAA buoy data.

## How it works

The browser reads the local file at `data/latest_obs.txt`.

It does **not** query NOAA directly at runtime, because the NOAA `latest_obs.txt` feed is not readable cross-origin from a normal browser page. Instead, the repository refreshes the local snapshot on a schedule.

## Automatic refresh

The workflow in `.github/workflows/refresh-noaa.yml` runs:

- every hour at minute `25`
- whenever you trigger it manually from the Actions tab
- whenever you push to `main`

On scheduled or manual runs it:

1. downloads `https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt`
2. replaces `data/latest_obs.txt`
3. commits and pushes the file only if it changed
4. deploys the site to GitHub Pages from the same workflow

On push runs, it skips the NOAA download and just deploys the current repository contents.

This workflow-based deploy is important because commits pushed by `GITHUB_TOKEN` do not trigger a branch-based GitHub Pages rebuild.

## GitHub Pages setup

This folder already has the right shape for GitHub Pages:

- `index.html` is at the repo root
- asset paths are relative, so it works from a project subpath
- `.nojekyll` tells Pages to serve the files as plain static content

To publish it with the current workflow:

1. Push this folder to a GitHub repository
2. Open `Settings`
3. Open `Pages`
4. Under `Build and deployment`, choose `GitHub Actions`
5. Save if GitHub prompts you to confirm the source

The existing workflow handles both NOAA refreshes and Pages deployments.

## GitHub Actions setup

For this workflow to push commits back to the repository and deploy Pages, make sure Actions can write to the repo:

1. Open `Settings`
2. Open `Actions` -> `General`
3. Under `Workflow permissions`, choose `Read and write permissions`
4. Save

The workflow requests `contents: write`, `pages: write`, and `id-token: write` so it can update `data/latest_obs.txt`, push the change to `main`, and publish the updated site in the same run.

## Hosting notes

- GitHub Pages: this is the most reliable setup for this project, because the NOAA refresh and site deploy happen in the same workflow run.
- Cloudflare Pages: also works if it deploys from the updated branch.
- Local file mode: if you open `index.html` with `file://`, browsers may block `fetch()` of `data/latest_obs.txt`. In that case, use a tiny static server or the page's import tools.

## Files

- `index.html`: page shell
- `styles.css`: dashboard styling
- `app.js`: map rendering and NOAA text parsing
- `data/latest_obs.txt`: current local NOAA snapshot
- `.github/workflows/refresh-noaa.yml`: scheduled NOAA refresh
