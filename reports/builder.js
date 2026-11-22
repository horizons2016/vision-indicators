/* مولّد الدوريات: «لمحة عن الرؤية» (سنوية) و«نبض الرؤية» (ربعية)، كل منهما داشبورد في شريحة واحدة.
 * يقرأ نفس ملف البيانات data/dataset.json ونفس محرك الحساب في index.html،
 * فأرقام العرض مطابقة دائماً للوحة. يعمل في المتصفح (صفحة reports.html) وفي Node.
 *
 * الاستخدام: OVReports.build(PptxGenJS, OVEngine, dataset, options) ← كائن pptx جاهز للحفظ
 * options: { kind:"annual"|"quarterly", year, quarter (1-4), set:"updated"|"original",
 *            font, baseline (dataset سابق للربعية أو null), baselineLabel, today (Date) }
 *
 * لتعديل الشكل: الألوان في PAL، والنصوص الثابتة في TXT. لا حاجة لتعديل أي شيء آخر عند تحديث البيانات.
 */
(function (root) {
  "use strict";

  /* ---------------- الهوية البصرية (ألوان قالب الوزارة + ألوان التصنيف في اللوحة) ---------------- */
  const PAL = {
    purple: "665893", slate: "4E6BA6", teal: "006B83", gold: "C3A13F", maroon: "A14B5C",
    ink: "1F2328", muted: "5F6670", line: "D9DCE3", soft: "F3F1F8", white: "FFFFFF",
    axes: ["B64E9D", "1FA9B4", "546CB0", "69479C"],   // ألوان المحاور في عجلة الأولويات الوطنية
    cat: { on_track: "1B7139", needs: "C3A13F", breakthrough: "D07A1C", backwards: "B23A32", stalled: "6B7680", review: "4E6BA6", na: "B8BDC4" },
  };
  const AXES = ["الإنسان والمجتمع", "الاقتصاد والتنمية", "الحوكمة والأداء المؤسسي", "البيئة المستدامة"];
  const PRI_ALIAS = { "المواطنة والهوية والثقافة والقيم": "المواطنة والهوية والتراث والثقافة الوطنية" };
  const CATS = ["on_track", "needs", "breakthrough", "backwards", "stalled", "review", "na"];
  const CAT_AR = { on_track: "على المسار", needs: "يحتاج تحسيناً", breakthrough: "متأخر عن المسار", backwards: "يتراجع", stalled: "ثابت بلا تقدم", review: "يحتاج مراجعة البيانات", na: "لا يُصنَّف" };
  const SEV = ["backwards", "breakthrough", "stalled", "needs", "on_track"];
  const RANK = { backwards: 0, breakthrough: 1, stalled: 2, needs: 3, on_track: 4 };
  const AR_M = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const Q_AR = ["الأول", "الثاني", "الثالث", "الرابع"];

  const W = 13.333, H = 7.5, M = 0.5;
  const isNum = v => typeof v === "number" && isFinite(v);

  /* ---------------- البيانات ← نموذج (نفس منطق buildModel في اللوحة) ---------------- */
  function buildModel(E, ds, setKey) {
    const rd = {}, pt = {}, nt = {};
    (ds.readings || []).forEach(a => { (rd[a[0]] = rd[a[0]] || []).push({ y: a[1], v: a[2], r: a[3], src: a[4], kind: a[5] || "فعلية", brk: a[6] === "نعم" || a[6] === true, rel: a[7] || "غير مقيّمة" }); });
    (ds.path || []).forEach(([c, y, p]) => { (pt[c] = pt[c] || []).push({ y, p }); });
    (ds.notes || []).forEach(([c, y, t]) => { (nt[c] = nt[c] || []).push({ y, t }); });
    const mk = i => {
      const pct = i.unit === "%", k = pct ? 100 : 1, sc = v => v == null ? null : v / k;
      const S = {};
      (rd[i.code] || []).forEach(r => { S[r.y] = { ...(S[r.y] || { y: r.y }), ...r, v: sc(r.v), raw: r.v }; });
      (pt[i.code] || []).forEach(p => { S[p.y] = { ...(S[p.y] || { y: p.y }), p: sc(p.p), praw: p.p }; });
      return {
        id: i.code, set: i.set === "محدث" ? "updated" : "original", axis: i.axis, priority: PRI_ALIAS[i.priority] || i.priority, name: i.name, unit: i.unit,
        pct, dir: String(i.dir || "").includes("الانخفاض") ? "down" : "up",
        base: sc(i.base), t30n: i.t30hi != null ? null : sc(i.t30), range: i.t30hi != null && i.t30 != null ? [sc(i.t30), sc(i.t30hi)] : null,
        t30r: i.t30rank, t40: sc(i.t40), t30text: i.t30text, owner: i.owner, freq: i.freq,
        method: i.calc === "CAGR" ? "CAGR" : "Linear", agg: E.AGG_BY_LABEL[i.agg] || null, cap: E.CAP_BY_LABEL[i.cap] || "auto",
        approval: i.approval || "", notes: (nt[i.code] || []).sort((a, b) => a.y - b.y),
        series: Object.values(S).sort((a, b) => a.y - b.y), parent: i.parent || null, grade: i.grade || null, subject: i.subject || null,
        rel: { last: i.rel_last || null, next: i.rel_next || null, due: i.rel_due || null },
      };
    };
    const act = ds.indicators.filter(i => i.active !== "لا" && (i.set === "محدث") === (setKey === "updated"));
    const kids = {};
    act.filter(i => i.parent).map(mk).forEach(k => (kids[k.parent] = kids[k.parent] || []).push(k));
    const list = act.filter(i => !i.parent).map(mk);
    list.forEach(x => { if (kids[x.id]) x.kids = kids[x.id]; });
    return list;
  }

  /* حساب التصنيف كما تراه اللوحة لو كانت السنة الحالية = now */
  function compute(E, list, now) {
    const one = x => {
      const act = x.series.filter(r => r.y <= now && (r.v != null || r.r != null));
      x.cur = act[act.length - 1] || null;
      x.el = E.eligibility(x, { targetYear: 2030, now, calcFrom: -Infinity, calcTo: now });
      x.p = x.el.progress;
      x.cat = x.p.status === "review" ? "review" : x.p.cat;
    };
    list.forEach(x => { one(x); (x.kids || []).forEach(one); });
    list.forEach(x => {
      if (!x.kids) return;
      const cs = x.kids.filter(k => k.p.status !== "review").map(k => k.p.cat).filter(c => c !== "na");
      x.cat = SEV.find(v => cs.includes(v)) || (x.kids.some(k => k.cat === "review") ? "review" : "na");
      x.p = { ...x.p, cat: x.cat, achieved: cs.length > 0 && x.kids.every(k => k.p.achieved), R: null, composite: true };
      x.cur = x.kids.map(k => k.cur).filter(Boolean).sort((a, b) => b.y - a.y)[0] || null;
    });
    return list;
  }

  /* ---------------- تنسيق ---------------- */
  function fmtN(v, dec) { if (v == null || isNaN(v)) return "—"; const a = Math.abs(v); const d = dec != null ? dec : a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : 3; return Number(v.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d }); }
  const fv = (x, v) => v == null ? "—" : x.pct ? fmtN(v * 100, Math.abs(v * 100) >= 10 ? 1 : 2) + "%" : fmtN(v);
  const useRank = x => x.cur && x.cur.r != null && (x.cur.v == null || (x.p && x.p.field === "r"));
  const curTxt = x => !x.cur ? "—" : useRank(x) ? "الترتيب " + fmtN(x.cur.r, 0) : fv(x, x.cur.v);
  function targetTxt(x) {
    if (x.kids) return "لكل مكوّن مستهدفه";
    if (x.range) return fv(x, x.range[0]) + " – " + fv(x, x.range[1]);
    if (x.t30n != null) return fv(x, x.t30n);
    if (x.t30r != null) return "الترتيب " + fmtN(x.t30r, 0);
    return x.t30text ? String(x.t30text).slice(0, 40) : "—";
  }
  const rTxt = x => x.p && x.p.achieved ? "حقق المستهدف" : x.cat === "backwards" ? "عكس الاتجاه" : x.p && isNum(x.p.R) ? fmtN(x.p.R * 100, 0) + "%" : "—";
  const relDate = s => { const m = String(s || "").match(/^(\d{4})-(\d{1,2})/); return m ? new Date(+m[1], +m[2], 0) : null; };
  const relTxt = s => { const d = relDate(s); return d ? AR_M[d.getMonth()] + " " + d.getFullYear() : "—"; };
  const dateAr = d => d.getDate() + " " + AR_M[d.getMonth()] + " " + d.getFullYear();
  const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s\S*$/, "") + "…" : s; };
  const pctOf = (a, b) => b ? Math.round(a * 100 / b) : 0;
  const count = (list, f) => list.filter(f).length;
  const dist = list => Object.fromEntries(CATS.map(c => [c, count(list, x => x.cat === c)]));

  /* ---------------- المولّد ---------------- */
  /* داشبورد في شريحة واحدة */
  function build(PptxGenJS, E, ds, opts) {
    const o = Object.assign({ kind: "quarterly", set: "updated", font: "Arial", baseline: null, today: new Date() }, opts || {});
    const F = o.font, annual = o.kind === "annual";
    const Y = o.year, Q = o.quarter || 1;
    const TITLE = annual ? "لمحة عن الرؤية" : "نبض الرؤية";
    const PERIOD = annual ? "عام " + Y : "الربع " + Q_AR[Q - 1] + " " + Y;
    const setLbl = o.set === "updated" ? "المؤشرات المحدثة 2026" : "مؤشرات المرحلة السابقة";

    const list = compute(E, buildModel(E, ds, o.set), Y);
    const N = list.length, D = dist(list);
    const behind = D.breakthrough + D.backwards + D.stalled;
    const achieved = count(list, x => x.p.achieved);

    const pres = new PptxGenJS();
    pres.layout = "LAYOUT_WIDE";
    pres.rtlMode = true;
    pres.title = TITLE + " — " + PERIOD;
    pres.author = "مديرية رؤية عُمان 2040";
    pres.company = "وزارة الاقتصاد";
    const s = pres.addSlide();
    s.background = { color: "FFFFFF" };

    const T = (text, op) => s.addText(text, Object.assign({ fontFace: F, fontSize: 12, color: PAL.ink, align: "right", valign: "top", rtlMode: true, lang: "ar-SA", margin: 0, isTextBox: true }, op));
    const box = (x, y, w, h, fill) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill || PAL.soft }, line: { color: fill || PAL.soft }, rectRadius: 0.08 });
    const panel = (x, y, w, h, title, sub) => {
      box(x, y, w, h, "F7F6FB");
      T(title, { x: x + 0.2, y: y + 0.1, w: w - 0.4, h: 0.32, fontSize: 14, bold: true, color: PAL.purple, valign: "middle" });
      if (sub) T(sub, { x: x + 0.2, y: y + 0.1, w: w - 0.4, h: 0.32, fontSize: 10, color: PAL.muted, align: "left", valign: "middle" });
    };
    const table = (x, y, w, head, rows, colW) => {
      const rtl = r => r.slice().reverse();
      const hd = rtl(head.map(t => ({ text: t, options: { bold: true, color: PAL.muted, fontSize: 10, fill: { color: "ECEAF3" } } })));
      const body = rows.map(r => rtl(r.map(c => (c && typeof c === "object") ? c : { text: String(c == null ? "—" : c) })));
      s.addTable([hd].concat(body), { x, y, w, colW: colW.slice().reverse(), fontFace: F, fontSize: 10.5, color: PAL.ink, align: "right", valign: "middle", rtlMode: true, lang: "ar-SA",
        rowH: 0.27, fontSize: 10, margin: [0.01, 0.06, 0.01, 0.06], fill: { color: "FFFFFF" }, border: { type: "solid", pt: 0.5, color: PAL.line } });
    };
    const catCell = c => ({ text: CAT_AR[c], options: { bold: true, color: PAL.cat[c] } });
    const empty = (x, y, w, t) => T(t, { x, y, w, h: 0.4, fontSize: 11, color: PAL.muted });

    const X0 = 0.4, CW = W - 0.8, G = 0.25, LW = (CW - G) / 2, RX = X0 + LW + G;

    /* الرأس */
    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.95, fill: { color: PAL.purple }, line: { color: PAL.purple } });
    T([{ text: TITLE + "  ", options: { bold: true, fontSize: 26 } }, { text: PERIOD, options: { fontSize: 20, color: PAL.gold, bold: true } }],
      { x: 5, y: 0.12, w: W - 5.4, h: 0.5, color: PAL.white, valign: "middle" });
    T((annual ? "لوحة سنوية" : "لوحة ربع سنوية") + " لتقدم مؤشرات رؤية عُمان 2040 نحو مستهدفات 2030 · " + setLbl, { x: 4, y: 0.6, w: W - 4.4, h: 0.28, fontSize: 11, color: "E8E2F4" });
    T("مديرية رؤية عُمان 2040", { x: X0, y: 0.14, w: 3.6, h: 0.3, fontSize: 12, bold: true, color: PAL.white, align: "left" });
    T("الإصدار " + dateAr(o.today) + " · البيانات " + String((ds.meta && ds.meta.built) || "").slice(0, 10), { x: X0, y: 0.5, w: 3.6, h: 0.3, fontSize: 10, color: "CFC6E3", align: "left" });

    /* بطاقات الأرقام */
    const kpis = [[N, "مؤشراً", PAL.purple], [D.on_track, "على المسار", PAL.cat.on_track], [D.needs, "يحتاج تحسيناً", PAL.cat.needs],
      [behind, "متأخر أو متراجع", PAL.cat.backwards], [achieved, "بلغ مستهدف 2030", PAL.teal], [D.na + D.review, "لا يُصنَّف بعد", PAL.muted]];
    const kw = (CW - G * (kpis.length - 1)) / kpis.length, ky = 1.12, kh = 1.0;
    kpis.forEach((k, i) => {
      const x = W - X0 - kw - i * (kw + G);
      box(x, ky, kw, kh);
      T(String(k[0]), { x: x + 0.15, y: ky + 0.08, w: kw - 0.3, h: 0.55, fontSize: 30, bold: true, color: k[2], valign: "middle" });
      T(k[1] + (i > 0 && i < 4 ? ` · ${pctOf(k[0], N)}%` : ""), { x: x + 0.15, y: ky + 0.63, w: kw - 0.3, h: 0.3, fontSize: 11, color: PAL.muted });
    });

    /* الصف الثاني يمين: الحالة حسب المحاور */
    const r2y = 2.35, r2h = 2.4;
    const axisRows = AXES.map(a => { const l = list.filter(x => x.axis === a); return { a, l, d: dist(l) }; }).filter(r => r.l.length);
    panel(RX, r2y, LW, r2h, "الحالة حسب محاور الرؤية", "عدد المؤشرات");
    const cs = CATS.filter(c => D[c] > 0);
    s.addChart(pres.charts.BAR, cs.map(c => ({ name: CAT_AR[c], labels: axisRows.map(r => r.a + " (" + r.l.length + ")"), values: axisRows.map(r => r.d[c]) })), {
      x: RX + 0.1, y: r2y + 0.45, w: LW - 0.2, h: r2h - 0.5, barDir: "bar", barGrouping: "stacked", barGapWidthPct: 45, chartColors: cs.map(c => PAL.cat[c]), catAxisOrientation: "maxMin",
      showLegend: true, legendPos: "b", legendFontSize: 9, legendFontFace: F, showValue: true, dataLabelPosition: "ctr", dataLabelColor: "FFFFFF", dataLabelFontSize: 10, dataLabelFontFace: F, dataLabelFormatCode: "#,##0;;;",
      valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" }, catAxisLabelFontFace: F, catAxisLabelFontSize: 11, catAxisLabelColor: PAL.ink, catAxisLineShow: false,
    });

    /* الصف الثاني يسار: ما الجديد (ربعي) / التحرك عن العام السابق (سنوي) */
    let PB = null, newCount = null, moves = [];
    if (annual) {
      const prev = compute(E, buildModel(E, ds, o.set), Y - 1); PB = Object.fromEntries(prev.map(x => [x.id, x]));
      moves = list.filter(x => PB[x.id] && PB[x.id].cat !== x.cat && RANK[x.cat] != null && RANK[PB[x.id].cat] != null).map(x => ({ x, from: PB[x.id].cat }));
    } else if (o.baseline) {
      const prev = compute(E, buildModel(E, o.baseline, o.set), Y); PB = Object.fromEntries(prev.map(x => [x.id, x]));
      moves = list.filter(x => PB[x.id] && PB[x.id].cat !== x.cat).map(x => ({ x, from: PB[x.id].cat }));
      const key = l => new Set(l.flatMap(x => (x.kids || [x]).flatMap(k => k.series.filter(r => r.raw != null || r.r != null).map(r => k.id + "|" + r.y + "|" + r.raw + "|" + r.r))));
      const a = key(list), b = key(prev); newCount = [...a].filter(k => !b.has(k)).length;
    }
    {
      const title = annual ? "التحرك مقارنة بعام " + (Y - 1) : "ما الجديد هذا الربع";
      const sub = annual ? "تغيّر التصنيف بعد قراءات " + Y : o.baseline ? "مقارنة بنسخة " + (o.baselineLabel || "سابقة") : "الإصدار الأول · أحدث القراءات";
      panel(X0, r2y, LW, r2h, title, sub);
      const tx = X0 + 0.2, tw = LW - 0.4;
      if (annual || o.baseline) {
        const up = moves.filter(m => (RANK[m.x.cat] ?? -1) > (RANK[m.from] ?? -1)).length;
        const facts = annual ? [[up, "تحسّن", PAL.cat.on_track], [moves.length - up, "تراجع", PAL.cat.backwards], [N - moves.length, "دون تغيير", PAL.muted]]
          : [[newCount, "قراءة جديدة", PAL.teal], [up, "تحسّن تصنيفه", PAL.cat.on_track], [moves.length - up, "تراجع تصنيفه", PAL.cat.backwards]];
        const fw = (tw - 0.3) / 3;
        facts.forEach((f, i) => { const x = tx + tw - fw - i * (fw + 0.15);
          box(x, r2y + 0.5, fw, 0.62, "FFFFFF");
          T([{ text: String(f[0]) + "  ", options: { fontSize: 20, bold: true, color: f[2] } }, { text: f[1], options: { fontSize: 10.5, color: PAL.muted } }], { x: x + 0.1, y: r2y + 0.5, w: fw - 0.2, h: 0.62, valign: "middle" }); });
        if (moves.length) table(tx, r2y + 1.27, tw, ["المؤشر", "كان", "أصبح"],
          moves.slice(0, 3).map(m => [clip(m.x.name, 44), catCell(m.from), catCell(m.x.cat)]), [tw - 2.6, 1.3, 1.3]);
        else empty(tx, r2y + 1.35, tw, "لم يتغير تصنيف أي مؤشر.");
        if (moves.length > 3) T(`و${moves.length - 3} مؤشرات أخرى`, { x: tx, y: r2y + r2h - 0.28, w: tw, h: 0.22, fontSize: 9.5, color: PAL.muted });
      } else {
        const recent = list.filter(x => x.cur && x.cur.y >= Y - 1).sort((a, b) => b.cur.y - a.cur.y);
        table(tx, r2y + 0.5, tw, ["المؤشر", "السنة", "آخر قراءة", "التصنيف"],
          recent.slice(0, 4).map(x => [clip(x.name, 40), x.cur.y, curTxt(x), catCell(x.cat)]), [tw - 2.8, 0.55, 1.0, 1.25]);
        T(`لها قراءة ${Y - 1} أو أحدث: ${recent.length} من ${N}`, { x: tx, y: r2y + r2h - 0.28, w: tw, h: 0.22, fontSize: 9.5, color: PAL.muted });
      }
    }

    /* الصف الثالث يمين: يحتاج تدخلاً */
    const r3y = 4.95, r3h = 2.05;
    {
      const att = list.filter(x => ["backwards", "breakthrough", "stalled"].includes(x.cat)).sort((a, b) => RANK[a.cat] - RANK[b.cat] || (a.p.R ?? 0) - (b.p.R ?? 0));
      panel(RX, r3y, LW, r3h, "مؤشرات تحتاج إلى تدخل", att.length > 4 ? `أشد 4 من ${att.length}` : "");
      const tw = LW - 0.4;
      if (att.length) table(RX + 0.2, r3y + 0.48, tw, ["المؤشر", "آخر قراءة", "مستهدف 2030", "التصنيف"],
        att.slice(0, 4).map(x => [clip(x.name, 36), curTxt(x), targetTxt(x), catCell(x.cat)]), [tw - 3.15, 1.0, 1.05, 1.1]);
      else empty(RX + 0.2, r3y + 0.55, tw, "لا توجد مؤشرات متراجعة أو متأخرة.");
    }

    /* الصف الثالث يسار: الأفضل أداءً (سنوي) / الإصدارات (ربعي) */
    {
      const tx = X0 + 0.2, tw = LW - 0.4;
      if (annual) {
        const top = list.filter(x => x.cat === "on_track").sort((a, b) => (b.p.achieved - a.p.achieved) || ((b.p.R ?? 0) - (a.p.R ?? 0)));
        panel(X0, r3y, LW, r3h, "على المسار", top.length > 4 ? `4 من ${top.length}` : "");
        if (top.length) table(tx, r3y + 0.48, tw, ["المؤشر", "آخر قراءة", "مستهدف 2030", "نسبة التقدم"],
          top.slice(0, 4).map(x => [clip(x.name, 36), curTxt(x), targetTxt(x), { text: rTxt(x), options: { color: PAL.cat.on_track, bold: true } }]), [tw - 3.15, 1.0, 1.05, 1.1]);
        else empty(tx, r3y + 0.55, tw, "لا توجد مؤشرات على المسار.");
      } else {
        const qEnd = new Date(Y, Q * 3, 0), nqEnd = new Date(Y, Q * 3 + 3, 0);
        const due = list.filter(x => relDate(x.rel.due) && relDate(x.rel.due) > qEnd && relDate(x.rel.due) <= nqEnd);
        const over = list.filter(x => relDate(x.rel.due) && relDate(x.rel.due) <= qEnd);
        const stale = list.filter(x => x.cur && Y - x.cur.y >= 3 && !due.includes(x) && !over.includes(x)).sort((a, b) => a.cur.y - b.cur.y);
        panel(X0, r3y, LW, r3h, "الإصدارات والتحديث", "بلا موعد مسجّل: " + count(list, x => !x.rel.due) + " من " + N);
        const rows = over.map(x => [clip(x.name, 38), relTxt(x.rel.due), { text: "تجاوز الموعد", options: { color: PAL.maroon, bold: true } }])
          .concat(due.map(x => [clip(x.name, 38), relTxt(x.rel.due), { text: "متوقع الربع القادم", options: { color: PAL.slate, bold: true } }]))
          .concat(stale.map(x => [clip(x.name, 38), "آخر قراءة " + x.cur.y, { text: "قراءة قديمة", options: { color: PAL.cat.breakthrough, bold: true } }]));
        if (rows.length) table(tx, r3y + 0.48, tw, ["المؤشر", "الموعد / آخر قراءة", "الحالة"], rows.slice(0, 4), [tw - 2.75, 1.4, 1.35]);
        else empty(tx, r3y + 0.55, tw, "لا إصدارات متوقعة أو متأخرة.");
      }
    }

    /* التذييل */
    T("نسبة التقدم = المعدل السنوي الفعلي ÷ المطلوب لبلوغ مستهدف 2030 · على المسار فوق 90% · يحتاج تحسيناً 50–90% · متأخر دون 50% · يتراجع: عكس الاتجاه",
      { x: X0 + 3.2, y: 7.1, w: CW - 3.2, h: 0.3, fontSize: 9, color: PAL.muted, valign: "middle" });
    T("ov2040.github.io/vision-indicators", { x: X0, y: 7.1, w: 3.1, h: 0.3, fontSize: 9, color: PAL.teal, align: "left", rtlMode: false, valign: "middle", hyperlink: { url: "https://ov2040.github.io/vision-indicators/" } });
    s.addNotes(list.map(x => `${x.name} | ${x.axis} | ${curTxt(x)} | ${targetTxt(x)} | ${rTxt(x)} | ${CAT_AR[x.cat]}`).join("\n"));
    return pres;
  }

  const API = { build, buildModel, compute, PAL };
  root.OVReports = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
