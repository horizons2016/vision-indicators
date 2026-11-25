const SEED = {"indicators": [], "readings": [], "path": [], "notes": [], "meta": {}};
const E = window.OVEngine;
const NOW = new Date().getFullYear();
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// روابط المصادر: يُقبل فقط https/http (يمنع روابط javascript: وdata: وغيرها)
const safeUrl = u => { try { const x = new URL(String(u || "").trim()); return (x.protocol === "https:" || x.protocol === "http:") ? x.href : ""; } catch(_){ return ""; } };
// نص مصدر مختلط (عربي + روابط/اختصارات لاتينية): يعزل الروابط والنطاقات باتجاه LTR حتى لا تنقلب الأقواس أو تتبعثر عند التفاف السطر
const escB = (s, short) => esc(s).replace(/(?:https?:\/\/)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[^\s؛،()<]*)?/g, m => `<bdi dir="ltr">${short ? m.replace(/^https?:\/\//, "").split("/")[0] : m}</bdi>`);
const IN_CLAUDE = !!(window.claude && window.claude.use);
const SITE = true;
// وضع الإدارة في نسخة الموقع: رمز يُتحقق منه ببصمة SHA-256 (الرمز نفسه لا يُحفظ في الكود).
// لا تُحفظ البصمة في المتصفح (كانت تتيح الدخول بنسخها من الكود)؛ يُحفظ الرمز في ذاكرة الجلسة فقط
// (sessionStorage: تُمسح عند إغلاق التبويب) ويُعاد التحقق منه عند كل فتح للصفحة.
const ADMIN_HASH = "797d79e2e6a37303672285958874e592ffbf9a0ee9eb201d0969a9750400eab3";
async function sha256(t){ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(v => v.toString(16).padStart(2, "0")).join(""); }
const BUILD = "ov-ar-11211019";   // يُستبدل عند البناء برقم النسخة   // true في نسخة GitHub Pages: البيانات تُقرأ من data/dataset.json
const MQ = window.matchMedia ? window.matchMedia("(max-width:860px)") : {matches:false};
const isMobile = () => !!MQ.matches;

const AXES = ["الإنسان والمجتمع","الاقتصاد والتنمية","الحوكمة والأداء المؤسسي","البيئة المستدامة"];
const EVAL = { done:{label:"منجز", cls:"e-done", c:"var(--good)"}, track:{label:"على المسار", cls:"e-track", c:"var(--info)"}, not:{label:"غير منجز", cls:"e-not", c:"var(--bad)"}, none:{label:"لم يُقيَّم", cls:"e-none", c:"var(--grey)"} };
const EV_ORDER = ["done","track","not","none"];
const CATS = ["on_track","needs","breakthrough","backwards","stalled","na","dev"];
// ألوان المحاور الرسمية من عجلة «أولوياتنا الوطنية» في وثيقة الرؤية: للهيكل فقط (أين أنا؟)
const AXC = ["var(--ax0)","var(--ax1)","var(--ax2)","var(--ax3)"], AXB = ["var(--ax0-bg)","var(--ax1-bg)","var(--ax2-bg)","var(--ax3-bg)"];
const axC = a => AXC[AXES.indexOf(a)] || "var(--accent)";
// رمز مع كل حالة حتى لا يعتمد الفهم على اللون وحده
// اسم الأولوية الرسمي كما في وثيقة الرؤية؛ ملف مؤشرات الرؤية (المحدثة) يكتبها باسم مختلف (للعرض والتجميع فقط، والبيانات كما هي)
const PRI_ALIAS = {"المواطنة والهوية والثقافة والقيم": "المواطنة والهوية والتراث والثقافة الوطنية"};
const CAT_SYM = {on_track:"↑", needs:"↗", breakthrough:"→", backwards:"↓", stalled:"=", na:"–", dev:"◌"};
const CAT_C = {on_track:"var(--k-on)", needs:"var(--k-needs)", breakthrough:"var(--k-break)", backwards:"var(--k-back)", stalled:"var(--k-stall)", na:"var(--k-na)", dev:"var(--k-dev)"};
const LV_LABEL = ["غير قابل للقياس","قياس التقدم","التنبؤ","المحاكاة الاحتمالية"];

const ST = { cal:{set:"", type:"", st:"", q:""}, fAxis:null, fPri:null, fInd:null, fSort:"cat", ds: SEED, dsSource:"seed", set:"updated", axis:null, pri:null, ev:null, cat:null, q:"", view:"cards", ty:2030, from:null, to:null, calcLinked:true,
  assess:{}, db:null, user:null, me:null, admin:false, siteAdmin:false, names:{}, uploads:[], pending:null, cmp:new Set(), page:"dash", asub:"upload" };
try { const v = localStorage.getItem("ovd-view"); if (v) ST.view = v; } catch(e){}
try { localStorage.removeItem("ovd-admin-key"); localStorage.removeItem("ovd-admin"); } catch(e){}
const ADMIN_SS = "ovd-admin-s";
const adminCheck = async v => { try { return !!v && (await sha256("ovd|" + v)) === ADMIN_HASH; } catch(_){ return false; } };
// صلاحية الإدارة: داخل Claude من صلاحية التحرير، وفي الموقع من رمز الإدارة
const isAdmin = () => IN_CLAUDE ? !!ST.admin : !!ST.siteAdmin;
function applyRole(){
  const a = isAdmin();
  $("#nav-admin").hidden = !a; $("#export").hidden = !a;
  $("#role").textContent = a ? "مدير" : "اطلاع"; $("#role").classList.toggle("admin", a);
}
let RAW = [], BY = {}, YMIN = 2010, KIDS = {};

const num = v => { if (v == null || v === "") return null; if (typeof v === "number") return isFinite(v) ? v : null;
  const t = String(v).trim().replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace("٫",".").replace(/,/g,"").replace("%","");
  if (t === "") return null; const n = Number(t); return isFinite(n) ? n : NaN; };

/* ================= dataset → model ================= */
// readings rows: [code, y, v, r, src, kind, brk, rel, note]
function buildModel(ds){
  const rd = {}, pt = {}, nt = {};
  (ds.readings || []).forEach(a => { (rd[a[0]] = rd[a[0]] || []).push({y:a[1], v:a[2], r:a[3], src:a[4], kind:a[5] || "فعلية", brk:a[6] === "نعم" || a[6] === true, rel:a[7] || "غير مقيّمة", note:a[8]}); });
  (ds.path || []).forEach(([c,y,p]) => { (pt[c] = pt[c] || []).push({y, p}); });
  (ds.notes || []).forEach(([c,y,t,s]) => { (nt[c] = nt[c] || []).push({y, t, s}); });
  const mk = i => {
    const pct = i.unit === "%", k = pct ? 100 : 1, sc = v => v == null ? null : v / k;
    const S = {};
    (rd[i.code] || []).forEach(r => { S[r.y] = {...(S[r.y]||{y:r.y}), ...r, v: sc(r.v)}; });
    (pt[i.code] || []).forEach(p => { S[p.y] = {...(S[p.y]||{y:p.y}), p: sc(p.p)}; });
    const o = {
      id:i.code, set: i.set === "محدث" ? "updated" : "original", axis:i.axis, priority:PRI_ALIAS[i.priority] || i.priority, priorityRaw:i.priority, name:i.name, unit:i.unit,
      pct, intl: i.type === "دولي", dir: String(i.dir||"").includes("الانخفاض") ? "down" : "up",
      base: sc(i.base), t30n: i.t30hi != null ? null : sc(i.t30), range: i.t30hi != null && i.t30 != null ? [sc(i.t30), sc(i.t30hi)] : null,
      t30r: i.t30rank, t40: sc(i.t40), t30text: i.t30text, owner:i.owner, issuer:i.issuer, src:i.src, freq:i.freq, methodText:i.method,
      method: i.calc === "CAGR" ? "CAGR" : "Linear", agg: E.AGG_BY_LABEL[i.agg] || null, aggLabel: i.agg || null,
      cap: E.CAP_BY_LABEL[i.cap] || "auto", approval: i.approval || "قيد المراجعة",
      challenges:i.challenges, explain:i.explain, initiatives:i.initiatives, factors:i.factors, supporting:i.supporting, risk:i.risk,
      notes: (nt[i.code] || []).sort((a,b) => a.y - b.y),
      series: Object.values(S).sort((a,b) => a.y - b.y),
      parent: i.parent || null, grade: i.grade || null, subject: i.subject || null,
      stage: i.stage === "قيد التطوير" ? "dev" : i.stage === "قيد التحقق" ? "verify" : null, stageNote: i.stage_note || null,
      rel: {last: i.rel_last || null, date: i.rel_date || null, next: i.rel_next || null, due: i.rel_due || null, note: i.rel_note || null, src: i.rel_src || null},
    };
    // «قيد التطوير»: المستهدف لم يُعتمد بعد، فلا يُعرض ولا يُحسب (القيم تبقى محفوظة في ملف البيانات)
    if (o.stage === "dev") { o.t30n = null; o.range = null; o.t30r = null; o.t40 = null; o.t30text = "يُحدَّد لاحقاً"; o.series = o.series.map(r => ({...r, p: null})).filter(r => r.v != null || r.r != null); }
    return o;
  };
  // المؤشر الأصلي الذي له مقابل في مؤشرات الرؤية (حقل dup) لا يُعرض، حتى لا تتكرر المعلومة
  const act = ds.indicators.filter(i => i.active !== "لا" && !i.dup);
  KIDS = {}; act.filter(i => i.parent).map(mk).forEach(k => (KIDS[k.parent] = KIDS[k.parent] || []).push(k));
  RAW = act.filter(i => !i.parent).map(mk);
  RAW.forEach(x => { if (KIDS[x.id]) x.kids = KIDS[x.id]; });
  BY = Object.fromEntries(RAW.map(x => [x.id, x]));
  RAW.forEach(x => { x._k = norm([x.name, x.id, x.priority, x.owner].join(" ")); });
  const ys = [...RAW, ...Object.values(KIDS).flat()].flatMap(x => x.series.filter(s => s.v != null || s.r != null).map(s => s.y)).filter(y => y <= NOW);
  YMIN = ys.length ? Math.min(...ys) : 2010;
  if (ST.from == null || ST.from < YMIN) ST.from = YMIN;
  if (ST.to == null) ST.to = NOW;
}

/* ================= compute ================= */
function calcRange(){ return ST.calcLinked ? {calcFrom:ST.from, calcTo:ST.to} : {calcFrom:-Infinity, calcTo:Infinity}; }
function compute(){
  const cr = calcRange();
  [...RAW, ...Object.values(KIDS).flat()].forEach(x => {
    const act = x.series.filter(r => r.y <= NOW && (r.v != null || r.r != null));
    x.curAll = act[act.length-1] || null;
    const inDisp = act.filter(r => r.y >= ST.from && r.y <= ST.to);
    x.cur = inDisp[inDisp.length-1] || null;
    x.age = x.curAll ? NOW - x.curAll.y : null;
    x.relOk = !!(x.rel && x.rel.due && relDate(x.rel.due) > new Date());
    x.el = E.eligibility(x, {targetYear:ST.ty, now:NOW, ...cr});
    x.p = x.el.progress;
    x.cat = x.p.cat;
    applyStage(x);
    x.ev = (ST.assess[x.id] && EVAL[ST.assess[x.id].s]) ? ST.assess[x.id].s : "none";
    x.showFc = x.el.showForecast && x.approval !== "مرفوض";
    x.showP = x.el.showProbability && x.approval !== "مرفوض";
  });
  /* مؤشر رئيسي بمكونات: يُعدّ مؤشراً واحداً، وتصنيفه أضعف تصنيف بين مكوناته */
  const SEV = ["backwards", "breakthrough", "stalled", "needs", "on_track"];
  RAW.forEach(x => {
    if (!x.kids) return;
    if (x.stage) return;
    const cs = x.kids.filter(k => k.p.status !== "review").map(k => k.cat).filter(c => c !== "na" && c !== "dev");
    const c = SEV.find(v => cs.includes(v)) || "na";
    x.cat = c;
    x.p = {...x.p, cat: c, status: cs.length ? "ok" : x.p.status, achieved: cs.length > 0 && x.kids.every(k => k.p.achieved), R: null, reason: "تصنيف مركّب من المكونات"};
    const last = x.kids.map(k => k.curAll).filter(Boolean).sort((a, b) => b.y - a.y)[0];
    if (last) { x.age = NOW - last.y; }
  });
}
/* المسارات الثلاثة: مكتمل (يُصنَّف) · قيد التطوير (مستهدف لم يُعتمد أو مؤشر بلا بيانات) · قيد التحقق (بيانات فيها إشكال لدى الفريق) */
function applyStage(x){
  const noData = !x.kids && !x.series.some(s => s.v != null || s.r != null);
  const st = x.stage || (!x.kids && (x.p.status === "no_target" || noData) ? "dev" : null);
  if (st === "dev") { x.p = {...x.p, status: "dev", cat: "dev", achieved: false, R: null, reason: x.stageNote || (noData ? "مؤشر قيد التطوير: لم تصدر له بيانات بعد" : "مؤشر قيد التطوير: المستهدف لم يُعتمد بعد")}; x.cat = "dev"; }
  else if (st === "verify") { x.p = {...x.p, status: "review", cat: "na", achieved: false, R: null, reason: x.stageNote || "بيانات المؤشر قيد التحقق لدى الفريق المختص"}; x.cat = "na"; }
}
const relDate = s => { const m = String(s || "").match(/^(\d{4})-(\d{1,2})/); return m ? new Date(+m[1], +m[2], 0) : null; };
const AR_M = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
function releaseHTML(x){
  const r = x.rel || {}, fq = x.freq ? esc(String(x.freq).trim()) : "—";
  const last = x.kids ? x.kids.map(k => k.curAll).filter(Boolean).sort((a, b) => b.y - a.y)[0] : x.curAll;
  const d = relDate(r.due), now = new Date();
  let st = "";
  if (relStop(x)) st = `<span class="rst stop">متوقف</span>`; else if (d) st = d > now ? `<span class="cat c-on_track">في موعده</span>` : `<span class="cat c-review">تجاوز الموعد المتوقع — تحقق من صدوره</span>`;
  const tile = (t, v) => `<div class="tile"><small>${t}</small><b style="font-size:14px;line-height:1.5">${v}</b></div>`;
  if (!r.last && !r.next) return `<div class="sec"><div class="hd"><h3>موعد الإصدار القادم</h3></div><div class="tiles">${tile("الدورية", fq)}${tile("آخر قراءة في اللوحة", last ? last.y : "—")}</div><div class="small muted">لم يُحدَّد موعد الإصدار القادم لهذا المؤشر بعد.</div></div>`;
  return `<div class="sec"><div class="hd"><h3>موعد الإصدار القادم</h3>${st}</div>
    <div class="tiles">${tile("الدورية", fq)}${tile("آخر قراءة في اللوحة", last ? last.y : "—")}${tile("آخر إصدار من الجهة", esc(r.last || "—"))}${tile("الإصدار القادم", esc(r.next || "—") + (d ? `<div class="small muted">${AR_M[d.getMonth()]} ${d.getFullYear()}</div>` : ""))}</div>
    ${r.note ? `<div class="msg warn">${esc(r.note)}</div>` : ""}
    ${safeUrl(r.src) ? `<div class="small muted">المصدر: <a href="${esc(safeUrl(r.src))}" target="_blank" rel="noopener noreferrer">${esc(r.src.replace(/^https?:\/\//, "").split("/")[0])}</a></div>` : ""}</div>`;
}
/* ================= release calendar ================= */
const relStop = x => /^متوقف/.test((x.rel && x.rel.next) || "");
const relDay = s => { const m = String(s || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const REL_ST = {soon:"يصدر قريباً", planned:"مجدول لاحقاً", late:"تجاوز الموعد — تحقق من صدوره", open:"موعد غير محدد", stop:"متوقف", none:"بلا بيانات إصدار"};
const REL_CHIPS = [["", "الكل"], ["recent", "صدر حديثاً"], ["soon", "يصدر قريباً"], ["planned", "مجدول لاحقاً"], ["late", "تجاوز الموعد"], ["open", "موعد غير محدد"], ["stop", "متوقف"], ["none", "بلا بيانات إصدار"]];
const REL_RECENT_DAYS = 90, REL_SOON_MONTHS = 3;
function relStatus(x){
  const r = x.rel || {};
  if (relStop(x)) return "stop";
  const d = relDate(r.due), now = new Date();
  if (!d) return r.last || r.next ? "open" : "none";
  if (d < now) return "late";
  const mo = (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth();
  return mo <= REL_SOON_MONTHS ? "soon" : "planned";
}
const fmtDay = d => `${d.getDate()} ${AR_M[d.getMonth()]} ${d.getFullYear()}`;
const fmtMon = s => { const d = relDate(s); return d ? `${AR_M[d.getMonth()]} ${d.getFullYear()}` : "—"; };
function relList(){
  const now = new Date();
  return RAW.map(x => { const d = relDay(x.rel.date); return {x, st: relStatus(x), d, recent: !!(d && d <= now && (now - d) / 864e5 <= REL_RECENT_DAYS)}; });
}
function relCardsHTML(L){
  const byDue = (a, b) => (relDate(a.x.rel.due) || 0) - (relDate(b.x.rel.due) || 0);
  const recent = L.filter(o => o.recent).sort((a, b) => b.d - a.d), soon = L.filter(o => o.st === "soon").sort(byDue),
        late = L.filter(o => o.st === "late").sort(byDue), stop = L.filter(o => o.st === "stop");
  const item = (o, t) => `<a href="#i-${o.x.id}" title="${esc(o.x.name)}"><span class="nm">${esc(o.x.name)}</span><span class="dt">${t}</span></a>`;
  const cur = ST.page === "cal" ? ST.cal.st : null;
  const card = (cls, title, list, fmt, empty) => { const key = cls.slice(2);
    return `<article class="rcard ${cls}" aria-current="${cur === key}"><button class="rhd" data-calgo="${key}" title="اعرض هذه المؤشرات في التقويم"><b class="num">${list.length}</b><span>${title}</span></button>${list.length ? `<div class="ls">${list.slice(0, 4).map(o => item(o, fmt(o))).join("")}${list.length > 4 ? `<a class="more" href="#calendar" data-calgo="${key}">+ ${list.length - 4} أخرى في التقويم</a>` : ""}</div>` : `<div class="small muted">${empty}</div>`}</article>`; };
  return card("r-recent", `صدر حديثاً (آخر ${REL_RECENT_DAYS} يوماً)`, recent, o => fmtDay(o.d), "لا إصدارات جديدة خلال الفترة") +
    card("r-soon", `يصدر قريباً (${REL_SOON_MONTHS} أشهر)`, soon, o => fmtMon(o.x.rel.due), "لا إصدارات متوقعة قريباً") +
    card("r-late", "تجاوز موعده المتوقع", late, o => fmtMon(o.x.rel.due), "لا يوجد") +
    card("r-stop", "مؤشرات توقف إصدارها", stop, () => "يحتاج قرار", "لا يوجد");
}
function renderRelStrip(){ $("#ov-rel").innerHTML = relCardsHTML(relList()); }
function renderCal(){
  const all = relList(), f = ST.cal;
  document.querySelectorAll("#cal-set button").forEach(b => b.setAttribute("aria-pressed", b.dataset.calset === f.set));
  document.querySelectorAll("#cal-type button").forEach(b => b.setAttribute("aria-pressed", b.dataset.caltype === f.type));
  if ($("#cal-q").value !== f.q) $("#cal-q").value = f.q;
  const qq = norm(f.q);
  const base = all.filter(o => (!f.set || o.x.set === f.set) && (!f.type || (f.type === "intl" ? o.x.intl : !o.x.intl))
    && (!qq || norm([o.x.name, o.x.id, o.x.issuer, o.x.src].join(" ")).includes(qq)));
  const hit = (o, k) => !k || (k === "recent" ? o.recent : o.st === k);
  $("#cal-st").innerHTML = REL_CHIPS.map(([k, t]) => { const n = base.filter(o => hit(o, k)).length;
    return `<button data-calst="${k}" aria-pressed="${f.st === k}"${n || f.st === k ? "" : " disabled"}>${t} <b class="num">${n}</b></button>`; }).join("");
  const L = base.filter(o => hit(o, f.st));
  $("#cal-rel").innerHTML = relCardsHTML(base);
  $("#cal-meta").textContent = `${L.length} من ${all.length} مؤشراً · بيانات الإصدار مسجلة لـ ${all.filter(o => o.st !== "none").length}`;
  const row = o => { const x = o.x, r = x.rel;
    return `<tr><td><a class="ind" href="#i-${x.id}">${esc(x.name)}</a><span class="tag">${x.id} · ${x.set === "updated" ? "مؤشرات الرؤية" : "مساند"} · ${x.intl ? "دولي" : "وطني"}</span>${r.note ? `<div class="nt">${esc(r.note)}</div>` : ""}</td>
      <td class="hide-m small">${esc(x.issuer || x.src || "—")}${safeUrl(r.src) ? `<div><a href="${esc(safeUrl(r.src))}" target="_blank" rel="noopener noreferrer">${esc(r.src.replace(/^https?:\/\//, "").split("/")[0])}</a></div>` : ""}</td>
      <td class="small hide-m">${esc(r.last || "—")}${o.d ? `<div class="muted">${fmtDay(o.d)}</div>` : ""}</td>
      <td class="small">${esc(r.next || "—")}${r.due && !relStop(x) ? `<div class="muted">${fmtMon(r.due)}</div>` : ""}</td>
      <td>${o.recent ? `<span class="rst recent">صدر حديثاً</span> ` : ""}<span class="rst ${o.st}">${REL_ST[o.st]}</span></td></tr>`; };
  let html = "";
  if (f.st === "recent"){
    const g = L.slice().sort((a, b) => b.d - a.d);
    if (g.length) html = `<tr class="grp"><td colspan="5">صدر خلال آخر ${REL_RECENT_DAYS} يوماً — الأحدث أولاً</td></tr>` + g.map(row).join("");
  } else {
    const dated = L.filter(o => ["soon", "planned", "late"].includes(o.st)).sort((a, b) => relDate(a.x.rel.due) - relDate(b.x.rel.due));
    let cur = "";
    dated.forEach(o => { const m = fmtMon(o.x.rel.due); if (m !== cur){ cur = m; html += `<tr class="mon"><td colspan="5">${m}</td></tr>`; } html += row(o); });
    [["open", "موعد الإصدار القادم غير محدد"], ["stop", "مؤشرات توقف إصدارها — تحتاج قراراً من الفريق"], ["none", "بلا بيانات إصدار بعد"]].forEach(([k, t]) => {
      const g = L.filter(o => o.st === k); if (g.length) html += `<tr class="grp"><td colspan="5">${t} (${g.length})</td></tr>` + g.map(row).join("");
    });
  }
  $("#cal-body").innerHTML = html || `<tr><td colspan="5" class="small muted">لا توجد مؤشرات بهذه التصفية. <button class="btn" data-calreset="1">إلغاء التصفية</button></td></tr>`;
}
function kidsHTML(x){
  const g = {}; x.kids.forEach(k => (g[k.grade || ""] = g[k.grade || ""] || []).push(k));
  const tile = (t, v) => `<div class="tile"><small>${t}</small><b class="num" style="font-size:16px">${N(v)}</b></div>`;
  return `<div class="sec"><div class="hd"><h3>التصنيف العام للمؤشر</h3>${catChip(x)}</div><div class="small muted">مؤشر واحد في القائمة المعتمدة يتكوّن من ${x.kids.length} مكونات، ولكل مكوّن خط أساسه ومستهدفاته. التصنيف العام هو أضعف تصنيف بين المكونات.</div></div>` +
    Object.entries(g).map(([gr, ks]) => `<div class="sec"><div class="hd"><h3>${esc(gr)}</h3></div>${ks.map(k => `
      <div style="display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:10px">
        <div class="hd"><b>${esc(k.subject || k.name)}</b>${catChip(k)}</div>
        <div class="tiles">${tile("خط الأساس", k.base != null ? fv(k, k.base) : "—")}${tile("آخر قراءة", k.curAll ? curTxt({...k, cur: k.curAll}) + " · " + k.curAll.y : "—")}${tile("مستهدف 2030", targetTxt(k, 2030))}${tile("مستهدف 2040", targetTxt(k, 2040))}</div>
        ${chartSVG(k)}
      </div>`).join("")}</div>`).join("");
}

/* ================= formatting ================= */
function fmtN(v, dec){ if (v == null || isNaN(v)) return "—"; const a = Math.abs(v); const d = dec != null ? dec : a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : 3; return Number(v.toFixed(d)).toLocaleString("en-US", {maximumFractionDigits:d}); }
const fv = (x, v) => v == null ? "—" : x.pct ? fmtN(v*100, Math.abs(v*100) >= 10 ? 1 : 2) + "%" : fmtN(v);
const fvf = (x, v, field) => field === "r" ? "الترتيب " + fmtN(v, 0) : fv(x, v);
const N = s => /^[-−+]?\d/.test(String(s)) ? `<bdi dir="ltr">${esc(s)}</bdi>` : esc(s);
const curTxt = x => !x.cur ? "—" : x.cur.v != null ? fv(x, x.cur.v) : "الترتيب " + fmtN(x.cur.r, 0);
function targetTxt(x, ty){ ty = ty || ST.ty;
  if (ty === 2040) return x.t40 != null ? fv(x, x.t40) : x.stage === "dev" ? "يُحدَّد لاحقاً" : "—";
  if (x.range) return fv(x, x.range[0]) + " – " + fv(x, x.range[1]); if (x.t30n != null) return fv(x, x.t30n); if (x.t30r != null) return "أفضل " + fmtN(x.t30r, 0); return x.t30text || "—"; }
const rTxt = x => x.p && x.p.R != null && isFinite(x.p.R) ? fmtN(x.p.R * 100, 1) + "%" : (x.p && x.p.achieved ? "حقق المستهدف" : "—");
const catChip = x => x.p.status === "review" ? `<span class="cat c-review" title="${esc(x.p.reason)}">؟ قيد التحقق</span>` : `<span class="cat c-${x.cat}"><b aria-hidden="true">${CAT_SYM[x.cat]}</b> ${E.CAT[x.cat].ar}${x.p.achieved ? " · حقق المستهدف" : ""}</span>`;
function ruleTxt(p){
  if (p.achieved) return "آخر قراءة بلغت المستهدف أو تجاوزته ← على المسار (لا تُحسب نسبة التقدّم)";
  if (p.status === "review") return "لم يُصنَّف: " + p.reason;
  if (!isFinite(p.R)) return p.reason || "لا يمكن الحساب";
  const r = fmtN(p.R * 100, 1) + "%";
  if (p.moved < 0) return `التغيّر الفعلي في الاتجاه المعاكس للمستهدف ← يتراجع (نسبة التقدّم ${r})`;
  if (p.moved === 0) return "لا تغيّر بين أول قراءة وآخرها ← ثابت بلا تقدم (منفصل عن التراجع)";
  if (p.cat === "on_track") return `نسبة التقدّم ${r} أكبر من 90% ← على المسار`;
  if (p.cat === "needs") return `نسبة التقدّم ${r} بين 50% و90% ← يحتاج تحسيناً`;
  return `نسبة التقدّم ${r} أقل من 50% مع تقدم في الاتجاه المطلوب ← متأخر عن المسار`;
}
function gapTxt(x){ const p = x.p; if (p.achieved) return "0"; if (p.T == null || !p.latest) return "—"; return p.field === "r" ? fmtN(Math.abs(p.T - p.latest.val), 0) + " مرتبة" : x.pct ? fmtN(Math.abs(p.T - p.latest.val)*100, 2) + " نقطة مئوية" : fmtN(Math.abs(p.T - p.latest.val)); }
const ageCls = a => a == null ? "" : a <= 1 ? "" : a === 2 ? "warn" : "bad";
const ageTxt = a => a == null ? "بلا قراءة" : a <= 0 ? "هذا العام" : a === 1 ? "قبل سنة" : a === 2 ? "قبل سنتين" : `قبل ${a} سنوات`;
const badge = x => `<span class="badge ${EVAL[x.ev].cls}">${EVAL[x.ev].label}</span>`;
const methTxt = m => m === "CAGR" ? "نمو سنوي مركّب (CAGR)" : "خطي";
const rateTxt = (x, v) => v == null || !isFinite(v) ? "—" : x.p.method === "CAGR" ? fmtN(v*100, 2) + "% سنوياً" : x.p.field === "r" ? fmtN(v, 2) + " مرتبة سنوياً" : x.pct ? fmtN(v*100, 3) + " نقطة مئوية سنوياً" : fmtN(v, 3) + " سنوياً";

/* ================= filtering ================= */
const norm = s => String(s||"").toLowerCase().replace(/[ً-ٰٟـ]/g,"").replace(/[إأآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/ؤ/g,"و").replace(/ئ/g,"ي").replace(/[^\p{L}\p{N}\s\-]/gu," ").replace(/\s+/g," ").trim();
const stripAl = w => w.length > 4 && w.startsWith("ال") ? w.slice(2) : w;
const inSet = x => x.set === ST.set;
const matchQ = x => !ST.q || norm(ST.q).split(" ").filter(Boolean).map(stripAl).every(t => x._k.includes(t));
const baseList = () => RAW.filter(x => inSet(x) && (!ST.axis || x.axis === ST.axis) && (!ST.pri || x.priority === ST.pri) && matchQ(x));
function filtered(){
  const ty = $("#f-type").value, fr = $("#f-fresh").value, el = $("#f-elig").value;
  return baseList().filter(x => (!ST.ev || x.ev === ST.ev) && (!ST.cat || x.cat === ST.cat) && (!ty || (ty === "intl" ? x.intl : !x.intl)) && (el === "" || String(x.el.level) === el)
    && (!fr || (fr === "none" ? x.age == null : fr === "fresh" ? x.age != null && x.age <= 1 : fr === "late" ? x.age === 2 : x.age != null && x.age >= 3)));
}

/* ================= tree ================= */
function prioritiesOf(axis){ const m = new Map(); RAW.filter(x => inSet(x) && x.axis === axis).forEach(x => m.set(x.priority, (m.get(x.priority)||0)+1)); return [...m.entries()]; }
const minibar = list => `<div class="minibar">${CATS.map(k => { const c = list.filter(x => x.cat === k).length; return c ? `<i style="flex:${c};background:${CAT_C[k]}"></i>` : ""; }).join("")}</div>`;
function renderTree(){
  const all = RAW.filter(inSet);
  let h = `<button class="axh" data-axis="" aria-current="${!ST.axis && !ST.pri}"><span>كل المؤشرات</span><span class="cnt">${all.length}</span></button>`;
  AXES.forEach(a => {
    const ax = all.filter(x => x.axis === a); if (!ax.length) return;
    h += `<div class="ax"><button class="axh" data-axis="${esc(a)}" aria-current="${ST.axis === a && !ST.pri}"><span>${esc(a)}</span><span class="cnt">${ax.length}</span></button>${minibar(ax)}`;
    prioritiesOf(a).forEach(([p,n]) => { h += `<button class="pr" data-pri="${esc(p)}" data-ax="${esc(a)}" aria-current="${ST.pri === p}"><span>${esc(p)}</span><span class="cnt">${n}</span></button>`; });
    h += `</div>`;
  });
  $("#tree").innerHTML = h;
  $("#m-axis").innerHTML = `<option value="">كل المحاور</option>` + AXES.map(a => `<option ${ST.axis===a?"selected":""}>${esc(a)}</option>`).join("");
  const ps = ST.axis ? prioritiesOf(ST.axis) : AXES.flatMap(prioritiesOf);
  $("#m-pri").innerHTML = `<option value="">كل الأولويات</option>` + ps.map(([p]) => `<option ${ST.pri===p?"selected":""}>${esc(p)}</option>`).join("");
}

/* ================= controls ================= */
function renderControls(){
  const yrs = []; for (let y = YMIN; y <= NOW; y++) yrs.push(y);
  $("#y-from").innerHTML = yrs.map(y => `<option ${y===ST.from?"selected":""}>${y}</option>`).join("");
  $("#y-to").innerHTML = yrs.map(y => `<option ${y===ST.to?"selected":""}>${y}</option>`).join("");
  $("#y-calc").checked = ST.calcLinked;
  document.querySelectorAll("#tyseg button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.ty === ST.ty));
  $("#tylbl").textContent = ST.ty; $("#th-t").textContent = "مستهدف " + ST.ty;
  const later = RAW.some(x => x.series.some(s => s.y > ST.to && s.y <= NOW && (s.v != null || s.r != null)));
  $("#calcnote").textContent = ST.calcLinked
    ? (ST.to < NOW && later ? `الحسابات تستخدم ${ST.from}–${ST.to} فقط؛ القراءات بعد ${ST.to} مستبعدة منها.` : `الحسابات تستخدم ${ST.from}–${ST.to}.`)
    : `الحسابات تستخدم كل السنوات المتاحة، بما فيها ما هو خارج فترة العرض.`;
}

/* ================= cards / table ================= */
function spark(x){
  const pts = x.series.filter(r => r.y <= NOW && r.y >= ST.from && r.y <= ST.to && r.v != null);
  if (pts.length < 2) return `<svg viewBox="0 0 200 34" aria-hidden="true"></svg>`;
  const ys = pts.map(r => r.v); let lo = Math.min(...ys), hi = Math.max(...ys); if (lo === hi){ lo -= 1; hi += 1; }
  const x0 = pts[0].y, x1 = pts[pts.length-1].y, X = y => 4 + 192*(y-x0)/Math.max(1,x1-x0), Y = v => 30 - 26*(v-lo)/(hi-lo);
  const d = pts.map((r,i) => (i?"L":"M") + X(r.y).toFixed(1) + " " + Y(r.v).toFixed(1)).join(" "), l = pts[pts.length-1];
  return `<svg viewBox="0 0 200 34" aria-hidden="true"><path d="${d} L${X(l.y)} 34 L${X(x0)} 34 Z" fill="var(--accent)" opacity=".09"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2"/><circle cx="${X(l.y)}" cy="${Y(l.v)}" r="3.2" fill="var(--accent)"/></svg>`;
}
function cardHTML(x){
  const est = x.cur && x.cur.kind && x.cur.kind !== "فعلية" ? `<span class="est">${esc(x.cur.kind)}</span>` : "";
  return `<div class="card" data-open="${x.id}" role="button" tabindex="0" style="--c:${CAT_C[x.cat]}">
    <span class="cmpbox"><input type="checkbox" class="cmpchk" data-cmp="${x.id}" aria-label="أضف للمقارنة" ${ST.cmp.has(x.id)?"checked":""}></span>
    <span class="pri">${esc(x.priority)}</span>
    <span class="nm">${esc(x.name)}</span>
    <span class="vals"><span><span class="big num">${N(curTxt(x))}</span> ${est}<br><span class="yr">${x.cur ? "آخر قراءة " + x.cur.y : "لا قراءة في الفترة"}</span></span>
      <span class="tg">مستهدف ${ST.ty}<b>${N(targetTxt(x))}</b></span></span>
    ${spark(x)}
    <span class="rline"><span>${catChip(x)}</span><span>التقدّم <b>${N(rTxt(x))}</b></span></span>
    <span class="foot"><span></span><span style="display:flex;gap:6px;align-items:center">${x.age!=null&&x.age>=2?`<span class="age ${(x.relOk ? "" : ageCls(x.age))}">${ageTxt(x.age)}</span>`:""}<span class="code">${x.id}</span></span></span>
  </div>`;
}
function rowHTML(x){
  return `<tr data-open="${x.id}" tabindex="0"><td class="n code">${x.id}</td><td>${esc(x.name)}</td><td class="small">${esc(x.priority)}</td>
    <td class="n">${N(curTxt(x))} <span class="small muted">${x.cur?x.cur.y:""}</span></td><td class="n">${N(targetTxt(x))}</td>
    <td class="n">${N(rTxt(x))}</td><td>${catChip(x)}</td><td class="n">${N(gapTxt(x))}</td><td><span class="lv lv${x.el.level}">${x.el.level}</span></td></tr>`;
}
function renderDash(){
  const base = baseList(), list = filtered();
  $("#title").textContent = ST.pri || ST.axis || "كل المؤشرات";
  $("#count").textContent = `${list.length} مؤشر` + (ST.set === "updated" ? " · مؤشرات الرؤية" : " · المؤشرات المساندة");
  $("#kpis").innerHTML = `<button class="kpi" data-ev="" aria-pressed="${!ST.ev}" style="--c:var(--ink)"><b class="num">${base.length}</b><span>كل المؤشرات</span></button>` +
    EV_ORDER.map(k => `<button class="kpi" data-ev="${k}" aria-pressed="${ST.ev===k}" style="--c:${EVAL[k].c}"><b class="num">${base.filter(x=>x.ev===k).length}</b><span>${EVAL[k].label}</span></button>`).join("");
  $("#kpis2").innerHTML = CATS.map(k => `<button class="kpi" data-cat="${k}" aria-pressed="${ST.cat===k}" style="--c:${CAT_C[k]}" title="${E.CAT[k].en}"><b class="num">${base.filter(x=>x.cat===k).length}</b><span>${E.CAT[k].ar}</span></button>`).join("");
  const s = $("#f-sort").value;
  const order = s === "name" ? (a,b) => a.name.localeCompare(b.name,"ar")
    : s === "r" ? (a,b) => (isFinite(b.p.R) ? b.p.R : (b.p.achieved ? 99 : -99)) - (isFinite(a.p.R) ? a.p.R : (a.p.achieved ? 99 : -99))
    : s === "age" ? (a,b) => (b.age ?? 99) - (a.age ?? 99)
    : s === "eval" ? (a,b) => EV_ORDER.indexOf(a.ev) - EV_ORDER.indexOf(b.ev)
    : (a,b) => AXES.indexOf(a.axis) - AXES.indexOf(b.axis) || a.priority.localeCompare(b.priority,"ar") || a.id.localeCompare(b.id, "en", {numeric:true});
  list.sort(order);
  const table = ST.view === "table";
  $("#grid").hidden = table; $("#tblwrap").hidden = !table;
  $("#viewseg").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === ST.view));
  if (table) $("#tbody").innerHTML = list.map(rowHTML).join("") || `<tr><td colspan="10" class="muted">لا توجد مؤشرات بهذه التصفية.</td></tr>`;
  else $("#grid").innerHTML = list.length ? list.map(cardHTML).join("") : `<div class="empty" style="grid-column:1/-1">لا توجد مؤشرات بهذه التصفية.</div>`;
  $("#reset").hidden = !(ST.axis || ST.pri || ST.ev || ST.cat || ST.q || $("#f-type").value || $("#f-fresh").value || $("#f-elig").value !== "");
  renderCmpBar();
}

/* ================= chart (interactive) ================= */
function chartSVG(x, opts){
  opts = opts || {};
  const inR = r => r.y >= ST.from && r.y <= Math.max(ST.to, opts.fcYear || 0);
  const pts = x.series.filter(r => r.v != null && r.y <= NOW && r.y >= ST.from && r.y <= ST.to);
  const path = x.series.filter(r => r.p != null && r.y >= ST.from);
  const fc = opts.fc;
  if (!pts.length && !path.length) return `<p class="small muted" style="margin:0">لا توجد قراءات رقمية في فترة العرض.</p>`;
  const sc = v => x.pct ? v*100 : v;
  const tgtV = ST.ty === 2040 ? x.t40 : x.t30n;
  const ys = [...pts.map(r=>sc(r.v)), ...path.map(r=>sc(r.p))]; if (tgtV != null) ys.push(sc(tgtV)); if (ST.ty === 2030 && x.range) ys.push(sc(x.range[0]), sc(x.range[1]));
  if (fc) ys.push(sc(fc.lo), sc(fc.hi), sc(fc.point));
  const yrs = [...pts.map(r=>r.y), ...path.map(r=>r.y), ST.ty === 2040 && tgtV != null ? 2040 : 2030], x0 = Math.min(...yrs), x1 = Math.max(...yrs);
  let lo = Math.min(...ys), hi = Math.max(...ys); if (lo === hi){ lo -= 1; hi += 1; } const pad = (hi-lo)*.1; lo -= pad; hi += pad;
  const W = 600, H = 230, L = 50, R = 14, T = 12, B = 26, X = y => L + (W-L-R)*(y-x0)/Math.max(1,x1-x0), Y = v => T + (H-T-B)*(1-(v-lo)/(hi-lo));
  const line = (arr, f) => arr.map((r,i) => (i?"L":"M") + X(r.y).toFixed(1) + " " + Y(sc(f(r))).toFixed(1)).join(" ");
  let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="السلسلة الزمنية" data-chart="${x.id}">`;
  for (let i=0;i<=4;i++){ const t = lo + (hi-lo)*i/4; g += `<line x1="${L}" x2="${W-R}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="${L-6}" y="${Y(t)+4}" text-anchor="end">${fmtN(t, Math.abs(hi-lo)<5?2:Math.abs(hi-lo)<50?1:0)}</text>`; }
  const step = Math.max(1, Math.ceil((x1-x0)/8)); for (let y=x0; y<=x1; y+=step) g += `<text x="${X(y)}" y="${H-6}" text-anchor="middle">${y}</text>`;
  if (ST.ty === 2030 && x.range) g += `<rect x="${L}" width="${W-L-R}" y="${Y(sc(x.range[1]))}" height="${Math.max(1, Y(sc(x.range[0]))-Y(sc(x.range[1])))}" fill="var(--good)" opacity=".12"/>`;
  else if (tgtV != null) g += `<line x1="${L}" x2="${W-R}" y1="${Y(sc(tgtV))}" y2="${Y(sc(tgtV))}" stroke="var(--good)" stroke-dasharray="2 4" stroke-width="1.5"/>`;
  if (path.length > 1) g += `<path d="${line(path, r=>r.p)}" fill="none" stroke="var(--sand)" stroke-width="2" stroke-dasharray="5 4"/>`;
  const act = pts.filter(r => (r.kind||"فعلية") === "فعلية");
  if (fc && pts.length){
    const l = pts[pts.length-1];
    g += `<path d="M${X(l.y)} ${Y(sc(l.v))} L${X(fc.y)} ${Y(sc(fc.hi))} L${X(fc.y)} ${Y(sc(fc.lo))} Z" fill="var(--muted)" opacity=".12"/><path d="M${X(l.y)} ${Y(sc(l.v))} L${X(fc.y)} ${Y(sc(fc.point))}" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="4 4"/><circle cx="${X(fc.y)}" cy="${Y(sc(fc.point))}" r="4" fill="var(--surface)" stroke="var(--muted)" stroke-width="2"/>`;
  }
  if (act.length){
    g += `<path d="${line(act, r=>r.v)} L${X(act[act.length-1].y)} ${H-B} L${X(act[0].y)} ${H-B} Z" fill="var(--accent)" opacity=".08"/><path d="${line(act, r=>r.v)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  }
  pts.forEach(r => { const est = (r.kind||"فعلية") !== "فعلية"; g += `<circle cx="${X(r.y)}" cy="${Y(sc(r.v))}" r="${est?4:3}" fill="${est?"var(--surface)":"var(--accent)"}" stroke="${est?"#b8862f":"var(--accent)"}" stroke-width="2"/>`; if (r.brk) g += `<line x1="${X(r.y)-6}" x2="${X(r.y)-6}" y1="${T}" y2="${H-B}" stroke="var(--bad)" stroke-dasharray="3 3"/>`; });
  // hover targets
  const yset = [...new Set([...pts.map(r=>r.y), ...path.map(r=>r.y)])].sort((a,b)=>a-b);
  yset.forEach((y,i) => { const xl = i ? (X(yset[i-1]) + X(y))/2 : L, xr = i < yset.length-1 ? (X(y) + X(yset[i+1]))/2 : W-R; g += `<rect x="${xl}" y="${T}" width="${Math.max(1,xr-xl)}" height="${H-T-B}" fill="transparent" data-hy="${y}"/>`; });
  return g + `</svg><div class="legend"><span><i style="background:var(--accent)"></i>قراءة فعلية</span>${pts.some(r=>(r.kind||"فعلية")!=="فعلية")?`<span><i style="background:#b8862f"></i>قراءة تقديرية أو أولية (دائرة مفرغة)</span>`:""}${path.length>1?`<span><i style="background:var(--sand)"></i>المسار المستهدف</span>`:""}<span><i style="background:var(--good)"></i>${ST.ty===2030&&x.range?"نطاق المستهدف":"مستهدف "+ST.ty}</span>${fc?`<span><i style="background:var(--muted)"></i>توقع إحصائي ونطاق 80%</span>`:""}${pts.some(r=>r.brk)?`<span><i style="background:var(--bad)"></i>تغيّر التعريف</span>`:""}</div>`;
}
function tipFor(x, y){
  const r = x.series.find(s => s.y === y) || {};
  const parts = [`${y}`];
  if (r.v != null && y <= NOW) parts.push(`القيمة ${fv(x, r.v)}${r.kind && r.kind !== "فعلية" ? " ("+r.kind+")" : ""}`);
  if (r.r != null && y <= NOW) parts.push(`الترتيب ${fmtN(r.r,0)}`);
  if (r.p != null) parts.push(`المسار ${fv(x, r.p)}`);
  if (r.src && y <= NOW) parts.push(r.src);
  return parts.join(" · ");
}

/* ================= drawer ================= */
function calcDetails(x){
  if (x.kids) return `<div class="small muted">تفاصيل الحساب لكل مكوّن تظهر في بطاقته ضمن «الملخص».</div>`;
  const p = x.p, f = p.field, cr = calcRange();
  const used = p.used.map(u => f === "r" ? `${u.y}: ${esc(fvf(x, u.val, f))}` : `<bdi dir="ltr">${u.y}: ${esc(fvf(x, u.val, f))}</bdi>`).join("، ") || "—";
  const exc = p.excluded.map(e => `${e.y} (${e.reason})`).join("، ");
  let body = `<div><b>فترة الحساب:</b> ${isFinite(cr.calcFrom) ? cr.calcFrom + "–" + cr.calcTo : "كل السنوات المتاحة"} · <b>الطريقة:</b> ${methTxt(p.method)} · <b>سنة المستهدف:</b> ${ST.ty}</div>
    <div><b>القراءات المستخدمة:</b> ${used}</div>${exc ? `<div><b>غير مستخدمة:</b> ${esc(exc)}</div>` : ""}`;
  if (p.status === "dev") return body + `<div class="msg"><b>قيد التطوير:</b> ${esc(p.reason)}. تُعرض القراءات واتجاهها للاطلاع، ولا يدخل المؤشر في نسب الأداء حتى يُعتمد مستهدفه.</div>`;
  if (p.status === "review") return body + `<div class="msg warn"><b>قيد التحقق:</b> ${esc(p.reason)}. لا يُصنَّف أداؤه حتى تُؤكَّد بياناته.</div>${isFinite(p.previewR) ? `<div class="small muted">للاطلاع فقط (غير معتمد): نسبة التقدّم بالبيانات الحالية = ${fmtN(p.previewR*100,1)}%.</div>` : ""}`;
  if (p.status !== "ok" && !p.achieved) return body + `<div><b>النتيجة:</b> ${esc(p.reason || "لا يمكن الحساب")}</div>`;
  if (p.achieved && p.R == null) return body + `<div><b>القاعدة المطبّقة:</b> ${esc(ruleTxt(p))}</div><div><b>النتيجة:</b> آخر قراءة (${fvf(x, p.latest.val, f)} في ${p.latest.y}) بلغت المستهدف${p.T != null ? " (" + fvf(x, p.T, f) + ")" : ""}، فالتصنيف «على المسار» دون حساب نسبة التقدّم.</div>`;
  const F = p.first, L = p.latest, raw = v => f === "r" ? fmtN(v,0) : x.pct ? fmtN(v*100,3) + "%" : fmtN(v,4);
  if (p.method === "CAGR"){
    body += `<div>معدل النمو المركّب الفعلي: <code>(${raw(L.val)} ÷ ${raw(F.val)})^(1/${p.hy}) − 1 = ${fmtN(p.actual*100,3)}%</code></div>
      <div>معدل النمو المركّب المطلوب: <code>(${raw(p.T)} ÷ ${raw(L.val)})^(1/${p.ry}) − 1 = ${fmtN(p.required*100,3)}%</code></div>`;
  } else {
    body += `<div>المعدل السنوي الفعلي: <code>(${raw(L.val)} − ${raw(F.val)}) ÷ (${L.y} − ${F.y}) = ${raw(p.actual)}</code></div>
      <div>المعدل السنوي المطلوب: <code>(${raw(p.T)} − ${raw(L.val)}) ÷ (${p.TY} − ${L.y}) = ${raw(p.required)}</code></div>`;
  }
  body += `<div>نسبة التقدّم = المعدل الفعلي ÷ المعدل المطلوب: <code>${fmtN(p.actual,6)} ÷ ${fmtN(p.required,6)} = ${fmtN(p.R*100,2)}%</code></div>
    <div><b>القاعدة المطبّقة:</b> ${esc(ruleTxt(p))}</div>
    <div class="small muted">القواعد: تحقّق المستهدف أو نسبة تقدّم أكثر من 90% ← على المسار · من 50% إلى 90% ← يحتاج تحسيناً · أقل من 50% مع تقدّم ← متأخر عن المسار · تغيّر عكسي ← يتراجع · لا تغيّر ← ثابت. لا تُقيَّد النسبة بسقف 100%.</div>`;
  return body;
}
function periodHTML(x){
  const a = E.aggregate(x, ST.from, ST.to, NOW);
  const f = a.field, fx = v => fvf(x, v, f);
  let h = `<div class="sec"><div class="hd"><h3>الفترة ${ST.from}–${ST.to}</h3><span class="pill2">نوع التجميع: ${esc(a.label)}</span></div>`;
  if (!a.n) return h + `<div class="small muted">لا توجد قراءات في الفترة.</div></div>`;
  const rows = [`<div class="tile"><small>بداية الفترة (${a.start.y})</small><b class="num">${N(fx(a.start[f]))}</b></div>`, `<div class="tile"><small>نهاية الفترة (${a.end.y})</small><b class="num">${N(fx(a.end[f]))}</b></div>`];
  if (a.type === "flow" || a.type === "events") rows.push(`<div class="tile"><small>الإجمالي خلال الفترة${a.complete?"":" (جزئي)"}</small><b class="num">${N(fx(a.total))}</b></div>`);
  else if (a.change != null) rows.push(`<div class="tile"><small>${a.type==="cumulative"?"الزيادة خلال الفترة":"التغيّر"}</small><b class="num">${N(f==="r"?fmtN(a.change,0)+" مرتبة":x.pct?fmtN(a.change*100,2)+" نقطة":fmtN(a.change))}</b>${a.pctChange!=null?`<div class="sub">${N(fmtN(a.pctChange*100,1)+"%")}</div>`:""}</div>`);
  h += `<div class="dtiles">${rows.join("")}</div>`;
  if (!a.type) h += `<div class="msg warn">${esc(a.reason)}</div>`;
  else { if (a.reason) h += `<div class="msg warn">${esc(a.reason)}</div>`; if (a.note) h += `<div class="small muted">${esc(a.note)}</div>`; }
  return h + `</div>`;
}
function forecastHTML(x){
  if (!x.showFc) return "";
  const fc = x.el.forecast, f = x.p.field, fx = v => fvf(x, v, f);
  let h = `<div class="sec forecast"><div class="hd"><h3>توقع ${fc.y} · تقديري</h3><span class="pill2">${esc(x.approval === "معتمد" ? "معتمد منهجياً" : "نتيجة آلية · قيد المراجعة المنهجية")}</span></div>
    <div class="dtiles"><div class="tile"><small>التوقع النقطي</small><b class="num">${N(fx(fc.point))}</b></div><div class="tile"><small>نطاق عدم اليقين 80%</small><b class="num" style="font-size:15px">من ${N(fx(fc.lo))} إلى ${N(fx(fc.hi))}</b></div><div class="tile"><small>النموذج</small><b style="font-size:13px">${esc(fc.method)}</b><div class="sub">خطأ الاختبار (MASE) ${fmtN(x.el.backtest.mase,2)} · ${x.el.n} قراءة</div></div></div>`;
  if (x.showP){ const m = x.el.mc; h += `<div class="dtiles"><div class="tile"><small>احتمال تحقيق المستهدف</small><b class="num">${N(fmtN(m.p*100,0)+"%")}</b></div><div class="tile"><small>نطاق المحاكاة (10%–90%)</small><b class="num" style="font-size:15px">من ${N(fx(m.p10))} إلى ${N(fx(m.p90))}</b></div><div class="tile"><small>المحاكاة</small><b style="font-size:13px">إعادة المعاينة للبواقي (Bootstrap)</b><div class="sub">${m.B} تكرار</div></div></div>`; }
  return h + `<div class="small muted">التوقع امتداد إحصائي للاتجاه، وليس قراءة فعلية.</div></div>`;
}
function textBlocks(x){
  const items = [["التحديات", x.challenges, "الإدارة"], ["ملاحظات تفسيرية", x.explain, "الإدارة"], ["المبادرات المرتبطة", x.initiatives, "الإدارة"],
    ["العوامل المؤثرة", x.factors, "بطاقة المؤشر"], ["المؤشرات والعوامل المساندة", x.supporting, "بطاقة المؤشر"], ["تقدير عدم التحقق", x.risk, "بطاقة المؤشر"]].filter(i => i[1]);
  let h = items.map(([t, v, s]) => `<div><b style="font-size:13px">${t}</b> <span class="pill2">المصدر: ${s}</span><div class="small" style="white-space:pre-wrap;margin-top:2px">${esc(v)}</div></div>`).join("");
  if (x.notes.length) h += `<details><summary>ملاحظات تفسيرية سنوية (${x.notes.length}) · المصدر: ${esc(x.notes[0].s || "بطاقة المؤشر")}</summary>${x.notes.map(n => `<p class="small" style="margin:6px 0"><b>${n.y}:</b> ${esc(n.t)}</p>`).join("")}</details>`;
  return h ? `<div class="sec"><h3>خصائص ومعلومات من مصادر معتمدة</h3>${h}</div>` : "";
}
function openDrawer(id, target){
  const x = BY[id]; if (!x){ closeDrawer(); return; }
  const a = ST.assess[x.id], p = x.p, cr = calcRange();
  const vIss = E.validity(x, NOW);
  const usedYears = new Set(p.used.map(u => u.y)), excl = Object.fromEntries(p.excluded.map(e => [e.y, e.reason]));
  const rows = x.series.filter(r => r.y >= ST.from && ((r.y <= Math.min(ST.to, NOW) && (r.v != null || r.r != null)) || (r.p != null && r.y <= Math.max(ST.to, ST.ty)))).map(r => {
    const isAct = r.y <= NOW && (r.v != null || r.r != null);
    const use = !isAct ? "" : usedYears.has(r.y) ? `<span style="color:var(--good)">مستخدمة</span>` : excl[r.y] ? `<span class="small muted">${esc(excl[r.y])}</span>` : `<span class="small muted">خارج الحساب</span>`;
    return `<tr><td class="n">${r.y}${r.brk?` <span class="pill2" style="color:var(--bad)">تغيّر التعريف</span>`:""}</td><td class="n">${isAct&&r.v!=null?N(fv(x,r.v)):"—"}</td><td class="n">${isAct&&r.r!=null?fmtN(r.r,0):"—"}</td><td class="n">${r.p!=null?N(fv(x,r.p)):"—"}</td><td class="small">${isAct?esc(r.kind||"فعلية"):""}</td><td class="small">${isAct?escB(r.src||"—")+(r.note?`<div class="small" style="color:#b8862f;margin-top:2px">${esc(r.note)}</div>`:""):""}</td><td class="small">${isAct?esc(r.rel||""):""}</td><td>${use}</td></tr>`; }).join("");
  const evalCtl = ST.admin ? `<div class="evalopts" role="group" aria-label="تقييم المؤشر">${EV_ORDER.map(k => `<button type="button" class="${EVAL[k].cls}" data-setev="${k}" aria-pressed="${x.ev===k}">${EVAL[k].label}</button>`).join("")}</div>` : `<div>${badge(x)}</div>`;
  const lastOut = x.curAll && x.curAll.y > (isFinite(cr.calcTo) ? cr.calcTo : 9999) ? `<div class="msg warn">قراءة ${x.curAll.y} (${N(x.curAll.v != null ? fv(x, x.curAll.v) : "الترتيب " + x.curAll.r)}) خارج فترة الحساب ولم تدخل المعادلة.</div>` : "";
  const html = `
    <div class="dh"><div><div class="small muted">${esc(x.axis)} ‹ ${esc(x.priority)}</div><h2 style="font-size:18px">${esc(x.name)}</h2><div class="small muted"><span class="code">${x.id}</span> · ${x.set==="updated"?"مؤشرات الرؤية":"المؤشرات المساندة"}${x.intl?" · دولي":""} · <span class="age ${(x.relOk ? "" : ageCls(x.age))}">آخر بيانات ${ageTxt(x.age)}</span></div></div>
      <div style="display:flex;gap:6px">${shareBtns(x.id)}<button class="btn" data-close aria-label="إغلاق">✕</button></div></div>
    <div class="db">
      <div class="itabs" role="tablist">${["الملخص","القراءات","المنهجية","المصدر"].map((n, i) => `<button role="tab" data-itab="${i}" aria-selected="${(ST.indTab||0) === i}">${n}</button>`).join("")}</div>
      <div data-tabp="0" ${(ST.indTab||0) !== 0 ? "hidden" : ""}>
      <div class="small muted">فترة العرض ${ST.from}–${ST.to} · فترة الحساب ${isFinite(cr.calcFrom) ? cr.calcFrom + "–" + cr.calcTo : "كل السنوات"} · المستهدف ${ST.ty}</div>
      ${x.kids ? kidsHTML(x) : `
      <div class="tiles">
        <div class="tile"><small>خط الأساس</small><b class="num">${x.base!=null?N(fv(x,x.base)):"—"}</b></div>
        <div class="tile cur"><small>آخر قراءة في الفترة</small><b class="num">${N(curTxt(x))}</b><div class="sub">${x.cur?x.cur.y + " · " + esc(x.cur.kind||"فعلية") + (x.cur.src ? " · " + escB(x.cur.src, 1) : "") + (x.cur.note ? `<div style="color:#b8862f;margin-top:2px">${esc(x.cur.note)}</div>` : ""):""}</div></div>
        <div class="tile"><small>مستهدف 2030</small><b class="num">${N(targetTxt(x, 2030))}</b></div>
        <div class="tile"><small>مستهدف 2040</small><b class="num">${N(targetTxt(x, 2040))}</b></div>
      </div>
      ${chartSVG(x, {fc: x.showFc ? x.el.forecast : null, fcYear: x.showFc ? x.el.forecast.y : 0})}
      ${lastOut}
      <div class="sec"><div class="hd"><h3>التقدّم نحو مستهدف ${ST.ty}</h3>${catChip(x)}</div>
        <div class="dtiles"><div class="tile"><small>نسبة التقدّم نحو المستهدف</small><b class="num">${N(rTxt(x))}</b></div><div class="tile"><small>الفجوة المتبقية</small><b class="num" style="font-size:16px">${N(gapTxt(x))}</b></div><div class="tile"><small>الطريقة</small><b style="font-size:15px">${methTxt(p.method)}</b></div>
          <div class="tile"><small>المعدل الفعلي</small><b class="num" style="font-size:14px">${N(rateTxt(x, p.actual))}</b></div><div class="tile"><small>المعدل المطلوب</small><b class="num" style="font-size:14px">${N(rateTxt(x, p.required))}</b></div><div class="tile"><small>الأهلية</small><b style="font-size:14px"><span class="lv lv${x.el.level}">${x.el.level}</span> ${LV_LABEL[x.el.level]}</b></div></div>
      </div>
      `}
      ${releaseHTML(x)}
      </div>
      <div data-tabp="1" ${(ST.indTab||0) !== 1 ? "hidden" : ""}>
      ${periodHTML(x)}
      <div class="tablewrap"><table><thead><tr><th>السنة</th><th>القيمة</th><th>الترتيب</th><th>المسار</th><th>النوع</th><th>المصدر</th><th>الموثوقية</th><th>في الحساب</th></tr></thead><tbody>${rows||`<tr><td colspan="8" class="muted">لا توجد قراءات في الفترة.</td></tr>`}</tbody></table></div>
      </div>
      <div data-tabp="2" ${(ST.indTab||0) !== 2 ? "hidden" : ""}>
      <div class="sec"><h3>المعادلة والأرقام التي دخلت الحساب</h3><div class="calc">${calcDetails(x)}</div></div>
      ${forecastHTML(x)}
      ${vIss.length?`<div class="sec"><h3>صلاحية البيانات</h3><ul class="list">${vIss.map(i=>`<li>${esc(i.t)}</li>`).join("")}</ul></div>`:""}
      </div>
      <div data-tabp="3" ${(ST.indTab||0) !== 3 ? "hidden" : ""}>
      <dl class="facts">
        <dt>الجهة المالكة</dt><dd>${esc(x.owner||"—")}</dd><dt>جهة الإصدار</dt><dd>${esc(x.issuer||"—")}</dd>
        <dt>مصدر البيانات</dt><dd>${escB(x.src||"—")}</dd><dt>دورية التحديث</dt><dd>${esc(x.freq||"—")}</dd>
        <dt>طريقة الحساب</dt><dd>${esc(x.methodText||"—")}</dd><dt>الوحدة · الاتجاه</dt><dd>${esc(x.unit)} · ${x.dir==="down"?"الانخفاض أفضل":"الارتفاع أفضل"}</dd>
        <dt>طريقة حساب التقدّم</dt><dd>${methTxt(x.method)}</dd><dt>نوع التجميع</dt><dd>${esc(x.aggLabel||"غير محدد")}</dd>
      </dl>
      ${textBlocks(x)}
      </div>
      ${ST.admin?`<div class="evalbox"><h3 style="font-size:14px">إضافة قراءة سريعة</h3>
        <form class="upd" data-updfor="${x.id}">
          <label>السنة<input name="y" type="number" min="2000" max="${NOW}" value="${x.curAll?Math.min(NOW,x.curAll.y+1):NOW}" required></label>
          <label>${x.pct?"القيمة %":"القيمة"}<input name="v" inputmode="decimal"></label>
          <label>الترتيب<input name="r" type="number" min="1" max="250"></label>
          <button class="btn primary" type="submit">حفظ ونشر</button>
        </form><span class="small muted">تُسجَّل كقراءة فعلية مصدرها «إدخال سريع». للتحديثات الكثيرة استخدم ملف Excel.</span></div>`:""}
    </div>`;
  if (target){ target.innerHTML = html; return; }
  $("#drawer").innerHTML = html;
  $("#drawer").hidden = false; $("#scrim").hidden = false; $("#drawer").scrollTop = 0; $("#drawer").dataset.mode = "ind";
}
function closeDrawer(){ $("#drawer").hidden = true; $("#scrim").hidden = true; }

/* ================= compare ================= */
const CMP_COLORS = ["#0d6b5a","#b8862f","#2b5f9e","#b23a32"];
function renderCmpBar(){ const n = ST.cmp.size; $("#cmpbar").hidden = !n; $("#cmpn").textContent = `${n} للمقارنة` + (n >= 4 ? " (الحد الأقصى)" : ""); }
function openCompare(){
  const xs = [...ST.cmp].map(id => BY[id]).filter(Boolean); if (!xs.length) return;
  const units = new Set(xs.map(x => x.p.field === "r" ? "rank" : x.unit));
  const sameUnit = units.size === 1;
  const mode = $("#drawer").dataset.cmpmode || (sameUnit ? "raw" : "index");
  const eff = mode === "raw" && !sameUnit ? "index" : mode;
  const series = xs.map((x, i) => {
    const f = x.series.some(s => s.v != null) && !(x.p.field === "r") ? "v" : "r";
    const pts = x.series.filter(s => s[f] != null && s.y <= NOW && s.y >= ST.from && s.y <= ST.to).map(s => ({y:s.y, v:s[f]}));
    let out = pts, note = "";
    if (eff === "index"){
      const b = pts[0];
      if (!b || b.v <= 0 || f === "r"){ out = []; note = f === "r" ? "ترتيب: لا يُحوَّل إلى رقم قياسي" : "قيمة أساس غير موجبة: لا يمكن التحويل"; }
      else out = pts.map(p => ({y:p.y, v:p.v / b.v * 100}));
    }
    return {x, f, pts:out, note, color:CMP_COLORS[i]};
  });
  const all = series.flatMap(s => s.pts); let svg = `<p class="small muted">لا توجد نقاط قابلة للرسم.</p>`;
  if (all.length){
    const W = 600, H = 240, L = 50, R = 14, T = 12, B = 26;
    const x0 = Math.min(...all.map(p=>p.y)), x1 = Math.max(...all.map(p=>p.y)); let lo = Math.min(...all.map(p=>p.v)), hi = Math.max(...all.map(p=>p.v)); if (lo===hi){lo-=1;hi+=1;} const pad=(hi-lo)*.1; lo-=pad; hi+=pad;
    const X = y => L + (W-L-R)*(y-x0)/Math.max(1,x1-x0), Y = v => T + (H-T-B)*(1-(v-lo)/(hi-lo)), sc = (s,v) => eff === "raw" && s.x.pct ? v*100 : v;
    svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="مقارنة المؤشرات">`;
    for (let i=0;i<=4;i++){ const t = lo + (hi-lo)*i/4; svg += `<line x1="${L}" x2="${W-R}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="${L-6}" y="${Y(t)+4}" text-anchor="end">${fmtN(sc(series[0],t), 1)}</text>`; }
    for (let y=x0; y<=x1; y+=Math.max(1,Math.ceil((x1-x0)/8))) svg += `<text x="${X(y)}" y="${H-6}" text-anchor="middle">${y}</text>`;
    if (eff === "index") svg += `<line x1="${L}" x2="${W-R}" y1="${Y(100)}" y2="${Y(100)}" stroke="var(--muted)" stroke-dasharray="2 3"/>`;
    series.forEach(s => { if (!s.pts.length) return; svg += `<path d="${s.pts.map((p,i)=>(i?"L":"M")+X(p.y).toFixed(1)+" "+Y(p.v).toFixed(1)).join(" ")}" fill="none" stroke="${s.color}" stroke-width="2.4"/>` + s.pts.map(p=>`<circle cx="${X(p.y)}" cy="${Y(p.v)}" r="3" fill="${s.color}"><title>${s.x.id} ${p.y}: ${fmtN(sc(s,p.v),2)}</title></circle>`).join(""); });
    svg += `</svg>`;
  }
  $("#drawer").innerHTML = `<div class="dh"><div><h2 style="font-size:18px">مقارنة ${xs.length} مؤشرات</h2><div class="small muted">الفترة ${ST.from}–${ST.to} · المستهدف ${ST.ty}</div></div><button class="btn" data-close aria-label="إغلاق">✕</button></div>
    <div class="db">
      <div class="seg" role="group" aria-label="طريقة المقارنة"><button data-cmpmode="index" aria-pressed="${eff==="index"}">رقم قياسي (أول سنة = 100)</button><button data-cmpmode="raw" aria-pressed="${eff==="raw"}" ${sameUnit?"":"disabled title=\"الوحدات مختلفة\""}>القيم الفعلية</button></div>
      ${!sameUnit?`<div class="msg warn">وحدات القياس مختلفة (${[...units].map(u=>u==="rank"?"ترتيب":u).join("، ")})، فلا تُعرض القيم الفعلية على محور واحد. الرقم القياسي يقارن الاتجاه النسبي فقط.</div>`:""}
      ${svg}
      <div class="legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${s.x.id} ${esc(s.x.name.slice(0,40))}${s.note?` · <span style="color:var(--bad)">${esc(s.note)}</span>`:""}</span>`).join("")}</div>
      <div class="tablewrap"><table><thead><tr><th>المؤشر</th><th>الوحدة</th><th>آخر قراءة</th><th>مستهدف ${ST.ty}</th><th>R</th><th>التصنيف</th><th>الفجوة</th></tr></thead><tbody>${xs.map(x=>`<tr data-open="${x.id}" style="cursor:pointer"><td>${x.id} ${esc(x.name)}</td><td>${esc(x.p.field==="r"?"ترتيب":x.unit)}</td><td class="n">${N(curTxt(x))} <span class="small muted">${x.cur?x.cur.y:""}</span></td><td class="n">${N(targetTxt(x))}</td><td class="n">${N(rTxt(x))}</td><td>${catChip(x)}</td><td class="n">${N(gapTxt(x))}</td></tr>`).join("")}</tbody></table></div>
      <div class="small muted">نسبة التقدّم والتصنيف قابلان للمقارنة بين الوحدات المختلفة لأنهما نسبة بلا وحدة.</div>
    </div>`;
  $("#drawer").dataset.mode = "cmp"; $("#drawer").dataset.cmpmode = eff;
  $("#drawer").hidden = false; $("#scrim").hidden = false;
}

/* ================= export results ================= */
function saveFile(name, data){
  if (DL) return DL.save({filename:name, data}).catch(e => { if (e && e.code !== "declined") toast("تعذر التنزيل"); });
  const u = URL.createObjectURL(data instanceof Blob ? data : new Blob([data])); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 500);
}
function exportResults(){
  if (!isAdmin()){ toast("تصدير البيانات متاح للمسؤول فقط"); return; }
  const cr = calcRange();
  const H = ["الرمز","المجموعة","المحور","الأولوية","المؤشر","الوحدة","سنة آخر قراءة","آخر قراءة","نوع القراءة","مصدر القراءة","سنة المستهدف","المستهدف","طريقة الحساب","أول قراءة مستخدمة (سنة)","أول قراءة مستخدمة","آخر قراءة مستخدمة (سنة)","آخر قراءة مستخدمة","المعدل الفعلي","المعدل المطلوب","R","R%","التصنيف الإحصائي","القاعدة المطبّقة","حقق المستهدف","الفجوة المتبقية","مستوى الأهلية","التوقع (تقديري)","حد أدنى 80%","حد أعلى 80%","احتمال تحقيق المستهدف","فترة العرض","فترة الحساب"];
  const val = (x, v, f) => v == null ? "" : f === "r" ? v : x.pct ? +(v*100).toFixed(4) : +v.toFixed(6);
  const rows = filtered().map(x => { const p = x.p, f = p.field;
    return [x.id, x.set==="updated"?"مؤشرات الرؤية":"المؤشرات المساندة", x.axis, x.priority, x.name, x.unit, x.cur?x.cur.y:"", x.cur?(x.cur.v!=null?val(x,x.cur.v,"v"):x.cur.r):"", x.cur?(x.cur.kind||"فعلية"):"", x.cur?(x.cur.src||""):"",
      ST.ty, targetTxt(x), p.method, p.first?p.first.y:"", p.first?val(x,p.first.val,f):"", p.latest?p.latest.y:"", p.latest?val(x,p.latest.val,f):"",
      p.actual!=null&&isFinite(p.actual)?+p.actual.toFixed(8):"", p.required!=null&&isFinite(p.required)?+p.required.toFixed(8):"", p.R!=null&&isFinite(p.R)?+p.R.toFixed(4):"", p.R!=null&&isFinite(p.R)?+(p.R*100).toFixed(2):"",
      E.CAT[x.cat].ar, ruleTxt(p), p.achieved?"نعم":"لا", gapTxt(x), x.el.level,
      x.showFc?val(x,x.el.forecast.point,f):"", x.showFc?val(x,x.el.forecast.lo,f):"", x.showFc?val(x,x.el.forecast.hi,f):"", x.showP?+(x.el.mc.p*100).toFixed(1):"",
      `${ST.from}-${ST.to}`, isFinite(cr.calcFrom)?`${cr.calcFrom}-${cr.calcTo}`:"كل السنوات"]; });
  const csv = "﻿" + [H, ...rows].map(r => r.map(c => { const s = String(c ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }).join(",")).join("\r\n");
  saveFile(`نتائج-مؤشرات-الرؤية-${ST.from}-${ST.to}-مستهدف${ST.ty}.csv`, new Blob([csv], {type:"text/csv"}));
}

/* ================= excel: export template ================= */
const IND_COLS = [["code","الرمز"],["set","المجموعة"],["axis","المحور"],["priority","الأولوية"],["name","اسم المؤشر"],["type","نوع المؤشر"],["unit","الوحدة"],["dir","اتجاه الأفضلية"],["base","خط الأساس"],["t30","مستهدف 2030"],["t30hi","مستهدف 2030 - الحد الأعلى"],["t30rank","مستهدف 2030 (ترتيب)"],["t40","مستهدف 2040"],["t30text","نص المستهدف في البطاقة"],["owner","مالك المؤشر"],["issuer","جهة الإصدار"],["src","مصدر البيانات"],["freq","الدورية"],["method","طريقة الاحتساب"],["active","فعّال"],["dup","مقابله في مؤشرات الرؤية"],["parent","المؤشر الرئيسي"],["rel_last","آخر إصدار من الجهة"],["rel_date","تاريخ آخر إصدار (سنة-شهر-يوم)"],["rel_next","الإصدار القادم"],["rel_due","موعد الإصدار القادم (سنة-شهر)"],["rel_note","ملاحظة الإصدار"],["rel_src","رابط الجهة المصدرة"],["grade","المكوّن"],["subject","البند"],["stage","مرحلة المؤشر (قيد التطوير / قيد التحقق)"],["stage_note","سبب المرحلة"],
  ["calc","طريقة حساب التقدم"],["agg","نوع التجميع"],["cap","سقف أهلية التحليل"],["approval","حالة الاعتماد المنهجي"],["challenges","التحديات"],["explain","ملاحظات تفسيرية"],["initiatives","المبادرات المرتبطة"],["factors","العوامل المؤثرة (البطاقة)"],["supporting","المؤشرات المساندة (البطاقة)"],["risk","تقدير عدم التحقق (البطاقة)"]];
const NUM_KEYS = new Set(["base","t30","t30hi","t30rank","t40"]);
const RD_COLS = ["الرمز","اسم المؤشر (للعرض فقط)","السنة","القيمة","الترتيب","المصدر","نوع القراءة","انقطاع السلسلة (تغيير التعريف)","موثوقية المصدر","ملاحظة"];
const LISTS = { calc:["Linear","CAGR"], agg:Object.values(E.AGG), cap:Object.values(E.CAPS), approval:["قيد المراجعة","معتمد","مرفوض"], kind:["فعلية","تقديرية","أولية"], rel:["عالية","متوسطة","منخفضة","غير مقيّمة"] };
let DL = null;
function exportTemplate(){
  if (!isAdmin()){ toast("تصدير البيانات متاح للمسؤول فقط"); return; }
  if (typeof XLSX === "undefined"){ toast("تعذر تحميل مكتبة Excel. تأكد من الاتصال."); return; }
  const ds = ST.ds, wb = XLSX.utils.book_new();
  const ins = [["نموذج بيانات مؤشرات الرؤية"],["عدّل الأوراق ثم ارفع الملف من «إدارة البيانات»."],["النسب المئوية تُكتب كرقم: 3.1 تعني 3.1%."],["الترتيب الدولي في عمود «الترتيب» لا «القيمة»."],["طريقة حساب التقدم: Linear أو CAGR (CAGR للمستويات الموجبة فقط)."],["نوع التجميع: " + LISTS.agg.join(" | ")],["سقف أهلية التحليل يقيّد ولا يرفع: " + LISTS.cap.join(" | ")],["نوع القراءة: فعلية | تقديرية | أولية. انقطاع السلسلة: اكتب «نعم» في سنة تغيّر التعريف."],["لا تغيّر أسماء الأوراق أو الأعمدة، ولا رمز مؤشر قائم. لإيقاف مؤشر اكتب «لا» في «فعّال»."],[`تاريخ التصدير: ${new Date().toISOString().slice(0,10)}`]];
  const add = (name, aoa, widths) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = widths.map(w => ({wch:w})); ws["!views"] = [{RTL:true}]; XLSX.utils.book_append_sheet(wb, ws, name); };
  add("تعليمات", ins, [90]);
  add("المؤشرات", [IND_COLS.map(c=>c[1]), ...ds.indicators.map(i => IND_COLS.map(([k]) => i[k] ?? null))], IND_COLS.map(([k]) => ["name","method","factors","supporting"].includes(k) ? 40 : 14));
  const nm = Object.fromEntries(ds.indicators.map(i => [i.code, i.name]));
  add("القراءات", [RD_COLS, ...ds.readings.slice().sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]).map(r => [r[0], nm[r[0]]||"", r[1], r[2], r[3], r[4], r[5]||"فعلية", r[6]===true||r[6]==="نعم"?"نعم":null, r[7]||"غير مقيّمة", r[8]||null])], [9,46,8,11,9,28,10,14,12,30]);
  add("المسار المستهدف", [["الرمز","السنة","القيمة المستهدفة"], ...ds.path.slice().sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1])], [9,8,16]);
  add("الملاحظات التفسيرية", [["الرمز","السنة","النص","المصدر"], ...(ds.notes||[])], [9,8,110,16]);
  wb.Workbook = {Views:[{RTL:true}]};
  const buf = XLSX.write(wb, {bookType:"xlsx", type:"array"});
  saveFile(`نموذج-بيانات-مؤشرات-الرؤية-${new Date().toISOString().slice(0,10)}.xlsx`, new Blob([buf]));
}

/* ================= excel: import & validate ================= */
// قراءة ملف Excel المرفوع تتم داخل Web Worker معزول (js/xlsx-worker.js): أي ملف ملغّم لا يصل إلى الصفحة نفسها،
// ويُوقف العامل إن تجاوز الوقت المسموح (حماية من ملفات تُجمّد المتصفح).
function readWorkbook(buf){
  return new Promise((resolve, reject) => {
    const w = new Worker("js/xlsx-worker.js");
    const t = setTimeout(() => { w.terminate(); reject(new Error("timeout")); }, 20000);
    w.onmessage = e => { clearTimeout(t); w.terminate(); const d = e.data || {}; if (!d.ok) return reject(new Error(d.error || "read"));
      // إعادة بناء الصفوف بكائنات بلا نموذج أولي (Object.create(null)) حتى لا تؤثر أسماء أعمدة مثل __proto__
      const sheets = {}; for (const [n, {h, rows}] of Object.entries(d.sheets)) sheets[n] = rows.map(r => { const o = Object.create(null); h.forEach((k, i) => { if (r[i] !== undefined) o[k] = r[i]; }); return o; });
      resolve({SheetNames: d.names, Sheets: sheets}); };
    w.onerror = e => { clearTimeout(t); w.terminate(); reject(new Error("worker")); };
    w.postMessage(buf, [buf]);
  });
}
function sheetRows(wb, name){ const key = wb.SheetNames.find(n => n.trim() === name); if (!key) return null; return wb.Sheets[key]; }
function parseWorkbook(wb){
  const Er = [], W = [];
  const I = sheetRows(wb, "المؤشرات"), R = sheetRows(wb, "القراءات"), P = sheetRows(wb, "المسار المستهدف") || [], NT = sheetRows(wb, "الملاحظات التفسيرية") || [];
  if (!I) Er.push("الورقة «المؤشرات» غير موجودة."); if (!R) Er.push("الورقة «القراءات» غير موجودة.");
  if (Er.length) return {E:Er, W};
  const head = Object.keys(I[0] || {}).map(h => String(h).trim());
  IND_COLS.slice(0, 8).forEach(([,h]) => { if (!head.includes(h)) Er.push(`العمود «${h}» غير موجود في ورقة «المؤشرات».`); });
  if (Er.length) return {E:Er, W};
  const get = (row, h) => { const k = Object.keys(row).find(z => String(z).trim() === h); const v = k ? row[k] : null; return typeof v === "string" ? (v.trim() || null) : v; };
  const inds = [], seen = new Set();
  I.forEach((row, i) => {
    const ln = i + 2, o = {};
    IND_COLS.forEach(([k,h]) => { o[k] = get(row, h); });
    if (!o.code && !o.name) return;
    o.code = String(o.code || "").trim().toUpperCase().replace(/\s/g,"");
    const at = `المؤشرات سطر ${ln} (${o.code})`;
    if (!/^[A-Z]{1,3}-\d{1,4}(-\d{1,2})?$/.test(o.code)){ Er.push(`المؤشرات سطر ${ln}: الرمز «${o.code}» غير صالح (مثال صحيح U-31).`); return; }
    if (seen.has(o.code)){ Er.push(`المؤشرات سطر ${ln}: الرمز ${o.code} مكرر.`); return; } seen.add(o.code);
    if (!["محدث","أصلي"].includes(o.set)) Er.push(`${at}: «المجموعة» يجب أن تكون محدث أو أصلي.`);
    if (!AXES.includes(o.axis)) Er.push(`${at}: المحور «${o.axis||""}» غير معروف.`);
    if (!o.priority) Er.push(`${at}: الأولوية فارغة.`);
    if (!o.name) Er.push(`${at}: اسم المؤشر فارغ.`);
    if (!["%","رقم","ترتيب"].includes(o.unit)) Er.push(`${at}: الوحدة يجب أن تكون % أو رقم أو ترتيب.`);
    if (!["الارتفاع أفضل","الانخفاض أفضل"].includes(o.dir)) Er.push(`${at}: اتجاه الأفضلية غير صالح.`);
    if (o.type && !["وطني","دولي"].includes(o.type)) Er.push(`${at}: نوع المؤشر يجب أن يكون وطني أو دولي.`);
    NUM_KEYS.forEach(k => { const n = num(o[k]); if (Number.isNaN(n)) Er.push(`${at}: «${IND_COLS.find(c=>c[0]===k)[1]}» ليس رقماً.`); else o[k] = n; });
    o.active = o.active === "لا" ? "لا" : "نعم";
    o.dup = o.dup ? String(o.dup).trim().toUpperCase().replace(/\s/g,"") : null;
    o.calc = o.calc ? String(o.calc).trim() : "Linear"; if (!LISTS.calc.includes(o.calc)) Er.push(`${at}: طريقة حساب التقدم يجب أن تكون Linear أو CAGR.`);
    if (o.calc === "CAGR" && (o.unit === "%" || o.unit === "ترتيب")) Er.push(`${at}: لا يُستخدم CAGR مع ${o.unit === "%" ? "النسب" : "الترتيب"}.`);
    if (o.agg != null && !LISTS.agg.includes(o.agg)) Er.push(`${at}: نوع التجميع «${o.agg}» غير معروف.`);
    o.cap = o.cap || "تلقائي"; if (!LISTS.cap.includes(o.cap)) Er.push(`${at}: سقف أهلية التحليل «${o.cap}» غير معروف.`);
    o.approval = o.approval || "قيد المراجعة"; if (!LISTS.approval.includes(o.approval)) Er.push(`${at}: حالة الاعتماد «${o.approval}» غير معروفة.`);
    if (o.t30 == null && o.t30rank == null && o.active === "نعم") W.push(`${o.code} ${o.name || ""}: لا يوجد مستهدف 2030، فلن يُحسب التقدم.`);
    if (!o.agg && o.active === "نعم") W.push(`${o.code}: نوع التجميع غير محدد.`);
    ["owner","issuer","src","freq","method","t30text","type","challenges","explain","initiatives","factors","supporting","risk"].forEach(k => { if (o[k] != null) o[k] = String(o[k]); });
    inds.push(o);
  });
  const codes = new Set(inds.map(i => i.code)), unit = Object.fromEntries(inds.map(i => [i.code, i.unit])), calc = Object.fromEntries(inds.map(i => [i.code, i.calc]));
  inds.forEach(o => { if (!o.dup) return; const t = inds.find(z => z.code === o.dup); if (!t) Er.push(`${o.code}: «مقابله في مؤشرات الرؤية» يشير إلى رمز غير موجود (${o.dup}).`); else if (t.set !== "محدث") Er.push(`${o.code}: «مقابله في مؤشرات الرؤية» يجب أن يكون مؤشراً من مؤشرات الرؤية.`); });
  const reads = [], key = new Map();
  R.forEach((row, i) => {
    const ln = i + 2, c = String(get(row,"الرمز") || "").trim().toUpperCase().replace(/\s/g,"");
    const y = num(get(row,"السنة")), v = num(get(row,"القيمة")), r = num(get(row,"الترتيب")), s = get(row,"المصدر");
    const kind = get(row,"نوع القراءة") || "فعلية", brk = get(row,"انقطاع السلسلة (تغيير التعريف)"), rel = get(row,"موثوقية المصدر") || "غير مقيّمة", note = get(row,"ملاحظة");
    if (!c && y == null && v == null && r == null) return;
    if (!codes.has(c)){ Er.push(`القراءات سطر ${ln}: الرمز «${c}» غير موجود في ورقة «المؤشرات».`); return; }
    if (y == null || Number.isNaN(y) || !Number.isInteger(y) || y < 2000 || y > NOW){ Er.push(`القراءات سطر ${ln} (${c}): السنة «${get(row,"السنة") ?? ""}» يجب أن تكون بين 2000 و${NOW}.`); return; }
    if (Number.isNaN(v) || Number.isNaN(r)){ Er.push(`القراءات سطر ${ln} (${c} ${y}): القيمة أو الترتيب ليس رقماً.`); return; }
    if (v == null && r == null){ Er.push(`القراءات سطر ${ln} (${c} ${y}): لا قيمة ولا ترتيب.`); return; }
    if (!LISTS.kind.includes(kind)) Er.push(`القراءات سطر ${ln} (${c} ${y}): نوع القراءة «${kind}» غير معروف.`);
    if (brk != null && brk !== "نعم") Er.push(`القراءات سطر ${ln} (${c} ${y}): «انقطاع السلسلة» يقبل «نعم» أو فارغ فقط.`);
    if (!LISTS.rel.includes(rel)) Er.push(`القراءات سطر ${ln} (${c} ${y}): موثوقية المصدر «${rel}» غير معروفة.`);
    const k2 = c + "|" + y; if (key.has(k2)){ Er.push(`القراءات سطر ${ln}: قراءة ${c} لعام ${y} مكررة (السطر ${key.get(k2)} أيضاً).`); return; } key.set(k2, ln);
    if (unit[c] === "%" && v != null && Math.abs(v) > 0 && Math.abs(v) < 1) W.push(`${c} ${y}: القيمة ${v} صغيرة لمؤشر نسبة. هل كُتبت كسراً بدل النسبة (0.031 بدل 3.1)؟`);
    if (unit[c] === "%" && v != null && Math.abs(v) > 100) W.push(`${c} ${y}: القيمة ${v}% أكبر من 100.`);
    if (calc[c] === "CAGR" && v != null && v <= 0) W.push(`${c} ${y}: قيمة غير موجبة في مؤشر يستخدم CAGR؛ لن يُحسب التقدم حتى تُصحح الطريقة أو القيمة.`);
    if (!s) W.push(`${c} ${y}: قراءة بلا مصدر.`);
    reads.push([c, y, v, r, s == null ? null : String(s), kind, brk === "نعم" ? "نعم" : null, rel, note == null ? null : String(note)]);
  });
  const by = {}; reads.forEach(r => (by[r[0]] = by[r[0]] || []).push(r));
  Object.values(by).forEach(arr => { arr.sort((a,b)=>a[1]-b[1]); for (let i=1;i<arr.length;i++){ const a = arr[i-1][2], b = arr[i][2]; if (a && b != null && !arr[i][6] && Math.abs((b-a)/a) > .5) W.push(`${arr[i][0]} ${arr[i][1]}: تغيّر ${Math.round(Math.abs((b-a)/a)*100)}% عن قراءة ${arr[i-1][1]}.`); } });
  const path = [];
  P.forEach((row, i) => {
    const ln = i + 2, c = String(get(row,"الرمز") || "").trim().toUpperCase().replace(/\s/g,""), y = num(get(row,"السنة")), p = num(get(row,"القيمة المستهدفة"));
    if (!c && y == null && p == null) return;
    if (!codes.has(c)){ Er.push(`المسار المستهدف سطر ${ln}: الرمز «${c}» غير موجود.`); return; }
    if (y == null || Number.isNaN(y) || y < 2000 || y > 2050 || p == null || Number.isNaN(p)){ Er.push(`المسار المستهدف سطر ${ln} (${c}): السنة أو القيمة غير صالحة.`); return; }
    path.push([c, y, p]);
  });
  const notes = [];
  NT.forEach((row, i) => { const c = String(get(row,"الرمز") || "").trim().toUpperCase(), y = num(get(row,"السنة")), t = get(row,"النص"), s = get(row,"المصدر");
    if (!c && !t) return; if (!codes.has(c)){ Er.push(`الملاحظات التفسيرية سطر ${i+2}: الرمز «${c}» غير موجود.`); return; }
    if (!s) W.push(`الملاحظات التفسيرية سطر ${i+2} (${c}): بلا مصدر.`);
    notes.push([c, y, String(t || ""), s == null ? null : String(s)]); });
  return {E:Er, W, ds:{indicators:inds, readings:reads, path, notes}};
}
function diff(oldDs, newDs){
  const oi = Object.fromEntries(oldDs.indicators.map(i => [i.code, i])), ni = Object.fromEntries(newDs.indicators.map(i => [i.code, i]));
  const added = Object.keys(ni).filter(c => !oi[c]), removed = Object.keys(oi).filter(c => !ni[c]);
  const changed = Object.keys(ni).filter(c => oi[c] && IND_COLS.some(([k]) => (oi[c][k] ?? null) != (ni[c][k] ?? null)));
  const rk = r => JSON.stringify([r[2] ?? null, r[3] ?? null, r[4] ?? null, r[5] || "فعلية", r[6] === true || r[6] === "نعم" ? "نعم" : null, r[7] || "غير مقيّمة", r[8] ?? null]);
  const ok = new Map(oldDs.readings.map(r => [r[0]+"|"+r[1], r])), nk = new Map(newDs.readings.map(r => [r[0]+"|"+r[1], r]));
  const rNew = [...nk.keys()].filter(k => !ok.has(k)), rDel = [...ok.keys()].filter(k => !nk.has(k));
  const rChg = [...nk.keys()].filter(k => ok.has(k) && rk(ok.get(k)) !== rk(nk.get(k)));
  const touched = new Set([...added, ...changed, ...[...rNew, ...rDel, ...rChg].map(k => k.split("|")[0])]);
  const grp = (arr, f) => { const m = {}; (arr||[]).forEach(a => (m[a[0]] = (m[a[0]]||[])).push(f(a))); Object.values(m).forEach(v => v.sort()); return m; };
  const op = grp(oldDs.path, a => a.join()), np = grp(newDs.path, a => a.join()), on = grp(oldDs.notes, a => a.join("¦")), nn = grp(newDs.notes, a => a.join("¦"));
  Object.keys({...op, ...np, ...on, ...nn}).forEach(c => { if ((JSON.stringify(op[c]) !== JSON.stringify(np[c]) || JSON.stringify(on[c]) !== JSON.stringify(nn[c])) && ni[c]) touched.add(c); });
  return {added, removed, changed, rNew, rDel, rChg, touched:[...touched].filter(c => ni[c])};
}
function renderCheck(res, fileName){
  const box = $("#check");
  if (res.E.length){ box.innerHTML = `<div class="msg bad"><b>لم يُعتمد شيء.</b> وجدت ${res.E.length} خطأ في «${esc(fileName)}». صححها في الملف ثم ارفعه مرة أخرى.</div><ul class="list">${res.E.slice(0,200).map(e=>`<li>${esc(e)}</li>`).join("")}</ul>`; ST.pending = null; return; }
  const d = diff(ST.ds, res.ds); ST.pending = {ds:res.ds, d, fileName};
  const nm = c => { const i = res.ds.indicators.find(z => z.code === c) || ST.ds.indicators.find(z => z.code === c); return i ? i.name : ""; };
  const nothing = !d.added.length && !d.removed.length && !d.changed.length && !d.rNew.length && !d.rDel.length && !d.rChg.length && !d.touched.length;
  const canPub = ST.db && ST.admin;
  box.innerHTML = `<div class="msg ${res.W.length?"warn":"ok"}">الملف سليم${res.W.length?` مع ${res.W.length} تنبيه للمراجعة`:""}. عاين التغييرات قبل الاعتماد.</div>
    <div class="sum"><div><b class="num">${d.rNew.length}</b>قراءة جديدة</div><div><b class="num">${d.rChg.length}</b>قراءة معدّلة</div><div><b class="num">${d.changed.length + d.added.length}</b>مؤشر معدّل أو جديد</div><div><b class="num" style="color:${d.removed.length||d.rDel.length?"var(--bad)":"inherit"}">${d.removed.length + d.rDel.length}</b>محذوف</div></div>
    ${d.rNew.length?`<details open><summary class="small">القراءات الجديدة</summary><ul class="list">${d.rNew.slice(0,150).map(k=>{const [c,y]=k.split("|");return `<li>${c} ${esc(nm(c))} · ${y}</li>`;}).join("")}</ul></details>`:""}
    ${d.rChg.length?`<details><summary class="small">القراءات المعدّلة</summary><ul class="list">${d.rChg.slice(0,150).map(k=>{const [c,y]=k.split("|");return `<li>${c} ${esc(nm(c))} · ${y}</li>`;}).join("")}</ul></details>`:""}
    ${d.added.length||d.changed.length?`<details><summary class="small">المؤشرات الجديدة أو المعدّلة</summary><ul class="list">${[...d.added.map(c=>`<li>جديد: ${c} ${esc(nm(c))}</li>`), ...d.changed.map(c=>`<li>معدّل: ${c} ${esc(nm(c))}</li>`)].join("")}</ul></details>`:""}
    ${d.removed.length||d.rDel.length?`<details open><summary class="small" style="color:var(--bad)">ما سيُحذف</summary><ul class="list">${[...d.removed.map(c=>`<li>مؤشر: ${c} ${esc(nm(c))}</li>`), ...d.rDel.slice(0,100).map(k=>`<li>قراءة: ${k.replace("|"," · ")}</li>`)].join("")}</ul></details>`:""}
    ${res.W.length?`<details><summary class="small">التنبيهات (${res.W.length})</summary><ul class="list">${res.W.slice(0,300).map(w=>`<li>${esc(w)}</li>`).join("")}</ul></details>`:""}
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      ${canPub?`<button class="btn primary" id="publish" ${nothing?"disabled":""}>${nothing?"لا توجد تغييرات":"اعتماد ونشر التحديث للجميع"}</button>`:""}
      <button class="btn ${canPub?"":"primary"}" id="preview-apply">معاينة اللوحة بهذه البيانات</button>
      <button class="btn" id="export-pending">تنزيل dataset.json من هذا الملف</button>
      <button class="btn" id="cancel">إلغاء</button><span class="small muted" id="pubprog"></span></div>`;
}

/* ================= db ================= */
function dsToDocs(ds){
  const docs = {};
  ds.indicators.forEach(i => { docs[i.code] = {...i, readings: [], path: [], notes: []}; });
  ds.readings.forEach(r => { if (docs[r[0]]) docs[r[0]].readings.push(r.slice(1)); });
  ds.path.forEach(p => { if (docs[p[0]]) docs[p[0]].path.push(p.slice(1)); });
  (ds.notes||[]).forEach(n => { if (docs[n[0]]) docs[n[0]].notes.push(n.slice(1)); });
  return docs;
}
function docsToDs(docs, meta){
  const ds = {meta: meta || {}, indicators: [], readings: [], path: [], notes: []};
  docs.forEach(d => { const {readings = [], path = [], notes = [], ...i} = d; ds.indicators.push(i); readings.forEach(r => ds.readings.push([i.code, ...r])); path.forEach(p => ds.path.push([i.code, ...p])); notes.forEach(n => ds.notes.push([i.code, ...n])); });
  ds.indicators.sort((a,b) => (a.set === b.set ? 0 : a.set === "أصلي" ? -1 : 1) || a.code.localeCompare(b.code, "en", {numeric:true}));
  return ds;
}
async function publish(newDs, touched, removed, fileName, summary){
  const docs = dsToDocs(newDs), col = ST.db.collection("inds");
  const all = ST.dsSource !== "db" ? Object.keys(docs) : touched;
  let n = 0;
  for (const c of all){ await col.doc(c).set(docs[c]); n++; const p = $("#pubprog"); if (p) p.textContent = `جارٍ النشر ${n} من ${all.length + removed.length}…`; }
  for (const c of removed){ await col.doc(c).delete(); n++; }
  const meta = {at: Date.now(), by: ST.me || null, file: fileName, indicators: newDs.indicators.length, readings: newDs.readings.length};
  await ST.db.doc("dsmeta/current").set(meta);
  await ST.db.collection("uploads").add({...meta, changed: all.length, removed: removed.length, summary: summary || null});
}

/* ================= admin panels ================= */
function renderAdmin(){
  const m = ST.ds.meta || {}, ok = isAdmin();
  $("#admin-lock").hidden = ok; $("#admin-out").hidden = !(ok && !IN_CLAUDE);
  document.querySelectorAll("[data-adm]").forEach(el => { if (!ok) el.hidden = true; });
  if (!ok){ $("#local-note").hidden = true; $("#ds-state").textContent = ""; $("#admin-title").textContent = "إدارة البيانات"; return; }
  $("#asub").hidden = false;
  $("#admin-title").textContent = IN_CLAUDE && ST.admin ? "إدارة البيانات" : "أدوات البيانات";
  $("#local-note").hidden = IN_CLAUDE && ST.admin;
  $("#ds-state").textContent = ST.dsSource === "db" ? `المنشور: ${m.file ? "«" + m.file + "» · " : ""}${m.at ? new Date(m.at).toLocaleString("ar-OM") : ""}${m.by && ST.names[m.by] ? " · " + ST.names[m.by] : ""}` : ST.dsSource === "preview" ? "معاينة محلية لملف لم يُنشر" : ST.dsSource === "file" ? "البيانات من data/dataset.json" : "البيانات الأولية من بطاقات المؤشرات";
  $("#dl-note").textContent = `${ST.ds.indicators.length} مؤشراً · ${ST.ds.readings.length} قراءة`;
  document.querySelectorAll("#asub button").forEach(b => b.setAttribute("aria-pressed", b.dataset.asub === ST.asub));
  document.querySelectorAll("[data-apanel]").forEach(p => p.hidden = p.dataset.apanel !== ST.asub);
  if (ST.asub === "elig") renderElig();
  if (ST.asub === "valid") renderValid();
  if (ST.asub === "pub" && ST.uploads.length) $("#hist").innerHTML = `<ul class="list" style="max-height:none">${ST.uploads.slice().sort((a,b)=>b.at-a.at).map(u => `<li>${new Date(u.at).toLocaleString("ar-OM")} · «${esc(u.file||"")}» · ${u.changed} مؤشر${u.summary?` · ${esc(u.summary)}`:""}${u.removed?` · ${u.removed} حُذف`:""}${u.by&&ST.names[u.by]?" · "+esc(ST.names[u.by]):""}</li>`).join("")}</ul>`;
}
function eligReason(x){
  const fail = x.el.checks.filter(c => !c.pass);
  if (x.el.capped) return `مقيّد بسقف الإدارة «${E.CAPS[x.cap]}» (اجتاز إحصائياً المستوى ${x.el.statLevel})`;
  if (!fail.length) return "اجتاز كل الفحوص";
  const f = fail[0]; return `${f.name}: ${f.detail}`;
}
function renderElig(){
  const f = $("#el-f").value, list = RAW.filter(inSet).filter(x => f === "" || String(x.el.level) === f);
  const all = RAW.filter(inSet); $("#el-sum").textContent = [0,1,2,3].map(l => `المستوى ${l}: ${all.filter(x => x.el.level === l).length}`).join(" · ");
  $("#el-body").innerHTML = list.map(x => `<tr data-open="${x.id}"><td class="code">${x.id}</td><td>${esc(x.name)}</td><td><span class="lv lv${x.el.level}">${x.el.level}</span></td><td class="n">${x.el.n}</td><td class="small">${esc(x.el.model ? x.el.model.name : "—")}</td><td class="n">${x.el.backtest && isFinite(x.el.backtest.mase) ? fmtN(x.el.backtest.mase,2) : "—"}</td><td class="n">${x.el.model && x.el.model.r2 != null && isFinite(x.el.model.r2) ? fmtN(x.el.model.r2,2) : "—"}</td>
    <td class="small">${esc(eligReason(x))}<details><summary class="small">كل الفحوص</summary><div class="chk">${x.el.checks.map(c => `<span>م${c.level}</span><span>${esc(c.name)} · <span class="muted">${esc(c.detail)}</span></span><b class="${c.pass?"ok":"no"}">${c.pass?"✓":"✗"}</b>`).join("")}</div></details></td><td class="small">${esc(x.approval)}</td></tr>`).join("") || `<tr><td colspan="9" class="muted">لا توجد مؤشرات.</td></tr>`;
}
const VK = {year:"سنة القراءة", future:"سنة مستقبلية", unit:"الوحدة", scale:"اتساق المقياس", sharp:"تغيّر حاد", outlier:"قيمة شاذة", definition:"تغيّر التعريف", missing:"قراءات مفقودة", estimate:"قراءات تقديرية", source:"المصدر", reliability:"الموثوقية", direction:"اتساق الاتجاه مع المستهدف", agg:"صلاحية التجميع"};
function renderValid(){
  const all = RAW.filter(inSet).map(x => ({x, iss: E.validity(x, NOW)}));
  const cnt = {}; all.forEach(a => a.iss.forEach(i => cnt[i.k] = (cnt[i.k]||0) + 1));
  const fc = all.filter(a => a.x.el.statLevel >= 2).length;
  $("#va-sum").innerHTML = `<div><b class="num">${all.length}</b>مؤشراً</div><div><b class="num">${all.filter(a=>a.iss.some(i=>i.sev==="bad")).length}</b>فيها مشكلة جوهرية</div><div><b class="num">${all.filter(a=>a.x.agg).length}</b>صالحة للتجميع (نوع محدد)</div><div><b class="num">${fc}</b>صالحة للتنبؤ إحصائياً</div>`;
  const cur = $("#va-f").value;
  $("#va-f").innerHTML = `<option value="">كل الفحوص</option>` + Object.entries(VK).map(([k,l]) => `<option value="${k}" ${cur===k?"selected":""}>${l} (${cnt[k]||0})</option>`).join("");
  const f = $("#va-f").value;
  $("#va-list").innerHTML = all.flatMap(a => a.iss.filter(i => !f || i.k === f).map(i => `<li><a href="#i-${a.x.id}">${a.x.id}</a> ${esc(a.x.name.slice(0,60))} · <b>${VK[i.k]||i.k}</b>: ${esc(i.t)}</li>`)).join("") || `<li class="muted">لا ملاحظات.</li>`;
}

/* ================= aggregates (no averaging of R across indicators) ================= */
const CLASSIFIED = new Set(["on_track","needs","breakthrough","backwards","stalled"]);
function stats(list){
  const cls = list.filter(x => CLASSIFIED.has(x.cat) && x.p.status !== "review");
  const counts = Object.fromEntries(CATS.map(k => [k, list.filter(x => x.cat === k && !(k === "na" && x.p.status === "review")).length]));
  counts.review = list.filter(x => x.p.status === "review").length;
  const rs = cls.map(x => x.p.achieved ? Infinity : x.p.R).filter(v => v === Infinity || Number.isFinite(v)).sort((a,b) => a - b);
  let med = null, medLo = false;
  if (rs.length){ const m = rs.length >> 1;
    if (rs.length % 2) med = rs[m];
    else if (rs[m] === Infinity && rs[m-1] === Infinity) med = Infinity;
    else if (rs[m] === Infinity){ med = rs[m-1]; medLo = true; }   // الوسيط بين قيمة ومؤشر محقق ⇒ «≥»
    else med = (rs[m-1] + rs[m]) / 2; }
  return { n:list.length, cls:cls.length, counts, onShare: cls.length ? counts.on_track / cls.length : null, med, medLo, medN: rs.length };
}
const medTxt = s => s.med == null ? "—" : s.med === Infinity ? "حقق المستهدف" : (s.medLo ? "≥ " : "") + fmtN(s.med * 100, 0) + "%";
const shareTxt = s => s.onShare == null ? "—" : fmtN(s.onShare * 100, 0) + "%";
function stackBar(list){
  const parts = CATS.map(k => [k, list.filter(x => x.cat === k && x.p.status !== "review").length]).concat([["review", list.filter(x => x.p.status === "review").length]]).filter(p => p[1]);
  return `<span class="stackbar" role="img" aria-label="${parts.map(([k,n]) => (k==="review"?"قيد التحقق":E.CAT[k].ar) + " " + n).join("، ")}">${parts.map(([k,n]) => `<i style="flex:${n};background:${k==="review"?"repeating-linear-gradient(45deg,var(--k-back) 0 3px,transparent 3px 6px)":CAT_C[k]}" title="${k==="review"?"قيد التحقق":E.CAT[k].ar}: ${n}"></i>`).join("")}</span>`;
}
const axisShort = a => ({"الإنسان والمجتمع":["الإنسان","والمجتمع"],"الاقتصاد والتنمية":["الاقتصاد","والتنمية"],"الحوكمة والأداء المؤسسي":["الحوكمة","والأداء المؤسسي"],"البيئة المستدامة":["البيئة","المستدامة"]}[a] || [a, ""]);
function allPriorities(){ return AXES.flatMap(a => prioritiesOf(a).map(p => [a, p[0], p[1]])); }

function renderInd(){
  const x = BY[ST.ind]; if (!x){ $("#ind-body").innerHTML = `<div class="empty">المؤشر غير موجود.</div>`; return; }
  $("#ind-crumb").innerHTML = `<span style="color:${axC(x.axis)};font-weight:600">${esc(x.axis)}</span> ‹ ${esc(x.priority)}`;
  openDrawer(x.id, $("#ind-body"));
}
// الرجوع: إلى الصفحة السابقة داخل اللوحة إن وُجدت، وإلا إلى المؤشر في «التركيز»
let NAVN = 0; window.addEventListener("hashchange", () => { NAVN++; });
document.addEventListener("click", e => { if (e.target.closest && e.target.closest("#ind-back")){ if (NAVN > 0 && history.length > 1) history.back(); else location.hash = "#focus-i-" + ST.ind; } });
// كل الأولويات المعروفة (من كل المجموعات) حتى تظهر الأولوية التي لا مؤشرات لها في المجموعة المختارة
function knownPriorities(){ const m = new Map(); RAW.forEach(x => { if (!m.has(x.priority)) m.set(x.priority, x.axis); }); return AXES.flatMap(a => [...m].filter(([, ax]) => ax === a).map(([p]) => [a, p])); }
function renderOverview(){
  renderRelStrip();
  const list = RAW.filter(inSet), tot = stats(list), c = tot.counts;
  $("#ov-meta").textContent = `${ST.set === "updated" ? "مؤشرات الرؤية" : "المؤشرات المساندة"} · مستهدف ${ST.ty}`;
  $("#ov-tot").innerHTML = `<div class="k"><b class="num">${list.length}</b><span>مؤشراً</span></div>
    <div class="k"><b class="num" style="color:var(--k-on)">↑ ${c.on_track}</b><span>على المسار</span></div>
    <div class="k"><b class="num" style="color:var(--k-back)">↓ ${c.backwards}</b><span>يتراجع</span></div>
    <div class="full">${stackBar(list)}<div class="rest"><span><i class="dot" style="background:var(--k-needs)"></i><b>${c.needs}</b> ${E.CAT.needs.ar}</span><span><i class="dot" style="background:var(--k-break)"></i><b>${c.breakthrough}</b> ${E.CAT.breakthrough.ar}</span><span><i class="dot" style="background:var(--k-na)"></i><b>${c.stalled + c.na}</b> ثابت أو لا يُصنَّف</span><span><i class="dot" style="background:var(--k-back)"></i><b>${c.review}</b> قيد التحقق</span><span><i class="dot" style="background:var(--k-dev)"></i><b>${c.dev}</b> قيد التطوير</span></div></div>`;
  const allP = allPriorities();
  $("#ov-cards").innerHTML = knownPriorities().map(([a, p]) => {
    const ai = AXES.indexOf(a), items = list.filter(x => x.priority === p), s = stats(items), k = allP.findIndex(q => q[1] === p);
    if (!items.length) return `<article class="pcard ghost" style="--axc:${AXC[ai]}"><span class="ax">${esc(a)}</span><h3>${esc(p)}</h3><span class="small">لا توجد مؤشرات في هذه المجموعة</span></article>`;
    return `<article class="pcard" style="--axc:${AXC[ai]}"><span class="ax">${esc(a)}</span><h3>${esc(p)}</h3>
      <div class="m3"><div><b class="num">${items.length}</b><small>مؤشر</small></div><div><b class="num" style="color:var(--k-on)">${N(shareTxt(s))}</b><small>على المسار</small></div><div><b class="num" style="color:var(--k-back)">${s.counts.backwards}</b><small>يتراجع</small></div></div>
      ${stackBar(items)}<a class="go" href="#focus-p-${k}">افتح في التركيز ←</a></article>`;
  }).join("");
}

/* ================= focus: one priority at a time ================= */
function renderFocus(){
  const allP = allPriorities();
  if (ST.fAxis == null || !RAW.some(x => inSet(x) && x.axis === AXES[ST.fAxis])) ST.fAxis = AXES.findIndex(a => RAW.some(x => inSet(x) && x.axis === a));
  const ax = AXES[ST.fAxis], pris = allP.filter(q => q[0] === ax);
  if (ST.fPri !== "all" && (ST.fPri == null || !pris.some(q => q[1] === ST.fPri))) ST.fPri = pris.length ? pris[0][1] : "all";
  $("#f-axes").innerHTML = AXES.map((a, i) => RAW.some(x => inSet(x) && x.axis === a) ? `<button data-fsetaxis="${i}" aria-pressed="${i === ST.fAxis}" style="--axc:${AXC[i]}">${esc(a)}</button>` : "").join("");
  $("#f-pris").innerHTML = `<button data-fsetpri="all" aria-pressed="${ST.fPri === "all"}">كل أولويات المحور</button>` + pris.map(([, p, n]) => `<button data-fsetpri="${esc(p)}" aria-pressed="${ST.fPri === p}">${esc(p)} <span class="muted">(${n})</span></button>`).join("");
  const items = sortFocus(RAW.filter(x => inSet(x) && x.axis === ax && (ST.fPri === "all" || x.priority === ST.fPri)));
  $("#f-sort").value = ST.fSort;
  const s = stats(items);
  $("#f-title").textContent = ST.fPri === "all" ? ax : ST.fPri; $("#f-title").style.color = AXC[ST.fAxis];
  document.querySelector("#v-focus").style.setProperty("--axc", AXC[ST.fAxis]); document.querySelector("#v-focus").style.setProperty("--axb", AXB[ST.fAxis]);
  $("#f-meta").textContent = `${items.length} مؤشر · على المسار ${shareTxt(s)} · وسيط نسبة التقدّم ${medTxt(s)} · مستهدف ${ST.ty}`; $("#f-bar").innerHTML = stackBar(items);
  if (!items.some(x => x.id === ST.fInd)) ST.fInd = items.length ? items[0].id : null;
  $("#f-list").innerHTML = items.map(x => `<button class="frow" data-fsel="${x.id}" aria-pressed="${x.id === ST.fInd}" style="--c:${x.p.status === "review" ? "var(--k-back)" : CAT_C[x.cat]}">
      <span class="t">${esc(x.name)}</span>
      <span class="r"><span>${N(curTxt(x))}${x.cur ? " · " + x.cur.y : ""} ← ${N(targetTxt(x))}</span><span>التقدّم <b style="color:var(--ink)">${N(rTxt(x))}</b></span></span>
      <span class="r">${catChip(x)}<span class="code">${x.id}</span></span></button>`).join("") || `<div class="empty">لا توجد مؤشرات.</div>`;
  $("#v-focus").style.setProperty("--axc", AXC[ST.fAxis]);
  $("#fd-axis").innerHTML = AXES.map((a, i) => RAW.some(x => inSet(x) && x.axis === a) ? `<option value="${i}" ${i === ST.fAxis ? "selected" : ""}>${esc(a)}</option>` : "").join("");
  $("#fd-pri").innerHTML = `<option value="all" ${ST.fPri === "all" ? "selected" : ""}>كل أولويات المحور</option>` + pris.map(([, p, n]) => `<option value="${esc(p)}" ${ST.fPri === p ? "selected" : ""}>${esc(p)} (${n})</option>`).join("");
  if (isMobile()){ renderFocusMobile(ax, pris, items, s); return; }
  $("#fd-ind").innerHTML = items.map((x, i) => `<option value="${x.id}" ${x.id === ST.fInd ? "selected" : ""}>${(i + 1)}. ${x.p.status === "review" ? "؟" : CAT_SYM[x.cat]} ${esc(x.name)}</option>`).join("");
  if (ST.fInd && BY[ST.fInd]) BY[ST.fInd]._pos = (items.findIndex(x => x.id === ST.fInd) + 1) + " من " + items.length;
  $("#f-panel").innerHTML = ST.fInd && BY[ST.fInd] ? focusCardHTML(BY[ST.fInd]) : `<div class="empty">اختر مؤشراً.</div>`;
}
function focusCardHTML(x){
  const col = x.p.status === "review" ? "var(--k-back)" : CAT_C[x.cat], p = x.p || {};
  const pace = p.actual != null && isFinite(p.actual) && p.required != null && isFinite(p.required);
  return `<div class="fc" style="--c:${col}">
    <div class="path" style="color:${axC(x.axis)}">${esc(x.axis)} ‹ ${esc(x.priority)}</div>
    <h2>${esc(x.name)}</h2>
    <div class="meta">${catChip(x)}<span class="code">${x.id}</span><span class="age ${(x.relOk ? "" : ageCls(x.age))}">آخر بيانات ${ageTxt(x.age)}</span>${x._pos ? `<span class="fpos" style="margin-inline-start:auto">${x._pos}</span>` : ""}</div>
    <div class="chart">${isMobile() ? (sparkSVG(x) || `<p class="small muted" style="margin:0;padding:18px;text-align:center">لا توجد قراءات كافية للرسم</p>`) : chartSVG(x, {fc: x.showFc ? x.el.forecast : null, fcYear: x.showFc ? x.el.forecast.y : 0})}</div>
    <div class="q4">
      <div><small>آخر قراءة</small><b class="num">${N(curTxt(x))}</b><div class="sub">${x.cur ? x.cur.y + (x.cur.src ? " · " + escB(x.cur.src, 1) : "") : ""}</div></div>
      <div><small>مستهدف ${ST.ty}</small><b class="num">${N(targetTxt(x))}</b></div>
      <div><small title="نسبة التقدّم نحو المستهدف">نسبة التقدّم</small><b class="num" style="color:${col}">${N(rTxt(x))}</b></div>
      <div><small>${pace ? "المتحقق سنوياً" : "الفجوة المتبقية"}</small><b class="num">${pace ? N(rateTxt(x, p.actual).split(" ")[0]) : N(gapTxt(x))}</b>${pace ? `<div class="sub">المطلوب ${N(rateTxt(x, p.required).split(" ")[0])}</div>` : ""}</div>
    </div>
    <p class="why">${esc(whyTxt(x))}</p>
    <div class="acts"><a class="btn primary" href="#i-${x.id}">التفاصيل والمنهجية ←</a>${shareBtns(x.id)}</div>
  </div>`;
}
// R للترتيب: المحقق = الأعلى، وغير القابل للتصنيف في الآخر دائماً
const rKey = x => x.p.status === "review" || !CLASSIFIED.has(x.cat) ? null : x.p.achieved ? Infinity : (x.p.R != null && isFinite(x.p.R) ? x.p.R : null);
function sortFocus(list){
  const byId = (u, v) => u.id.localeCompare(v.id, "en", {numeric:true});
  if (ST.fSort === "cat") return list.sort((u, v) => CATS.indexOf(u.cat) - CATS.indexOf(v.cat) || byId(u, v));
  const sgn = ST.fSort === "near" ? -1 : 1;
  return list.sort((u, v) => { const a = rKey(u), b = rKey(v); if (a == null && b == null) return byId(u, v); if (a == null) return 1; if (b == null) return -1; return a === b ? byId(u, v) : sgn * (a < b ? -1 : 1); });
}
function sparkSVG(x){
  const pts = (x.p && x.p.used && x.p.used.length ? x.p.used : []).map(s => [s.y, s.val]);   // نفس القراءات ونفس الوحدة التي دخلت الحساب
  const inv = x.p && x.p.field === "r";
  const T = x.p && x.p.T != null && isFinite(x.p.T) ? x.p.T : null, TY = ST.ty;
  if (pts.length < 2 && T == null) return "";
  const xs = pts.map(p => p[0]).concat(T != null ? [TY] : []), ys = pts.map(p => p[1]).concat(T != null ? [T] : []);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 320, H = 96, L = 14, Rr = 14, Tp = 18, B = 20;
  const px = v => L + (W - L - Rr) * (x1 === x0 ? .5 : (v - x0) / (x1 - x0));
  const py = v => { let k = y1 === y0 ? .5 : (v - y0) / (y1 - y0); if (inv) k = 1 - k; return H - B - (H - Tp - B) * k; };
  const fmt = v => inv ? "#" + fmtN(v, 0) : fv(x, v);
  const line = pts.map(p => px(p[0]).toFixed(1) + "," + py(p[1]).toFixed(1)).join(" ");
  const first = pts[0], last = pts[pts.length - 1];
  const lab = (xx, yy, txt, anc, col, w) => `<text x="${xx.toFixed(1)}" y="${yy.toFixed(1)}" text-anchor="${anc}" style="font-size:11px;${w ? "font-weight:700;" : ""}fill:${col}">${esc(txt)}</text>`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true" style="direction:ltr">
    <line x1="${L}" y1="${H - B + 4}" x2="${W - Rr}" y2="${H - B + 4}" stroke="var(--line)"/>
    ${T != null && last ? `<line x1="${px(last[0])}" y1="${py(last[1])}" x2="${px(TY)}" y2="${py(T)}" stroke="var(--muted)" stroke-dasharray="3 4"/><circle cx="${px(TY)}" cy="${py(T)}" r="4.5" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.6"/>
      ${lab(px(TY), py(T) - 8, fmt(T), "end", "var(--ink)", 1)}${lab(px(TY), H - 4, String(TY), "end", "var(--muted)")}` : ""}
    ${pts.length > 1 ? `<polyline points="${line}" fill="none" stroke="var(--c)" stroke-width="2.6" stroke-linejoin="round"/>` : ""}
    ${first && pts.length > 1 ? lab(px(first[0]), H - 4, String(first[0]), "start", "var(--muted)") : ""}
    ${last ? `<circle cx="${px(last[0])}" cy="${py(last[1])}" r="4.5" fill="var(--c)"/>${lab(px(last[0]), py(last[1]) - 8, fmt(last[1]), "middle", "var(--c)", 1)}${lab(px(last[0]), H - 4, String(last[0]), "middle", "var(--muted)")}` : ""}</svg>`;
}
function whyTxt(x){
  const p = x.p || {};
  if (p.status === "dev") return p.reason + "، فلا يدخل في نسب الأداء.";
  if (p.status === "review") return p.reason || "بيانات المؤشر قيد التحقق قبل التصنيف.";
  if (p.achieved) return "حقق المستهدف بآخر قراءة.";
  if (!CLASSIFIED.has(x.cat)) return "لا يكفي ما لديه من قراءات أو مستهدف لحساب التقدم.";
  if (p.actual != null && isFinite(p.actual) && p.required != null && isFinite(p.required)) return `المطلوب ${rateTxt(x, p.required)}، والمتحقق ${rateTxt(x, p.actual)}.`;
  return E.CAT[x.cat].ar + ".";
}
function renderFocusMobile(ax, pris, items, s){
  $("#fm-axis").innerHTML = AXES.map((a, i) => RAW.some(x => inSet(x) && x.axis === a) ? `<option value="${i}" ${i === ST.fAxis ? "selected" : ""}>${esc(a)}</option>` : "").join("");
  $("#fm-pri").innerHTML = `<option value="all" ${ST.fPri === "all" ? "selected" : ""}>كل الأولويات</option>` + pris.map(([, p, n]) => `<option value="${esc(p)}" ${ST.fPri === p ? "selected" : ""}>${esc(p)} (${n})</option>`).join("");
  $("#fm-sum").innerHTML = `<div class="row"><span><b>${items.length}</b> مؤشر · على المسار <b>${N(shareTxt(s))}</b> · وسيط نسبة التقدّم <b>${N(medTxt(s))}</b></span>
    <select class="fsort" id="fm-sort" aria-label="الترتيب"><option value="cat">حسب التصنيف</option><option value="near">الأقرب أولاً</option><option value="far">الأبعد أولاً</option></select></div>${stackBar(items)}`;
  $("#fm-sort").value = ST.fSort;
  const col = x => x.p.status === "review" ? "var(--k-back)" : CAT_C[x.cat];
  $("#fm-cards").innerHTML = items.map(x => `<article class="fcard" data-fcard="${x.id}" style="--c:${col(x)}">
      <div class="top">${catChip(x)}<span class="code">${x.id}</span></div>
      <h3>${esc(x.name)}</h3>
      ${sparkSVG(x)}
      <div class="big"><div><small>آخر قراءة${x.cur ? " · " + x.cur.y : ""}</small><b class="num">${N(curTxt(x))}</b></div><div><small>مستهدف ${ST.ty}</small><b class="num">${N(targetTxt(x))}</b></div></div>
      <div class="rr"><span class="small muted" title="نسبة التقدّم نحو المستهدف">نسبة التقدّم</span><b class="num">${N(rTxt(x))}</b></div>
      <p class="why">${esc(whyTxt(x))}</p>
      <div style="display:flex;gap:8px;align-items:center"><a class="more" href="#i-${x.id}" style="flex:1;text-align:center;text-decoration:none">كل التفاصيل والمنهجية ←</a>${shareBtns(x.id)}</div></article>`).join("") || `<div class="empty">لا توجد مؤشرات.</div>`;
  const cnt = id => { const k = items.findIndex(x => x.id === id); $("#fm-count").textContent = k >= 0 ? `المؤشر ${k + 1} من ${items.length}` : ""; };
  cnt(ST.fInd);
  $("#fm-dots").innerHTML = items.map((x, i) => `<button data-fdot="${x.id}" style="--c:${col(x)}" aria-label="${esc(x.name)}" aria-current="${x.id === ST.fInd}"></button>`).join("");
  const box = $("#fm-cards"), el = ST.fInd && box.querySelector(`[data-fcard="${ST.fInd}"]`);
  if (el && el.scrollIntoView && items[0] && items[0].id !== ST.fInd) requestAnimationFrame(() => el.scrollIntoView({block:"nearest", inline:"center"}));
  if (window.IntersectionObserver){
    if (box._io) box._io.disconnect();
    box._io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && e.intersectionRatio > .6){ const id = e.target.dataset.fcard; if (ST.fInd === id) return; ST.fInd = id;
      document.querySelectorAll("#fm-dots button").forEach(b => b.setAttribute("aria-current", b.dataset.fdot === id)); cnt(id); go(); } }), {root:box, threshold:[.6]});
    box.querySelectorAll(".fcard").forEach(c => box._io.observe(c));
  }
}

/* ================= routing ================= */
function stateHash(){
  if (ST.page === "admin") return "#admin";
  if (ST.page === "overview") return "#overview";
  if (ST.page === "ind" && ST.ind) return "#i-" + ST.ind;
  if (ST.page === "focus"){ if (ST.fInd) return "#focus-i-" + ST.fInd; const allP = allPriorities(); if (ST.fPri && ST.fPri !== "all") return "#focus-p-" + allP.findIndex(q => q[1] === ST.fPri); return "#focus-a-" + (ST.fAxis ?? 0); }
  if (!$("#drawer").hidden && $("#drawer").dataset.mode === "ind" && $("#drawer").dataset.id) return "#i-" + $("#drawer").dataset.id;
  if (ST.pri){ const all = AXES.flatMap(prioritiesOf).map(p=>p[0]); return "#p-" + all.indexOf(ST.pri); }
  const ai = AXES.indexOf(ST.axis); return ai >= 0 ? "#a-" + ai : "#all";
}
function go(){ const h = stateHash(); if (location.hash !== h) history.replaceState(null, "", h); }
function readHash(){
  const h = location.hash.slice(1);
  if (h === "" || h === "overview"){ ST.page = "overview"; closeDrawer(); render(); return; }
  if (h === "calendar"){ ST.page = "cal"; closeDrawer(); render(); window.scrollTo(0, 0); return; }
  if (h.startsWith("focus")){
    ST.page = "focus"; closeDrawer();
    const m = h.match(/^focus-(a|p|i)-(.+)$/);
    if (m && m[1] === "a"){ ST.fAxis = +m[2]; ST.fPri = "all"; ST.fInd = null; }
    if (m && m[1] === "p"){ const e = allPriorities()[+m[2]]; if (e){ ST.fAxis = AXES.indexOf(e[0]); ST.fPri = e[1]; ST.fInd = null; } }
    if (m && m[1] === "i" && BY[m[2]]){ const x = BY[m[2]]; if (!inSet(x)) ST.set = x.set; ST.fAxis = AXES.indexOf(x.axis); ST.fPri = x.priority; ST.fInd = x.id; }
    render(); return;
  }
  ST.page = h === "admin" ? "admin" : "dash";
  if (h.startsWith("i-")){ const id = h.slice(2); if (BY[id]){ if (!inSet(BY[id])) ST.set = BY[id].set; closeDrawer(); if (ST.ind !== id) ST.indTab = 0; ST.page = "ind"; ST.ind = id; render(); window.scrollTo(0, 0); return; } }
  closeDrawer(); $("#drawer").dataset.id = "";
  if (h.startsWith("a-")){ ST.axis = AXES[+h.slice(2)] || null; ST.pri = null; }
  else if (h.startsWith("p-")){ const all = AXES.flatMap(a => prioritiesOf(a).map(p => [a, p[0]])); const e = all[+h.slice(2)]; if (e){ ST.axis = e[0]; ST.pri = e[1]; } }
  else if (h === "all" || !h){ ST.axis = null; ST.pri = null; }
  render();
}

/* ================= render ================= */
function setSeg(){
  const nU = RAW.filter(x=>x.set==="updated").length, nO = RAW.filter(x=>x.set==="original").length;
  $("#setseg").innerHTML = [["updated",`مؤشرات الرؤية (${nU})`],["original",`المؤشرات المساندة (${nO})`]].map(([k,l]) => `<button data-set="${k}" aria-pressed="${ST.set===k}">${l}</button>`).join("");
}
function render(){
  compute(); setSeg(); renderTree(); renderControls();
  const pg = ST.page;
  ["overview","dash","focus","admin","ind","cal"].forEach(v => { $("#v-" + v).hidden = pg !== v; });
  document.body.classList.toggle("noside", pg !== "dash");
  document.body.dataset.pg = pg;
  document.querySelectorAll(".navtabs a").forEach(a => a.setAttribute("aria-current", a.dataset.nav === pg ? "page" : "false"));
  document.querySelectorAll(".bnav button").forEach(b => b.setAttribute("aria-current", b.dataset.bnav === (pg === "ind" ? "focus" : pg) ? "page" : "false"));
  document.querySelectorAll(".navtabs a").forEach(a => { if (pg === "ind" && a.dataset.nav === "focus") a.setAttribute("aria-current", "page"); });
  $("#ctl-sum").textContent = `مستهدف ${ST.ty} · ${ST.from}–${ST.to}${ST.calcLinked ? "" : " · الحساب: كل السنوات"}`;
  applyRole();
  if (pg === "admin") renderAdmin(); else if (pg === "overview") renderOverview(); else if (pg === "focus") renderFocus(); else if (pg === "ind") renderInd(); else if (pg === "cal") renderCal(); else renderDash();
  const d = $("#drawer");
  if (!d.hidden){ if (d.dataset.mode === "cmp") openCompare(); else if (d.dataset.id) openDrawer(d.dataset.id); }
}

/* ================= events ================= */
function toast(m){ const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 2200); }
async function copyText(t){
  try { await navigator.clipboard.writeText(t); return true; } catch(_){}
  try { const ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch(_){ return false; }
}
let deb;
$("#cal-q").addEventListener("input", e => { ST.cal.q = e.target.value; renderCal(); });
$("#q").addEventListener("input", () => { clearTimeout(deb); deb = setTimeout(() => { ST.q = $("#q").value; if (ST.page !== "dash") location.hash = "#all"; else renderDash(); }, 50); });
$("#q").addEventListener("keydown", e => { if (e.key === "Enter"){ const f = document.querySelector("#v-dash [data-open]"); if (f) f.click(); } });
document.addEventListener("keydown", e => {
  if (e.key === "/" && !["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName)){ e.preventDefault(); $("#q").focus(); }
  if (e.key === "Escape" && !$("#drawer").hidden){ closeDrawer(); $("#drawer").dataset.id = ""; go(); }
  if (e.key === "Enter" && e.target.matches("[data-open]") && e.target.tagName !== "BUTTON") e.target.click();
});
["#f-type","#f-fresh","#f-sort","#f-elig"].forEach(s => $(s).addEventListener("input", renderDash));
$("#el-f").addEventListener("input", renderElig); $("#va-f").addEventListener("input", renderValid);
$("#y-from").addEventListener("input", e => { ST.from = +e.target.value; if (ST.from > ST.to) ST.to = ST.from; render(); });
$("#y-to").addEventListener("input", e => { ST.to = +e.target.value; if (ST.to < ST.from) ST.from = ST.to; render(); });
$("#y-calc").addEventListener("input", e => { ST.calcLinked = e.target.checked; render(); });
$("#m-axis").addEventListener("input", e => { ST.axis = e.target.value || null; ST.pri = null; render(); go(); });
$("#m-pri").addEventListener("input", e => { ST.pri = e.target.value || null; if (ST.pri){ const x = RAW.find(z => z.priority === ST.pri); if (x) ST.axis = x.axis; } render(); go(); });
$("#scrim").addEventListener("click", () => { closeDrawer(); $("#drawer").dataset.id = ""; go(); });
$("#export").addEventListener("click", exportResults);
$("#dl-tpl").addEventListener("click", exportTemplate); $("#dl-tpl2").addEventListener("click", exportTemplate);
$("#dl-json").addEventListener("click", () => isAdmin() && saveFile("dataset.json", new Blob([JSON.stringify({...ST.ds, meta:{...(ST.ds.meta||{}), exported:new Date().toISOString()}})], {type:"application/json"})));
$("#cmpgo").addEventListener("click", openCompare);
$("#cmpclr").addEventListener("click", () => { ST.cmp.clear(); renderDash(); if ($("#drawer").dataset.mode === "cmp") closeDrawer(); });
const fileIn = $("#file"), drop = $("#drop");
async function handleFile(f){
  if (!f) return;
  if (typeof Worker === "undefined"){ $("#check").innerHTML = `<div class="msg bad">المتصفح لا يدعم فحص الملفات بأمان. استخدم متصفحاً حديثاً.</div>`; return; }
  if (f.size > 15 * 1024 * 1024){ $("#check").innerHTML = `<div class="msg bad">حجم الملف أكبر من المسموح (15 ميغابايت).</div>`; fileIn.value = ""; return; }
  $("#check").innerHTML = `<div class="msg">جارٍ فحص «${esc(f.name)}»…</div>`;
  try { renderCheck(parseWorkbook(await readWorkbook(await f.arrayBuffer())), f.name); }
  catch(e){ $("#check").innerHTML = `<div class="msg bad">تعذرت قراءة الملف. تأكد أنه ملف Excel بصيغة ‎.xlsx‎ وبنفس أوراق النموذج.</div>`; }
  fileIn.value = "";
}
fileIn.addEventListener("change", () => handleFile(fileIn.files[0]));
["dragover","dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave","drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => handleFile(e.dataTransfer.files[0]));
document.addEventListener("mousemove", e => {
  const tp = e.target.closest && e.target.closest("[data-tip]"), tip0 = $("#tip");
  if (isMobile()){ tip0.style.display = "none"; return; }
  if (tp){ tip0.textContent = tp.dataset.tip; tip0.style.display = "block"; const x = Math.min(e.clientX + 12, window.innerWidth - tip0.offsetWidth - 8); tip0.style.left = Math.max(8, x) + "px"; tip0.style.top = (e.clientY + 14) + "px"; return; }
  const r = e.target.closest && e.target.closest("rect[data-hy]"), tip = $("#tip");
  if (!r){ tip.style.display = "none"; return; }
  const svg = r.closest("svg[data-chart]"), x = svg && BY[svg.dataset.chart]; if (!x){ tip.style.display = "none"; return; }
  tip.textContent = tipFor(x, +r.dataset.hy); tip.style.display = "block"; tip.style.left = (e.clientX + 12) + "px"; tip.style.top = (e.clientY + 12) + "px";
});
document.addEventListener("submit", async e => {
  const f = e.target.closest("form[data-updfor]"); if (!f) return; e.preventDefault();
  const x = BY[f.dataset.updfor], y = num(f.y.value), v = num(f.v.value), r = num(f.r.value);
  if (!(Number.isInteger(y) && y >= 2000 && y <= NOW)){ toast("السنة غير صالحة"); return; }
  if (Number.isNaN(v) || Number.isNaN(r)){ toast("القيمة ليست رقماً"); return; }
  if (v == null && r == null){ toast("أدخل القيمة أو الترتيب"); return; }
  if (!ST.db || !ST.admin){ toast("الحفظ متاح للمدير داخل Claude فقط"); return; }
  const ds = JSON.parse(JSON.stringify(ST.ds));
  const i = ds.readings.findIndex(z => z[0] === x.id && z[1] === y);
  const row = [x.id, y, v, r, "إدخال سريع من اللوحة", "فعلية", null, "غير مقيّمة", null];
  if (i >= 0) ds.readings[i] = row; else ds.readings.push(row);
  f.querySelector("button").disabled = true;
  try { await publish(ds, [x.id], [], `إدخال سريع: ${x.id} ${y}`, `قراءة ${x.id} لعام ${y}`); toast("نُشرت القراءة"); }
  catch(err){ toast(err && err.code === "invalid_argument" ? "ليست لديك صلاحية التحديث" : "تعذر الحفظ، أعد المحاولة"); }
  f.querySelector("button").disabled = false;
});
document.addEventListener("change", e => {
  const c = e.target.closest("[data-cmp]"); if (!c) return;
  if (c.checked){ if (ST.cmp.size >= 4){ c.checked = false; toast("أقصى عدد للمقارنة 4 مؤشرات"); return; } ST.cmp.add(c.dataset.cmp); } else ST.cmp.delete(c.dataset.cmp);
  renderCmpBar();
});
document.addEventListener("click", async e => {
  if (e.target.closest(".cmpbox")) return;
  const ov = e.target.closest("[data-faxis],[data-fpri],[data-fsel],[data-fsetaxis],[data-fsetpri],[data-gocenter],[data-ovcat]");
  if (ov){ const d = ov.dataset;
    if (d.faxis !== undefined){ location.hash = "#focus-a-" + d.faxis; return; }
    if (d.fpri !== undefined){ location.hash = "#focus-p-" + d.fpri; return; }
    if (d.fsetaxis !== undefined){ ST.fAxis = +d.fsetaxis; ST.fPri = null; ST.fInd = null; renderFocus(); go(); return; }
    if (d.fsetpri !== undefined){ ST.fPri = d.fsetpri; ST.fInd = null; renderFocus(); go(); return; }
    if (d.fsel){ ST.fInd = d.fsel; document.querySelectorAll(".frow").forEach(b => b.setAttribute("aria-pressed", b.dataset.fsel === d.fsel)); $("#f-panel").innerHTML = focusCardHTML(BY[d.fsel]); go(); return; }
    if (d.gocenter){ location.hash = "#all"; return; }
    if (d.ovcat){ ST.cat = ["all","rest"].includes(d.ovcat) ? null : d.ovcat; ST.axis = ST.pri = null; location.hash = "#all"; setTimeout(() => renderDash(), 0); return; }
  }
  const cg = e.target.closest("[data-calgo],[data-calst],[data-caltype],[data-calset],[data-calreset]");
  if (cg){ e.preventDefault(); const d = cg.dataset;
    if (d.calreset){ ST.cal = {set:"", type:"", st:"", q:""}; }
    if (d.calset !== undefined) ST.cal.set = d.calset;
    if (d.caltype !== undefined) ST.cal.type = d.caltype;
    if (d.calst !== undefined) ST.cal.st = d.calst;
    if (d.calgo !== undefined){
      if (ST.page !== "cal"){ ST.cal = {set:"", type:"", st:d.calgo, q:""}; location.hash = "#calendar"; return; }
      ST.cal.st = ST.cal.st === d.calgo ? "" : d.calgo;
    }
    renderCal(); return; }
  const el = e.target.closest("[data-open],[data-set],[data-axis],[data-pri],[data-ev],[data-cat],[data-close],[data-sharecopy],[data-sharepdf],[data-shareimg],[data-setev],[data-view],[data-ty],[data-asub],[data-cmpmode],#reset,#publish,#cancel,#preview-apply,#export-pending");
  if (!el) return; const d = el.dataset;
  if (d.open){ closeDrawer(); location.hash = "#i-" + d.open; return; }
  if (d.view){ ST.view = d.view; try { localStorage.setItem("ovd-view", ST.view); } catch(_){} renderDash(); return; }
  if (d.ty){ ST.ty = +d.ty; render(); return; }
  if (d.asub){ ST.asub = d.asub; renderAdmin(); return; }
  if (d.cmpmode){ $("#drawer").dataset.cmpmode = d.cmpmode; openCompare(); return; }
  if (d.set){ ST.set = d.set; try { localStorage.setItem("ovd-set", ST.set); } catch(_){} ST.pri = null; render(); go(); return; }
  if (d.axis !== undefined && el.classList.contains("axh")){ ST.page = "dash"; ST.axis = d.axis || null; ST.pri = null; render(); go(); return; }
  if (d.pri){ ST.page = "dash"; ST.pri = d.pri; ST.axis = d.ax; render(); go(); return; }
  if (d.ev !== undefined){ ST.ev = d.ev || null; renderDash(); return; }
  if (d.cat){ ST.cat = ST.cat === d.cat ? null : d.cat; renderDash(); return; }
  if (d.close !== undefined){ closeDrawer(); $("#drawer").dataset.id = ""; go(); return; }
  if (d.sharecopy){ shareCopy(d.sharecopy); return; }
  if (d.sharepdf){ exportCard(d.sharepdf, "pdf"); return; }
  if (d.shareimg){ exportCard(d.shareimg, "png"); return; }
  if (el.id === "reset"){ ST.axis = ST.pri = ST.ev = ST.cat = null; ST.q = ""; $("#q").value = ""; ["#f-type","#f-fresh","#f-elig"].forEach(s => $(s).value = ""); render(); go(); return; }
  if (el.id === "cancel"){ ST.pending = null; $("#check").innerHTML = ""; return; }
  if (el.id === "preview-apply"){ if (!ST.pending) return; ST.ds = {...ST.pending.ds, meta:{file:ST.pending.fileName}}; ST.dsSource = "preview"; buildModel(ST.ds); render(); toast("تعرض اللوحة الآن بيانات الملف (معاينة غير منشورة)"); return; }
  if (el.id === "export-pending"){ if (!ST.pending || !isAdmin()) return; saveFile("dataset.json", new Blob([JSON.stringify({...ST.pending.ds, meta:{file:ST.pending.fileName, exported:new Date().toISOString()}})], {type:"application/json"})); return; }
  if (el.id === "publish"){
    if (!ST.pending || !ST.db || !ST.admin){ toast("النشر متاح للمدير داخل Claude فقط"); return; }
    el.disabled = true; const p = ST.pending;
    const summary = `${p.d.rNew.length} قراءة جديدة، ${p.d.rChg.length} معدّلة، ${p.d.changed.length + p.d.added.length} مؤشر معدّل`;
    try { await publish(p.ds, p.d.touched, p.d.removed, p.fileName, summary); $("#check").innerHTML = `<div class="msg ok">اعتُمد التحديث من «${esc(p.fileName)}» ونُشر لكل المستخدمين.</div>`; ST.pending = null; }
    catch(err){ el.disabled = false; $("#pubprog").textContent = err && err.code === "invalid_argument" ? "ليست لديك صلاحية النشر." : err && err.code === "quota_exceeded" ? "امتلأت سعة قاعدة البيانات." : "توقف النشر قبل اكتماله. أعد الضغط لإكماله."; }
    return;
  }
  if (d.setev){
    if (!ST.admin || !ST.db){ toast("التقييم متاح للمدير داخل Claude فقط"); return; }
    const id = $("#drawer").dataset.id, prev = ST.assess[id];
    ST.assess[id] = {s:d.setev, at:Date.now(), by:ST.me}; render();
    try { await ST.db.collection("assessments").doc(id).set({s:d.setev, at:Date.now(), by:ST.me||null}); toast("حُفظ التقييم"); }
    catch(err){ if (prev) ST.assess[id] = prev; else delete ST.assess[id]; render(); toast(err && err.code === "invalid_argument" ? "ليست لديك صلاحية التقييم" : "تعذر الحفظ"); }
  }
});
window.addEventListener("hashchange", readHash);
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-itab]"); if (!b) return;
  ST.indTab = +b.dataset.itab; const root = b.closest(".db");
  root.querySelectorAll("[data-itab]").forEach(x => x.setAttribute("aria-selected", x === b));
  root.querySelectorAll("[data-tabp]").forEach(pn => { pn.hidden = +pn.dataset.tabp !== ST.indTab; }); });
document.addEventListener("change", e => {
  const id = e.target.id;
  if (id === "f-sort" || id === "fm-sort"){ ST.fSort = e.target.value; ST.fInd = null; renderFocus(); go(); }
  if (id === "fm-axis"){ ST.fAxis = +e.target.value; ST.fPri = null; ST.fInd = null; renderFocus(); go(); }
  if (id === "fm-pri"){ ST.fPri = e.target.value; ST.fInd = null; renderFocus(); go(); }
  if (id === "fd-axis"){ ST.fAxis = +e.target.value; ST.fPri = null; ST.fInd = null; renderFocus(); go(); }
  if (id === "fd-pri"){ ST.fPri = e.target.value; ST.fInd = null; renderFocus(); go(); }
  if (id === "fd-ind"){ ST.fInd = e.target.value; renderFocus(); go(); window.scrollTo && window.scrollTo(0, 0); }
});
document.addEventListener("click", e => {
  const dot = e.target.closest("[data-fdot]");
  if (dot){ const c = document.querySelector(`[data-fcard="${dot.dataset.fdot}"]`); if (c) c.scrollIntoView({behavior:"smooth", block:"nearest", inline:"center"}); return; }
  const bn = e.target.closest("[data-bnav]");
  if (bn){ const v = bn.dataset.bnav;
    if (v === "search"){ if (ST.page !== "dash") location.hash = "#all"; setTimeout(() => { window.scrollTo(0, 0); $("#q").focus(); }, 30); return; }
    location.hash = v === "overview" ? "#overview" : v === "focus" ? "#focus" : "#all"; window.scrollTo(0, 0); return; }
  if (e.target.closest("#ctl-toggle")){ const o = $("#controls").classList.toggle("open"); $("#ctl-toggle").setAttribute("aria-expanded", o); return; }
});
if (MQ.addEventListener) MQ.addEventListener("change", () => render());
/* bottom sheet: اسحب للأسفل للإغلاق */
(() => { const d = $("#drawer"); let y0 = null, dy = 0;
  d.addEventListener("touchstart", e => { if (!isMobile() || d.scrollTop > 0 || !e.target.closest(".dh")) return; y0 = e.touches[0].clientY; dy = 0; d.classList.add("dragging"); }, {passive:true});
  d.addEventListener("touchmove", e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); d.style.setProperty("--dy", dy + "px"); }, {passive:true});
  d.addEventListener("touchend", () => { if (y0 == null) return; d.classList.remove("dragging"); y0 = null; d.style.setProperty("--dy", "0px"); if (dy > 110){ closeDrawer(); go(); } });
})();

/* ================= وضع الإدارة (الموقع) ================= */
$("#admin-unlock").addEventListener("submit", async e => {
  e.preventDefault();
  const v = $("#admin-pass").value.trim(); if (!v) return;
  let h = ""; try { h = await sha256("ovd|" + v); } catch(_){ toast("المتصفح لا يدعم التحقق. افتح الرابط عبر https."); return; }
  if (h !== ADMIN_HASH){ $("#admin-pass").value = ""; toast("رمز غير صحيح"); return; }
  ST.siteAdmin = true; try { sessionStorage.setItem(ADMIN_SS, v); } catch(_){}
  $("#admin-pass").value = ""; applyRole(); renderAdmin(); toast("تم الدخول إلى وضع الإدارة");
});
$("#admin-out").addEventListener("click", () => {
  ST.siteAdmin = false; try { sessionStorage.removeItem(ADMIN_SS); } catch(_){}
  applyRole(); location.hash = "#overview"; toast("تم الخروج من وضع الإدارة");
});

/* ================= مشاركة المؤشر: نسخ نص أو صورة أو PDF — بلا روابط ================= */
const shareBtns = id => `<span class="shr"><button class="btn" data-sharecopy="${id}" title="نسخ بيانات المؤشر نصاً">نسخ</button><button class="btn" data-shareimg="${id}" title="حفظ بطاقة المؤشر صورة (PNG)">صورة</button><button class="btn" data-sharepdf="${id}" title="حفظ بطاقة المؤشر ملف PDF">PDF</button></span>`;
const today = () => new Date().toLocaleDateString("ar-OM-u-nu-latn", {year:"numeric", month:"long", day:"numeric"});
const LRM = "‎", lt = v => /^[-−+]?\d/.test(String(v)) ? LRM + v + LRM : v;   // حتى تظهر الأرقام والنسب صحيحة داخل النص العربي
const catTxt = x => x.p.status === "review" ? "قيد التحقق" : E.CAT[x.cat].ar + (x.p.achieved ? " · حقق المستهدف" : "");
const srcOf = (x, r) => (r && r.src) || x.src || x.issuer || "";
function shareText(x){
  const L = [`${x.name} (${x.id})`, `${x.axis} ‹ ${x.priority}`, ""];
  if (x.kids){
    x.kids.forEach(k => { const c = k.curAll;
      L.push(`• ${[k.grade, k.subject || k.name].filter(Boolean).join(" · ")}: ${c ? lt(curTxt({...k, cur:c})) + " (" + c.y + ")" : "لا توجد قراءة"} · مستهدف 2030: ${lt(targetTxt(k, 2030))}`); });
    L.push(`التصنيف العام: ${catTxt(x)}`);
  } else {
    const c = x.curAll;
    L.push(`آخر قراءة: ${c ? lt(curTxt({...x, cur:c})) + " (" + c.y + (c.kind && c.kind !== "فعلية" ? "، " + c.kind : "") + ")" : "لا توجد قراءة"}`);
    if (x.base != null) L.push(`خط الأساس: ${lt(fv(x, x.base))}`);
    L.push(`مستهدف 2030: ${lt(targetTxt(x, 2030))} · مستهدف 2040: ${lt(targetTxt(x, 2040))}`);
    L.push(`التصنيف: ${catTxt(x)}` + (x.p.R != null && isFinite(x.p.R) ? ` · نسبة التقدّم: ${lt(rTxt(x))}` : ""));
    const s = srcOf(x, c); if (s) L.push(`المصدر: ${s}`);
  }
  L.push("", `لوحة مؤشرات رؤية عُمان 2040 · ${today()}`);
  return L.join("\n");
}
async function shareCopy(id){
  const x = BY[id]; if (!x) return;
  toast(await copyText(shareText(x)) ? "نُسخت بيانات المؤشر، الصقها حيث تريد" : "تعذر النسخ على هذا الجهاز");
}
function sharePDF(id){
  const x = BY[id]; if (!x) return;
  const ps = $("#printsheet"), logo = document.querySelector(".vlogo");
  const tiles = (k, ty) => `<div class="ptiles"><div><small>خط الأساس</small><b>${N(k.base != null ? fv(k, k.base) : "—")}</b></div><div><small>آخر قراءة${k.curAll ? " (" + k.curAll.y + ")" : ""}</small><b>${N(k.curAll ? curTxt({...k, cur:k.curAll}) : "—")}</b></div><div><small>مستهدف 2030</small><b>${N(targetTxt(k, 2030))}</b></div><div><small>مستهدف 2040</small><b>${N(targetTxt(k, 2040))}</b></div></div>`;
  const rows = k => k.series.filter(r => r.y <= NOW && (r.v != null || r.r != null)).slice(-8).map(r => `<tr><td>${r.y}</td><td>${N(r.v != null ? fv(k, r.v) : "—")}</td><td>${r.r != null ? fmtN(r.r, 0) : "—"}</td><td>${esc(r.kind || "فعلية")}</td><td>${esc(r.src || "—")}</td></tr>`).join("");
  const table = k => { const r = rows(k); return r ? `<table><thead><tr><th>السنة</th><th>القيمة</th><th>الترتيب</th><th>النوع</th><th>المصدر</th></tr></thead><tbody>${r}</tbody></table>` : ""; };
  const body = x.kids
    ? x.kids.map(k => `<div class="kid"><b>${esc([k.grade, k.subject || k.name].filter(Boolean).join(" · "))}</b> — ${esc(catTxt(k))}${tiles(k)}${chartSVG(k)}${table(k)}</div>`).join("")
    : `${tiles(x)}${chartSVG(x)}${table(x)}`;
  ps.innerHTML = `<div class="ph"><div><b>لوحة مؤشرات رؤية عُمان 2040</b><div class="path">${esc(today())}</div></div>${logo ? `<img src="${logo.src}" alt="">` : ""}</div>
    <div class="path">${esc(x.axis)} ‹ ${esc(x.priority)}</div><h1>${esc(x.name)}</h1>
    <div class="path">${x.id} · التصنيف: <b>${esc(catTxt(x))}</b>${!x.kids && x.p.R != null && isFinite(x.p.R) ? " · نسبة التقدّم نحو مستهدف " + ST.ty + ": " + N(rTxt(x)) : ""}</div>
    ${body}
    <div class="path" style="margin-top:8px">مصدر البيانات: ${escB(x.src || x.issuer || "—")}${x.freq ? " · الدورية: " + esc(x.freq) : ""}</div>
    <div class="pf"><span>لوحة مؤشرات رؤية عُمان 2040</span><span>${esc(today())}</span></div>`;
  const t0 = document.title; document.title = "مؤشر " + x.id + " - " + x.name;
  document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); document.title = t0; ps.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  toast("اختر «حفظ بصيغة PDF» من نافذة الطباعة");
  setTimeout(() => { try { window.print(); } catch(_){ done(); toast("تعذر فتح الطباعة على هذا الجهاز"); } }, 250);
}

/* ================= تصدير بطاقة المؤشر مباشرة: صورة PNG أو ملف PDF (بلا نافذة طباعة) ================= */
const EXP = {bg:"#ffffff", ink:"#15211e", muted:"#5d6b67", line:"#dde3e1", soft:"#f2f4f3", accent:"#0d6b5a", good:"#1f7a3f", sand:"#b8862f", bad:"#b23a32"};
const expFont = (w, s, disp) => `${w} ${s}px ${getComputedStyle(document.documentElement).getPropertyValue(disp ? "--f-display" : "--f-body").trim() || "Tahoma,sans-serif"}`;
const clean = s => String(s == null ? "" : s).replace(/[‎‏]/g, "");
function wrapLines(c, text, maxW){
  const out = []; clean(text).split("\n").forEach(par => {
    let line = ""; par.split(/\s+/).forEach(w => { const t = line ? line + " " + w : w; if (c.measureText(t).width > maxW && line){ out.push(line); line = w; } else line = t; });
    out.push(line);
  }); return out;
}
/* chart drawn natively on canvas (mirrors chartSVG) */
function drawChart(c, x, X0, Y0, W, H){
  const pts = x.series.filter(r => r.v != null && r.y <= NOW && r.y >= ST.from && r.y <= ST.to);
  const path = x.series.filter(r => r.p != null && r.y >= ST.from);
  c.save(); c.strokeStyle = EXP.line; c.lineWidth = 1; c.strokeRect(X0 + .5, Y0 + .5, W - 1, H - 1);
  if (!pts.length && !path.length){ c.fillStyle = EXP.muted; c.font = expFont(400, 13); c.textAlign = "center"; c.fillText("لا توجد قراءات رقمية في فترة العرض", X0 + W / 2, Y0 + H / 2); c.restore(); return; }
  const sc = v => x.pct ? v * 100 : v, tgt = ST.ty === 2040 ? x.t40 : x.t30n;
  const ys = [...pts.map(r => sc(r.v)), ...path.map(r => sc(r.p))]; if (tgt != null) ys.push(sc(tgt)); if (ST.ty === 2030 && x.range) ys.push(sc(x.range[0]), sc(x.range[1]));
  const yrs = [...pts.map(r => r.y), ...path.map(r => r.y), ST.ty === 2040 && tgt != null ? 2040 : 2030], x0 = Math.min(...yrs), x1 = Math.max(...yrs);
  let lo = Math.min(...ys), hi = Math.max(...ys); if (lo === hi){ lo -= 1; hi += 1; } const pad = (hi - lo) * .1; lo -= pad; hi += pad;
  const L = X0 + 58, R = X0 + W - 16, T = Y0 + 14, B = Y0 + H - 30;
  const PX = y => L + (R - L) * (y - x0) / Math.max(1, x1 - x0), PY = v => T + (B - T) * (1 - (v - lo) / (hi - lo));
  c.font = expFont(400, 12); c.direction = "ltr";
  for (let i = 0; i <= 4; i++){ const t = lo + (hi - lo) * i / 4, yy = PY(t); c.strokeStyle = EXP.line; c.beginPath(); c.moveTo(L, yy); c.lineTo(R, yy); c.stroke();
    c.fillStyle = EXP.muted; c.textAlign = "right"; c.fillText(fmtN(t, Math.abs(hi - lo) < 5 ? 2 : Math.abs(hi - lo) < 50 ? 1 : 0), L - 8, yy + 4); }
  const step = Math.max(1, Math.ceil((x1 - x0) / 8)); c.textAlign = "center"; for (let y = x0; y <= x1; y += step) c.fillText(String(y), PX(y), B + 20);
  if (ST.ty === 2030 && x.range){ c.globalAlpha = .12; c.fillStyle = EXP.good; const a = PY(sc(x.range[1])), b = PY(sc(x.range[0])); c.fillRect(L, a, R - L, Math.max(1, b - a)); c.globalAlpha = 1; }
  else if (tgt != null){ c.strokeStyle = EXP.good; c.lineWidth = 1.5; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(L, PY(sc(tgt))); c.lineTo(R, PY(sc(tgt))); c.stroke(); c.setLineDash([]); }
  const poly = (arr, f) => { c.beginPath(); arr.forEach((r, i) => { const px = PX(r.y), py = PY(sc(f(r))); i ? c.lineTo(px, py) : c.moveTo(px, py); }); };
  if (path.length > 1){ c.strokeStyle = EXP.sand; c.lineWidth = 2; c.setLineDash([5, 4]); poly(path, r => r.p); c.stroke(); c.setLineDash([]); }
  const act = pts.filter(r => (r.kind || "فعلية") === "فعلية");
  if (act.length){
    poly(act, r => r.v); c.lineTo(PX(act[act.length - 1].y), B); c.lineTo(PX(act[0].y), B); c.closePath(); c.globalAlpha = .08; c.fillStyle = EXP.accent; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = EXP.accent; c.lineWidth = 2.5; poly(act, r => r.v); c.stroke();
  }
  pts.forEach(r => { const est = (r.kind || "فعلية") !== "فعلية"; c.beginPath(); c.arc(PX(r.y), PY(sc(r.v)), est ? 4.5 : 3.5, 0, Math.PI * 2);
    c.fillStyle = est ? "#fff" : EXP.accent; c.fill(); c.lineWidth = 2; c.strokeStyle = est ? EXP.sand : EXP.accent; c.stroke(); });
  c.restore();
  /* legend under the chart */
  c.save(); c.font = expFont(400, 12); c.direction = "rtl"; c.textAlign = "right"; let lx = X0 + W;
  [[EXP.accent, "قراءة فعلية"], ...(path.length > 1 ? [[EXP.sand, "المسار المستهدف"]] : []), ...(tgt != null || x.range ? [[EXP.good, "المستهدف " + ST.ty]] : [])].forEach(([col, t]) => {
    c.fillStyle = col; c.fillRect(lx - 12, Y0 + H + 9, 12, 4); c.fillStyle = EXP.muted; c.fillText(t, lx - 18, Y0 + H + 16); lx -= 30 + c.measureText(t).width; });
  c.restore();
}
/* full card layout; returns used height. Drawing on a 1×1 scratch canvas = measuring pass */
function drawCard(c, x){
  const W = 900, M = 40, CW = W - 2 * M, RX = W - M;
  let y = M; const brk = c.__brk = [];
  c.fillStyle = EXP.bg; c.fillRect(0, 0, W, 20000);
  c.direction = "rtl"; c.textAlign = "right"; c.textBaseline = "alphabetic";
  const txt = (t, size, opt) => { opt = opt || {}; c.font = expFont(opt.w || 400, size, opt.disp); c.fillStyle = opt.color || EXP.ink;
    const lines = wrapLines(c, t, opt.maxW || CW), lh = Math.round(size * (opt.lh || 1.55));
    lines.forEach(l => { y += lh; c.fillText(l, opt.x || RX, y - Math.round(size * .35)); }); return lines.length * lh; };
  /* header */
  const logo = document.querySelector(".vlogo");
  if (logo && logo.complete && logo.naturalWidth){ const h = 56, w = h * logo.naturalWidth / logo.naturalHeight; c.drawImage(logo, M, y, w, h); }
  const y0 = y; txt("لوحة مؤشرات رؤية عُمان 2040", 18, {w:700, disp:1, color:EXP.accent}); txt(today(), 13, {color:EXP.muted}); y = Math.max(y, y0 + 58) + 8;
  c.fillStyle = EXP.accent; c.fillRect(M, y, CW, 2.5); y += 14;
  txt(`${x.axis} ‹ ${x.priority}`, 13, {color:EXP.muted});
  txt(x.name, 24, {w:700, disp:1, lh:1.45});
  const R = !x.kids && x.p.R != null && isFinite(x.p.R) ? ` · نسبة التقدّم نحو مستهدف ${ST.ty}: ${clean(rTxt(x))}` : "";
  txt(`${x.id} · التصنيف: ${catTxt(x)}${R}`, 14, {color:EXP.muted}); y += 10;
  const block = k => {
    /* tiles */
    const tiles = [["خط الأساس", k.base != null ? fv(k, k.base) : "—"], ["آخر قراءة" + (k.curAll ? " (" + k.curAll.y + ")" : ""), k.curAll ? curTxt({...k, cur:k.curAll}) : "—"], ["مستهدف 2030", targetTxt(k, 2030)], ["مستهدف 2040", targetTxt(k, 2040)]];
    const g = 10, tw = (CW - 3 * g) / 4, th = 70;
    tiles.forEach(([l, v], i) => { const tx = RX - i * (tw + g);
      c.fillStyle = EXP.soft; c.fillRect(tx - tw, y, tw, th); c.strokeStyle = EXP.line; c.lineWidth = 1; c.strokeRect(tx - tw + .5, y + .5, tw - 1, th - 1);
      c.textAlign = "right"; c.direction = "rtl"; c.font = expFont(400, 12); c.fillStyle = EXP.muted; c.fillText(clean(l), tx - 10, y + 22);
      c.font = expFont(700, 20, 1); c.fillStyle = EXP.ink; let s = clean(v); while (c.measureText(s).width > tw - 20 && s.length > 4) s = s.slice(0, -2) + "…"; c.fillText(s, tx - 10, y + 54); });
    y += th + 16;
    drawChart(c, k, M, y, CW, 270); y += 270 + 30; brk.push(y);
    /* readings table */
    const rows = k.series.filter(r => r.y <= NOW && (r.v != null || r.r != null)).slice(-8);
    if (!rows.length) return;
    const cols = [["السنة", 70], ["القيمة", 110], ["الترتيب", 80], ["النوع", 70], ["المصدر", CW - 330]];
    const row = (cells, head) => { c.font = expFont(head ? 600 : 400, 12.5); const srcL = wrapLines(c, cells[4], cols[4][1] - 12), h = Math.max(1, srcL.length) * 19 + 12;
      if (head){ c.fillStyle = EXP.soft; c.fillRect(M, y, CW, h); }
      let cx = RX; c.fillStyle = head ? EXP.muted : EXP.ink; c.textAlign = "right"; c.direction = "rtl";
      cells.forEach((v, i) => { if (i < 4) c.fillText(clean(v), cx - 6, y + 21); else srcL.forEach((l, j) => c.fillText(l, cx - 6, y + 21 + j * 19)); cx -= cols[i][1]; });
      y += h; c.fillStyle = EXP.line; c.fillRect(M, y - 1, CW, 1); brk.push(y); };
    row(cols.map(cc => cc[0]).concat([]).slice(0, 5), true);
    rows.forEach(r => row([String(r.y), r.v != null ? fv(k, r.v) : "—", r.r != null ? fmtN(r.r, 0) : "—", r.kind || "فعلية", r.src || "—"]));
    y += 10;
  };
  if (x.kids) x.kids.forEach(k => { brk.push(y); y += 6; txt([k.grade, k.subject || k.name].filter(Boolean).join(" · ") + " — " + catTxt(k), 16, {w:700}); y += 6; block(k); });
  else block(x);
  brk.push(y);
  txt(`مصدر البيانات: ${x.src || x.issuer || "—"}${x.freq ? " · الدورية: " + x.freq : ""}`, 12.5, {color:EXP.muted});
  y += 10; c.fillStyle = EXP.line; c.fillRect(M, y, CW, 1); y += 4;
  txt("لوحة مؤشرات رؤية عُمان 2040 · " + today(), 11.5, {color:EXP.muted});
  return y + M;
}
function cardCanvas(x){
  const S = 2, probe = document.createElement("canvas").getContext("2d"), H = Math.ceil(drawCard(probe, x));
  const cv = document.createElement("canvas"); cv.width = 900 * S; cv.height = H * S;
  const c = cv.getContext("2d"); c.scale(S, S); drawCard(c, x); cv.__brk = (c.__brk || []).map(v => Math.round(v * S)); return cv;
}
const b64bytes = d => { const s = atob(d.split(",")[1]), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
/* minimal PDF: one JPEG per A4 page (card split into page-height slices) */
function canvasPDF(cv){
  const PW = 595.28, PH = 841.89, MG = 24, IW = PW - 2 * MG, sc = IW / cv.width, sliceH = Math.floor((PH - 2 * MG) / sc);
  const pages = [], B = (cv.__brk || []).slice().sort((a, b) => a - b);
  for (let top = 0, h; top < cv.height; top += h){
    h = Math.min(sliceH, cv.height - top);
    if (top + h < cv.height){ const cut = B.filter(b => b > top + sliceH * .35 && b <= top + sliceH).pop(); if (cut) h = cut - top; }
    const s = document.createElement("canvas"); s.width = cv.width; s.height = h;
    const sc2 = s.getContext("2d"); sc2.fillStyle = "#fff"; sc2.fillRect(0, 0, s.width, h); sc2.drawImage(cv, 0, top, cv.width, h, 0, 0, cv.width, h);
    pages.push({jpg: b64bytes(s.toDataURL("image/jpeg", .9)), w: s.width, h});
  }
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = p => { const b = typeof p === "string" ? enc.encode(p) : p; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body.forEach(push); push("\nendobj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const N = pages.length, kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]); obj(2, [`<< /Type /Pages /Kids [${kids}] /Count ${N} >>`]);
  pages.forEach((p, i) => { const pn = 3 + i * 3, im = pn + 1, ct = pn + 2, dw = IW, dh = p.h * sc;
    obj(pn, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im${i} ${im} 0 R >> >> /Contents ${ct} 0 R >>`]);
    obj(im, [`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`, p.jpg, "\nendstream"]);
    const cs = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${MG} ${(PH - MG - dh).toFixed(2)} cm /Im${i} Do Q`;
    obj(ct, [`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`]); });
  const total = 3 + N * 3, xref = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n` + offs.slice(1, total).map(o => String(o).padStart(10, "0") + " 00000 n \n").join(""));
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, {type: "application/pdf"});
}
async function deliverFile(blob, name){
  const f = typeof File === "function" ? new File([blob], name, {type: blob.type}) : null;
  const touch = window.matchMedia && matchMedia("(pointer:coarse)").matches;
  if (f && touch && navigator.canShare && navigator.canShare({files: [f]})){
    try { await navigator.share({files: [f], title: name}); return "shared"; } catch(e){ if (e && e.name === "AbortError") return "cancel"; }
  }
  const a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 4000); return "saved";
}
async function exportCard(id, kind){
  const x = BY[id]; if (!x) return;
  const base = `مؤشر ${x.id}`;
  try {
    const cv = cardCanvas(x);
    const blob = kind === "pdf" ? canvasPDF(cv) : new Blob([b64bytes(cv.toDataURL("image/png"))], {type: "image/png"});
    const r = await deliverFile(blob, `${base}.${kind === "pdf" ? "pdf" : "png"}`);
    if (r === "saved") toast(kind === "pdf" ? "حُفظ ملف PDF في التنزيلات" : "حُفظت الصورة في التنزيلات");
  } catch(err){
    if (kind === "pdf"){ sharePDF(id); return; }   // احتياط: نافذة الطباعة عند تعذر الإنشاء المباشر
    toast("تعذر إنشاء الصورة على هذا الجهاز");
  }
}

/* ================= boot ================= */
buildModel(ST.ds);
const stamp = () => { $("#sub").textContent = ""; };   // لا تاريخ في الترويسة؛ الهوية في شعار الرؤية
stamp(); readHash(); if (!location.hash) render();
applyRole();   // أدوات الإدارة والتصدير لا تظهر إلا للمسؤول
// استعادة وضع الإدارة داخل التبويب نفسه: يُعاد التحقق من الرمز المحفوظ في الجلسة، لا من قيمة يمكن نسخها
if (!IN_CLAUDE){ let sv = null; try { sv = sessionStorage.getItem(ADMIN_SS); } catch(_){}
  if (sv) adminCheck(sv).then(ok => { if (ok){ ST.siteAdmin = true; applyRole(); if (ST.page === "admin") renderAdmin(); } else { try { sessionStorage.removeItem(ADMIN_SS); } catch(_){} } }); }

if (!IN_CLAUDE && /^https?:$/.test(location.protocol) && typeof fetch === "function"){
  if (SITE) $("#sub").textContent = "جارٍ تحميل البيانات…";
  fetch("data/dataset.json", {cache:"no-cache"}).then(r => r.ok ? r.json() : null).then(ds => {
    if (ds && Array.isArray(ds.indicators)){ ST.ds = ds; ST.dsSource = "file"; buildModel(ds); stamp(); readHash(); }
    else if (SITE){ $("#sub").textContent = "تعذر تحميل البيانات"; toast("تعذر تحميل البيانات. تحقق من الاتصال ثم أعد فتح التطبيق."); }
  }).catch(() => { if (SITE){ $("#sub").textContent = "تعذر تحميل البيانات"; toast("تعذر تحميل البيانات. تحقق من الاتصال ثم أعد فتح التطبيق."); } });
}
/* ================= PWA: تثبيت، عمل بلا اتصال، تحديث تلقائي ================= */
if (SITE && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)){
  const had = !!navigator.serviceWorker.controller;
  let REG = null, reloading = false;
  const reloadOnce = () => { if (reloading) return; reloading = true; try { sessionStorage.setItem("ovd-updated", "1"); } catch(_){} location.reload(); };
  navigator.serviceWorker.register("sw.js").then(reg => { REG = reg; }).catch(() => {});
  // نسخة جديدة من عامل الخدمة أخذت التحكم ← إعادة تحميل مرة واحدة لعرض الصفحة الجديدة
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had) reloadOnce(); });
  // آيفون يستأنف التطبيق المثبّت من الذاكرة دون إعادة تحميل؛ لذلك نفحص رقم النسخة عند الفتح وعند كل عودة للتطبيق
  const checkVersion = () => {
    if (REG) REG.update().catch(() => {});
    fetch("version.json?t=" + Date.now(), {cache: "no-store"}).then(r => r.ok ? r.json() : null).then(v => { if (v && v.build && v.build !== BUILD) reloadOnce(); }).catch(() => {});
  };
  checkVersion();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkVersion(); });
  setInterval(checkVersion, 15 * 60 * 1000);
  try { if (sessionStorage.getItem("ovd-updated")){ sessionStorage.removeItem("ovd-updated"); setTimeout(() => toast("تم تحديث اللوحة إلى أحدث نسخة"), 600); } } catch(_){}
}
if (SITE){
  const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  let dismissed = false; try { dismissed = localStorage.getItem("ovd-install-x") === "1"; } catch(_){}
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const show = txt => { if (standalone || dismissed || !isMobile()) return; $("#install-txt").textContent = txt; $("#installbar").hidden = false; };
  if (ios) show("لتثبيت اللوحة كتطبيق: اضغط زر المشاركة ⬆︎ في Safari ثم «إضافة إلى الشاشة الرئيسية».");
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("#install-btn").hidden = false; show("ثبّت مؤشرات الرؤية على جوالك لتفتحها كتطبيق وتعمل بدون إنترنت."); });
  $("#install-btn").addEventListener("click", async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch(_){} deferred = null; $("#installbar").hidden = true; });
  $("#install-x").addEventListener("click", () => { $("#installbar").hidden = true; try { localStorage.setItem("ovd-install-x", "1"); } catch(_){} });
}
if (IN_CLAUDE){
  claude.use("downloads").then(d => { DL = d || null; }).catch(()=>{});
  claude.use("user").then(async u => {
    ST.user = u || null; if (!u) return;
    try { ST.me = await u.id(); } catch(_){}
    try { ST.admin = !!(await u.canEdit()); } catch(_){ ST.admin = false; }
    applyRole(); render();
  }).catch(()=>{});
  claude.use("db").then(db => {
    ST.db = db || null; if (!db) return;
    let meta = null, docs = null;
    const apply = () => { if (docs && docs.length && ST.dsSource !== "preview"){ ST.ds = docsToDs(docs, meta || {}); ST.dsSource = "db"; buildModel(ST.ds); stamp(); render(); } };
    db.doc("dsmeta/current").onSnapshot(s => { meta = s.exists ? s.data() : null; apply(); }, () => {});
    db.collection("inds").onSnapshot(s => { docs = s.docs.map(d => d.data()).filter(d => d && d.code); apply(); }, () => {});
    db.collection("assessments").onSnapshot(s => { ST.assess = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); names(); render(); }, () => {});
    db.collection("uploads").onSnapshot(s => { ST.uploads = s.docs.map(d => d.data()); names(); if (ST.page === "admin") renderAdmin(); }, () => {});
  }).catch(()=>{});
}
let namesBusy = false;
async function names(){
  if (!ST.user || namesBusy) return;
  const ids = [...new Set([...Object.values(ST.assess).map(a => a.by), ...ST.uploads.map(u => u.by), (ST.ds.meta||{}).by].filter(Boolean))].filter(i => !(i in ST.names));
  if (!ids.length) return; namesBusy = true;
  try { const ps = await ST.user.profiles(ids); ids.forEach(i => ST.names[i] = (ps[i] && ps[i].name) || ""); } catch(_){}
  namesBusy = false;
}
