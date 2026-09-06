"use strict";

/* ============ 存储 ============ */
const PAGES_KEY = "english_notebook_pages_v1";
const ACTIVE_KEY = "english_notebook_active_v1";
const SYNC_KEY = "english_notebook_sync_v1";
const OLD_PAGE_KEY = "english_notebook_page_v1";
const OLD_WORDS_KEY = "english_notebook_words_v1";
const DEFAULT_REPO = "2317399744ther-dot/english-notebook";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const page = $("#page");

let pages = {};       // dateKey -> { html, updatedAt }
let activeDate = null;
let saveTimer = null;

/* ============ 日期工具 ============ */
function dateKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function todayKey() { return dateKey(new Date()); }
function parseKey(k) {
  const p = k.split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
function formatDateLabel(k) {
  const d = parseKey(k);
  const main = (d.getMonth() + 1) + "月" + d.getDate() + "日";
  const week = "星期" + "日一二三四五六".charAt(d.getDay());
  return { main: main, week: week, full: d.getFullYear() + "年" + main };
}
function dates() { return Object.keys(pages).sort(); }

/* ============ 工具 ============ */
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 2200);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============ 数据模型 ============ */
function normalizePage(v) {
  const now = Date.now();
  if (typeof v === "string") return { html: v, updatedAt: now };
  if (v && typeof v === "object" && typeof v.html === "string") return { html: v.html, updatedAt: v.updatedAt || now };
  return { html: "", updatedAt: now };
}

function ensureToday() {
  const t = todayKey();
  if (!pages[t]) pages[t] = { html: "", updatedAt: Date.now() };
}

function migrateOld() {
  pages = {};
  let html = "";
  try { html = localStorage.getItem(OLD_PAGE_KEY) || ""; } catch (e) {}
  pages[todayKey()] = { html: html, updatedAt: Date.now() };
  savePages();
}

function loadPages() {
  let raw = null;
  try { raw = localStorage.getItem(PAGES_KEY); } catch (e) {}
  if (raw) {
    try {
      const parsed = JSON.parse(raw) || {};
      const out = {};
      Object.keys(parsed).forEach(k => { out[k] = normalizePage(parsed[k]); });
      pages = out;
    } catch (e) { pages = {}; }
  } else {
    migrateOld();
    raw = null;
  }
  ensureToday();

  let active = null;
  try { active = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
  if (!active || !pages[active]) active = todayKey();
  activeDate = active;

  if (raw) savePages();
}

function savePages() {
  try {
    localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
  } catch (e) {
    toast("保存失败：存储空间不足");
  }
  updateCounts();
}

function saveActive() {
  try { localStorage.setItem(ACTIVE_KEY, activeDate); } catch (e) {}
}

function scheduleSave() {
  $("#coverSub").textContent = "保存中…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    savePages();
    const cfg = getSyncConfig();
    if (cfg.auto && cfg.token) syncNow(false);
  }, 600);
}

function updateCounts() {
  const ds = dates();
  const i = ds.indexOf(activeDate);
  $("#coverSub").textContent = "第 " + (i + 1) + " / " + ds.length + " 页";
}

function updateNav() {
  const ds = dates();
  const i = ds.indexOf(activeDate);
  const isToday = activeDate === todayKey();
  const lbl = formatDateLabel(activeDate);
  $("#dateMain").textContent = isToday ? "今天" : lbl.main;
  $("#dateWeek").textContent = isToday ? (lbl.main + " · " + lbl.week) : (lbl.full + " · " + lbl.week);
  $("#btnPrev").disabled = i <= 0;
  $("#btnNext").disabled = i >= ds.length - 1 || i === -1;
  updateCounts();
}

function goTo(key, dir) {
  pages[activeDate].html = page.innerHTML;
  pages[activeDate].updatedAt = Date.now();
  activeDate = key;
  const el = $("#page");
  el.classList.remove("turn-next", "turn-prev");
  void el.offsetWidth;
  el.classList.add(dir === "next" ? "turn-next" : "turn-prev");
  page.innerHTML = pages[key].html;
  savePages();
  saveActive();
  updateNav();
}

function prevPage() {
  const ds = dates();
  const i = ds.indexOf(activeDate);
  if (i > 0) goTo(ds[i - 1], "prev");
}

function nextPage() {
  const ds = dates();
  const i = ds.indexOf(activeDate);
  if (i >= 0 && i < ds.length - 1) goTo(ds[i + 1], "next");
}

function goToday() {
  const t = todayKey();
  if (!pages[t]) pages[t] = { html: "", updatedAt: Date.now() };
  if (activeDate !== t) goTo(t, "next");
  else updateNav();
}

/* ============ 云同步 ============ */
function getSyncConfig() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem(SYNC_KEY) || "null"); } catch (e) {}
  return Object.assign({ token: "", repo: DEFAULT_REPO, branch: "main", path: "data/notes.json", auto: true }, c || {});
}
function setSyncConfig(c) {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(c)); } catch (e) {}
}
function saveSyncConfig() {
  setSyncConfig({
    token: $("#syncToken").value.trim(),
    repo: $("#syncRepo").value.trim() || DEFAULT_REPO,
    branch: "main",
    path: "data/notes.json",
    auto: $("#syncAuto").checked,
  });
}
function setSyncStatus(m) { $("#syncStatus").textContent = m; }

function openSync() {
  const c = getSyncConfig();
  $("#syncToken").value = c.token || "";
  $("#syncRepo").value = c.repo || DEFAULT_REPO;
  $("#syncAuto").checked = !!c.auto;
  setSyncStatus(c.token ? "" : "请先填写 GitHub Token");
  $("#syncModal").classList.remove("hidden");
}
function closeSync() {
  saveSyncConfig();
  $("#syncModal").classList.add("hidden");
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64ToUtf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

function mergePages(a, b) {
  const out = {};
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  keys.forEach(k => {
    const av = a[k], bv = b[k];
    const at = (av && av.updatedAt) || 0;
    const bt = (bv && bv.updatedAt) || 0;
    out[k] = (bt > at) ? bv : av;
  });
  return out;
}

async function githubGetFile(cfg) {
  const url = "https://api.github.com/repos/" + cfg.repo + "/contents/" + cfg.path + "?ref=" + cfg.branch + "&_=" + Date.now();
  const r = await fetch(url, { headers: { Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json" }, cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) {
    let m = "HTTP " + r.status;
    try { const j = await r.json(); if (j && j.message) m = j.message + " (HTTP " + r.status + ")"; } catch (e) {}
    throw new Error(m);
  }
  const j = await r.json();
  return { sha: j.sha, content: j.content };
}

async function githubPutFile(cfg, sha, text) {
  const url = "https://api.github.com/repos/" + cfg.repo + "/contents/" + cfg.path;
  const body = { message: "sync notes", content: utf8ToB64(text), branch: cfg.branch };
  if (sha) body.sha = sha;
  const r = await fetch(url, {
    method: "PUT",
    headers: { Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) {
    let m = "HTTP " + r.status;
    try { const j = await r.json(); if (j && j.message) m = j.message + " (HTTP " + r.status + ")"; } catch (e) {}
    throw new Error(m);
  }
}

let syncing = false;
let syncQueued = false;

async function syncNow(resetDom) {
  const cfg = getSyncConfig();
  if (!cfg.token) { openSync(); setSyncStatus("请先填写 GitHub Token"); return; }
  if (syncing) { syncQueued = true; return; }
  syncing = true;
  try {
    setSyncStatus("同步中…");
    let remote = await githubGetFile(cfg);
    for (let attempt = 0; attempt < 3; attempt++) {
      let remotePages = {};
      if (remote) {
        const data = JSON.parse(b64ToUtf8(remote.content));
        if (data && data.pages && typeof data.pages === "object") remotePages = data.pages;
      }
      const norm = {};
      Object.keys(remotePages).forEach(k => { norm[k] = normalizePage(remotePages[k]); });
      pages = mergePages(pages, norm);
      const payload = JSON.stringify({ app: "english-notebook", version: 3, updatedAt: Date.now(), pages: pages });
      try {
        await githubPutFile(cfg, remote ? remote.sha : null, payload);
        break;
      } catch (e) {
        if (attempt < 2 && /409|conflict|does not match/i.test(e.message || "")) {
          await sleep(300);
          remote = await githubGetFile(cfg);
          continue;
        }
        throw e;
      }
    }
    savePages();
    if (resetDom) {
      const h = pages[activeDate] ? pages[activeDate].html : "";
      if (h !== page.innerHTML) page.innerHTML = h;
      updateNav();
      toast("已同步");
    }
    setSyncStatus("已同步 " + new Date().toLocaleTimeString());
  } catch (e) {
    setSyncStatus("同步失败：" + (e && e.message ? e.message : "网络错误"));
    if (resetDom) toast("同步失败");
  } finally {
    syncing = false;
    if (syncQueued) { syncQueued = false; syncNow(resetDom); }
  }
}

async function pushNow() {
  const cfg = getSyncConfig();
  if (!cfg.token) return;
  try {
    const remote = await githubGetFile(cfg);
    const payload = JSON.stringify({ app: "english-notebook", version: 3, updatedAt: Date.now(), pages: pages });
    await githubPutFile(cfg, remote ? remote.sha : null, payload);
  } catch (e) {}
}

/* ============ 导出 / 导入 ============ */
const EXPORT_CSS = 'body{font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;max-width:680px;margin:20px auto;padding:0 20px;color:#1d1d1f;background:#fff}' +
  'h2{margin:26px 0 8px;padding-bottom:6px;border-bottom:0.5px solid #e5e5ea;font-size:20px}' +
  'p,div{line-height:1.7}';

function allPagesHtml() {
  return dates().map(function (k) {
    const lbl = formatDateLabel(k);
    return '<h2>' + lbl.full + ' ' + lbl.week + '</h2>' + (pages[k].html || '');
  }).join("");
}

function exportDoc() {
  const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8"><title>英语笔记本</title><style>' + EXPORT_CSS + '</style></head>' +
    '<body>' + allPagesHtml() + '</body></html>';
  download("英语笔记本_" + todayStr() + ".doc", html, "application/msword");
  toast("已导出 Word 文档");
}

function exportJson() {
  const payload = { app: "english-notebook", version: 3, exportedAt: new Date().toISOString(), pages: pages };
  download("英语笔记本_" + todayStr() + ".json", JSON.stringify(payload, null, 2), "application/json");
  toast("已导出备份");
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const incoming = data && data.pages && typeof data.pages === "object" ? data.pages : null;
      if (!incoming) { toast("导入失败：备份格式不正确"); return; }
      const norm = {};
      Object.keys(incoming).forEach(k => { norm[k] = normalizePage(incoming[k]); });
      pages = mergePages(pages, norm);
      ensureToday();
      if (!pages[activeDate]) activeDate = todayKey();
      page.innerHTML = pages[activeDate].html;
      savePages();
      saveActive();
      updateNav();
      toast("已导入");
    } catch (e) {
      toast("导入失败：文件格式不正确");
    }
  };
  reader.readAsText(file);
}

function clearAll() {
  if (confirm("确定要清空所有日期的全部内容吗？建议先「导出备份」。")) {
    pages = {};
    ensureToday();
    activeDate = todayKey();
    page.innerHTML = "";
    savePages();
    saveActive();
    updateNav();
    toast("已清空");
    pushNow();
  }
}

/* ============ 工具栏 ============ */
function updateToolbar() {
  $$(".tb-btn[data-cmd]").forEach(b => {
    const cmd = b.dataset.cmd;
    if (cmd === "bold" || cmd === "italic" || cmd === "underline" || cmd === "strikeThrough") {
      let on = false;
      try { on = document.queryCommandState(cmd); } catch (e) {}
      b.classList.toggle("active", on);
    }
  });
}

/* ============ 事件绑定 ============ */
function bindEvents() {
  page.addEventListener("input", () => {
    pages[activeDate].html = page.innerHTML;
    pages[activeDate].updatedAt = Date.now();
    scheduleSave();
  });

  /* 翻页 */
  $("#btnPrev").addEventListener("click", prevPage);
  $("#btnNext").addEventListener("click", nextPage);
  $("#btnToday").addEventListener("click", goToday);

  let touchX = 0, touchY = 0;
  $(".paper").addEventListener("touchstart", (e) => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  $(".paper").addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 80 && Math.abs(dy) < 40) {
      if (dx < 0) nextPage(); else prevPage();
    }
  }, { passive: true });

  /* 工具栏 */
  const toolbar = $("#toolbar");
  toolbar.addEventListener("mousedown", (e) => {
    if (e.target.closest(".tb-btn")) e.preventDefault();
  });
  toolbar.addEventListener("click", (e) => {
    const b = e.target.closest(".tb-btn");
    if (!b) return;
    const cmd = b.dataset.cmd;
    if (!cmd) return;
    document.execCommand(cmd, false, b.dataset.val || null);
    updateToolbar();
    pages[activeDate].html = page.innerHTML;
    pages[activeDate].updatedAt = Date.now();
    scheduleSave();
  });

  /* 更多菜单 */
  $("#btnMore").addEventListener("click", () => $("#moreModal").classList.remove("hidden"));
  $("#moreBackdrop").addEventListener("click", () => $("#moreModal").classList.add("hidden"));
  $("#moreModal").addEventListener("click", (e) => {
    const item = e.target.closest("[data-action]");
    if (!item) return;
    $("#moreModal").classList.add("hidden");
    const act = item.dataset.action;
    if (act === "sync") openSync();
    else if (act === "exportdoc") exportDoc();
    else if (act === "exportjson") exportJson();
    else if (act === "clear") clearAll();
  });
  const importLabel = document.querySelector('label[for="importJsonFile"]');
  importLabel.addEventListener("click", () => setTimeout(() => $("#moreModal").classList.add("hidden"), 0));
  $("#importJsonFile").addEventListener("change", (e) => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = "";
  });

  /* 云同步 */
  $("#btnCloseSync").addEventListener("click", closeSync);
  $("#syncBackdrop").addEventListener("click", closeSync);
  $("#btnSyncNow").addEventListener("click", () => { saveSyncConfig(); syncNow(true); });

  window.addEventListener("beforeunload", () => {
    pages[activeDate].html = page.innerHTML;
    pages[activeDate].updatedAt = Date.now();
    savePages();
  });
}

/* ============ PWA ============ */
function registerSW() {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

loadPages();
page.innerHTML = pages[activeDate].html;
bindEvents();
updateNav();
registerSW();
if (getSyncConfig().token) syncNow(true);
