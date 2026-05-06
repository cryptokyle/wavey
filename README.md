# Gulf of Mexico Wave Field

This page is built to stay static while still showing fresh NOAA buoy data.

## How it works

The browser reads the local file at `data/latest_obs.txt`.

It does **not** query NOAA directly at runtime, because the NOAA `latest_obs.txt` feed is not readable cross-origin from a normal browser page. Instead, the repository refreshes the local snapshot on a schedule.

## Automatic refresh

The workflow in `.github/workflows/refresh-noaa.yml` runs:

- every hour at minute `25`
- whenever you trigger it manually from the Actions tab

On each run it:

1. downloads `https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt`
2. replaces `data/latest_obs.txt`
3. commits and pushes the file only if it changed

If this repo is hosted on a static platform that serves the branch contents, the site will pick up the new snapshot automatically on the next deploy or branch sync.

## Smallest possible GitHub Pages setup

This folder already has the right shape for GitHub Pages:

- `index.html` is at the repo root
- asset paths are relative, so it works from a project subpath
- `.nojekyll` tells Pages to serve the files as plain static content

To publish it with the fewest moving parts:

1. Push this folder to a GitHub repository
2. Open `Settings`
3. Open `Pages`
4. Under `Build and deployment`, choose `Deploy from a branch`
5. Set `Branch` to your default branch, usually `main`
6. Set the folder to `/(root)`
7. Save

That is enough to serve this exact folder through GitHub Pages. No separate Pages build workflow is required.

## GitHub Actions setup

For this workflow to push commits back to the repository, make sure Actions can write to the repo:

1. Open `Settings`
2. Open `Actions` -> `General`
3. Under `Workflow permissions`, choose `Read and write permissions`
4. Save

After that, the refresh workflow can update `data/latest_obs.txt`, push the change to `main`, and GitHub Pages will automatically serve the new snapshot.

## Hosting notes

- GitHub Pages: this is the smallest setup for this project, because the site can be served directly from the same branch the NOAA refresh workflow updates.
- Cloudflare Pages: also works if it deploys from the updated branch.
- Local file mode: if you open `index.html` with `file://`, browsers may block `fetch()` of `data/latest_obs.txt`. In that case, use a tiny static server or the page's import tools.

## Files

- `index.html`: page shell
- `styles.css`: dashboard styling
- `app.js`: map rendering and NOAA text parsing
- `data/latest_obs.txt`: current local NOAA snapshot
- `.github/workflows/refresh-noaa.yml`: scheduled NOAA refresh
