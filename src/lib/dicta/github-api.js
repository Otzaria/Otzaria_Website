/**
 * פרימיטיבים לתקשורת מול GitHub עבור "מרחב עריכת הספרים הערוכים".
 *
 * - משיכה (read): רשימת קבצים בקריאה אחת (git trees recursive) + תוכן blob לפי sha.
 * - דחיפה (write): עדכון קובץ דרך Contents API (PUT) — דורש את ה-sha הנוכחי של הקובץ.
 *
 * אין כאן שום תלות ב-DB. ההגדרות נקראות מ-env כדי שניתן יהיה להחליף ריפו/טוקן
 * בלי שינוי קוד (push repo + token עתידים להתחלף ידנית מהראשי).
 */

import { createHash } from "crypto";

const GITHUB_API = "https://api.github.com";

const DEFAULTS = {
  pullRepo: "Otzaria/otzaria-library",
  pullBranch: "main",
  // ברירת מחדל לדחיפה: הפורק של palmoni5 (יוחלף בעתיד לראשי)
  pushRepo: "palmoni5/otzaria-library",
  pushBranch: "main",
  // נתיב הבסיס של הספרים הערוכים בתוך הריפו
  basePath: "DictaToOtzaria/ערוך/ספרים/אוצריא",
};

/**
 * קריאת הגדרות הגיטהאב של המרחב מ-env (עם ברירות מחדל).
 * @returns {{pullRepo:string, pullBranch:string, pushRepo:string, pushBranch:string, basePath:string, token:(string|null)}}
 */
export function getLibraryGitHubConfig() {
  return {
    pullRepo: process.env.DICTA_LIBRARY_PULL_REPO || DEFAULTS.pullRepo,
    pullBranch: process.env.DICTA_LIBRARY_PULL_BRANCH || DEFAULTS.pullBranch,
    pushRepo: process.env.DICTA_LIBRARY_PUSH_REPO || DEFAULTS.pushRepo,
    pushBranch: process.env.DICTA_LIBRARY_PUSH_BRANCH || DEFAULTS.pushBranch,
    basePath: process.env.DICTA_LIBRARY_BASE_PATH || DEFAULTS.basePath,
    token: process.env.DICTA_LIBRARY_GITHUB_TOKEN || null,
  };
}

function ghHeaders(token, extra = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "otzaria-library-editor",
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function ghFetch(url, { token, method = "GET", body, fetchImpl = fetch, redirect = "follow", timeoutMs } = {}) {
  const resp = await fetchImpl(url, {
    method,
    headers: ghHeaders(token, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
    redirect,
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });

  if (!resp.ok) {
    let detail = "";
    try {
      const j = await resp.json();
      detail = j?.message ? ` - ${j.message}` : "";
    } catch {
      /* ignore */
    }
    const err = new Error(`GitHub API ${method} ${resp.status}${detail}`);
    err.status = resp.status;
    err.retryAfter = resp.headers?.get?.("retry-after") ?? null;
    throw err;
  }
  return resp.json();
}

// ====================== Base64 (UTF-8 safe) ======================

function encodeBase64(str) {
  return Buffer.from(str, "utf-8").toString("base64");
}

function decodeBase64(b64) {
  // תוכן blob מ-GitHub עשוי לכלול שורות חדשות בתוך ה-base64
  return Buffer.from(String(b64).replace(/\s/g, ""), "base64").toString("utf-8");
}

// ====================== פתרון tree sha של נתיב הבסיס ======================

function splitPath(p) {
  return p.split("/").map((s) => s.trim()).filter(Boolean);
}

/**
 * מוצא את ה-tree sha של תיקיית הבסיס בלי להוריד את כל עץ הריפו.
 * הולך מדרגת השורש כלפי מטה, סגמנט-סגמנט. (~4 קריאות)
 */
async function resolveBaseTreeSha({ repo, branch, basePath, token }) {
  const branchInfo = await ghFetch(
    `${GITHUB_API}/repos/${repo}/branches/${encodeURIComponent(branch)}`,
    { token }
  );
  let treeSha = branchInfo?.commit?.commit?.tree?.sha;
  if (!treeSha) throw new Error("לא נמצא tree sha של הענף");

  for (const segment of splitPath(basePath)) {
    const tree = await ghFetch(`${GITHUB_API}/repos/${repo}/git/trees/${treeSha}`, { token });
    // git trees API מחזיר שדה path (לא name כמו ב-Contents API); ברמה לא-רקורסיבית זה שם הבסיס
    const child = (tree.tree || []).find((t) => t.type === "tree" && t.path === segment);
    if (!child) throw new Error(`לא נמצאה תיקייה "${segment}" בנתיב הבסיס`);
    treeSha = child.sha;
  }
  return treeSha;
}

/**
 * ליבה: כל הקבצים בעלי הסיומות המבוקשות תחת תיקיית הבסיס בריפו/ענף נתון,
 * בקריאה אחת (recursive tree). ברירת המחדל היא txt בלבד (התנהגות היסטורית).
 *
 * ההשוואה לסיומת היא תלוית-רישיות כברירת מחדל (כמו בהתנהגות ההיסטורית);
 * caseInsensitiveExtensions=true מאפשר התאמה ללא תלות ברישיות.
 */
async function listFilesInRepo({
  repo,
  branch,
  basePath,
  token,
  extensions = [".txt"],
  caseInsensitiveExtensions = false,
}) {
  const exts = caseInsensitiveExtensions ? extensions.map((e) => e.toLowerCase()) : extensions;
  const baseTreeSha = await resolveBaseTreeSha({ repo, branch, basePath, token });
  const data = await ghFetch(`${GITHUB_API}/repos/${repo}/git/trees/${baseTreeSha}?recursive=1`, { token });
  if (data.truncated) {
    throw new Error("רשימת הקבצים מגיטהאב נחתכה (truncated) — יש לפצל את הסריקה");
  }
  return (data.tree || [])
    .filter((t) => {
      if (t.type !== "blob") return false;
      const candidate = caseInsensitiveExtensions ? t.path.toLowerCase() : t.path;
      return exts.some((e) => candidate.endsWith(e));
    })
    .map((t) => ({ path: t.path, sha: t.sha, size: t.size }));
}

/**
 * רשימת קבצים גנרית תחת תיקיית בסיס כלשהי בריפו המשיכה.
 * נועד לצרכנים שאינם "מרחב העריכה" (למשל תיקיית MoreBooks של הספרים הפרטיים).
 *
 * @param {object} opts
 * @param {string} opts.basePath      נתיב הבסיס בתוך הריפו (למשל "MoreBooks")
 * @param {string[]} [opts.extensions] סיומות לסינון (ברירת מחדל: [".txt"])
 * @param {string} [opts.repo]        ברירת מחדל: ריפו המשיכה מה-config
 * @param {string} [opts.branch]      ברירת מחדל: ענף המשיכה מה-config
 * @returns {Promise<Array<{path:string, sha:string, size:number}>>} path יחסי ל-basePath
 *
 * כאן ההשוואה לסיומת אינה תלוית-רישיות (קבצי המשתמשים מגיעים גם כ-".PDF" וכד').
 */
export async function listRepoFiles({ basePath, extensions = [".txt"], repo, branch } = {}, config = getLibraryGitHubConfig()) {
  if (!basePath) throw new Error("חסר basePath לרשימת קבצים מגיטהאב");
  return listFilesInRepo({
    repo: repo || config.pullRepo,
    branch: branch || config.pullBranch,
    basePath,
    token: config.token,
    extensions,
    caseInsensitiveExtensions: true,
  });
}

/**
 * קבצי ה-txt בריפו המשיכה (origin).
 * @returns {Promise<Array<{path:string, sha:string, size:number}>>}
 *   path = יחסי לתיקיית הבסיס (מזהה הספר), למשל "הלכה/אחרונים/דרך החיים.txt"
 */
export async function listLibraryFiles(config = getLibraryGitHubConfig()) {
  const { pullRepo: repo, pullBranch: branch, basePath, token } = config;
  return listFilesInRepo({ repo, branch, basePath, token });
}

/** קבצי ה-txt בריפו הדחיפה (לזיהוי שינוי כשהוא שונה מריפו המשיכה). */
export async function listPushFiles(config = getLibraryGitHubConfig()) {
  const { pushRepo: repo, pushBranch: branch, basePath, token } = config;
  return listFilesInRepo({ repo, branch, basePath, token });
}

// ====================== git blob sha (לזיהוי שינוי מקומי) ======================

/** מחשב את ה-blob sha של git עבור תוכן (sha1 של "blob <bytelen>\0<content>"). */
export function gitBlobSha(content) {
  const data = Buffer.from(String(content == null ? "" : content), "utf-8");
  const header = Buffer.from(`blob ${data.length}\0`, "utf-8");
  return createHash("sha1").update(Buffer.concat([header, data])).digest("hex");
}

// ====================== Git Data API — commit אחד לאצווה ======================

/** ראש הענף: sha של הקומיט ושל ה-tree. */
async function getBranchHead({ repo, branch, token }) {
  const info = await ghFetch(`${GITHUB_API}/repos/${repo}/branches/${encodeURIComponent(branch)}`, { token });
  return { commitSha: info?.commit?.sha, treeSha: info?.commit?.commit?.tree?.sha };
}

/**
 * דוחף אצווה של קבצים ב-commit יחיד (blobs מוטמעים ב-tree, מעל base_tree).
 * @param {Array<{fullPath:string, content:string}>} files נתיב מלא בריפו + תוכן
 * @returns {Promise<{commitSha:string, treeSha:string}>}
 */
export async function commitBatch({ files, message }, config = getLibraryGitHubConfig()) {
  const { pushRepo: repo, pushBranch: branch, token } = config;
  if (!token) throw new Error("חסר טוקן GitHub (DICTA_LIBRARY_GITHUB_TOKEN) לדחיפה");
  if (!files?.length) return { commitSha: null, treeSha: null };

  const head = await getBranchHead({ repo, branch, token });
  if (!head.commitSha || !head.treeSha) throw new Error("לא נמצא ראש הענף בריפו הדחיפה");

  const tree = files.map((f) => ({ path: f.fullPath, mode: "100644", type: "blob", content: f.content }));
  const newTree = await ghFetch(`${GITHUB_API}/repos/${repo}/git/trees`, {
    token, method: "POST", body: { base_tree: head.treeSha, tree },
  });

  const commit = await ghFetch(`${GITHUB_API}/repos/${repo}/git/commits`, {
    token, method: "POST", body: { message, tree: newTree.sha, parents: [head.commitSha] },
  });

  await ghFetch(`${GITHUB_API}/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    token, method: "PATCH", body: { sha: commit.sha, force: false },
  });

  return { commitSha: commit.sha, treeSha: newTree.sha };
}

/**
 * מוריד תוכן של קובץ לפי blob sha (מבטיח התאמה מדויקת ל-sha שנשמר).
 */
export async function fetchBlobContent(sha, config = getLibraryGitHubConfig()) {
  const { pullRepo: repo, token } = config;
  const blob = await ghFetch(`${GITHUB_API}/repos/${repo}/git/blobs/${sha}`, { token });
  return decodeBase64(blob.content);
}

/**
 * מוריד תוכן קובץ דרך raw.githubusercontent (ללא טוקן, ללא rate-limit).
 * מתאים למשיכה ההמונית של תוכן ספרים. ה-sha עצמו נלקח מרשימת ה-tree.
 */
export async function fetchRawContent(relativePath, config = getLibraryGitHubConfig()) {
  const { pullRepo: repo, pullBranch: branch, basePath } = config;
  const url = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${encodeGitHubPath(`${basePath}/${relativePath}`)}`;
  const resp = await fetch(url, { headers: { "User-Agent": "otzaria-library-editor" } });
  if (!resp.ok) throw new Error(`raw fetch ${resp.status} עבור ${relativePath}`);
  return resp.text();
}

/**
 * קורא את הקובץ מריפו הדחיפה (כדי לקבל את ה-sha והתוכן העדכניים שם לפני PUT).
 * מחזיר null אם הקובץ לא קיים שם עדיין.
 * @returns {Promise<{content:string, sha:string}|null>}
 */
export async function getPushFile(relativePath, config = getLibraryGitHubConfig()) {
  const { pushRepo: repo, pushBranch: branch, basePath, token } = config;
  const fullPath = `${basePath}/${relativePath}`;
  const url = `${GITHUB_API}/repos/${repo}/contents/${encodeGitHubPath(fullPath)}?ref=${encodeURIComponent(branch)}`;
  try {
    const data = await ghFetch(url, { token });
    return { content: decodeBase64(data.content), sha: data.sha };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * דוחף תוכן חדש לקובץ בריפו הדחיפה (יצירה או עדכון).
 * @param {object} opts
 * @param {string} opts.relativePath  נתיב יחסי לתיקיית הבסיס
 * @param {string} opts.content       התוכן החדש המלא
 * @param {string} [opts.sha]         ה-sha הנוכחי של הקובץ בריפו הדחיפה (חובה לעדכון; להשמיט ליצירה)
 * @param {string} opts.message       הודעת קומיט
 * @param {{name:string, email:string}} [opts.author]
 * @returns {Promise<{contentSha:string, commitSha:string}>}
 */
export async function putLibraryFile({ relativePath, content, sha, message, author }, config = getLibraryGitHubConfig()) {
  const { pushRepo: repo, pushBranch: branch, basePath, token } = config;
  if (!token) throw new Error("חסר טוקן GitHub (DICTA_LIBRARY_GITHUB_TOKEN) לדחיפה");

  const fullPath = `${basePath}/${relativePath}`;
  const url = `${GITHUB_API}/repos/${repo}/contents/${encodeGitHubPath(fullPath)}`;

  const body = {
    message,
    content: encodeBase64(content),
    branch,
  };
  if (sha) body.sha = sha;
  if (author?.name && author?.email) {
    body.author = { name: author.name, email: author.email };
    body.committer = { name: author.name, email: author.email };
  }

  const data = await ghFetch(url, { token, method: "PUT", body });
  return { contentSha: data.content?.sha, commitSha: data.commit?.sha };
}

/**
 * קידוד נתיב ל-URL של GitHub: מקודד כל סגמנט אך משאיר את הסלאשים.
 */
function encodeGitHubPath(p) {
  return p.split("/").map(encodeURIComponent).join("/");
}

/** עזר: כותרת תצוגה מנתיב יחסי (הסרת סיומת .txt) */
export function pathToTitle(relativePath) {
  return relativePath.replace(/\.txt$/i, "");
}

/** עזר: קטגוריה = הסגמנט הראשון בנתיב */
export function pathToCategory(relativePath) {
  return relativePath.split("/")[0] || "";
}

// ====================== לקוח ריפו כללי (משמש גם את תיקוני הטקסט) ======================

/**
 * לקוח ממוקד-ריפו מעל ghFetch, עם fetch מוזרק (בדיקות) ו-timeout לכל קריאה.
 * redirect=error: יעד הכתיבה נקבע בהגדרה בלבד ולא נגרר להפניה.
 * @param {{repo:string, token?:string, fetchImpl?:Function, timeoutMs?:number, apiBase?:string}} opts
 */
export function createRepoClient({ repo, token = null, fetchImpl = fetch, timeoutMs = 20_000, apiBase = GITHUB_API }) {
  const base = `${apiBase}/repos/${repo}`;
  const call = (path, opts = {}) => ghFetch(`${base}${path}`, { token, fetchImpl, timeoutMs, redirect: "error", ...opts });
  const notFoundAsNull = async (p) => {
    try {
      return await p;
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  };

  return {
    repo,
    fetchImpl,
    async getBranchHead(branch) {
      const info = await call(`/branches/${encodeURIComponent(branch)}`);
      return { commitSha: info?.commit?.sha, treeSha: info?.commit?.commit?.tree?.sha };
    },
    async getRef(branch) {
      const r = await notFoundAsNull(call(`/git/ref/heads/${encodeGitHubPath(branch)}`));
      return r?.object?.sha ? { sha: r.object.sha } : null;
    },
    async getCommit(sha) {
      const c = await call(`/git/commits/${sha}`);
      return { sha: c.sha, message: c.message, treeSha: c.tree?.sha, parents: (c.parents || []).map((p) => p.sha) };
    },
    /** רשימת תיקייה ב-ref נתון (שמות + blob sha, בלי תוכן). null אם לא קיימת. */
    async listDir(dirPath, ref) {
      const data = await notFoundAsNull(call(`/contents/${encodeGitHubPath(dirPath)}?ref=${encodeURIComponent(ref)}`));
      return Array.isArray(data) ? data.map((e) => ({ name: e.name, path: e.path, sha: e.sha, type: e.type, size: e.size })) : null;
    },
    async getFileMeta(filePath, ref) {
      const data = await notFoundAsNull(call(`/contents/${encodeGitHubPath(filePath)}?ref=${encodeURIComponent(ref)}`));
      return data && !Array.isArray(data) && data.type === "file" ? { sha: data.sha, size: data.size } : null;
    },
    /** בתי ה-blob הגולמיים (Buffer) — בלי פענוח, כדי לשמר קידוד/BOM/CRLF. */
    async getBlob(sha) {
      const blob = await call(`/git/blobs/${sha}`);
      return Buffer.from(String(blob.content || "").replace(/\s/g, ""), "base64");
    },
    async createTree(baseTreeSha, entries) {
      const t = await call(`/git/trees`, { method: "POST", body: { base_tree: baseTreeSha, tree: entries } });
      return { sha: t.sha };
    },
    async createBlob(buffer) {
      const b = await call(`/git/blobs`, { method: "POST", body: { content: buffer.toString("base64"), encoding: "base64" } });
      return { sha: b.sha };
    },
    async createCommit({ message, treeSha, parents }) {
      const c = await call(`/git/commits`, { method: "POST", body: { message, tree: treeSha, parents } });
      return { sha: c.sha };
    },
    /** עדכון ענף בלי force — 422 כשהענף התקדם. */
    async updateRef(branch, sha) {
      await call(`/git/refs/heads/${encodeGitHubPath(branch)}`, { method: "PATCH", body: { sha, force: false } });
    },
    async createRef(branch, sha) {
      await call(`/git/refs`, { method: "POST", body: { ref: `refs/heads/${branch}`, sha } });
    },
    async listCommits({ sha, path, perPage = 30 }) {
      const q = new URLSearchParams({ sha, per_page: String(perPage) });
      if (path) q.set("path", path);
      const list = await call(`/commits?${q.toString()}`);
      return (list || []).map((c) => ({ sha: c.sha, message: c.commit?.message || "" }));
    },
    async createPull({ title, body, head, base: baseBranch }) {
      const pr = await call(`/pulls`, { method: "POST", body: { title, body, head, base: baseBranch, maintainer_can_modify: true } });
      return { number: pr.number, url: pr.html_url, state: pr.state, merged: Boolean(pr.merged_at) };
    },
    async findPullByHead(owner, branch) {
      const q = new URLSearchParams({ head: `${owner}:${branch}`, state: "all", per_page: "5" });
      const list = await call(`/pulls?${q.toString()}`);
      const pr = (list || [])[0];
      return pr ? { number: pr.number, url: pr.html_url, state: pr.state, merged: Boolean(pr.merged_at), mergeCommitSha: pr.merge_commit_sha || null } : null;
    },
    async getPull(number) {
      const pr = await call(`/pulls/${Number(number)}`);
      return { number: pr.number, url: pr.html_url, state: pr.state, merged: Boolean(pr.merged), mergeCommitSha: pr.merge_commit_sha || null };
    },
  };
}
