// あさログ（Web版）
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const setText = (s, v) => { const e = document.querySelector(s); if (e) e.textContent = v; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (t) => { if (!/^\d{1,2}:\d{2}$/.test(t || "")) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmtDur = (min) => min == null ? "–" : `${Math.floor(min / 60)}時間${pad(min % 60)}分`;
const fmtClock = (min) => { if (min == null) return "–"; min = ((Math.round(min) % 1440) + 1440) % 1440; return `${Math.floor(min / 60)}:${pad(min % 60)}`; };
const sleepMinutes = (bed, wake) => { const b = toMin(bed), w = toMin(wake); if (b == null || w == null) return null; let d = w - b; if (d <= 0) d += 1440; return d; };
const WIN_START = 21 * 60, WIN_LEN = 14 * 60;
const pos = (t) => { const m = toMin(t); if (m == null) return null; return (((m - WIN_START) % 1440) + 1440) % 1440; };
const pct = (p) => Math.max(0, Math.min(100, (p / WIN_LEN) * 100));
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const dayLabel = (s) => { const [y, m, d] = s.split("-").map(Number); const dt = new Date(y, m - 1, d); return `${m}月${d}日（${WEEK[dt.getDay()]}）`; };
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const normTime = (t) => /^\d{1,2}:\d{2}$/.test(t || "") ? t.padStart(5, "0") : "";

// ---------- option sets ----------
const MAKERS = [["self", "自分"], ["family", "家族"], ["partner", "パートナー"], ["mate", "友人・同居人"], ["shop", "お店・外食"], ["bought", "買ったもの"], ["other", "その他"]];
const MAKER_LABEL = { self: "自分で作った", family: "家族がつくった", partner: "パートナーがつくった", mate: "友人・同居人がつくった", shop: "お店・外食", bought: "買ったもの", other: "その他" };
const MAKER_COLOR = { self: "var(--yolk)", family: "#E07B5A", partner: "#C46BA5", mate: "#5AA6A0", shop: "var(--night)", bought: "#8A93A6", other: "#C9CED8" };
const TAG_GROUPS = [
  ["主食", ["ごはん", "パン", "おにぎり", "麺", "シリアル", "グラノーラ", "オートミール"]],
  ["おかず", ["卵", "納豆", "魚", "肉", "豆腐", "サラダ", "野菜", "味噌汁", "スープ", "漬物"]],
  ["そのほか", ["ヨーグルト", "フルーツ", "チーズ", "甘いもの"]],
  ["飲みもの", ["コーヒー", "紅茶", "緑茶", "牛乳", "豆乳", "ジュース", "スムージー", "プロテイン"]],
  ["スタイル", ["和食", "洋食", "中華", "作り置き", "時短", "残りもの"]],
];
const BALANCE = [["staple", "主食"], ["main", "主菜（たんぱく質）"], ["side", "副菜（野菜）"], ["soup", "汁物"], ["fruit", "果物"], ["dairy", "乳製品"]];
const BAL_LABEL = Object.fromEntries(BALANCE.map(([v, l]) => [v, l.replace(/（.*）/, "")]));
const FEELS = [["5", "とてもすっきり"], ["4", "すっきり"], ["3", "ふつう"], ["2", "ねむい"], ["1", "とてもねむい"]];
const PLACES = [["home", "自宅"], ["work", "職場・学校"], ["cafe", "カフェ・お店"], ["move", "移動中"], ["other", "その他"]];
const WITHS = [["alone", "ひとり"], ["family", "家族"], ["partner", "パートナー"], ["friend", "友人"], ["colleague", "同僚・仲間"]];
const DURS = [["lt5", "5分未満"], ["5-15", "5〜15分"], ["15-30", "15〜30分"], ["gt30", "30分以上"]];
const SATS = [["1", "★1"], ["2", "★2"], ["3", "★3"], ["4", "★4"], ["5", "★5"]];
const MOODS = [["genki", "元気"], ["calm", "おだやか"], ["normal", "ふつう"], ["tired", "疲れぎみ"], ["rush", "バタバタ"]];
const LBL = (list) => Object.fromEntries(list);
const FEEL_LABEL = LBL(FEELS), PLACE_LABEL = LBL(PLACES), WITH_LABEL = LBL(WITHS), DUR_LABEL = LBL(DURS), MOOD_LABEL = LBL(MOODS);
const COLORS = ["#E07B5A", "#F2AE1C", "#6BAF5B", "#3FA3A0", "#4E7BD1", "#8467C9", "#C46BA5", "#6A7386"];
const STATUS_LABEL = { active: "参加中", pending: "承認待ち", blocked: "停止中", owner: "管理者" };

function chipGroup(box, options, multi, small) {
  const sel = new Set();
  options.forEach(([v, l]) => {
    const b = el("button", "chip" + (small ? " sm" : ""), l); b.type = "button"; b.dataset.v = v; b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => { if (multi) { sel.has(v) ? sel.delete(v) : sel.add(v); } else { const had = sel.has(v); sel.clear(); if (!had) sel.add(v); } sync(); });
    box.appendChild(b);
  });
  function sync() { box.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", String(sel.has(b.dataset.v)))); }
  return {
    get: () => multi ? [...sel] : ([...sel][0] || ""),
    set(v) { sel.clear(); (Array.isArray(v) ? v : (v ? [v] : [])).forEach(x => { if (options.some(o => o[0] === x)) sel.add(x); }); sync(); },
  };
}
const G = {
  maker: chipGroup($("#g-maker"), MAKERS, false),
  balance: chipGroup($("#g-balance"), BALANCE, true),
  feel: chipGroup($("#g-feel"), FEELS, false),
  place: chipGroup($("#g-place"), PLACES, false),
  with: chipGroup($("#g-with"), WITHS, false),
  dur: chipGroup($("#g-dur"), DURS, false),
  sat: chipGroup($("#g-sat"), SATS, false),
  mood: chipGroup($("#g-mood"), MOODS, false),
};
const tagGroups = TAG_GROUPS.map(([name, list]) => {
  const wrap = $("#g-tags"); wrap.appendChild(el("div", "sublbl", name));
  const box = el("div", "chips"); box.style.marginBottom = "6px"; wrap.appendChild(box);
  return chipGroup(box, list.map(t => [t, t]), true, true);
});
const tags = { get: () => tagGroups.flatMap(g => g.get()), set: (v) => tagGroups.forEach(g => g.set(v || [])) };

// ---------- state ----------
let sb = null;
let session = null, uid = null, me = null, config = { approval: "auto", group_name: "", welcome: "" };
let profiles = {};      // id -> profile (those this viewer may see)
let posts = [];         // visible posts (own incl. private + others' shared)
let likes = {};         // post_id -> Set(user_id)
let photoUrls = {};     // photo_path -> signed url
let feedLimit = 60, feedHasMore = false;
let myPosts = [];       // all own posts (for stats, export)
let photoBlob = null, photoPreview = null, photoRemoved = false;
let editing = null;
let joinColor = COLORS[0], joinMode = "join";
const isAdmin = () => !!(me && me.role === "admin" && me.status === "active");

// ---------- view switching ----------
const APP_VIEWS = ["feed", "rec", "me", "admin"];
function show(view) {
  if (APP_VIEWS.includes(view) && !(me && me.status === "active")) view = "gate";
  if (view === "admin" && !isAdmin()) view = "feed";
  $("#tabs").hidden = !APP_VIEWS.includes(view);
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === view)));
  document.querySelectorAll("section.view").forEach(s => s.classList.toggle("on", s.id === "view-" + view));
  if (view === "rec") loadOwnForDate();
  if (view === "me") renderMe();
  if (view === "admin") loadAdmin();
  window.scrollTo(0, 0);
}
document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => show(b.dataset.view)));
function setGate(title, text, extra) { $("#gate-title").textContent = title; $("#gate-text").textContent = text || ""; $("#gate-extra").replaceChildren(...(extra ? [extra] : [])); show("gate"); }
function notice(msg, warn) { const n = $("#conn"); n.hidden = !msg; n.textContent = msg || ""; n.classList.toggle("warn", !!warn); }
const errText = (e) => (e && (e.message || e.error_description)) || "通信に失敗しました";

// ---------- header ----------
$("#today").textContent = dayLabel(ymd(new Date()));
$("#date").value = ymd(new Date());
const last = store.get("asalog.last") || {};
["bed", "wake", "bft"].forEach(k => { if (last[k]) $("#" + k).value = last[k]; });

// ---------- boot ----------
async function boot() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const code = el("div", "setup-code", 'export const SUPABASE_URL = "https://xxxx.supabase.co";\nexport const SUPABASE_ANON_KEY = "eyJ...";');
    setGate("初期設定が必要です", "config.js に Supabase の URL と anon key を書き込んでから、もう一度開いてください。", code);
    return;
  }
  let baseUrl = SUPABASE_URL.trim();
  try { baseUrl = new URL(baseUrl).origin; } catch {}
  sb = createClient(baseUrl, SUPABASE_ANON_KEY.trim(), { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  sb.auth.onAuthStateChange((event, s) => {
    if (event === "PASSWORD_RECOVERY") { session = s; show("newpass"); return; }
    if (event === "SIGNED_OUT") { session = null; uid = null; me = null; show("auth"); return; }
    if (event === "SIGNED_IN" && s && (!session || session.user.id !== s.user.id)) { session = s; uid = s.user.id; setTimeout(enter, 0); }
  });
  const { data } = await sb.auth.getSession();
  if (uid) return; // already entered through the sign-in event
  session = data.session;
  if (location.hash.includes("type=recovery")) return; // handled by PASSWORD_RECOVERY
  if (!session) { show("auth"); return; }
  uid = session.user.id;
  enter();
}

async function enter() {
  setGate("読み込み中…", "");
  try {
    const [{ data: cfg }, { data: prof, error: pe }] = await Promise.all([
      sb.from("app_config").select("*").eq("id", 1).maybeSingle(),
      sb.from("profiles").select("*").eq("id", uid).maybeSingle(),
    ]);
    if (pe) throw pe;
    if (cfg) config = cfg;
    me = prof || null;
    $("#group-name").textContent = config.group_name ? config.group_name + "・" : "";
    $("#tab-admin").hidden = !isAdmin();
    if (!me) { openJoin("join"); showJoin(); return; }
    if (me.status !== "active") { renderWait(); show("wait"); return; }
    applyDefaults();
    await loadFeed();
    show("feed");
  } catch (e) {
    setGate("読み込めませんでした", "通信状況を確認して、ページを開き直してください。（" + errText(e) + "）");
  }
}
function applyDefaults() {
  const l = store.get("asalog.last") || {};
  const vis = l.vis || me.default_vis;
  (vis === "private" ? $("#vis-private") : $("#vis-public")).checked = true;
}

// ---------- auth ----------
function authMode() { return $("#amode-up").checked ? "up" : "in"; }
function syncAuthMode() {
  const up = authMode() === "up";
  $("#a-submit").textContent = up ? "登録してメールを確認" : "ログイン";
  $("#a-pass").autocomplete = up ? "new-password" : "current-password";
  $("#a-forgot").hidden = up;
  $("#a-status").textContent = "";
}
document.querySelectorAll('input[name="amode"]').forEach(r => r.addEventListener("change", syncAuthMode));
syncAuthMode();
const redirectUrl = () => location.origin + location.pathname;

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const st = $("#a-status"); st.classList.remove("err");
  const email = $("#a-email").value.trim(), pass = $("#a-pass").value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { st.textContent = "メールアドレスを確認してください。"; st.classList.add("err"); return; }
  if (pass.length < 8) { st.textContent = "パスワードは8文字以上にしてください。"; st.classList.add("err"); return; }
  const btn = $("#a-submit"); btn.disabled = true; st.textContent = "送信しています…";
  try {
    if (authMode() === "up") {
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: redirectUrl() } });
      if (error) throw error;
      if (data.session) { st.textContent = ""; return; } // email confirmation is off
      st.textContent = "確認メールを送りました。メールのリンクを開くと登録が完了します。";
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      st.textContent = "";
    }
  } catch (err) {
    const m = errText(err);
    st.textContent = /Invalid login/i.test(m) ? "メールアドレスかパスワードが違います。" : /not confirmed/i.test(m) ? "メールの確認がまだです。届いたメールのリンクを開いてください。" : /already registered/i.test(m) ? "このメールアドレスは登録済みです。ログインしてください。" : "うまくいきませんでした：" + m;
    st.classList.add("err");
  } finally { btn.disabled = false; }
});
$("#a-forgot").addEventListener("click", async () => {
  const st = $("#a-status"); const email = $("#a-email").value.trim();
  if (!email) { st.textContent = "メールアドレスを入れてから押してください。"; st.classList.add("err"); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  st.classList.toggle("err", !!error);
  st.textContent = error ? "送れませんでした：" + errText(error) : "パスワード再設定のメールを送りました。";
});
$("#np-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const st = $("#np-status"); const p = $("#np-pass").value;
  if (p.length < 8) { st.textContent = "8文字以上にしてください。"; st.classList.add("err"); return; }
  const { error } = await sb.auth.updateUser({ password: p });
  if (error) { st.textContent = "設定できませんでした：" + errText(error); st.classList.add("err"); return; }
  st.textContent = "設定しました。"; history.replaceState(null, "", location.pathname);
  const { data } = await sb.auth.getSession(); session = data.session; uid = session && session.user.id;
  if (uid) enter(); else show("auth");
});
async function logout() { await sb.auth.signOut(); }
$("#wait-logout").addEventListener("click", logout);
$("#acct-logout").addEventListener("click", logout);

// ---------- join / profile ----------
COLORS.forEach(c => {
  const b = el("button", "swatch"); b.type = "button"; b.style.background = c; b.dataset.c = c; b.setAttribute("aria-label", "アイコンの色 " + c);
  b.addEventListener("click", () => { joinColor = c; syncSwatch(); });
  $("#j-colors").appendChild(b);
});
function syncSwatch() { document.querySelectorAll(".swatch").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.c === joinColor))); }
function showJoin() { document.querySelectorAll("section.view").forEach(s => s.classList.toggle("on", s.id === "view-join")); $("#tabs").hidden = true; window.scrollTo(0, 0); }
function openJoin(mode) {
  joinMode = mode;
  const m = me || {};
  $("#join-title").textContent = mode === "edit" ? "プロフィールを編集" : (config.group_name ? `${config.group_name}に参加する` : "あさログに参加する");
  $("#join-welcome").textContent = mode === "edit" ? "ニックネームや色は、みんなの朝の表示に使われます。" : (config.welcome || "毎朝の朝ごはんと睡眠を記録して、仲間と見せ合う場所です。");
  $("#j-nick").value = m.nickname || ""; $("#j-bio").value = m.bio || "";
  joinColor = COLORS.includes(m.color) ? m.color : COLORS[Math.floor(Math.random() * COLORS.length)]; syncSwatch();
  (m.default_vis === "private" ? $("#jvis-private") : $("#jvis-public")).checked = true;
  $("#j-hide").checked = !!m.default_hide_photo;
  $("#j-rules-block").hidden = mode === "edit"; $("#j-agree").checked = mode === "edit";
  $("#j-submit").textContent = mode === "edit" ? "保存する" : "参加する";
  $("#j-cancel").hidden = mode !== "edit";
  $("#j-status").textContent = "";
}
$("#j-cancel").addEventListener("click", () => { if (me && me.status === "active") show("me"); else { renderWait(); show("wait"); } });
$("#wait-edit").addEventListener("click", () => { openJoin("edit"); showJoin(); });
$("#wait-reload").addEventListener("click", enter);
$("#acct-edit").addEventListener("click", () => { openJoin("edit"); showJoin(); });
$("#join-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const st = $("#j-status"); st.classList.remove("err");
  const nick = $("#j-nick").value.trim();
  if (!nick) { st.textContent = "ニックネームを入れてください。"; st.classList.add("err"); return; }
  if (!$("#j-agree").checked) { st.textContent = "参加のルールに同意してください。"; st.classList.add("err"); return; }
  const row = { nickname: nick, bio: $("#j-bio").value.trim(), color: joinColor, default_vis: $("#jvis-private").checked ? "private" : "public", default_hide_photo: $("#j-hide").checked };
  const btn = $("#j-submit"); btn.disabled = true; st.textContent = "保存しています…";
  try {
    const q = me ? sb.from("profiles").update(row).eq("id", uid) : sb.from("profiles").insert({ id: uid, ...row });
    const { error } = await q;
    if (error) throw error;
    store.set("asalog.last", { ...(store.get("asalog.last") || {}), vis: row.default_vis, hidePhoto: row.default_hide_photo });
    st.textContent = "保存しました。";
    const wasEdit = joinMode === "edit";
    await enter();
    if (wasEdit && me && me.status === "active") show("me");
  } catch (err) { st.textContent = "保存できませんでした：" + errText(err); st.classList.add("err"); }
  finally { btn.disabled = false; }
});
function renderWait() {
  const blocked = me && me.status === "blocked";
  $("#wait-title").textContent = blocked ? "参加が停止されています" : "参加の承認を待っています";
  $("#wait-text").textContent = blocked ? "管理者によって参加が停止されています。心当たりがない場合は、管理者に連絡してください。" : "管理者が承認すると、記録とタイムラインが使えるようになります。承認されたら「状態を確認する」を押してください。";
  $("#wait-edit").hidden = blocked;
}

// ---------- data loading ----------
async function loadFeed() {
  const [{ data: ps, error: e1 }, { data: profs, error: e2 }, { data: mine, error: e3 }] = await Promise.all([
    sb.from("posts").select("*").or(`visibility.eq.public,author.eq.${uid}`).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(feedLimit + 1),
    sb.from("profiles").select("id,nickname,color,bio,status,role,created_at"),
    sb.from("posts").select("*").eq("author", uid).order("date", { ascending: false }).limit(1000),
  ]);
  if (e1 || e2 || e3) throw (e1 || e2 || e3);
  feedHasMore = ps.length > feedLimit;
  posts = ps.slice(0, feedLimit);
  myPosts = mine || [];
  profiles = {}; (profs || []).forEach(p => { profiles[p.id] = p; });
  if (me) profiles[uid] = { ...profiles[uid], ...me };
  const ids = posts.filter(p => p.visibility === "public").map(p => p.id);
  likes = {};
  if (ids.length) {
    const { data: lk } = await sb.from("likes").select("post_id,user_id").in("post_id", ids);
    (lk || []).forEach(l => { (likes[l.post_id] ||= new Set()).add(l.user_id); });
  }
  await signPhotos([...posts, ...myPosts]);
  renderFeed();
  $("#feed-more").hidden = !feedHasMore;
}
async function signPhotos(list) {
  const need = [...new Set(list.map(p => p.photo_path).filter(p => p && !photoUrls[p]))];
  for (let i = 0; i < need.length; i += 100) {
    const { data } = await sb.storage.from("photos").createSignedUrls(need.slice(i, i + 100), 60 * 60 * 6);
    (data || []).forEach(d => { if (d.signedUrl && !d.error) photoUrls[d.path] = d.signedUrl; });
  }
}
$("#feed-reload").addEventListener("click", async () => { const b = $("#feed-reload"); b.disabled = true; try { await loadFeed(); } catch (e) { notice("更新できませんでした。", true); } b.disabled = false; });
$("#feed-more").addEventListener("click", async () => { feedLimit += 60; try { await loadFeed(); } catch {} });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && me && me.status === "active" && $("#view-feed").classList.contains("on")) loadFeed().catch(() => {}); });

// ---------- sleep bar ----------
function sleepBar(p, withScale) {
  const box = el("div", "sleep");
  const bp = pos(p.bed), wp = pos(p.wake), fp = pos(p.bft);
  const track = el("div", "track");
  [3, 6, 9, 12].forEach(h => { const t = el("div", "tick"); t.style.left = pct(h * 60) + "%"; track.appendChild(t); });
  if (bp != null && wp != null) {
    const s = el("div", "seg-bar"); let a = bp, b = wp; if (b < a) b = WIN_LEN;
    s.style.left = pct(a) + "%"; s.style.width = Math.max(1, pct(b) - pct(a)) + "%"; track.appendChild(s);
  }
  if (!p.skipped && fp != null && fp <= WIN_LEN) { const d = el("div", "bf"); d.style.left = pct(fp) + "%"; track.appendChild(d); }
  box.appendChild(track);
  if (withScale) {
    const sc = el("div", "scale");
    [["21時", 0], ["0時", 3], ["3時", 6], ["6時", 9], ["9時", 12]].forEach(([l, h]) => { const s = el("span", null, l); s.style.left = pct(h * 60) + "%"; sc.appendChild(s); });
    box.appendChild(sc);
  }
  return box;
}

// ---------- feed ----------
const photoSrc = (p) => (p.photo_path && photoUrls[p.photo_path]) || null;
const nameOf = (id) => (profiles[id] && profiles[id].nickname) || (id === uid ? "あなた" : "メンバー");
const colorOf = (id) => { const c = profiles[id] && profiles[id].color; return COLORS.includes(c) ? c : "#8A93A6"; };

function armed(b, fn, label = "もう一度押すと実行") {
  if (b.dataset.armed !== "1") { const orig = b.textContent; b.dataset.armed = "1"; b.textContent = label; setTimeout(() => { if (b.isConnected && b.dataset.armed === "1") { b.dataset.armed = ""; b.textContent = orig; } }, 3000); return; }
  b.dataset.armed = ""; b.disabled = true; b.textContent = "実行中…";
  Promise.resolve().then(fn).catch(() => { b.textContent = "できませんでした"; b.disabled = false; });
}

function card(p, opts = {}) {
  const c = el("article", "card");
  const who = el("div", "who");
  const nm = nameOf(p.author);
  const av = el("div", "avatar", (nm || "?").slice(0, 1)); av.style.background = colorOf(p.author);
  const id = el("div"); id.style.minWidth = "0";
  id.appendChild(el("div", "name", nm));
  id.appendChild(el("div", "meta", `睡眠 ${fmtDur(sleepMinutes(p.bed, p.wake))}${p.feel ? "・" + (FEEL_LABEL[p.feel] || "") : ""}`));
  const wb = el("div", "wake-badge"); wb.appendChild(el("small", null, "起床")); wb.appendChild(document.createTextNode(p.wake || "–"));
  who.append(av, id, wb); c.appendChild(who);

  const src = opts.noPhoto ? null : photoSrc(p);
  if (src && !p.skipped) { const img = el("img", "photo"); img.alt = p.menu ? `朝ごはん：${p.menu}` : "朝ごはんの写真"; img.loading = "lazy"; img.src = src; img.onerror = () => img.replaceWith(el("div", "photo-missing", "写真を表示できません")); c.appendChild(img); }

  const body = el("div", "body");
  if (p.skipped) body.appendChild(el("div", "menu skip", "朝ごはんはなし"));
  else if (p.menu) body.appendChild(el("div", "menu", p.menu));
  const facts = el("div", "facts");
  if (opts.showDate) facts.appendChild(el("span", "fact", dayLabel(p.date)));
  if (p.visibility === "private") facts.appendChild(el("span", "fact lock", "自分だけ"));
  if (opts.noPhoto && p.photo_path && !p.skipped) facts.appendChild(el("span", "fact lock", "写真あり（本人のみ表示）"));
  if (p.photo_hidden && p.visibility !== "private" && p.photo_path) facts.appendChild(el("span", "fact lock", p.author === uid ? "写真は自分だけに表示" : "写真は非公開"));
  if (!p.skipped && MAKER_LABEL[p.maker]) facts.appendChild(el("span", "fact", MAKER_LABEL[p.maker]));
  if (PLACE_LABEL[p.place]) facts.appendChild(el("span", "fact", PLACE_LABEL[p.place]));
  if (WITH_LABEL[p.with_whom]) facts.appendChild(el("span", "fact", WITH_LABEL[p.with_whom] + (p.with_whom === "alone" ? "で" : "と")));
  if (p.sat) facts.appendChild(el("span", "fact", "満足度 ★" + p.sat));
  if (facts.childNodes.length) body.appendChild(facts);
  const tagList = [...(p.balance || []).map(b => BAL_LABEL[b]).filter(Boolean), ...(p.tags || [])];
  if (!p.skipped && tagList.length) { const t = el("div", "tags"); tagList.slice(0, 14).forEach(x => t.appendChild(el("span", "tag", "#" + x))); body.appendChild(t); }
  const sl = sleepBar(p, false);
  const lab = el("div", "label");
  const l1 = el("span"); l1.append("就寝 ", el("b", null, p.bed || "–"), " → 起床 ", el("b", null, p.wake || "–")); lab.appendChild(l1);
  if (p.bft && !p.skipped) { const l2 = el("span"); l2.append("朝食 ", el("b", null, p.bft)); lab.appendChild(l2); }
  sl.insertBefore(lab, sl.firstChild); body.appendChild(sl);
  if (p.note) body.appendChild(el("div", "note", p.note));
  c.appendChild(body);

  if (opts.readOnly) return c;
  const foot = el("div", "foot");
  if (p.visibility === "public") {
    const set = likes[p.id] || new Set(); const mine = set.has(uid);
    const lb = el("button", "pill-btn"); lb.type = "button"; lb.setAttribute("aria-pressed", String(mine));
    lb.textContent = set.size ? `おはよう ${set.size}` : "おはよう";
    lb.addEventListener("click", () => toggleLike(p, !mine, lb));
    foot.appendChild(lb);
  }
  foot.appendChild(el("span", "spacer"));
  if (p.author === uid) {
    const eb = el("button", "pill-btn", "編集"); eb.type = "button";
    eb.addEventListener("click", () => { $("#date").value = p.date; show("rec"); });
    const xb = el("button", "pill-btn danger", "削除"); xb.type = "button";
    xb.addEventListener("click", () => armed(xb, () => deletePost(p), "削除する？"));
    foot.append(eb, xb);
  } else if (isAdmin() && p.visibility === "public") {
    const xb = el("button", "pill-btn danger", "管理者として削除"); xb.type = "button";
    xb.addEventListener("click", () => armed(xb, () => deletePost(p), "本当に削除する？"));
    foot.appendChild(xb);
  }
  c.appendChild(foot);
  return c;
}

function renderFeed() {
  const box = $("#feed"); box.replaceChildren();
  const today = ymd(new Date());
  const list = posts.filter(p => p.author === uid || (profiles[p.author] && profiles[p.author].status === "active"));
  if (!list.length) {
    const e = el("div", "empty-state");
    e.appendChild(el("h2", null, "最初の朝を記録しましょう"));
    e.appendChild(el("p", null, "朝ごはんの写真と、寝た時刻・起きた時刻を投稿すると、ここに仲間の朝と一緒に並びます。"));
    const b = el("button", "btn", "今朝を記録する"); b.type = "button"; b.addEventListener("click", () => show("rec")); e.appendChild(b);
    box.appendChild(e); return;
  }
  let curDay = null; const wrap = el("div", "list");
  list.forEach(p => {
    if (p.date !== curDay) { curDay = p.date; wrap.appendChild(el("div", "day-head", p.date === today ? `今日・${dayLabel(p.date)}` : dayLabel(p.date))); }
    wrap.appendChild(card(p));
  });
  box.appendChild(wrap);
}

async function toggleLike(p, on, btn) {
  btn.disabled = true;
  try {
    const { error } = on ? await sb.from("likes").insert({ post_id: p.id, user_id: uid }) : await sb.from("likes").delete().eq("post_id", p.id).eq("user_id", uid);
    if (error) throw error;
    const set = (likes[p.id] ||= new Set()); on ? set.add(uid) : set.delete(uid);
    renderFeed();
  } catch { btn.disabled = false; notice("「おはよう」を送れませんでした。", true); }
}

async function deletePost(p) {
  const { error } = await sb.from("posts").delete().eq("id", p.id);
  if (error) throw error;
  if (p.photo_path) await sb.storage.from("photos").remove([p.photo_path]);
  await loadFeed();
  if ($("#view-me").classList.contains("on")) renderMe();
}

// ---------- my log ----------
function renderMe() {
  const mine = myPosts;
  const byDate = new Map(mine.map(p => [p.date, p]));
  $("#s-count").replaceChildren(String(mine.length), el("small", null, "回"));
  let streak = 0; const d = new Date();
  if (!byDate.has(ymd(d))) d.setDate(d.getDate() - 1);
  while (byDate.has(ymd(d))) { streak++; d.setDate(d.getDate() - 1); }
  $("#s-streak").replaceChildren(String(streak), el("small", null, "日"));

  const chart = $("#chart"); chart.replaceChildren();
  const sleeps = [], wakes = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const p = byDate.get(ymd(dt));
    const row = el("div", "chart-row" + (p ? "" : " empty"));
    row.appendChild(el("span", null, `${dt.getMonth() + 1}/${dt.getDate()}${WEEK[dt.getDay()]}`));
    row.appendChild(sleepBar(p || {}, i === 0));
    const m = p ? sleepMinutes(p.bed, p.wake) : null;
    row.appendChild(el("span", "dur", m == null ? "" : `${(m / 60).toFixed(1)}h`));
    chart.appendChild(row);
    if (m != null) sleeps.push(m);
    const w = p ? toMin(p.wake) : null; if (w != null) wakes.push(w);
  }
  $("#s-sleep").replaceChildren(sleeps.length ? (sleeps.reduce((a, b) => a + b, 0) / sleeps.length / 60).toFixed(1) : "–");
  if (sleeps.length) $("#s-sleep").appendChild(el("small", null, "時間"));
  $("#s-wake").textContent = wakes.length ? fmtClock(wakes.reduce((a, b) => a + b, 0) / wakes.length) : "–";

  const counts = {}; let total = 0;
  mine.forEach(p => { if (p.skipped) { counts.skip = (counts.skip || 0) + 1; total++; } else if (p.maker) { counts[p.maker] = (counts[p.maker] || 0) + 1; total++; } });
  const stack = $("#maker-stack"), legend = $("#maker-legend"); stack.replaceChildren(); legend.replaceChildren();
  if (!total) legend.appendChild(el("span", null, "記録すると、自分で作った日・誰かがつくった日の割合が出ます。"));
  [...MAKERS.map(m => m[0]), "skip"].forEach(k => {
    if (!counts[k]) return;
    const color = k === "skip" ? "var(--line)" : MAKER_COLOR[k];
    const s = el("span"); s.style.width = (counts[k] / total * 100) + "%"; s.style.background = color; stack.appendChild(s);
    const li = el("span"); const i = el("i"); i.style.background = color;
    li.append(i, `${k === "skip" ? "食べなかった" : MAKER_LABEL[k]} ${Math.round(counts[k] / total * 100)}%`); legend.appendChild(li);
  });

  const album = $("#album"); album.replaceChildren();
  const list = mine.filter(p => !p.skipped).slice(0, 30);
  if (!list.length) { const c = el("div", "cell", "まだ写真がありません"); c.style.gridColumn = "1 / -1"; c.style.aspectRatio = "auto"; c.style.padding = "18px"; album.appendChild(c); }
  list.forEach(p => {
    const c = el("div", "cell"); const src = photoSrc(p);
    if (src) { const img = el("img"); img.alt = p.menu || "朝ごはん"; img.loading = "lazy"; img.src = src; c.appendChild(img); }
    else c.textContent = p.menu || "写真なし";
    const [, m, dd] = p.date.split("-").map(Number); c.appendChild(el("span", "d", `${m}/${dd}`));
    album.appendChild(c);
  });

  const av = $("#acct-av"); av.textContent = (me.nickname || "?").slice(0, 1); av.style.background = colorOf(uid);
  $("#acct-name").replaceChildren(me.nickname);
  if (isAdmin()) $("#acct-name").appendChild(el("span", "badge owner", "管理者"));
  $("#acct-sub").textContent = `${session.user.email}・${new Date(me.created_at).toLocaleDateString("ja-JP")} に参加`;
}

// ---------- record form ----------
function updateCalc() {
  $("#calc").replaceChildren("睡眠時間 ", el("b", null, fmtDur(sleepMinutes($("#bed").value, $("#wake").value))));
  $("#rec-bar").replaceChildren(sleepBar({ bed: $("#bed").value, wake: $("#wake").value, bft: $("#bft").value, skipped: $("#skip").checked }, true));
}
["#bed", "#wake", "#bft"].forEach(s => $(s).addEventListener("input", updateCalc));
$("#skip").addEventListener("change", () => { $("#meal-fields").hidden = $("#skip").checked; $("#bft").disabled = $("#skip").checked; updateCalc(); });
function syncHidePhoto() { $("#hide-photo-row").hidden = $("#vis-private").checked; }
document.querySelectorAll('input[name="vis"]').forEach(r => r.addEventListener("change", syncHidePhoto));
updateCalc();

function setPreview(src) {
  const drop = $("#drop"); drop.querySelectorAll("img").forEach(i => i.remove());
  $("#drop-hint").hidden = !!src;
  $("#photo-actions").hidden = !src;
  if (src) { const img = el("img"); img.alt = "選んだ写真のプレビュー"; img.src = src; drop.insertBefore(img, $("#photo")); }
}
$("#photo").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  try {
    const { blob, url } = await compress(f, 1280, 0.82);
    photoBlob = blob; photoRemoved = false; if (photoPreview) URL.revokeObjectURL(photoPreview); photoPreview = url; setPreview(url);
  } catch { setStatus("この写真は読み込めませんでした。JPEGかPNGで試してください。", true); }
  e.target.value = "";
});
$("#photo-remove").addEventListener("click", () => { photoBlob = null; photoRemoved = true; setPreview(null); });

function loadImage(src) { return new Promise((res, rej) => { const u = URL.createObjectURL(src); const i = new Image(); i.onload = () => res({ i, u }); i.onerror = () => { URL.revokeObjectURL(u); rej(); }; i.src = u; }); }
async function compress(file, max, q) {
  const { i, u } = await loadImage(file);
  const s = Math.min(1, max / Math.max(i.naturalWidth, i.naturalHeight));
  const cv = document.createElement("canvas"); cv.width = Math.round(i.naturalWidth * s); cv.height = Math.round(i.naturalHeight * s);
  cv.getContext("2d").drawImage(i, 0, 0, cv.width, cv.height); URL.revokeObjectURL(u);
  const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", q));
  if (!blob) throw new Error("encode");
  return { blob, url: URL.createObjectURL(blob) };
}
function setStatus(msg, err) { const s = $("#status"); s.textContent = msg || ""; s.classList.toggle("err", !!err); }

function loadOwnForDate() {
  const date = $("#date").value;
  const p = myPosts.find(x => x.date === date) || null;
  editing = p; photoBlob = null; photoRemoved = false;
  const l = store.get("asalog.last") || {};
  if (p) {
    (p.visibility === "private" ? $("#vis-private") : $("#vis-public")).checked = true;
    $("#skip").checked = !!p.skipped; $("#hide-photo").checked = !!p.photo_hidden;
    $("#menu").value = p.menu || ""; $("#bed").value = p.bed || ""; $("#wake").value = p.wake || ""; $("#bft").value = p.bft || ""; $("#note").value = p.note || "";
    tags.set(p.tags); G.maker.set(p.maker); G.balance.set(p.balance); G.feel.set(p.feel);
    G.place.set(p.place); G.with.set(p.with_whom); G.dur.set(p.dur); G.sat.set(p.sat); G.mood.set(p.mood);
    if (p.place || p.with_whom || p.dur || p.sat || p.mood) $("#more").open = true;
    setPreview(photoSrc(p)); $("#submit").textContent = "この朝の記録を更新する";
  } else {
    (((l.vis || (me && me.default_vis)) === "private") ? $("#vis-private") : $("#vis-public")).checked = true;
    $("#skip").checked = false; $("#hide-photo").checked = l.hidePhoto != null ? !!l.hidePhoto : !!(me && me.default_hide_photo);
    $("#menu").value = ""; $("#note").value = "";
    tags.set([]); G.balance.set([]); G.feel.set(""); G.place.set(""); G.with.set(""); G.dur.set(""); G.sat.set(""); G.mood.set("");
    G.maker.set(l.maker || "");
    setPreview(null); $("#submit").textContent = "この朝を記録する";
  }
  $("#meal-fields").hidden = $("#skip").checked; $("#bft").disabled = $("#skip").checked;
  syncHidePhoto(); setStatus(""); updateCalc();
}
$("#date").addEventListener("change", loadOwnForDate);

$("#rec-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const vis = $("#vis-private").checked ? "private" : "public";
  const date = $("#date").value, bed = normTime($("#bed").value), wake = normTime($("#wake").value);
  const skipped = $("#skip").checked, bft = skipped ? "" : normTime($("#bft").value);
  const menu = skipped ? "" : $("#menu").value.trim();
  if (!date) { setStatus("日付を入れてください。", true); return; }
  const hasPhoto = !!photoBlob || (editing && editing.photo_path && !photoRemoved);
  if (!skipped && !menu && !hasPhoto) { setStatus("写真か、食べたものを入れてください。", true); return; }
  const btn = $("#submit"); btn.disabled = true; setStatus("保存しています…");
  let uploaded = null;
  try {
    let photo_path = editing ? editing.photo_path : null;
    const oldPath = photo_path;
    if (skipped || photoRemoved) photo_path = null;
    if (photoBlob && !skipped) {
      uploaded = `${uid}/${date}-${Date.now().toString(36)}.jpg`;
      const { error } = await sb.storage.from("photos").upload(uploaded, photoBlob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      photo_path = uploaded;
    }
    const row = {
      author: uid, date, visibility: vis, skipped, menu, bed, wake, bft,
      sleep_min: sleepMinutes(bed, wake),
      maker: skipped ? "" : G.maker.get(), tags: skipped ? [] : tags.get(), balance: skipped ? [] : G.balance.get(),
      feel: G.feel.get(), place: G.place.get(), with_whom: G.with.get(), dur: G.dur.get(), sat: G.sat.get(), mood: G.mood.get(),
      note: $("#note").value.trim(), photo_path, photo_hidden: vis === "public" && $("#hide-photo").checked,
    };
    const { error } = await sb.from("posts").upsert(row, { onConflict: "author,date" });
    if (error) throw error;
    if (oldPath && oldPath !== photo_path) await sb.storage.from("photos").remove([oldPath]);
    store.set("asalog.last", { ...(store.get("asalog.last") || {}), bed, wake, bft: bft || "07:15", vis, maker: row.maker, hidePhoto: $("#hide-photo").checked });
    photoBlob = null;
    setStatus(vis === "public" ? "投稿しました。" : "自分だけの記録として保存しました。");
    await loadFeed();
    setTimeout(() => show(vis === "public" ? "feed" : "me"), 500);
  } catch (err) {
    if (uploaded) await sb.storage.from("photos").remove([uploaded]).catch(() => {});
    setStatus("保存できませんでした：" + errText(err), true);
  } finally { btn.disabled = false; }
});

// ---------- export / import ----------
const CSV_COLS = ["date", "nickname", "visibility", "bed", "wake", "breakfast_time", "sleep_minutes", "skipped", "menu", "made_by", "tags", "balance", "wake_feeling", "place", "with", "eating_time", "satisfaction", "mood", "note", "has_photo", "photo_hidden"];
function csvRow(p) {
  return [p.date, nameOf(p.author), p.visibility === "private" ? "自分だけ" : "公開", p.bed, p.wake, p.skipped ? "" : p.bft, p.sleep_min ?? "", p.skipped ? "1" : "0", p.menu,
    MAKER_LABEL[p.maker] || "", (p.tags || []).join(" "), (p.balance || []).map(b => BAL_LABEL[b]).join(" "), FEEL_LABEL[p.feel] || "", PLACE_LABEL[p.place] || "",
    WITH_LABEL[p.with_whom] || "", DUR_LABEL[p.dur] || "", p.sat || "", MOOD_LABEL[p.mood] || "", p.note, p.photo_path ? "1" : "0", p.photo_hidden ? "1" : "0"]
    .map(v => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(",");
}
const toCsv = (list) => "﻿" + CSV_COLS.join(",") + "\n" + list.map(csvRow).join("\n");
const stamp = () => ymd(new Date()).replace(/-/g, "");
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$("#acct-json").addEventListener("click", () => download(`asalog_mydata_${stamp()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), app: "asalog-web", profile: { nickname: me.nickname, bio: me.bio, color: me.color }, records: myPosts.map(({ author, ...r }) => r) }, null, 2), "application/json"));
$("#acct-csv").addEventListener("click", () => download(`asalog_records_${stamp()}.csv`, toCsv(myPosts.slice().sort((a, b) => a.date.localeCompare(b.date))), "text/csv"));

const pick = (v, list) => list.some(o => o[0] === v) ? v : "";
$("#import-file").addEventListener("change", async (e) => {
  const st = $("#acct-status"); const f = e.target.files && e.target.files[0]; if (!f) return;
  try {
    const json = JSON.parse(await f.text());
    const recs = Array.isArray(json.records) ? json.records : [];
    const have = new Set(myPosts.map(p => p.date));
    const rows = recs.filter(r => r && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !have.has(r.date)).map(r => ({
      author: uid, date: r.date, visibility: (r._vis === "private" || r.visibility === "private") ? "private" : "public", skipped: !!r.skipped,
      menu: String(r.menu || "").slice(0, 80), bed: normTime(r.bed), wake: normTime(r.wake), bft: r.skipped ? "" : normTime(r.bft),
      sleep_min: sleepMinutes(normTime(r.bed), normTime(r.wake)),
      maker: pick(r.maker, MAKERS), tags: Array.isArray(r.tags) ? r.tags.map(String).slice(0, 40) : [],
      balance: Array.isArray(r.balance) ? r.balance.filter(b => BAL_LABEL[b]) : [],
      feel: pick(String(r.feel || ""), FEELS), place: pick(r.place, PLACES), with_whom: pick(r.with || r.with_whom, WITHS), dur: pick(r.dur, DURS),
      sat: pick(String(r.sat || ""), SATS), mood: pick(r.mood, MOODS), note: String(r.note || "").slice(0, 300), photo_path: null, photo_hidden: false,
    }));
    if (!rows.length) { st.textContent = "取り込める新しい記録はありませんでした。"; return; }
    st.textContent = `${rows.length}件を取り込んでいます…`;
    const { error } = await sb.from("posts").insert(rows);
    if (error) throw error;
    await loadFeed(); renderMe();
    st.textContent = `${rows.length}件を取り込みました（写真は含まれません）。`;
  } catch (err) { st.textContent = "取り込めませんでした：" + errText(err); }
  e.target.value = "";
});

$("#acct-passbtn").addEventListener("click", async () => {
  const st = $("#acct-status"); const p = $("#acct-newpass").value;
  if (p.length < 8) { st.textContent = "パスワードは8文字以上にしてください。"; return; }
  const { error } = await sb.auth.updateUser({ password: p });
  st.textContent = error ? "変更できませんでした：" + errText(error) : "パスワードを変更しました。";
  $("#acct-newpass").value = "";
});

$("#acct-del").addEventListener("click", async () => {
  const st = $("#acct-status");
  if ($("#acct-del-confirm").value.trim() !== "削除") { st.textContent = "確認のため「削除」と入力してください。"; return; }
  const b = $("#acct-del"); b.disabled = true; st.textContent = "削除しています…";
  try {
    for (;;) {
      const { data: files } = await sb.storage.from("photos").list(uid, { limit: 100 });
      if (!files || !files.length) break;
      const { error } = await sb.storage.from("photos").remove(files.map(f => `${uid}/${f.name}`));
      if (error) throw error;
    }
    const { error } = await sb.rpc("delete_my_account");
    if (error) throw error;
    await sb.auth.signOut();
  } catch (err) { st.textContent = "削除できませんでした：" + errText(err); b.disabled = false; }
});

// ---------- admin ----------
let adminProfiles = [], adminCounts = {}, adminPrivCounts = {};
async function loadAdmin() {
  if (!isAdmin()) return;
  const [{ data: profs }, { data: all }] = await Promise.all([
    sb.from("profiles").select("*").order("created_at", { ascending: true }),
    sb.from("posts").select("id,author,photo_path,visibility").limit(20000),
  ]);
  adminProfiles = profs || [];
  const pub = (all || []).filter(p => p.visibility === "public");
  adminCounts = {}; adminPrivCounts = {};
  (all || []).forEach(p => { const t = p.visibility === "public" ? adminCounts : adminPrivCounts; t[p.author] = (t[p.author] || 0) + 1; });
  setText("#a-posts", pub.length);
  setText("#a-private", (all || []).length - pub.length);
  setText("#a-members-n", adminProfiles.length);
  renderAdmin();
}
function renderAdmin() {
  const cnt = { active: 0, pending: 0, blocked: 0 };
  adminProfiles.forEach(p => { cnt[p.status] = (cnt[p.status] || 0) + 1; });
  $("#a-active").textContent = cnt.active; $("#a-pending").textContent = cnt.pending; $("#a-blocked").textContent = cnt.blocked;
  const order = { pending: 0, active: 1, blocked: 2 };
  const list = adminProfiles.slice().sort((a, b) => (order[a.status] - order[b.status]) || a.created_at.localeCompare(b.created_at));
  const box = $("#a-members"); box.replaceChildren();
  list.forEach(m => {
    const st = m.role === "admin" ? "owner" : m.status;
    const row = el("div", "member");
    const av = el("div", "avatar", (m.nickname || "?").slice(0, 1)); av.style.background = COLORS.includes(m.color) ? m.color : "#8A93A6";
    const info = el("div");
    const nm = el("div", "nm"); nm.append(m.nickname, el("span", "badge " + st, STATUS_LABEL[st]));
    if (m.role === "admin" && m.status !== "active") nm.appendChild(el("span", "badge " + m.status, STATUS_LABEL[m.status]));
    const n = adminCounts[m.id] || 0, np = adminPrivCounts[m.id] || 0;
    info.append(nm, el("div", "sub", `${new Date(m.created_at).toLocaleDateString("ja-JP")} 登録・公開 ${n}件・自分だけ ${np}件${m.bio ? "・" + m.bio : ""}`));
    row.append(av, info);
    const acts = el("div", "acts");
    const mk = (label, fn, cls) => { const b = el("button", "pill-btn" + (cls ? " " + cls : ""), label); b.type = "button"; b.addEventListener("click", () => fn(b)); acts.appendChild(b); };
    if (n + np) mk(`記録を見る（${n + np}件）`, () => openMemberRecords(m));
    if (m.id !== uid) {
      if (m.status === "pending") mk("承認する", () => updateMember(m.id, { status: "active" }));
      if (m.status === "active") mk("参加を停止", (b) => armed(b, () => updateMember(m.id, { status: "blocked" })), "danger");
      if (m.status === "blocked") mk("停止を解除", () => updateMember(m.id, { status: "active" }));
      if (m.status === "active") mk(m.role === "admin" ? "管理者から外す" : "管理者にする", (b) => armed(b, () => updateMember(m.id, { role: m.role === "admin" ? "member" : "admin" })));
      if (n) mk(`公開投稿を削除（${n}件）`, (b) => armed(b, async () => {
        const { data } = await sb.from("posts").select("id,photo_path").eq("author", m.id).eq("visibility", "public");
        const paths = (data || []).map(p => p.photo_path).filter(Boolean);
        if (paths.length) await sb.storage.from("photos").remove(paths);
        const { error } = await sb.from("posts").delete().eq("author", m.id).eq("visibility", "public");
        if (error) throw error;
        await loadAdmin(); await loadFeed();
      }), "danger");
    }
    if (acts.childNodes.length) row.appendChild(acts);
    box.appendChild(row);
  });
  $("#a-group").value = config.group_name || "";
  $("#a-welcome").value = config.welcome || "";
  (config.approval === "manual" ? $("#appr-manual") : $("#appr-auto")).checked = true;
}

async function openMemberRecords(m) {
  const panel = $("#a-records"), list = $("#a-records-list");
  $("#a-records-title").textContent = `${m.nickname} さんの記録`;
  list.replaceChildren(el("p", "hint", "読み込み中…"));
  panel.hidden = false; panel.scrollIntoView({ behavior: "smooth", block: "start" });
  const { data, error } = await sb.from("posts").select("*").eq("author", m.id).order("date", { ascending: false }).limit(500);
  if (error) { list.replaceChildren(el("p", "hint", "読み込めませんでした：" + errText(error))); return; }
  profiles[m.id] = profiles[m.id] || m;
  list.replaceChildren();
  if (!data.length) { list.appendChild(el("p", "hint", "記録はまだありません。")); return; }
  const wrap = el("div", "list"); data.forEach(p => wrap.appendChild(card(p, { noPhoto: true, readOnly: true, showDate: true }))); list.appendChild(wrap);
}
$("#a-records-close").addEventListener("click", () => { $("#a-records").hidden = true; });
async function updateMember(id, patch) {
  const { error } = await sb.from("profiles").update(patch).eq("id", id);
  if (error) { $("#a-status").textContent = "変更できませんでした：" + errText(error); return; }
  await loadAdmin(); await loadFeed().catch(() => {});
}
$("#a-save").addEventListener("click", async () => {
  const st = $("#a-status"); st.textContent = "保存しています…";
  const patch = { approval: $("#appr-manual").checked ? "manual" : "auto", group_name: $("#a-group").value.trim(), welcome: $("#a-welcome").value.trim() };
  const { data, error } = await sb.from("app_config").update(patch).eq("id", 1).select().maybeSingle();
  if (error) { st.textContent = "保存できませんでした：" + errText(error); return; }
  if (data) config = data;
  $("#group-name").textContent = config.group_name ? config.group_name + "・" : "";
  st.textContent = "保存しました。";
});
$("#a-copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(redirectUrl()); $("#a-copy").textContent = "コピーしました"; }
  catch { $("#a-copy").textContent = redirectUrl(); }
});
$("#a-json").addEventListener("click", async () => {
  const st = $("#a-dstatus"); st.textContent = "まとめています…";
  const { data: pub, error } = await sb.from("posts").select("*").order("date").limit(20000);
  if (error) { st.textContent = "書き出せませんでした：" + errText(error); return; }
  const nick = Object.fromEntries(adminProfiles.map(p => [p.id, p.nickname]));
  download(`asalog_all_${stamp()}.json`, JSON.stringify({
    exportedAt: new Date().toISOString(), app: "asalog-web",
    config: { approval: config.approval, group_name: config.group_name },
    members: adminProfiles.map(p => ({ id: p.id, nickname: p.nickname, bio: p.bio, status: p.status, role: p.role, created_at: p.created_at })),
    posts: (pub || []).map(p => ({ ...p, nickname: nick[p.author] || "" })),
  }, null, 2), "application/json");
  st.textContent = "書き出しました。";
});
$("#a-csv").addEventListener("click", async () => {
  const st = $("#a-dstatus");
  const { data: pub, error } = await sb.from("posts").select("*").order("date").limit(20000);
  if (error) { st.textContent = "書き出せませんでした：" + errText(error); return; }
  adminProfiles.forEach(p => { profiles[p.id] = profiles[p.id] || p; });
  download(`asalog_all_records_${stamp()}.csv`, toCsv(pub || []), "text/csv");
  st.textContent = "書き出しました。";
});

boot();
