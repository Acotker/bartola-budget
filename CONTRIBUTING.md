# How we work together

Two people build this repo (Carlos + Anna), each with Claude Code. This is how we avoid stepping on each other.

## The golden rule

**Never commit directly to `main`.** `main` is always the working, deployable version (Vercel auto-deploys it). All work happens on a **branch** and comes back through a **Pull Request (PR)**.

## The routine (every work session)

```bash
# 1. Start from the latest main
git checkout main
git pull

# 2. Make a branch for what you're about to do
git checkout -b feature/short-description

# 3. ...work with Claude Code, committing as you go...
git add -A && git commit -m "clear message"

# 4. Push your branch and open a PR
git push -u origin feature/short-description
# then open the PR link GitHub prints, and click "Create pull request"
```

Vercel comments on the PR with a **live preview link** — share it to show your work.
When it looks good, click **Merge** on GitHub, then delete the branch.

## Branch names

`feature/…` new feature · `fix/…` bug fix · `ui/…` visual work.
Examples: `ui/home-redesign`, `feature/budget-categories`, `fix/deficit-copy`.

## Who owns what (keeps our edits apart)

To minimize the chance of touching the same lines:

- **Anna — look & feel:** `src/components/*`, `src/app/globals.css`, `src/app/layout.tsx`, and the visual markup (className / layout) inside pages.
- **Carlos — logic & features:** `src/engine/*` (never break its tests), `src/lib/*`, `src/app/actions.ts`, and new data/fields.

Shared files to coordinate on: the `page.tsx` files and `src/lib/data.ts`. If a feature needs both new logic *and* new UI, it's usually cleanest for **one person to build that whole slice on one branch**.

## Stay fresh, merge small

- **Merge often** (aim for at least once a day). Small PRs = tiny, easy merges.
- If `main` moved while you worked, pull it into your branch before merging:
  ```bash
  git checkout main && git pull
  git checkout your-branch
  git merge main   # resolve any conflicts here, calmly, before the PR
  ```
- **Conflicts are normal and safe.** Git marks the overlapping lines; ask Claude Code to walk you through choosing the right version. Nothing is ever lost — the old versions are all in history.

## Before you open a PR

Make sure it still works:

```bash
npm test        # engine tests must stay green (13 passing)
npm run lint
npm run build
```
