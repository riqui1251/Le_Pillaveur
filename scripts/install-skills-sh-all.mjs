#!/usr/bin/env node
/**
 * Install skills from skills.sh in category batches (by publisher/owner).
 *
 * Usage:
 *   node scripts/install-skills-sh-all.mjs discover-only
 *   node scripts/install-skills-sh-all.mjs list-categories
 *   node scripts/install-skills-sh-all.mjs install-categories
 *   node scripts/install-skills-sh-all.mjs install-category vercel-labs
 */
import { execSync, spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(ROOT, ".tmp-skills-install");
const MANIFEST = join(CACHE, "manifest.json");
const PROGRESS = join(CACHE, "progress.json");

/** Publishers installed first — most useful for a Next.js web app */
const PRIORITY_OWNERS = [
  "vercel-labs",
  "vercel",
  "anthropics",
  "shadcn-ui",
  "mattpocock",
  "getsentry",
  "spencerpauly",
  "supabase",
  "better-auth",
  "obra",
  "trailofbits",
  "firebase",
  "remotion-dev",
  "callstackincubator",
  "nextlevelbuilder",
  "microsoft",
  "neondatabase",
  "langchain-ai",
  "openai",
  "google-labs-code",
  "AbsolutelySkilled",
];

const SEARCH_TERMS = (() => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const terms = new Set(["skill", "test", "web", "app", "dev", "api", "ai", "ui", "react", "next"]);
  for (const a of letters) for (const b of letters) terms.add(a + b);
  return [...terms];
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getOwner(source) {
  const i = source.indexOf("/");
  return i === -1 ? source : source.slice(0, i);
}

async function searchSkills(query, retries = 5) {
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(query)}&limit=500`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return data.skills ?? [];
  }
  throw new Error("429");
}

async function discoverAll() {
  mkdirSync(CACHE, { recursive: true });
  const byId = new Map();
  for (let i = 0; i < SEARCH_TERMS.length; i++) {
    const q = SEARCH_TERMS[i];
    try {
      for (const s of await searchSkills(q)) {
        if (!byId.has(s.id)) byId.set(s.id, s);
      }
      if ((i + 1) % 50 === 0) {
        process.stderr.write(`[discover] ${i + 1}/${SEARCH_TERMS.length} — ${byId.size} skills\n`);
      }
    } catch (err) {
      process.stderr.write(`[warn] "${q}": ${err.message}\n`);
    }
    await sleep(400);
  }
  const repos = [...new Set([...byId.values()].map((s) => s.source))].sort();
  const manifest = {
    discoveredAt: new Date().toISOString(),
    skillCount: byId.size,
    repoCount: repos.length,
    repos,
    skills: [...byId.values()],
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  return manifest;
}

function loadManifest() {
  if (!existsSync(MANIFEST)) return null;
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

function loadProgress() {
  if (!existsSync(PROGRESS)) {
    return { completedCategories: [], failedRepos: [], stats: { ok: 0, fail: 0 } };
  }
  return JSON.parse(readFileSync(PROGRESS, "utf8"));
}

function saveProgress(progress) {
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
}

function installedSources() {
  const lockPath = join(ROOT, "skills-lock.json");
  if (!existsSync(lockPath)) return new Set();
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    return new Set(
      Object.values(lock.skills ?? {})
        .map((e) => e.source)
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

function buildCategories(repos) {
  const byOwner = new Map();
  for (const repo of repos) {
    const owner = getOwner(repo);
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push(repo);
  }

  const categories = [];
  const used = new Set();

  for (const owner of PRIORITY_OWNERS) {
    const list = byOwner.get(owner);
    if (!list?.length) continue;
    categories.push({ name: owner, repos: list.sort(), priority: 1 });
    used.add(owner);
  }

  const miscOwners = [...byOwner.keys()].filter((o) => !used.has(o)).sort();
  const MISC_BATCH = 40;
  for (let i = 0; i < miscOwners.length; i += MISC_BATCH) {
    const slice = miscOwners.slice(i, i + MISC_BATCH);
    const reposInBatch = slice.flatMap((o) => byOwner.get(o)).sort();
    const label = `misc-${String(Math.floor(i / MISC_BATCH) + 1).padStart(3, "0")}`;
    categories.push({ name: label, repos: reposInBatch, priority: 2, owners: slice });
  }

  return categories;
}

function installRepo(source) {
  const result = spawnSync(
    "npx",
    ["--yes", "skills", "add", source, "--all", "--agent", "cursor", "--copy", "-y"],
    {
      cwd: ROOT,
      stdio: "pipe",
      encoding: "utf8",
      shell: true,
      timeout: 8 * 60 * 1000,
      env: { ...process.env, npm_config_yes: "true" },
    }
  );
  return { source, ok: result.status === 0, code: result.status ?? 1, stderr: result.stderr?.slice(-300) };
}

function syncCursor() {
  try {
    execSync("npx --yes skills experimental_sync -a cursor -y", {
      cwd: ROOT,
      stdio: "pipe",
      shell: true,
      timeout: 120_000,
    });
  } catch {
    /* optional */
  }
}

async function installCategory(category, progress, already) {
  const pending = category.repos.filter((r) => !already.has(r));
  if (!pending.length) {
    process.stderr.write(`[skip] ${category.name} — déjà installé\n`);
    return;
  }

  process.stderr.write(`\n=== Catégorie: ${category.name} (${pending.length} dépôts) ===\n`);
  let catOk = 0;
  let catFail = 0;

  for (let i = 0; i < pending.length; i++) {
    const repo = pending[i];
    process.stderr.write(`[${category.name}] ${i + 1}/${pending.length} ${repo}\n`);
    const result = installRepo(repo);
    if (result.ok) {
      catOk++;
      progress.stats.ok++;
      already.add(repo);
    } else {
      catFail++;
      progress.stats.fail++;
      progress.failedRepos.push({ repo, category: category.name, at: new Date().toISOString() });
      process.stderr.write(`  ✗ échec (${result.code})\n`);
    }
    if ((i + 1) % 5 === 0) saveProgress(progress);
    await sleep(600);
  }

  if (!progress.completedCategories.includes(category.name)) {
    progress.completedCategories.push(category.name);
  }
  saveProgress(progress);
  syncCursor();
  process.stderr.write(`[done] ${category.name}: ${catOk} ok, ${catFail} échecs — pause 3s\n`);
  await sleep(3000);
}

async function installCategories(filterName) {
  const manifest = loadManifest();
  if (!manifest) throw new Error("manifest.json manquant — lancez discover-only d'abord");

  const categories = buildCategories(manifest.repos);
  const progress = loadProgress();
  const already = installedSources();

  let toRun = categories.filter((c) => !progress.completedCategories.includes(c.name));
  if (filterName) {
    toRun = categories.filter((c) => c.name === filterName);
    if (!toRun.length) throw new Error(`Catégorie introuvable: ${filterName}`);
  }

  process.stderr.write(
    `${toRun.length} catégories à traiter (${progress.completedCategories.length} déjà faites, ${already.size} dépôts connus)\n`
  );

  for (const category of toRun) {
    await installCategory(category, progress, already);
  }

  writeFileSync(
    join(CACHE, "install-summary.json"),
    JSON.stringify(
      {
        finishedAt: new Date().toISOString(),
        completedCategories: progress.completedCategories.length,
        totalCategories: categories.length,
        stats: progress.stats,
        failedCount: progress.failedRepos.length,
      },
      null,
      2
    )
  );
  process.stderr.write(
    `\nTerminé — ${progress.stats.ok} installs ok, ${progress.stats.fail} échecs, ${progress.completedCategories.length}/${categories.length} catégories\n`
  );
}

function listCategories() {
  const manifest = loadManifest();
  if (!manifest) throw new Error("manifest.json manquant");
  const categories = buildCategories(manifest.repos);
  const progress = loadProgress();
  for (const c of categories) {
    const done = progress.completedCategories.includes(c.name) ? "✓" : " ";
    const owners = c.owners ? ` (${c.owners.length} éditeurs)` : "";
    process.stdout.write(`${done} ${c.name}${owners} — ${c.repos.length} dépôts\n`);
  }
  process.stdout.write(`\nTotal: ${categories.length} catégories, ${manifest.repoCount} dépôts\n`);
}

async function main() {
  const [mode, arg] = process.argv.slice(2);
  mkdirSync(CACHE, { recursive: true });

  switch (mode) {
    case "discover-only":
      await discoverAll();
      break;
    case "list-categories":
      listCategories();
      break;
    case "install-category":
      if (!arg) throw new Error("Usage: install-category <nom>");
      await installCategories(arg);
      break;
    case "install-categories":
      await installCategories();
      break;
    case "install-only":
      await installCategories();
      break;
    default:
      process.stderr.write(`Modes: discover-only | list-categories | install-categories | install-category <nom>\n`);
      await discoverAll();
      await installCategories();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
