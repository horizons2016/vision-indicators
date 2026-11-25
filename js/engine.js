/* محرك الحسابات الإحصائية للوحة مؤشرات الرؤية.
 * دوال خالصة (بلا واجهة) تُستخدم في المتصفح وفي الاختبارات (Node).
 *
 * المؤشر المتوقع:
 * { id, unit:'%'|'رقم'|'ترتيب', pct:bool, dir:'up'|'down', base, t30n, range:[lo,hi]|null, t30r, t40,
 *   method:'Linear'|'CAGR', agg:<نوع التجميع>, cap:<سقف الأهلية>, series:[{y, v, r, p, kind, brk, src, rel}] }
 * القيم النسبية داخلياً كسور (0.031 = 3.1%).
 */
(function (root) {
  "use strict";

  const CFG = {
    onTrackAbove: 0.9,      // R > 0.9 → على المسار
    needsFrom: 0.5,         // 0.5 ≤ R ≤ 0.9 → يحتاج تحسيناً
    tiny: 1e-12,
    forecastMinN: 6,        // أقل عدد قراءات متجانسة للتنبؤ
    mcMinN: 8,              // أقل عدد قراءات للمحاكاة
    maxGap: 1,              // أقصى عدد سنوات مفقودة متتالية داخل السلسلة المستخدمة للتنبؤ
    backtestMin: 2,         // أقل عدد نقاط اختبار رجعي
    minR2: 0.3,             // أقل نسبة تباين يفسرها الاتجاه حتى يُعد النموذج ملائماً
    piLevel: 0.8,           // نطاق عدم اليقين المعروض (10%–90%)
    bootstrap: 2000,
    seed: 2040,
    sharpChange: 0.5,       // تغيّر سنوي أكبر من 50% = تغيّر حاد
    madZ: 3.5,              // قيمة شاذة: |z| بطريقة MAD
    scaleJump: 30,          // قفزة ×30 بين قراءتين = احتمال اختلاف وحدة
  };

  const CAT = {
    on_track:     { ar: "على المسار", en: "On Track" },
    needs:        { ar: "يحتاج تحسيناً", en: "Needs Improvement" },
    breakthrough: { ar: "متأخر عن المسار", en: "Breakthrough Needed" },
    backwards:    { ar: "يتراجع", en: "Off Track – Going Backwards" },
    stalled:      { ar: "ثابت · بلا تقدم", en: "No change (stalled)" },
    na:           { ar: "لا يُصنَّف", en: "Not classified" },
    dev:          { ar: "قيد التطوير", en: "In development" },
  };

  const AGG = {
    flow:       "تدفق سنوي (قابل للجمع)",
    events:     "مشروعات أو أحداث مستقلة",
    stock:      "رصيد (مخزون)",
    ratio:      "نسبة أو معدل",
    rank:       "ترتيب أو تصنيف",
    cumulative: "تراكمي",
    index:      "درجة مؤشر مركب",
  };
  const AGG_BY_LABEL = Object.fromEntries(Object.entries(AGG).map(([k, v]) => [v, k]));

  const CAPS = { auto: "تلقائي", progress: "قياس التقدم فقط", forecast: "حتى التنبؤ", none: "لا تحليل إحصائي" };
  const CAP_BY_LABEL = Object.fromEntries(Object.entries(CAPS).map(([k, v]) => [v, k]));
  const capMax = c => ({ none: 0, progress: 1, forecast: 2 }[c] ?? 3);

  /* ---------- helpers ---------- */
  const isNum = v => typeof v === "number" && isFinite(v);
  const better = (a, b, down) => (down ? a <= b : a >= b);

  function targetFor(ind, ty) {
    if (ty === 2040) {
      if (isNum(ind.t40)) return { kind: "value", v: ind.t40, y: 2040 };
      return null;
    }
    if (ind.range && isNum(ind.range[0]) && isNum(ind.range[1])) return { kind: "range", lo: ind.range[0], hi: ind.range[1], y: 2030 };
    if (isNum(ind.t30n)) return { kind: "value", v: ind.t30n, y: 2030 };
    if (isNum(ind.t30r)) return { kind: "rank", v: ind.t30r, y: 2030 };
    return null;
  }

  /* اختيار القراءات المستخدمة في الحساب، مع سبب استبعاد كل قراءة غير مستخدمة */
  function selectSeries(ind, opts) {
    const o = Object.assign({ calcFrom: -Infinity, calcTo: Infinity, now: new Date().getFullYear(), includeEstimates: false, targetYear: 2030 }, opts || {});
    const tgt = targetFor(ind, o.targetYear);
    const field = tgt && tgt.kind === "rank" ? "r" : (ind.series.some(s => isNum(s.v)) ? "v" : (ind.series.some(s => isNum(s.r)) ? "r" : "v"));
    const rows = ind.series.filter(s => isNum(s[field]) && s.y <= o.now && (s.kind || "فعلية") !== "مسار");
    const excluded = [];
    const inRange = rows.filter(s => {
      if (s.y < o.calcFrom || s.y > o.calcTo) { excluded.push({ y: s.y, reason: "خارج فترة الحساب" }); return false; }
      return true;
    });
    const brks = inRange.filter(s => s.brk).map(s => s.y);
    const segStart = brks.length ? Math.max(...brks) : null;
    const used = [];
    inRange.forEach(s => {
      if (segStart != null && s.y < segStart) { excluded.push({ y: s.y, reason: `قبل تغيير تعريف المؤشر في ${segStart} (غير قابلة للمقارنة)` }); return; }
      const kind = s.kind || "فعلية";
      if (kind !== "فعلية" && !o.includeEstimates) { excluded.push({ y: s.y, reason: `قراءة ${kind}` }); return; }
      used.push({ y: s.y, val: s[field], kind });
    });
    excluded.sort((a, b) => a.y - b.y);
    return { field, used, excluded, segStart, target: tgt };
  }

  /* ---------- Progress Ratio ---------- */
  /* التصنيف بعد استبعاد حالتي «تحقق المستهدف» و«البيانات غير الكافية».
   * moved: +1 تحرك نحو المستهدف، −1 تحرك عكسه، 0 لم يتغير. إن لم يُمرَّر يُستنتج من إشارة R.
   * القواعد (بحسب المواصفة المعتمدة؛ مطابقة حدود 0 و50% و90% مع مصدر Monash معلّقة):
   *   تحرك عكسي                → backwards
   *   لا تغيّر                  → stalled  (منفصل عن التراجع)
   *   R% > 90                   → on_track
   *   50 ≤ R% ≤ 90              → needs
   *   0 < R% < 50 مع تقدم       → breakthrough */
  function classify(R, moved) {
    if (!isNum(R)) return "na";
    const m = moved === undefined ? Math.sign(R) : moved;
    if (m < 0) return "backwards";
    if (m === 0) return "stalled";
    const r = Math.round(R * 1e9) / 1e9;        // يمنع خطأ الفاصلة العائمة عند الحدود 0.5 و0.9
    if (r > CFG.onTrackAbove) return "on_track";
    if (r >= CFG.needsFrom) return "needs";
    return "breakthrough";
  }

  function progress(ind, opts) {
    const o = Object.assign({ targetYear: 2030 }, opts || {});
    const sel = selectSeries(ind, o);
    const res = { status: "ok", cat: "na", method: ind.method === "CAGR" ? "CAGR" : "Linear", field: sel.field, used: sel.used, excluded: sel.excluded, segStart: sel.segStart, target: sel.target, achieved: false, noChange: false };
    if (!sel.target) return Object.assign(res, { status: "no_target", reason: `لا يوجد مستهدف رقمي لعام ${o.targetYear}` });
    if (sel.used.length < 2) return Object.assign(res, { status: "insufficient", reason: `يلزم قراءتان فعليتان قابلتان للمقارنة على الأقل داخل فترة الحساب (المتاح ${sel.used.length})` });
    const F = sel.used[0], L = sel.used[sel.used.length - 1];
    const down = sel.field === "r" || ind.dir === "down";
    let T, TY = sel.target.y;
    if (sel.target.kind === "range") {
      if (L.val >= sel.target.lo && L.val <= sel.target.hi) return Object.assign(res, { first: F, latest: L, achieved: true, cat: "on_track", T: null, TY });
      T = L.val < sel.target.lo ? sel.target.lo : sel.target.hi;
    } else T = sel.target.v;
    const downEff = sel.target.kind === "range" ? T < L.val : down;
    Object.assign(res, { first: F, latest: L, T, TY, down: downEff });
    const conflict = sel.target.kind === "value" ? targetConflict(ind, sel, T, F, L) : null;
    if (conflict) {
      // لا يُنتج تصنيف مصطنع: يُحسب R للاطلاع فقط ويُعلَّم المؤشر للمراجعة
      const hy0 = L.y - F.y, ry0 = TY - L.y;
      if (hy0 > 0 && ry0 > 0) { const a = (L.val - F.val) / hy0, q = (T - L.val) / ry0; if (isNum(a) && isNum(q) && q !== 0) res.previewR = a / q; }
      return Object.assign(res, { status: "review", reason: conflict, cat: "na" });
    }
    if (better(L.val, T, downEff)) return Object.assign(res, { achieved: true, cat: "on_track" });
    if (L.y >= TY) return Object.assign(res, { status: "expired", reason: `آخر قراءة في سنة المستهدف أو بعدها دون تحقيقه` });
    const hy = L.y - F.y, ry = TY - L.y;
    if (res.method === "CAGR") {
      const why = sel.field === "r" ? "الترتيب لا يصلح للنمو المركب"
        : ind.unit === "%" ? "النسب والمعدلات لا تصلح للنمو المركب"
        : !(F.val > 0 && L.val > 0 && T > 0) ? "CAGR يتطلب قيماً موجبة (أول قراءة وآخرها والمستهدف)" : null;
      if (why) return Object.assign(res, { status: "method_invalid", reason: why });
      res.actual = Math.pow(L.val / F.val, 1 / hy) - 1;
      res.required = Math.pow(T / L.val, 1 / ry) - 1;
    } else {
      res.actual = (L.val - F.val) / hy;
      res.required = (T - L.val) / ry;
    }
    res.hy = hy; res.ry = ry;
    if (!isNum(res.actual) || !isNum(res.required)) return Object.assign(res, { status: "invalid", reason: "تعذر حساب المعدلات (قيم غير صالحة)" });
    if (Math.abs(res.required) < CFG.tiny) return Object.assign(res, { achieved: true, cat: "on_track" }); // المقام صفر = آخر قراءة تساوي المستهدف
    res.moved = Math.abs(res.actual) < CFG.tiny ? 0 : (Math.sign(res.actual) === Math.sign(res.required) ? 1 : -1);
    if (res.moved === 0) { res.noChange = true; res.actual = 0; }
    res.R = res.actual / res.required;          // لا يُقص عند 1: قد تتجاوز السرعة الفعلية المطلوبة
    res.Rpct = res.R * 100;
    res.cat = classify(res.R, res.moved);
    return res;
  }

  /* تعارضات تجعل التصنيف مضللاً: اتجاه الأفضلية يعاكس المستهدف، أو المستهدف بمقياس مختلف عن القراءات.
   * الاستثناء: المستهدف السقفي («لا يتجاوز») أو الأرضي («لا يقل») حيث يقع المستهدف عمداً في الجهة الأخرى. */
  function targetConflict(ind, sel, T, F, L) {
    if (sel.field === "r") return null;
    const fmt = v => String(+(+v).toPrecision(4));
    const txt = String(ind.t30text || "");
    const bound = /لا\s*يتجاوز|لا\s*يزيد|حد\s*أقصى|سقف|لا\s*يقل|حد\s*أدنى/.test(txt);
    const ref = isNum(ind.base) ? ind.base : F.val, refLbl = isNum(ind.base) ? "خط الأساس" : `أول قراءة (${F.y})`;
    if (!bound && ref !== T) {
      const wantsUp = T > ref;
      if (wantsUp && ind.dir === "down") return `المستهدف (${fmt(T)}) أعلى من ${refLbl} (${fmt(ref)}) بينما اتجاه الأفضلية «الانخفاض أفضل»: تعارض في بيانات المؤشر`;
      if (!wantsUp && ind.dir !== "down") return `المستهدف (${fmt(T)}) أقل من ${refLbl} (${fmt(ref)}) بينما اتجاه الأفضلية «الارتفاع أفضل»: تعارض في بيانات المؤشر`;
    }
    if (T > 0 && L.val > 0) { const k = T / L.val; if (k > 10 || k < 0.1) return `المستهدف (${fmt(T)}) وآخر قراءة (${fmt(L.val)}) بمقياسين مختلفين (الفرق ×${(k > 1 ? k : 1 / k).toFixed(0)}): تعارض في بيانات المؤشر`; }
    return null;
  }

  /* ---------- aggregation over a period ---------- */
  function aggregate(ind, from, to, now) {
    now = now || new Date().getFullYear();
    const type = ind.agg || null;
    const field = type === "rank" || (!ind.series.some(s => isNum(s.v)) && ind.series.some(s => isNum(s.r))) ? "r" : "v";
    const rows = ind.series.filter(s => isNum(s[field]) && s.y >= from && s.y <= Math.min(to, now) && (s.kind || "فعلية") !== "مسار").sort((a, b) => a.y - b.y);
    const out = { type, label: type ? AGG[type] : "غير محدد", field, from, to, n: rows.length, rows };
    if (!rows.length) return Object.assign(out, { ok: false, reason: "لا توجد قراءات في الفترة المختارة." });
    const s = rows[0], e = rows[rows.length - 1];
    const brk = rows.some((r, i) => i > 0 && r.brk);
    out.start = s; out.end = e; out.brk = brk;
    if (!type) return Object.assign(out, { ok: false, reason: "نوع التجميع غير محدد لهذا المؤشر. حدّده في الإدارة قبل أي تجميع أو مقارنة للفترة." });
    if (type === "flow" || type === "events") {
      const years = []; for (let y = from; y <= Math.min(to, now); y++) years.push(y);
      const have = new Set(rows.map(r => r.y));
      const missing = years.filter(y => !have.has(y));
      out.total = rows.reduce((a, r) => a + r[field], 0);
      out.missing = missing;
      out.ok = !missing.length && !brk;
      out.complete = !missing.length;
      if (missing.length) out.reason = `الإجمالي جزئي: سنوات بلا قراءة ${missing.join("، ")}`;
      if (brk) out.reason = (out.reason ? out.reason + ". " : "") + "تغيّر تعريف المؤشر داخل الفترة، فالجمع غير قابل للمقارنة.";
      return out;
    }
    out.ok = !brk;
    if (brk) out.reason = "تغيّر تعريف المؤشر داخل الفترة؛ التغيّر بين البداية والنهاية غير قابل للمقارنة.";
    out.change = rows.length > 1 ? e[field] - s[field] : null;
    if (type === "stock" || type === "cumulative" || type === "index") out.pctChange = rows.length > 1 && s[field] !== 0 ? (e[field] - s[field]) / Math.abs(s[field]) : null;
    if (type === "ratio") out.note = "النسب والمعدلات لا تُجمع، ولا يُحسب متوسطها دون أوزان.";
    if (type === "rank") out.note = "الترتيب لا يُجمع. الرقم الأصغر أفضل، فالتغيّر السالب تحسّن.";
    if (type === "cumulative") out.note = "الزيادة خلال الفترة = قيمة نهاية الفترة − قيمة بدايتها.";
    if (type === "stock") out.note = "الرصيد لا يُجمع عبر السنوات؛ تُعرض قيمة نهاية الفترة وتغيّرها.";
    return out;
  }

  /* ---------- data validity ---------- */
  function validity(ind, now) {
    now = now || new Date().getFullYear();
    const issues = [];
    const add = (k, sev, t, years) => issues.push({ k, sev, t, years: years || [] });
    const act = ind.series.filter(s => (isNum(s.v) || isNum(s.r)) && (s.kind || "فعلية") !== "مسار").sort((a, b) => a.y - b.y);
    const vals = act.filter(s => isNum(s.v));
    act.forEach(s => {
      if (!Number.isInteger(s.y) || s.y < 1990) add("year", "bad", `سنة قراءة غير صالحة: ${s.y}`, [s.y]);
      if (s.y > now) add("future", "bad", `قراءة فعلية لسنة مستقبلية ${s.y}`, [s.y]);
    });
    if (ind.unit === "%") vals.forEach(s => { if (Math.abs(s.v) > 1.5) add("unit", "warn", `قيمة ${s.y} تتجاوز 150% لمؤشر نسبة؛ تحقّق من الوحدة`, [s.y]); });
    for (let i = 1; i < vals.length; i++) {
      const a = vals[i - 1].v, b = vals[i].v;
      if (a && b && Math.max(Math.abs(a / b), Math.abs(b / a)) >= CFG.scaleJump) add("scale", "bad", `قفزة بين ${vals[i - 1].y} و${vals[i].y} تشير إلى اختلاف الوحدة أو المقياس`, [vals[i].y]);
      else if (a && Math.abs((b - a) / a) > CFG.sharpChange) add("sharp", "warn", `تغيّر حاد ${Math.round(Math.abs((b - a) / a) * 100)}% بين ${vals[i - 1].y} و${vals[i].y}`, [vals[i].y]);
    }
    if (vals.length >= 6) {
      const d = []; for (let i = 1; i < vals.length; i++) d.push(vals[i].v - vals[i - 1].v);
      const med = median(d), mad = median(d.map(x => Math.abs(x - med)));
      if (mad > 0) d.forEach((x, i) => { const z = 0.6745 * (x - med) / mad; if (Math.abs(z) > CFG.madZ) add("outlier", "warn", `قيمة شاذة محتملة في ${vals[i + 1].y} (z=${z.toFixed(1)})`, [vals[i + 1].y]); });
    }
    const brks = act.filter(s => s.brk).map(s => s.y);
    if (brks.length) add("definition", "warn", `تغيّر تعريف المؤشر أو منهجيته في ${brks.join("، ")}؛ القراءات قبلها لا تُقارن بما بعدها`, brks);
    if (act.length > 1) {
      const gaps = []; for (let i = 1; i < act.length; i++) if (act[i].y - act[i - 1].y > 1) gaps.push(`${act[i - 1].y + 1}–${act[i].y - 1}`);
      if (gaps.length) add("missing", "info", `سنوات مفقودة: ${gaps.join("، ")}`);
    }
    const est = act.filter(s => (s.kind || "فعلية") !== "فعلية");
    if (est.length) add("estimate", "info", `قراءات غير فعلية (تقديرية أو أولية): ${est.map(s => s.y).join("، ")}؛ لا تدخل الحساب افتراضياً`, est.map(s => s.y));
    const noSrc = act.filter(s => !s.src);
    if (noSrc.length) add("source", "info", `قراءات بلا مصدر: ${noSrc.map(s => s.y).join("، ")}`, noSrc.map(s => s.y));
    const low = act.filter(s => s.rel === "منخفضة");
    if (low.length) add("reliability", "warn", `مصدر منخفض الموثوقية في: ${low.map(s => s.y).join("، ")}`, low.map(s => s.y));
    const t = targetFor(ind, 2030);
    if (t && t.kind === "value" && isNum(ind.base) && ind.base !== t.v) {
      const wantUp = t.v > ind.base;
      if ((ind.dir === "down") === wantUp) add("direction", "bad", `اتجاه الأفضلية (${ind.dir === "down" ? "الانخفاض أفضل" : "الارتفاع أفضل"}) يعاكس اتجاه المستهدف من خط الأساس`);
    }
    if (!ind.agg) add("agg", "info", "نوع التجميع غير محدد؛ لا يصلح المؤشر للتجميع حتى يُحدَّد");
    return issues;
  }

  /* ---------- statistics ---------- */
  function median(a) { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; }
  function ols(pts) { // pts [[x,y]]
    const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
    let sxy = 0, sxx = 0; pts.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; });
    const b = sxx ? sxy / sxx : 0, a = my - b * mx;
    const res = pts.map(([x, y]) => y - (a + b * x));
    const sse = res.reduce((s, r) => s + r * r, 0), sst = pts.reduce((s, p) => s + (p[1] - my) ** 2, 0);
    return { a, b, res, se: n > 2 ? Math.sqrt(sse / (n - 2)) : NaN, r2: sst ? 1 - sse / sst : NaN, mx, sxx, n };
  }
  function tq(df) { // t quantile 0.9 (one-sided) for 80% two-sided interval
    const tab = { 1: 3.078, 2: 1.886, 3: 1.638, 4: 1.533, 5: 1.476, 6: 1.440, 7: 1.415, 8: 1.397, 9: 1.383, 10: 1.372, 12: 1.356, 15: 1.341, 20: 1.325, 30: 1.310 };
    const ks = Object.keys(tab).map(Number).filter(k => k <= df); return df >= 30 ? 1.282 : tab[ks.length ? Math.max(...ks) : 1];
  }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function skew(a) { const n = a.length, m = a.reduce((s, x) => s + x, 0) / n, sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / n); return sd ? a.reduce((s, x) => s + ((x - m) / sd) ** 3, 0) / n : 0; }
  function acf1(a) { const n = a.length, m = a.reduce((s, x) => s + x, 0) / n; let num = 0, den = 0; for (let i = 0; i < n; i++) { den += (a[i] - m) ** 2; if (i) num += (a[i] - m) * (a[i - 1] - m); } return den ? num / den : 0; }

  /* ---------- eligibility engine ---------- */
  function eligibility(ind, opts) {
    const o = Object.assign({ targetYear: 2030 }, opts || {});
    const p = progress(ind, o);
    const checks = [];
    const chk = (level, name, pass, detail) => { checks.push({ level, name, pass: !!pass, detail }); return !!pass; };
    const out = { level: 0, checks, progress: p, model: null, n: p.used.length, cap: ind.cap || "auto" };

    /* المستوى 1 */
    const l1 = [
      chk(1, "مستهدف رقمي واضح", !!p.target, p.target ? `مستهدف ${o.targetYear}` : `لا يوجد مستهدف لعام ${o.targetYear}`),
      chk(1, "قراءتان فعليتان قابلتان للمقارنة", p.used.length >= 2, `${p.used.length} قراءة مستخدمة`),
      chk(1, "طريقة الحساب صالحة", p.status !== "method_invalid", p.status === "method_invalid" ? p.reason : p.method),
    ].every(Boolean);
    chk(1, "اتساق المستهدف مع اتجاه الأفضلية ومقياس القراءات", p.status !== "review", p.status === "review" ? p.reason : "متسق");
    if (!l1 || p.status === "insufficient" || p.status === "no_target" || p.status === "review") return finish(out, 0, ind);
    out.level = 1;

    /* المستوى 2 */
    const u = p.used, n = u.length;
    const log = p.method === "CAGR" && u.every(r => r.val > 0);
    const tr = v => (log ? Math.log(v) : v), inv = v => (log ? Math.exp(v) : v);
    let gaps = 0; for (let i = 1; i < n; i++) gaps = Math.max(gaps, u[i].y - u[i - 1].y - 1);
    const vIssues = validity(ind, o.now).filter(i => ["outlier", "scale", "unit"].includes(i.k) && i.years.some(y => u.some(r => r.y === y)));
    const okN = chk(2, `عدد قراءات متجانسة ≥ ${CFG.forecastMinN}`, n >= CFG.forecastMinN, `${n} قراءة بعد استبعاد غير القابل للمقارنة`);
    const okGap = chk(2, "سلسلة متصلة", gaps <= CFG.maxGap, gaps ? `أطول فجوة ${gaps} سنة` : "بلا فجوات");
    const okClean = chk(2, "لا قيم شاذة أو اختلاف وحدة في السلسلة المستخدمة", !vIssues.length, vIssues.map(i => i.t).join("؛ ") || "سليمة");
    const pts = u.map(r => [r.y, tr(r.val)]);
    const fit = n >= 3 ? ols(pts) : null;
    out.model = { name: log ? "اتجاه لوغاريتمي-خطي (نمو مركب)" : "اتجاه خطي (OLS)", r2: fit ? fit.r2 : null, se: fit ? fit.se : null };
    // backtest: rolling origin, one-step-ahead, model vs naive
    const bt = [];
    for (let k = Math.max(3, n - 3); k < n; k++) {
      const f = ols(pts.slice(0, k)), x = pts[k][0];
      const pred = f.a + f.b * x, naive = pts[k - 1][1];
      bt.push({ y: x, actual: inv(pts[k][1]), pred: inv(pred), naive: inv(naive), em: Math.abs(inv(pts[k][1]) - inv(pred)), en: Math.abs(inv(pts[k][1]) - inv(naive)) });
    }
    const maeM = bt.length ? bt.reduce((s, b) => s + b.em, 0) / bt.length : NaN, maeN = bt.length ? bt.reduce((s, b) => s + b.en, 0) / bt.length : NaN;
    out.backtest = { points: bt, maeModel: maeM, maeNaive: maeN, mase: maeN > 0 ? maeM / maeN : NaN };
    const varies = new Set(u.map(r => r.val)).size > 1;
    chk(2, "السلسلة متغيرة (ليست ثابتة)", varies, varies ? "متغيرة" : "كل القراءات متساوية؛ لا معلومات عن الاتجاه أو عدم اليقين");
    const okBt = chk(2, "اختبار رجعي: النموذج أدق من التوقع الساذج", bt.length >= CFG.backtestMin && isNum(out.backtest.mase) && out.backtest.mase < 1,
      bt.length < CFG.backtestMin ? "نقاط اختبار غير كافية" : `MASE = ${isNum(out.backtest.mase) ? out.backtest.mase.toFixed(2) : "—"} (يجب أقل من 1)`);
    if (fit && n >= 3) {
      const TY = p.target.y, x0 = TY;
      const se = fit.se * Math.sqrt(1 + 1 / n + (x0 - fit.mx) ** 2 / fit.sxx), t = tq(n - 2);
      const pt = fit.a + fit.b * x0;
      out.forecast = { y: TY, point: inv(pt), lo: inv(pt - t * se), hi: inv(pt + t * se), level: CFG.piLevel, method: out.model.name };
      if (out.forecast.lo > out.forecast.hi) [out.forecast.lo, out.forecast.hi] = [out.forecast.hi, out.forecast.lo];
    }
    const okFit = chk(2, `ملاءمة نموذج الاتجاه (R² ≥ ${CFG.minR2})`, fit && isNum(fit.r2) && fit.r2 >= CFG.minR2, fit && isNum(fit.r2) ? `R² = ${fit.r2.toFixed(2)}` : "تعذر التقدير");
    if (!(okN && okGap && okClean && okBt && varies && okFit)) return finish(out, 1, ind);
    out.level = 2;

    /* المستوى 3 */
    const okN3 = chk(3, `عدد قراءات ≥ ${CFG.mcMinN}`, n >= CFG.mcMinN, `${n} قراءة`);
    const ac = acf1(fit.res), sk = skew(fit.res);
    const okAc = chk(3, "البواقي غير مترابطة ذاتياً", Math.abs(ac) < 0.5, `ارتباط ذاتي بفارق سنة = ${ac.toFixed(2)}`);
    const okSk = chk(3, "توزيع البواقي غير ملتوٍ بشدة", Math.abs(sk) < 1.5 && fit.se > 0, fit.se > 0 ? `الالتواء = ${sk.toFixed(2)}` : "البواقي صفرية؛ لا يمكن تقدير عدم اليقين");
    let mc = null, okCal = false, okSane = false;
    if (okN3 && okAc && okSk) {
      // calibration: hold out last 3 points, simulate 80% interval from earlier fit
      let cover = 0, tests = 0;
      for (let k = n - 3; k < n; k++) {
        const sim = simulate(pts.slice(0, k), pts[k][0], 800, CFG.seed + k);
        const lo = quant(sim, 0.1), hi = quant(sim, 0.9);
        tests++; if (pts[k][1] >= lo && pts[k][1] <= hi) cover++;
      }
      okCal = chk(3, "معايرة المحاكاة على القراءات الأخيرة", cover >= 2, `${cover} من ${tests} قراءات داخل نطاق 80%`);
      const sim = simulate(pts, p.target.y, CFG.bootstrap, CFG.seed).map(inv);
      const T = p.target.kind === "range" ? null : p.target.v;
      const hit = sim.filter(v => p.target.kind === "range" ? v >= p.target.lo && v <= p.target.hi : better(v, T, p.field === "r" || ind.dir === "down")).length / sim.length;
      mc = { p: hit, p10: quant(sim, 0.1), p50: quant(sim, 0.5), p90: quant(sim, 0.9), B: CFG.bootstrap, seed: CFG.seed };
      const fcMeets = p.target.kind === "range" ? out.forecast.point >= p.target.lo && out.forecast.point <= p.target.hi : better(out.forecast.point, T, p.field === "r" || ind.dir === "down");
      const consistent = (fcMeets && hit >= 0.35) || (!fcMeets && hit <= 0.65);
      okSane = chk(3, "معقولية النتيجة", isNum(hit) && consistent && mc.p10 <= mc.p90, consistent ? "الاحتمال متسق مع التوقع النقطي" : "الاحتمال يعاكس التوقع النقطي");
    } else chk(3, "معايرة المحاكاة", false, "لم تُجرَ: لم تتحقق شروط البواقي أو العدد");
    if (mc) out.mc = mc;
    if (!(okN3 && okAc && okSk && okCal && okSane)) return finish(out, 2, ind);
    return finish(out, 3, ind);
  }
  function simulate(pts, x0, B, seed) { // residual bootstrap of a linear trend
    const rnd = mulberry32(seed), f = ols(pts), n = pts.length, out = [];
    const res = f.res.map(r => r * Math.sqrt(n / Math.max(1, n - 2)));
    for (let b = 0; b < B; b++) {
      const yb = pts.map(([x], i) => [x, f.a + f.b * x + res[Math.floor(rnd() * n)]]);
      const fb = ols(yb);
      out.push(fb.a + fb.b * x0 + res[Math.floor(rnd() * n)]);
    }
    return out.sort((a, b) => a - b);
  }
  function quant(sorted, q) { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
  function finish(out, level, ind) {
    const max = capMax(ind.cap || "auto");
    out.statLevel = level;                      // ما اجتازه المؤشر إحصائياً
    out.level = Math.min(level, max);           // بعد سقف الإدارة
    out.capped = max < level;
    out.showForecast = out.level >= 2 && !!out.forecast;
    out.showProbability = out.level >= 3 && !!out.mc;
    if (!out.showForecast) out.forecastHidden = true;
    return out;
  }

  const API = { CFG, CAT, AGG, AGG_BY_LABEL, CAPS, CAP_BY_LABEL, targetFor, selectSeries, progress, classify, targetConflict, aggregate, validity, eligibility, ols, median };
  root.OVEngine = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
