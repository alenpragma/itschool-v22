# Pushing this project to your own GitHub repository

Everything here is plain static files plus one Node script — there is **nothing to install**
(no `npm install`, no dependencies). If you only want the site online, you can skip straight
to step 5.

---

## 1. Unzip and enter the folder

```bash
unzip edulife-it-school.zip
cd edulife-it-school
```

## 2. (Optional) Rebuild the pages

The generated `.html` files are already committed, so this is only needed if you change
anything in `pages/`, `components/`, `layouts/`, `data/` or `assets/`.

```bash
node build.js && cp -r .build/. .
```

> Keep the `-r`. Once the build emits the `blog/`, `notice/` and `event/` detail folders,
> `cp .build/*.html .` silently drops every one of them while still reporting success.

## 3. Confirm the project is clean before committing

```bash
ls -a                 # you should NOT see a .build/ folder — it is gitignored
node check.js         # optional quality gate (tag balance, dead links, data contract)
```

## 4. Initialise the repository and make the first commit

```bash
git init
git add .
git commit -m "Initial commit: Edulife IT School website"
git branch -M main
```

## 5. Create the GitHub repository and push

Create an **empty** repository on GitHub first — no README, no .gitignore, no license
(otherwise the push is rejected as "remote contains work you do not have locally").
Your browser will ask you to authorise once.

```bash
# replace <your-username> and <your-repo> with your own values
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Using the GitHub CLI instead? `gh repo create <your-repo> --public --source=. --push`
does steps 5 and 6 in one go.

---

## 6. Host it on GitHub Pages

**Option A — GitHub Actions (recommended; rebuilds on every push to `main`)**

A workflow already ships at `.github/workflows/deploy-pages.yml`. Simply:

1. Open the repo → **Settings** → **Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Push to `main` (or run the workflow from the **Actions** tab)

Your site appears at `https://<your-username>.github.io/<your-repo>/`.

**Option B — deploy straight from the branch (no CI)**

1. Open the repo → **Settings** → **Pages**
2. **Source**: _Deploy from a branch_
3. **Branch**: `main`, folder: **`/` (root)** → **Save**

This works because the built pages are committed, so GitHub needs to run nothing.

### Does the sub-path break anything?

**No.** The site uses **relative URLs only** — `assets/css/styles.css`, `about.html`,
`blog/<slug>.html` — and contains **zero root-absolute `/assets/...` references**. It
therefore works unchanged both at a domain root and at a repo sub-path like
`https://<your-username>.github.io/<your-repo>/`.

Two things worth doing for production, neither of which breaks local use:

- `sitemap.xml` ships with **relative** `<loc>` values. Make them absolute, including the
  sub-path: `https://<your-username>.github.io/<your-repo>/about.html`.
- Optionally add a `Sitemap: https://…` line to `robots.txt`.

**Do not add a `<base href="…">` tag** — it would break the relative detail routes under
`blog/` and `notice/`.

---

## Deploying somewhere else

- **Vercel** — import the repo → Framework Preset **Other** → Output Directory `.`
- **Netlify** — New site from Git → Publish directory `.` → 404 page `/404.html`
- **Any static host** (S3 + CloudFront, nginx, Cloudflare Pages) — upload the repo root and
  point the 404 handler at `404.html`

Full details, plus the folder map and the data-layer notes, are in **`README.md`**.
