#!/usr/bin/env python3
"""يبني «لوحة مؤشرات رؤية عمان 2040» (Excel محمي) تلقائياً من data/dataset.json.
يعمل في GitHub Actions عند كل تحديث للبيانات؛ لا يُعدَّل الإكسل يدوياً.
الاستخدام: python tools/build_excel.py --dataset data/dataset.json --template excel/template.xlsx
          --changelog excel/changelog.json [--prev old_dataset.json --date 2026-11-22 --by NAME] --out excel/vision2040-indicators.xlsx
"""
import sys, os, copy, difflib, collections, argparse, json, re, zipfile, datetime
import openpyxl
from openpyxl.formula.translate import Translator
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

ap = argparse.ArgumentParser()
ap.add_argument('--dataset', required=True); ap.add_argument('--template', required=True)
ap.add_argument('--changelog', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--prev'); ap.add_argument('--date'); ap.add_argument('--by', default='تحديث تلقائي')
A = ap.parse_args()
SRC, OUT = A.template, A.out
DS = json.load(open(A.dataset, encoding='utf-8'))
ALIAS = {"المواطنة والهوية والثقافة والقيم": "المواطنة والهوية والتراث والثقافة الوطنية"}
def norm(s):
    s = str(s or '')
    s = re.sub(r'\s+—\s+.*$', '', s)
    s = re.sub('[إأآا]', 'ا', s); s = s.replace('ة','ه').replace('ى','ي')
    s = re.sub(r'[^\w\s]', ' ', s); return re.sub(r'\s+', ' ', s).strip()
IND = {i['code']: i for i in DS['indicators']}
def group(i):
    if i['set'] == 'محدث':
        if i.get('active') == 'لا': return 'مؤشرات ملغاة'
        if i.get('parent'): return 'مكوّنات مؤشرات الرؤية'
        return 'مؤشرات الرؤية'
    return 'مكرر (له مقابل في مؤشرات الرؤية)' if i.get('dup') else 'المؤشرات المساندة'


# ---------- 0. سجل التحديثات الآلي: فروق البيانات بين النسخة السابقة والحالية ----------
def _fmt(i, v):
    if v is None: return None
    return f'{v:g}%' if (i or {}).get('unit') == '%' else (f'{v:g}' if isinstance(v, (int, float)) else str(v))
def diff_datasets(prev, cur, date, by):
    out = []
    P = {i['code']: i for i in prev['indicators']}; C = {i['code']: i for i in cur['indicators']}
    pr = {(r[0], r[1]): r for r in prev['readings']}; cr = {(r[0], r[1]): r for r in cur['readings']}
    def add(code, series, year, old, new, typ, src=None, note=None):
        out.append({'date': date, 'code': code, 'series': series, 'year': year, 'old': old, 'new': new,
                    'type': typ, 'source': src, 'by': by, 'note': note})
    for code in C.keys() - P.keys(): add(code, None, None, None, None, 'مؤشر جديد', note=C[code]['name'])
    for code in P.keys() - C.keys(): add(code, None, None, None, None, 'حذف مؤشر', note=P[code]['name'])
    for code in C.keys() & P.keys():
        a, b = P[code], C[code]
        for f, lab in (('t30', 'مستهدف 2030'), ('t40', 'مستهدف 2040')):
            if a.get(f) != b.get(f): add(code, None, None, _fmt(a, a.get(f)), _fmt(b, b.get(f)), 'تحديث مستهدف', note=lab)
        ch = [f for f in ('set', 'active', 'dup', 'stage', 'priority', 'name', 'unit', 'dir') if a.get(f) != b.get(f)]
        if ch: add(code, None, None, None, None, 'تحديث بيانات وصفية', note='تغيّر: ' + '، '.join(ch))
    for k in sorted(cr.keys() | pr.keys(), key=lambda x: (str(x[0]), x[1])):
        i = C.get(k[0]) or P.get(k[0]); o, n = pr.get(k), cr.get(k)
        if n and not o:
            if n[2] is not None: add(k[0], 'فعلي', k[1], None, _fmt(i, n[2]), 'قراءة جديدة', n[4])
            if n[3] is not None: add(k[0], 'المقياس الثاني', k[1], None, _fmt(None, n[3]), 'قراءة جديدة', n[4])
        elif o and not n:
            add(k[0], 'فعلي', k[1], _fmt(i, o[2]), None, 'حذف قراءة', o[4])
        else:
            if o[2] != n[2]: add(k[0], 'فعلي', k[1], _fmt(i, o[2]), _fmt(i, n[2]), 'قراءة جديدة' if o[2] is None else 'تصحيح قراءة', n[4])
            if o[3] != n[3]: add(k[0], 'المقياس الثاني', k[1], _fmt(None, o[3]), _fmt(None, n[3]), 'قراءة جديدة' if o[3] is None else 'تصحيح قراءة', n[4])
            if o[2] == n[2] and o[3] == n[3] and o[4] != n[4]: add(k[0], 'فعلي', k[1], None, None, 'تحديث المصدر', n[4])
    return out
CHANGELOG = json.load(open(A.changelog, encoding='utf-8')) if os.path.exists(A.changelog) else []
if A.prev and os.path.exists(A.prev):
    try:
        PREV = json.load(open(A.prev, encoding='utf-8'))
        new_entries = diff_datasets(PREV, DS, A.date or datetime.date.today().isoformat(), A.by)
        CHANGELOG += new_entries
        print('changelog: +', len(new_entries))
    except Exception as e:
        print('changelog: previous dataset unreadable —', e)
json.dump(CHANGELOG, open(A.changelog, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
wb = openpyxl.load_workbook(SRC)
old = openpyxl.load_workbook(SRC, data_only=True)

# ---------- 1. indicators to include, in app order ----------
inds = DS['indicators']
pri_of = lambda i: ALIAS.get(i['priority'], i['priority'])
vision = [i for i in inds if group(i) == 'مؤشرات الرؤية']
kids = {}
for i in inds:
    if group(i) == 'مكوّنات مؤشرات الرؤية': kids.setdefault(i['parent'], []).append(i)
rows = []
for v in vision:
    rows.append(v); rows += kids.get(v['code'], [])
rows += [i for i in inds if group(i) == 'المؤشرات المساندة']
rows += [i for i in inds if group(i) == 'مؤشرات ملغاة']
assert len(rows) == 101, len(rows)

RD = collections.defaultdict(list)
for r in DS['readings']: RD[r[0]].append(r)
PT = collections.defaultdict(list)
for p in DS['path']: PT[p[0]].append(p)
NT = collections.defaultdict(list)
for n in DS['notes']: NT[n[0]].append(n)
rev_dup = collections.defaultdict(list)
for i in inds:
    if i.get('dup'): rev_dup[i['dup']].append(i['code'])

# ---------- 2. map old Excel IDs -> app codes ----------
oreg = old['سجل المؤشرات']
names = {c: norm(i['name']) for c, i in IND.items()}
FIX = {1: 'U-02', 2: 'U-02', 3: 'U-02', 35: 'U-39'}
old_rows = {}
old_map = collections.defaultdict(list)
for r in oreg.iter_rows(min_row=5, max_row=204, values_only=True):
    if r[0] is None: continue
    oid = r[0]
    if oid in FIX: code = FIX[oid]
    else:
        n = norm(r[4]); best = max(names, key=lambda c: difflib.SequenceMatcher(None, n, names[c]).ratio())
        code = IND[best].get('dup') or best
    old_rows[oid] = r
    old_map[code].append(oid)

def old_field(code, col):  # first non-empty, preferring the «القيمة» metric row
    ids = sorted(old_map.get(code, []), key=lambda o: 0 if 'القيمة' in str(old_rows[o][4]) else 1)
    for o in ids:
        v = old_rows[o][col]
        if v not in (None, ''): return v
    return None

# ---------- 3. بيانات المصدر ----------
ws = wb['بيانات المصدر']
tmpl = {k: [copy.copy(c._style) for c in ws[r]] for k, r in (('فعلي', 5), ('مسار مخطط', 6), ('المقياس الثاني', 7))}
for row in ws.iter_rows(min_row=5, max_row=704):
    for c in row: c.value = None
YEAR_COL = {y: 10 + (y - 2007) for y in range(2007, 2041)}  # J=10
pct = lambda i: i['unit'] == '%'
sc = lambda i, v: None if v is None else (round(v / 100, 10) if pct(i) else v)
r = 5
for i in rows:
    code = i['code']; dev = i.get('stage') == 'قيد التطوير'
    for kind in ('فعلي', 'مسار مخطط', 'المقياس الثاني'):
        for ci, st in enumerate(tmpl[kind], start=1): ws.cell(r, ci)._style = copy.copy(st)
        ws.cell(r, 1, code); ws.cell(r, 2, kind); ws.cell(r, 3, f'=IF(A{r}="","",A{r}&"|"&B{r})')
        if kind == 'فعلي':
            ws.cell(r, 4, pri_of(i)); ws.cell(r, 5, i['name'])
            ws.cell(r, 6, 'نسبة' if pct(i) else 'قيمة')
            ws.cell(r, 7, 'انخفاض' if 'الانخفاض' in (i['dir'] or '') else 'ارتفاع')
            if not dev and i.get('t30hi') is None: ws.cell(r, 8, sc(i, i['t30']))
            if not dev: ws.cell(r, 9, sc(i, i['t40']))
            srcs = []
            for rd in sorted(RD[code], key=lambda a: a[1]):
                if rd[2] is not None: ws.cell(r, YEAR_COL[rd[1]], sc(i, rd[2]))
                if rd[4] and rd[4] not in srcs: srcs.append(rd[4])
            ws.cell(r, 44, ' · '.join(f'المصدر: {s}' for s in srcs) or None)
        else:
            ws.cell(r, 4, f'=IFERROR(INDEX($D$5:$D$704,MATCH($A{r}&"|فعلي",$C$5:$C$704,0)),"")')
            ws.cell(r, 5, f'=IFERROR(INDEX($E$5:$E$704,MATCH($A{r}&"|فعلي",$C$5:$C$704,0)),"")')
            if kind == 'مسار مخطط' and not dev:
                for p in PT[code]: ws.cell(r, YEAR_COL[p[1]], sc(i, p[2]))
            if kind == 'المقياس الثاني':
                has = False
                for rd in RD[code]:
                    if rd[3] is not None: ws.cell(r, YEAR_COL[rd[1]], rd[3]); has = True
                if has: ws.cell(r, 44, 'الترتيب (التصنيف) في المؤشر الدولي')
        r += 1
assert r - 1 <= 704
# priority list (AT5:AT30) feeding القوائم
plist = []
for i in [x for x in inds if x['set'] == 'أصلي'] + rows:
    if pri_of(i) not in plist: plist.append(pri_of(i))
for k in range(26): ws.cell(5 + k, 46, plist[k] if k < len(plist) else None)
ws['A2'] = ('حدّث القيم هنا فقط (الخلايا الصفراء) — تنتقل تلقائيًا إلى «السلاسل الزمنية» و«سجل المؤشرات» و«لوحة القيادة» و«عرض المؤشر». '
            'البيانات مطابقة لتطبيق المؤشرات (تحديث 20-11-2026): المعرفات هي رموز التطبيق (U = مؤشرات الرؤية، O = المؤشرات المساندة)، '
            'والنسب مخزنة كسور عشرية (3.3% = 0.033). لإضافة مؤشر: أضف صفوفه هنا بمعرف جديد ثم أضف المعرف في «سجل المؤشرات».')

# ---------- 4. سجل المؤشرات ----------
reg = wb['سجل المؤشرات']
row5 = [(c.value, copy.copy(c._style)) for c in reg[5]]
for rr in reg.iter_rows(min_row=5, max_row=204):
    for c in rr: c.value = None
FREQ_FIX = {'5سنوات': 'كل 5 سنوات', '3سنوات': 'كل 3 سنوات'}
def risk(v):
    if v is None: return None
    return {'متوسطة': 'متوسط'}.get(v, v)
def fmt(v):
    if v is None: return ''
    return f'{v:g}' if isinstance(v, (int, float)) else str(v)
for k, i in enumerate(rows):
    rr = 5 + k; code = i['code']; dev = i.get('stage') == 'قيد التطوير'
    for ci, (val, st) in enumerate(row5, start=1):
        cell = reg.cell(rr, ci); cell._style = copy.copy(st)
        if isinstance(val, str) and val.startswith('='):
            cell.value = Translator(val, origin=f'{cell.column_letter}5').translate_formula(f'{cell.column_letter}{rr}')
    g = group(i)
    unit_sfx = '%' if pct(i) else ''
    refs = []
    if rev_dup.get(code): refs.append('يقابل المؤشر الأصلي: ' + '، '.join(rev_dup[code]))
    if i.get('parent'): refs.append(f'مكوّن من {i["parent"]} — {i.get("grade") or ""} {i.get("subject") or ""}'.strip())
    t30text = 'يُحدَّد لاحقاً' if dev else (i.get('t30text') or (fmt(i['t30']) + unit_sfx if i['t30'] is not None else None))
    if not dev and i.get('t30hi') is not None:
        t30text = f'نطاق: {fmt(i["t30"])}–{fmt(i["t30hi"])}{unit_sfx}'
    has_rank = any(rd[3] is not None for rd in RD[code])
    second = None
    if has_rank:
        second = 'الترتيب (التصنيف)' + (f' — مستهدف 2030: المرتبة {fmt(i["t30rank"])}' if i.get('t30rank') is not None and not dev else '')
    notes = sorted(NT[code], key=lambda n: n[1])
    analysis = f'{notes[-1][1]}: {notes[-1][2]}' if notes else old_field(code, 20)
    latest_note = next((rd[8] for rd in sorted(RD[code], key=lambda a: -a[1]) if rd[8]), None)
    w = '؛ '.join(x for x in [(f'{i["stage"]}: {i.get("stage_note") or ""}'.strip(': ') if i.get('stage') else None),
                              (f'ملاحظة آخر قراءة: {latest_note}' if latest_note else None),
                              ('مؤشر ملغى في المرحلة المحدثة — للتوثيق فقط' if g == 'مؤشرات ملغاة' else None),
                              ('القراءات في المكوّنات: ' + '، '.join(k_['code'] for k_ in kids.get(code, [])) if kids.get(code) else None)] if x)
    vals = {
        1: code, 2: g, 3: ' · '.join(refs) or None,
        6: i.get('owner'), 7: FREQ_FIX.get(i.get('freq'), i.get('freq')) or old_field(code, 6),
        10: (f'خط الأساس: {fmt(i["base"])}{unit_sfx}' if i.get('base') is not None else None),
        11: t30text, 13: ('بطاقة المؤشر (تطبيق المؤشرات)' if (not dev and i['t30'] is not None and i.get('t30hi') is None) else None),
        15: risk(i.get('risk')),
        16: 'مراجعة' if (i.get('stage') or g == 'مؤشرات ملغاة') else 'جاهز',
        17: second, 18: old_field(code, 17), 19: i.get('method') or old_field(code, 18),
        20: i.get('factors') or old_field(code, 19), 21: analysis,
        22: i.get('stage'), 23: w or None,
        24: None, 25: None, 26: None,
    }
    for ci, v in vals.items(): reg.cell(rr, ci).value = v
reg['B4'] = 'المجموعة'; reg['C4'] = 'المرجع (المقابل في المؤشرات الأصلية)'; reg['V4'] = 'مرحلة المؤشر (التطبيق)'
reg['A2'] = ('A–W من بيانات تطبيق المؤشرات (كل قراءة مُراجعة من مصدرها الأصلي) · AA–BF محسوبة بالمعادلات — لا تُعدّل · '
             'المجموعة: 38 مؤشر رؤية (U) + 4 مكوّنات TIMSS + 57 مؤشراً مسانداً (O) + 2 ملغاة؛ المؤشرات الأصلية التي لها مقابل في مؤشرات الرؤية (17) لا تتكرر')

# ---------- 5. القوائم ----------
L = wb['القوائم']
L['B4'] = 'المجموعة'
GROUPS = ['الكل', 'مؤشرات الرؤية', 'المؤشرات المساندة', 'مكوّنات مؤشرات الرؤية', 'مؤشرات ملغاة']
for k in range(5, 12): L.cell(k, 2).value = GROUPS[k - 5] if k - 5 < len(GROUPS) else None
owners = sorted({i['owner'].strip() for i in rows if i.get('owner')})
for k in range(6, 60): L.cell(k, 5).value = owners[k - 6] if k - 6 < len(owners) else None
assert len(owners) <= 54, len(owners)
L['A2'] = 'قيم القوائم المنسدلة والفلاتر — عمود «المجموعة» يطابق تقسيم تطبيق المؤشرات (مؤشرات الرؤية / المؤشرات المساندة)'

# ---------- 6. لوحة القيادة ----------
D = wb['لوحة القيادة']
D['H10'] = 'المجموعة:'; D['I10'] = 'مؤشرات الرؤية'; D['D10'] = 'الكل'
D['L10'] = 'الكل'; D['O10'] = 'الكل'; D['S10'] = 'الكل'; D['V10'] = None
D['A2'] = ('كل المؤشرات في صفحة واحدة: آخر قراءة، المستهدف، كفاية التقدم، الوضع مقابل المسار المخطط، مستوى عدم التحقق، والسلسلة 2017–2026 · '
           'فلتر «المجموعة»: مؤشرات الرؤية (38) أو المؤشرات المساندة (57) كما في التطبيق')
D['AA10'] = 'امسح الفلاتر: اختر «الكل» واترك البحث فارغًا — المجموعة الافتراضية «مؤشرات الرؤية»'

# ---------- 7. عرض المؤشر + مساعد_الرسم ----------
first = rows[0] if False else next(i for i in rows if i['code'] == 'U-32')
wb['عرض المؤشر']['C4'] = f'{first["code"]} | {first["name"]}'
wb['مساعد_الرسم']['B3'] = '=IFERROR(TRIM(LEFT(\'عرض المؤشر\'!$C$4,FIND(" |",\'عرض المؤشر\'!$C$4)-1)),"")'

# ---------- 8. متابعة البيانات الناقصة ----------
F = wb['متابعة البيانات الناقصة']
oldF = {}
for rr_ in old['متابعة البيانات الناقصة'].iter_rows(min_row=8, max_row=100, values_only=True):
    if rr_[0] is not None: oldF[rr_[0]] = rr_[12:17]
f8 = [(c.value, copy.copy(c._style)) for c in F[8]]
LAST = 110
for rr in F.iter_rows(min_row=8, max_row=LAST):
    for c in rr: c.value = None
for k, i in enumerate(rows):
    rr = 8 + k
    for ci, (val, st) in enumerate(f8, start=1):
        cell = F.cell(rr, ci); cell._style = copy.copy(st)
        if isinstance(val, str) and val.startswith('='):
            cell.value = Translator(val, origin=f'{cell.column_letter}8').translate_formula(f'{cell.column_letter}{rr}')
    F.cell(rr, 1).value = i['code']
    F.cell(rr, 5).value = f"=IFERROR(IF(INDEX('سجل المؤشرات'!$G$5:$G$204,MATCH($A{rr},'سجل المؤشرات'!$A$5:$A$204,0))=\"\",\"\",INDEX('سجل المؤشرات'!$G$5:$G$204,MATCH($A{rr},'سجل المؤشرات'!$A$5:$A$204,0))),\"\")"
    F.cell(rr, 7).value = f"=IFERROR(IF(INDEX('سجل المؤشرات'!$AD$5:$AD$204,MATCH($A{rr},'سجل المؤشرات'!$A$5:$A$204,0))=\"\",\"\",INDEX('سجل المؤشرات'!$AD$5:$AD$204,MATCH($A{rr},'سجل المؤشرات'!$A$5:$A$204,0))),\"\")"
    # carry user follow-up entries (M–Q) from the old rows that map to this code
    carried = None
    for o in old_map.get(i['code'], []):
        if o in oldF and any(x not in (None, 'لم يبدأ') for x in oldF[o]): carried = oldF[o]; break
    for ci, v in zip(range(13, 18), carried or (None, None, None, 'لم يبدأ', None)):
        F.cell(rr, ci).value = v
for ref, new in (('A5', '=COUNTA(A8:A110)'), ('B5', '=COUNTIFS(A8:A110,"<>",F8:F110,0)'), ('C5', '=COUNTIFS(A8:A110,"<>",H8:H110,"")'),
                 ('D5', '=COUNTIFS(F8:F110,">0",G8:G110,"<"&$I$5)'), ('E5', '=COUNTIF(I8:I110,"مراجعة")'), ('F5', '=COUNTIF(P8:P110,"تم التحديث")')):
    F[ref] = new
F.auto_filter.ref = 'A7:Q110'
for dv in F.data_validations.dataValidation:
    s = str(dv.sqref)
    dv.sqref = openpyxl.worksheet.cell_range.MultiCellRange(s.replace('100', '110'))
from openpyxl.formatting.formatting import ConditionalFormattingList
newcf = ConditionalFormattingList()
for cf in F.conditional_formatting:
    for rule in cf.rules: newcf.add(str(cf.sqref).replace('100', '110'), rule)
F.conditional_formatting = newcf
wb.defined_names  # noqa

# ---------- 9. re-add list validations (x14 ones are dropped by openpyxl) ----------
def dv(ws_, rng, f, **kw):
    d = DataValidation(type='list', formula1=f, allow_blank=True, **kw); d.add(rng); ws_.add_data_validation(d)
dv(D, 'D10', 'القوائم!$A$5:$A$57'); dv(D, 'I10', 'القوائم!$B$5:$B$9'); dv(D, 'L10', 'القوائم!$C$5:$C$11')
dv(D, 'O10', 'القوائم!$D$5:$D$9'); dv(D, 'S10', 'القوائم!$E$5:$E$59')
dv(wb['عرض المؤشر'], 'C4', "'سجل المؤشرات'!$BE$5:$BE$204")
dv(reg, 'D5:D204', 'القوائم!$A$6:$A$57', showErrorMessage=True, errorStyle='warning', error='القيمة غير موجودة في القوائم')
dv(reg, 'B5:B204', 'القوائم!$B$6:$B$9'); dv(reg, 'H5:H204', 'القوائم!$F$5:$F$7'); dv(reg, 'I5:I204', 'القوائم!$G$5:$G$6')
dv(reg, 'O5:O204', 'القوائم!$D$6:$D$8'); dv(reg, 'P5:P204', 'القوائم!$H$5:$H$7')
S = wb['بيانات المصدر']
dv(S, 'B5:B704', 'القوائم!$I$5:$I$7'); dv(S, 'F5:F704', 'القوائم!$G$5:$G$6'); dv(S, 'G5:G704', 'القوائم!$F$5:$F$7')
dv(wb['السلاسل الزمنية'], 'B5:B704', 'القوائم!$I$5:$I$7')

# ---------- 10. تصنيف المؤشرات (new reference sheet) ----------
T = wb.create_sheet('تصنيف المؤشرات', index=3)
T.sheet_view.rightToLeft = True
hdr_fill = PatternFill('solid', fgColor='1F3A5F'); hfont = Font(name='Arial', bold=True, color='FFFFFF', size=10)
thin = Side(style='thin', color='D0D5DD'); bd = Border(left=thin, right=thin, top=thin, bottom=thin)
T['A1'] = 'تصنيف المؤشرات — مطابق لتطبيق المؤشرات (تحديث 20-11-2026)'; T['A1'].font = Font(name='Arial', bold=True, size=14, color='1F3A5F')
T['A2'] = ('كل سجلات التطبيق (118): مؤشرات الرؤية للمرحلة المحدثة هي المجموعة الرئيسية، و«المؤشرات المساندة» هي المؤشرات الأصلية (68) غير الموجودة ضمن الـ 38؛ '
           'المؤشر الأصلي الذي له مقابل في مؤشرات الرؤية لا يتكرر في الملف ويظهر هنا فقط مع رمز مقابله. القراءات مُراجعة من مصادرها الأصلية.')
T['A2'].font = Font(name='Arial', size=10, color='555555'); T['A2'].alignment = Alignment(wrap_text=True, vertical='top')
T.merge_cells('A2:I2'); T.row_dimensions[2].height = 32
summ = [('المجموعة', 'العدد', 'في الملف'), ('مؤشرات الرؤية', None, 'نعم'), ('مكوّنات مؤشرات الرؤية', None, 'نعم'),
        ('المؤشرات المساندة', None, 'نعم'), ('مؤشرات ملغاة', None, 'نعم'), ('مكرر (له مقابل في مؤشرات الرؤية)', None, 'لا — يظهر عبر مقابله')]
for k, (a, b, c) in enumerate(summ):
    rr = 4 + k
    T.cell(rr, 1, a); T.cell(rr, 3, c)
    T.cell(rr, 2, 'العدد' if k == 0 else f'=COUNTIF($B$12:$B$200,A{rr})')
    for ci in (1, 2, 3):
        T.cell(rr, ci).border = bd; T.cell(rr, ci).font = hfont if k == 0 else Font(name='Arial', size=10)
        if k == 0: T.cell(rr, ci).fill = hdr_fill
cols = ['الرمز', 'المجموعة', 'المحور', 'الأولوية', 'اسم المؤشر', 'النوع', 'مرحلة المؤشر', 'مقابله في مؤشرات الرؤية', 'في الملف']
for ci, h in enumerate(cols, start=1):
    c = T.cell(11, ci, h); c.fill = hdr_fill; c.font = hfont; c.border = bd; c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
order = rows[:] + [i for i in inds if group(i).startswith('مكرر')]
GF = {'مؤشرات الرؤية': 'E8F0FB', 'مكوّنات مؤشرات الرؤية': 'F2F6FC', 'المؤشرات المساندة': 'FFFFFF', 'مؤشرات ملغاة': 'F3F3F3', 'مكرر (له مقابل في مؤشرات الرؤية)': 'FDF6E3'}
for k, i in enumerate(order):
    rr = 12 + k; g = group(i)
    vals = [i['code'], g, i['axis'], pri_of(i), i['name'], i['type'], i.get('stage') or '', i.get('dup') or '',
            'لا' if g.startswith('مكرر') else 'نعم']
    for ci, v in enumerate(vals, start=1):
        c = T.cell(rr, ci, v); c.border = bd; c.font = Font(name='Arial', size=10)
        c.fill = PatternFill('solid', fgColor=GF[g]); c.alignment = Alignment(vertical='top', wrap_text=(ci == 5))
for col, w in zip('ABCDEFGHI', (9, 30, 18, 34, 60, 8, 13, 14, 9)): T.column_dimensions[col].width = w
T.freeze_panes = 'C12'; T.auto_filter.ref = f'A11:I{11 + len(order)}'

# ---------- 11. دليل الاستخدام ----------
G = wb['دليل الاستخدام']
for row in G.iter_rows():
    for c in row:
        if isinstance(c.value, str):
            c.value = (c.value.replace('فلاتر (الأولوية، المصدر،', 'فلاتر (الأولوية، المجموعة،')
                       .replace('تحويل مصنف بطاقات المؤشرات إلى لوحة تفاعلية واحدة + بيانات كفاية التقدم من الملف السابق',
                                'لوحة تفاعلية واحدة مبنية على بيانات تطبيق المؤشرات المحدثة (20-11-2026) + بيانات كفاية التقدم من الملف السابق'))
            if c.value.startswith('45 مقياسًا دوليًا'):
                c.value = ('أُلغيت «المقاييس الإضافية» المنفصلة (تصنيف/قيمة): كل مؤشر الآن صف واحد برمز التطبيق، والقيمة في «فعلي» والترتيب في «المقياس الثاني». '
                           'فلتر «المجموعة» يعرض مؤشرات الرؤية (38) أو المؤشرات المساندة (57) أو مكوّنات TIMSS أو المؤشرات الملغاة.')
            if c.value == 'مقاييس إضافية': c.value = 'المجموعات'
            if c.value.startswith('نسخة تحليلية أولية'):
                c.value = ('نسخة تحليلية وليست تقريرًا معتمدًا. نسبة الكفاية وصفية وليست احتمالًا إحصائيًا. ورقة «تصنيف المؤشرات» تربط كل رمز بمجموعته وبمقابله وبالمعرف في النسخة السابقة.')


# ---------- 12. سجل التحديثات + حماية ----------
import datetime
from openpyxl.styles import Protection
from openpyxl.workbook.protection import WorkbookProtection
# كلمة مرور حماية الأوراق من سر المستودع EXCEL_PASSWORD. لا توجد كلمة افتراضية ثابتة في الكود:
# إن غاب السر تُولَّد كلمة عشوائية لهذا البناء فقط (يبقى الملف محمياً ولا يعرف أحد كلمته).
# تنبيه: حماية الأوراق تمنع التعديل العرضي ولا تشفّر البيانات.
import secrets
PW = os.environ.get('EXCEL_PASSWORD') or ''
if not PW:
    PW = secrets.token_urlsafe(18)
    print('تنبيه: السر EXCEL_PASSWORD غير مضبوط؛ استُخدمت كلمة عشوائية لهذا البناء.', file=sys.stderr)
LG = wb.create_sheet('سجل التحديثات', index=4)
LG.sheet_view.rightToLeft = True
LG['A1'] = 'سجل تحديثات البيانات'; LG['A1'].font = Font(name='Arial', bold=True, size=14, color='1F3A5F')
LG['A2'] = ('يُملأ تلقائياً: يُسجَّل هنا كل تغيير في بيانات التطبيق (قراءة جديدة، تصحيح، مستهدف) مع مصدره وتاريخه. '
            'منه يُحسب «آخر تحديث مسجل» لكل مؤشر في «سجل المؤشرات» وفي «عرض المؤشر»، و«آخر تحديث للبيانات» في لوحة القيادة. '
            'المعرف «الكل» = تحديث شامل لكل المؤشرات.')
LG['A2'].font = Font(name='Arial', size=10, color='555555'); LG['A2'].alignment = Alignment(wrap_text=True, vertical='top')
LG.merge_cells('A2:K2'); LG.row_dimensions[2].height = 44
lh = ['التاريخ', 'المعرف', 'اسم المؤشر (تلقائي)', 'نوع السلسلة', 'السنة', 'القيمة السابقة', 'القيمة الجديدة', 'نوع التحديث', 'المصدر (الجهة والإصدار/الجدول)', 'المحدِّث', 'ملاحظة']
for ci, h in enumerate(lh, start=1):
    c = LG.cell(4, ci, h); c.fill = hdr_fill; c.font = hfont; c.border = bd; c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
inp = PatternFill('solid', fgColor='FFF8DC'); calcf = PatternFill('solid', fgColor='F2F2F2')
for rr in range(5, 1005):
    for ci in range(1, 12):
        c = LG.cell(rr, ci); c.border = bd; c.font = Font(name='Arial', size=10)
        c.fill = calcf
    LG.cell(rr, 1).number_format = 'yyyy-mm-dd'
    LG.cell(rr, 3).value = f'=IF(B{rr}="","",IF(B{rr}="الكل","كل المؤشرات",IFERROR(INDEX(\'سجل المؤشرات\'!$E$5:$E$204,MATCH(B{rr},\'سجل المؤشرات\'!$A$5:$A$204,0)),"؟ معرف غير موجود")))'
LOG = CHANGELOG[-1000:]
for k, e in enumerate(LOG):
    rr = 5 + k
    try: d = datetime.date.fromisoformat(e['date'][:10])
    except Exception: d = None
    vals = [d, e.get('code'), None, e.get('series'), e.get('year'), e.get('old'), e.get('new'), e.get('type'), e.get('source'), e.get('by'), e.get('note')]
    for ci, v in enumerate(vals, start=1):
        if ci != 3: LG.cell(rr, ci).value = v
for col, w in zip('ABCDEFGHIJK', (12, 10, 44, 13, 8, 13, 13, 16, 40, 14, 40)): LG.column_dimensions[col].width = w
LG.freeze_panes = 'D5'; LG.auto_filter.ref = 'A4:K1004'
LG['M4'] = 'أنواع التحديث'; LG['M4'].font = Font(name='Arial', bold=True, size=10)
for k, t in enumerate(['قراءة جديدة', 'تصحيح قراءة', 'تحديث مستهدف', 'تحديث بيانات وصفية', 'مزامنة شاملة', 'حذف قراءة']):
    LG.cell(5 + k, 13, t).font = Font(name='Arial', size=10, color='777777')
d1 = DataValidation(type='date', operator='greaterThan', formula1='43831', allow_blank=True, showErrorMessage=True, error='أدخل تاريخاً صحيحاً'); d1.add('A5:A1004'); LG.add_data_validation(d1)
d2 = DataValidation(type='list', formula1="'سجل المؤشرات'!$A$5:$A$204", allow_blank=True, showErrorMessage=True, errorStyle='warning', error='المعرف غير موجود في سجل المؤشرات (استخدم «الكل» للتحديث الشامل)'); d2.add('B5:B1004'); LG.add_data_validation(d2)
d3 = DataValidation(type='list', formula1='القوائم!$I$5:$I$7', allow_blank=True); d3.add('D5:D1004'); LG.add_data_validation(d3)
d4 = DataValidation(type='whole', operator='between', formula1='2007', formula2='2040', allow_blank=True, showErrorMessage=True, error='السنة بين 2007 و2040'); d4.add('E5:E1004'); LG.add_data_validation(d4)
d5 = DataValidation(type='list', formula1='$M$5:$M$10', allow_blank=True); d5.add('H5:H1004'); LG.add_data_validation(d5)

# last update per indicator (registry BF)
reg['BF3'] = 'التحديث'; reg['BF4'] = 'آخر تحديث مسجل'
reg['BF3']._style = copy.copy(reg['BE3']._style); reg['BF4']._style = copy.copy(reg['BE4']._style)
reg.column_dimensions['BF'].width = 14
for rr in range(5, 205):
    c = reg.cell(rr, 58); c._style = copy.copy(reg.cell(rr, 57)._style); c.number_format = 'yyyy-mm-dd'
    c.value = (f'=IF($A{rr}="","",IF(MAX(_xlfn.MAXIFS(\'سجل التحديثات\'!$A$5:$A$1004,\'سجل التحديثات\'!$B$5:$B$1004,$A{rr}),'
               f'_xlfn.MAXIFS(\'سجل التحديثات\'!$A$5:$A$1004,\'سجل التحديثات\'!$B$5:$B$1004,"الكل"))=0,"",'
               f'MAX(_xlfn.MAXIFS(\'سجل التحديثات\'!$A$5:$A$1004,\'سجل التحديثات\'!$B$5:$B$1004,$A{rr}),'
               f'_xlfn.MAXIFS(\'سجل التحديثات\'!$A$5:$A$1004,\'سجل التحديثات\'!$B$5:$B$1004,"الكل"))))')
reg.auto_filter.ref = 'A4:BF204'
# dashboard + indicator view
D.merge_cells('A3:AF3')
D['A3'] = ('=IF(COUNT(\'سجل التحديثات\'!$A$5:$A$1004)=0,"لا توجد تحديثات مسجلة","آخر تحديث مسجل للبيانات: "&TEXT(MAX(\'سجل التحديثات\'!$A$5:$A$1004),"yyyy-mm-dd")'
           '&" · عدد التحديثات المسجلة: "&COUNT(\'سجل التحديثات\'!$A$5:$A$1004)&" · الملف يُبنى تلقائياً من بيانات التطبيق (' + str(DS['meta'].get('built','')) + ') — لا يُعدَّل يدوياً")')
D['A3'].font = Font(name='Arial', size=10, bold=True, color='1F3A5F'); D['A3'].alignment = Alignment(horizontal='right')
V = wb['عرض المؤشر']
V['B9'] = '=IF(مساعد_الرسم!$B$4="","",IF(INDEX(\'سجل المؤشرات\'!$BF$5:$BF$204,مساعد_الرسم!$B$4)="","آخر تحديث مسجل: —","آخر تحديث مسجل: "&TEXT(INDEX(\'سجل المؤشرات\'!$BF$5:$BF$204,مساعد_الرسم!$B$4),"yyyy-mm-dd")))'
V['B9'].font = Font(name='Arial', size=10, color='555555')
S['A2'] = ('لا تُعدَّل البيانات هنا: هذه الورقة تُبنى تلقائياً من بيانات تطبيق المؤشرات عند كل تحديث. لتغيير أي قيمة حدّثها من صفحة إدارة التطبيق، فيُعاد بناء هذا الملف ويُسجَّل التغيير في «سجل التحديثات». '
            'المعرفات هي رموز التطبيق (U = مؤشرات الرؤية، O = المؤشرات المساندة)، والنسب كسور عشرية (3.3% = 0.033).')

# protection: everything locked; only viewer controls stay editable
UNLOCK = {'لوحة القيادة': ['D10', 'I10', 'L10', 'O10', 'S10', 'V10'], 'عرض المؤشر': ['C4']}
for ws_ in wb.worksheets:
    for addr in UNLOCK.get(ws_.title, []):
        ws_[addr].protection = Protection(locked=False)
    ws_.protection.sheet = True
    ws_.protection.password = PW
    ws_.protection.autoFilter = False
    ws_.protection.sort = False
    ws_.protection.formatColumns = False
    ws_.protection.formatRows = False
F_ = wb['متابعة البيانات الناقصة']
for row in F_.iter_rows(min_row=8, max_row=110, min_col=13, max_col=17):
    for c in row: c.protection = Protection(locked=False)
wb.security = WorkbookProtection(workbookPassword=PW, lockStructure=True)
G.append([])
G.append(['الحماية والتحديث'])
G.append(['الحماية', 'كل الأوراق محمية وهيكل المصنف مقفل. المفتوح للجميع: فلاتر لوحة القيادة، قائمة اختيار المؤشر، وأعمدة المتابعة (M–Q) في «متابعة البيانات الناقصة».'])
G.append(['خطوات التحديث', 'الملف لا يُحدَّث يدوياً: حدّث البيانات من صفحة إدارة التطبيق وارفع dataset.json إلى GitHub، فيُبنى هذا الملف من جديد خلال دقائق ويُسجَّل كل تغيير في «سجل التحديثات». الدوريات (PowerPoint) تُبنى من البيانات نفسها.'])
G.append(['معرفة التحديث', '«آخر تحديث مسجل» يظهر لكل مؤشر في العمود BF من «سجل المؤشرات» وفي «عرض المؤشر»، وآخر تحديث للملف في أعلى لوحة القيادة.'])

# ---------- 13. إزالة كل مقارنة بالملف السابق (المراجعة تمت من المصادر الأصلية) ----------
if 'كفاية التقدم (الملف السابق)' in wb.sheetnames: del wb['كفاية التقدم (الملف السابق)']
for col in ('X', 'Y', 'Z', 'AV'):
    reg[col + '3'] = None; reg[col + '4'] = None; reg.column_dimensions[col].hidden = True
    for rr in range(5, 205): reg[f'{col}{rr}'].value = None
for rr in range(33, 154): D[f'AF{rr}'].value = None
V['E8'] = ('="الحالة: "&IF(مساعد_الرسم!$B$4="","",INDEX(\'سجل المؤشرات\'!$AL$5:$AL$204,مساعد_الرسم!$B$4))'
           '&" · عدم التحقق: "&IF(مساعد_الرسم!$B$4="","",INDEX(\'سجل المؤشرات\'!$AX$5:$AX$204,مساعد_الرسم!$B$4))')
V['B39'] = 'مرحلة المؤشر ونقاط المراجعة'
V['B43'] = 'مصدر القراءات'
V['B44'] = ('=IF(مساعد_الرسم!$B$4="","",IFERROR(IF(INDEX(\'بيانات المصدر\'!$AR$5:$AR$704,MATCH(INDEX(\'سجل المؤشرات\'!$A$5:$A$204,مساعد_الرسم!$B$4)&"|فعلي",\'بيانات المصدر\'!$C$5:$C$704,0))="","—",'
            'INDEX(\'بيانات المصدر\'!$AR$5:$AR$704,MATCH(INDEX(\'سجل المؤشرات\'!$A$5:$A$204,مساعد_الرسم!$B$4)&"|فعلي",\'بيانات المصدر\'!$C$5:$C$704,0))),"—"))')

D['B7'] = D['B7'].value.replace(' · تغيرت حالة "&COUNTIFS(\'سجل المؤشرات\'!$AY$5:$AY$204,1,\'سجل المؤشرات\'!$AV$5:$AV$204,"تغيرت*")&" مؤشرًا عن الملف السابق', '')
D['B155'] = D['B155'].value.replace(' · الحالة بلون بنفسجي في العمود الأخير = تغيّرت عن الملف السابق.', '.')
from openpyxl.formatting.formatting import ConditionalFormattingList as _CFL
_cf = _CFL()
for _r in D.conditional_formatting:
    if 'AF' in str(_r.sqref) and all(str(x).startswith('AF') for x in str(_r.sqref).split()):
        continue
    for _rule in _r.rules: _cf.add(str(_r.sqref), _rule)
D.conditional_formatting = _cf
# دليل الاستخدام: إعادة كتابة كاملة متسقة مع المنظومة
st_title = copy.copy(G['A2']._style); st_sec = copy.copy(G['B4']._style); st_lab = copy.copy(G['B5']._style); st_txt = copy.copy(G['C5']._style)
keep = {G.cell(r, 2).value: G.cell(r, 3).value for r in range(5, G.max_row + 1) if G.cell(r, 2).value}
for m in list(G.merged_cells.ranges):
    if m.min_row >= 2: G.unmerge_cells(str(m))
for row in G.iter_rows(min_row=2, max_row=max(G.max_row, 60)):
    for c in row: c.value = None; c._style = copy.copy(G['A3']._style)
GUIDE = [
 ('title', 'لوحة تفاعلية تُبنى تلقائياً من بيانات تطبيق مؤشرات الرؤية — مصدر واحد للبيانات، وكل قراءة مُراجعة من مصدرها الأصلي.'),
 None,
 ('sec', 'الأوراق'),
 ('لوحة القيادة', keep.get('لوحة القيادة')),
 ('عرض المؤشر', keep.get('عرض المؤشر')),
 ('سجل المؤشرات', 'صف لكل مؤشر: A–W من بيانات التطبيق (الأولوية، الاسم، الجهة، الدورية، الاتجاه، خط الأساس، المستهدفات، الوصف، طريقة الاحتساب، التحليل)، والأعمدة بعدها محسوبة بالمعادلات.'),
 ('تصنيف المؤشرات', 'كل سجلات التطبيق ومجموعة كل مؤشر: مؤشرات الرؤية (38)، المؤشرات المساندة (57)، مكوّنات TIMSS، والملغاة؛ والمؤشر الأصلي الذي له مقابل في مؤشرات الرؤية لا يتكرر.'),
 ('سجل التحديثات', 'يُملأ تلقائياً عند كل تحديث لبيانات التطبيق: القراءات الجديدة والمصححة وتغيّر المستهدفات، مع المصدر والتاريخ.'),
 ('متابعة البيانات الناقصة', 'المؤشرات التي تنقصها قراءات أو تحتاج متابعة مع الجهات.'),
 ('السلاسل الزمنية', keep.get('السلاسل الزمنية')),
 ('بيانات المصدر', 'القراءات والمسار المخطط والترتيب لكل مؤشر، ومصدر القراءات في عمود الملاحظات. تُبنى من التطبيق ولا تُعدَّل هنا.'),
 None,
 ('sec', 'مصادر البيانات واعتمادها'),
 ('المصدر الوحيد', 'بيانات تطبيق المؤشرات (dataset.json). الملف يُبنى منها تلقائياً بعد كل تحديث، فلا يختلف عن التطبيق ولا عن الدوريات.'),
 ('المراجعة', 'كل قراءة مُراجعة من مصدرها الأصلي: الجهة المُصدِرة للمؤشرات الدولية (الإصدار الحالي)، والمركز الوطني للإحصاء والمعلومات للمؤشرات الوطنية ثم تقرير الرؤية.'),
 ('نقاط تحتاج اعتماداً', 'المؤشرات «قيد التحقق» أو «قيد التطوير» تظهر في عمود «مرحلة المؤشر» وفي ملاحظات البيانات، وتُحال إلى الفريق المختص لاعتمادها لاحقاً، ولا تدخل في حساب الأداء حتى تُعتمد.'),
 None,
 ('sec', 'منطق الحساب'),
 ('الحالة', keep.get('الحالة')),
 ('تصنيف الكفاية', keep.get('تصنيف الكفاية')),
 ('قطع المسافة', keep.get('قطع المسافة')),
 ('الوضع مقابل المسار', keep.get('الوضع مقابل المسار')),
 ('المستهدف للحساب', 'مستهدف 2030 من بيانات التطبيق؛ المستهدف على شكل نطاق أو غير المعتمد لا يدخل الحساب ويظهر نصاً.'),
 ('الاتجاه', 'من بيانات التطبيق: «ارتفاع» عندما يكون الارتفاع أفضل، و«انخفاض» عندما يكون الانخفاض أفضل.'),
 ('الوحدات', 'النسب مخزنة كسوراً عشرية (3.3% = 0.033)، والترتيب الدولي في «المقياس الثاني».'),
 None,
 ('sec', 'الحماية والتحديث'),
 ('الحماية', 'كل الأوراق محمية وهيكل المصنف مقفل. المفتوح للجميع: فلاتر لوحة القيادة، قائمة اختيار المؤشر، وأعمدة المتابعة (M–Q) في «متابعة البيانات الناقصة».'),
 ('خطوات التحديث', 'الملف لا يُحدَّث يدوياً: تُحدَّث البيانات من صفحة إدارة التطبيق، فيُبنى هذا الملف من جديد خلال دقائق ويُسجَّل كل تغيير في «سجل التحديثات». الدوريات (PowerPoint) تُبنى من البيانات نفسها.'),
 ('معرفة التحديث', '«آخر تحديث مسجل» يظهر لكل مؤشر في العمود BF من «سجل المؤشرات» وفي «عرض المؤشر»، وآخر تحديث للملف أعلى لوحة القيادة.'),
 None,
 ('sec', 'تنبيه'),
 ('', 'نسخة تحليلية للمتابعة وليست تقريراً معتمداً. نسبة الكفاية وصفية وليست احتمالاً إحصائياً.'),
]
r_ = 2
for item in GUIDE:
    if item is None: r_ += 1; continue
    a, b = item
    if a == 'title':
        G.cell(r_, 1, b)._style = copy.copy(st_title); G.merge_cells(f'A{r_}:C{r_}')
    elif a == 'sec':
        G.cell(r_, 2, b)._style = copy.copy(st_sec); G.cell(r_, 3)._style = copy.copy(st_sec); G.merge_cells(f'B{r_}:C{r_}')
    else:
        G.cell(r_, 2, a or None)._style = copy.copy(st_lab); G.cell(r_, 3, b)._style = copy.copy(st_txt)
    r_ += 1

wb.calculation.fullCalcOnLoad = True
wb.active = 0
wb.save(OUT)
# openpyxl يعيد كتابة الرسوم بتنسيق مبسّط؛ نعيد رسوم القالب الأصلية كما هي
KEEP = ['xl/charts/chart1.xml', 'xl/charts/chart2.xml', 'xl/drawings/drawing1.xml', 'xl/drawings/drawing2.xml']
with zipfile.ZipFile(SRC) as zt: orig = {n: zt.read(n) for n in KEEP if n in zt.namelist()}
tmp = OUT + '.tmp'
with zipfile.ZipFile(OUT) as zi, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zo:
    for it in zi.infolist(): zo.writestr(it, orig.get(it.filename, zi.read(it.filename)))
os.replace(tmp, OUT)
print('saved', len(rows), 'indicators;', r - 5, 'source rows; owners', len(owners), '; priorities', len(plist))
