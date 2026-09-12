# Stop Committing `docs/` — Deploy via GitHub Actions Instead

## The problem

`docs/` (the Vite build output) is committed straight to `main` and published via GitHub Pages' "deploy from a branch" mode. That means every rebuild-and-commit permanently adds new blobs to git history — old ones are never removed, only hidden by later commits. As of 2026-09-06, `.git` is 361 MB, and 431 MB of everything ever committed (across all history, including now-superseded versions) is under `docs/` — versus ~30 MB for actual source. Concretely: 126 different hashed versions of just the `canvas-recorder-*.js` bundle exist in history, one per rebuild-and-commit cycle, because Vite's cache-busting filenames (`[name]-[hash].js`) change any time the bundle's content shifts — including indirect shifts caused by unrelated code elsewhere in the dependency graph.

This is structural, not a cleanup-habit problem: the working tree itself is already clean (Vite empties `docs/` before every build; there's no accumulated cruft sitting in the current commit). The bloat is purely historical, and tuning the build's chunking (see `vite.config.js`'s `manualChunks`, already improved once) only reduces how much unrelated churn rides along — it can't eliminate the core issue, because genuinely-changing source will always produce new committed blobs as long as the build output itself is tracked.

`package.json`'s `"changes": "git status|grep -v 'docs/'"` script is a tell that this was already the intent — `docs/` diffs were never meant to be something to look at.

## The fix

Stop tracking `docs/` in git at all. Build and deploy it via a GitHub Actions workflow instead, so `main`'s history only ever holds source.

### Steps

1. **Add a workflow file**, e.g. `.github/workflows/deploy.yml`:
   - Trigger on push to `main` (and optionally manual `workflow_dispatch`).
   - `actions/checkout`, `actions/setup-node`, `npm ci`, `npm run build`.
   - `actions/upload-pages-artifact` pointing at `docs/`.
   - `actions/deploy-pages` to publish.
   - (GitHub's own "Static HTML" / Pages starter workflow templates already do most of this — start from one of those rather than from scratch.)

2. **Change the repo's Pages source**: Settings → Pages → Build and deployment → Source → switch from "Deploy from a branch" to "GitHub Actions".

3. **Stop tracking `docs/` going forward**:
   ```
   git rm -r --cached docs/
   ```
   and add `docs/` to `.gitignore`. Local `npm run build` / `npm run preview` keep working exactly as before — the output just stays local (or gets built fresh by CI), instead of being committed.

4. **Verify**: push to `main`, confirm the Actions run succeeds and the Pages site updates.

### Optional, separate decision: cleaning up existing history

The 431 MB already in history doesn't go away on its own — steps 1-3 only stop it from growing further. Purging it requires rewriting history (`git filter-repo` or BFG Repo Cleaner) and a force-push. This is a bigger, riskier, and fully separate decision from switching the deploy process — don't do it casually, and definitely don't do it as a side effect of the steps above. Since this is a solo repo, a force-push is low-risk *for you*, but it does mean any existing clone (including forks, if any) would need to be re-cloned rather than pulled. Worth doing eventually, but on its own timeline.

## Related, already done

`vite.config.js`'s `manualChunks` now also buckets all `node_modules` dependencies into one stable `vendor` chunk (previously left to Rollup's automatic splitting, which is what made unrelated changes reshuffle unrelated chunks' hashes). This reduces churn regardless of the above, and was worth doing independent of whether/when this deploy migration happens.
