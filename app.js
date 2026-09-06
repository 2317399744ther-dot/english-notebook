"use strict";

/* ============ 存储 ============ */
const PAGES_KEY = "english_notebook_pages_v1";
const ACTIVE_KEY = "english_notebook_active_v1";
const OLD_PAGE_KEY = "english_notebook_page_v1";
const OLD_WORDS_KEY = "english_notebook_words_v1";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const page = $("#page");

let pages = {};       // dateKey -> innerHTML
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

/* ============ 分页加载 / 保存 ============ */
function ensureToday() {
  const t = todayKey();
  if (!pages[t]) pages[t] = "";
}

function migrateOld() {
  pages = {};
  let html = "";
  try { html = localStorage.getItem(OLD_PAGE_KEY) || ""; } catch (e) {}
  pages[todayKey()] = html;
  savePages();
}

function loadPages() {
  let raw = null;
  try { raw = localStorage.getItem(PAGES_KEY); } catch (e) {}
  if (raw) {
    try { pages = JSON.parse(raw) || {}; } catch (e) { pages = {}; }
  } else {
    migrateOld();
  }
  ensureToday();

  let active = null;
  try { active = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
  if (!active || !pages[active]) active = todayKey();
  activeDate = active;
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
  saveTimer = setTimeout(savePages, 400);
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
  pages[activeDate] = page.innerHTML;
  activeDate = key;
  const el = $("#page");
  el.classList.remove("turn-next", "turn-prev");
  void el.offsetWidth;
  el.classList.add(dir === "next" ? "turn-next" : "turn-prev");
  page.innerHTML = pages[key] || "";
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
  if (!pages[t]) pages[t] = "";
  if (activeDate !== t) goTo(t, "next");
  else updateNav();
}

/* ============ 导出 / 导入 ============ */
const EXPORT_CSS = 'body{font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;max-width:680px;margin:20px auto;padding:0 20px;color:#1d1d1f;background:#fff}' +
  'h2{margin:26px 0 8px;padding-bottom:6px;border-bottom:0.5px solid #e5e5ea;font-size:20px}' +
  'p,div{line-height:1.7}';

function allPagesHtml() {
  return dates().map(function (k) {
    const lbl = formatDateLabel(k);
    return '<h2>' + lbl.full + ' ' + lbl.week + '</h2>' + (pages[k] || '');
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
  const payload = { app: "english-notebook", version: 2, exportedAt: new Date().toISOString(), pages: pages };
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
      if (!confirm("导入将按日期合并（同名日期会被覆盖），确定继续吗？")) return;
      Object.keys(incoming).forEach(function (k) {
        pages[k] = typeof incoming[k] === "string" ? incoming[k] : "";
      });
      ensureToday();
      if (!pages[activeDate]) activeDate = todayKey();
      page.innerHTML = pages[activeDate] || "";
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
    pages[activeDate] = page.innerHTML;
    scheduleSave();
  });

  /* 翻页 */
  $("#btnPrev").addEventListener("click", prevPage);
  $("#btnNext").addEventListener("click", nextPage);
  $("#btnToday").addEventListener("click", goToday);

  /* 左右滑动翻页 */
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
    pages[activeDate] = page.innerHTML;
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
    if (act === "exportdoc") exportDoc();
    else if (act === "exportjson") exportJson();
    else if (act === "clear") clearAll();
  });
  const importLabel = document.querySelector('label[for="importJsonFile"]');
  importLabel.addEventListener("click", () => setTimeout(() => $("#moreModal").classList.add("hidden"), 0));
  $("#importJsonFile").addEventListener("change", (e) => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = "";
  });

  window.addEventListener("beforeunload", () => {
    pages[activeDate] = page.innerHTML;
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
page.innerHTML = pages[activeDate] || "";
bindEvents();
updateNav();
registerSW();
