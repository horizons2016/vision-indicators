#!/usr/bin/env python3
"""مولّد طلبات تحديث المؤشرات.

يقارن بيانات التطبيق (data/dataset.json) بثلاثة مصادر، ويفتح لكل جديد «طلباً» في GitHub Issues:
  1. إصدارات المركز الوطني للإحصاء كما يرصدها «مستودع البيانات والتقارير» (إصدار جديد أو تعديل صامت لملف).
  2. واجهة بيانات البنك الدولي: قيمة أحدث أو مختلفة عن التطبيق ← طلب بقيمة مقترحة جاهزة للاعتماد.
  3. تقويم الإصدارات: حلّ موعد إصدار مؤشر دولي ولم تُضف قراءته بعد.
لا يغيّر أي رقم بنفسه: الاعتماد بتعليق «/اعتماد» على الطلب (tools/apply_request.py).

الاستخدام: python tools/update_requests.py [--dry-run] [--baseline]
"""
import argparse, json, os, re, sys, urllib.request, urllib.error, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, 'requests', 'state.json')
LABEL_REQ, LABEL_ALERT = 'طلب تحديث', 'تنبيه إصدار'
LABELS = {LABEL_REQ: ('1f6feb', 'قيمة جديدة جاهزة للاعتماد بتعليق /اعتماد'),
          LABEL_ALERT: ('d4a72c', 'إصدار جديد أو موعد إصدار يخص مؤشرات التطبيق'),
          'معتمد': ('2da44e', 'اعتُمد وأُضيف إلى البيانات')}


def http_json(url, token=None, method='GET', body=None):
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
    req.add_header('User-Agent', 'ov2040-update-requests')
    if token:
        req.add_header('Authorization', f'Bearer {token}'); req.add_header('Accept', 'application/vnd.github+json')
    if body is not None: req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode() or 'null')


def fmt(i, v):
    if v is None: return '—'
    s = f'{v:,.3f}'.rstrip('0').rstrip('.') if isinstance(v, float) else f'{v:,}'
    return s + ('%' if (i or {}).get('unit') == '%' else '')


class Data:
    def __init__(self, ds):
        self.ds = ds
        self.ind = {i['code']: i for i in ds['indicators']}
        self.read = {}
        for r in ds['readings']: self.read.setdefault(r[0], {})[r[1]] = r

    def last(self, code):
        ys = [y for y, r in self.read.get(code, {}).items() if r[2] is not None]
        return (max(ys), self.read[code][max(ys)]) if ys else (None, None)

    def cur_txt(self, code):
        y, r = self.last(code)
        return f'{y}: {fmt(self.ind.get(code), r[2])}' if y else 'لا توجد قراءة'


def marker(kind, key, payload):
    return f'<!-- ov2040-request {json.dumps({"kind": kind, "key": key, **payload}, ensure_ascii=False)} -->'


# ---------------------------------------------------------------- 1) إصدارات المركز
def ncsi_requests(cfg, data, pubs, state, baseline):
    out = []
    seen = set(state.setdefault('ncsi_seen', []))
    for p in pubs:
        title = p.get('title_ar') or p.get('title_en') or ''
        vers = [v for vs in (p.get('versions') or {}).values() for v in vs]
        if not vers: continue
        top = max(vers, key=lambda v: v.get('v', 1))
        key = f"ncsi:{p['id']}:v{top.get('v', 1)}"
        if key in seen: continue
        seen.add(key)
        if baseline: continue
        codes = []
        for rule in cfg['ncsi']:
            if all(m in title for m in rule['match']):
                codes += [c for c in rule['indicators'] if c in data.ind and c not in codes]
        if not codes: continue
        updated = top.get('v', 1) > 1
        url = top.get('url'); arch = (top.get('archive_url') or '').replace('github.com/horizons2016/', 'github.com/ov2040/') or None
        rows = '\n'.join(f"| {c} | {data.ind[c]['name']} | {data.cur_txt(c)} |" for c in codes)
        src = f'المركز الوطني للإحصاء والمعلومات — {title}'
        body = (f"{'**تعديل صامت على ملف منشور** (النسخة ' + str(top.get('v')) + ')' if updated else '**إصدار جديد**'} من المركز الوطني للإحصاء والمعلومات يخص {len(codes)} من مؤشرات التطبيق.\n\n"
                f"- **الإصدار:** {title}\n- **الملف:** {url}\n" + (f"- **نسخة مؤرشفة:** {arch}\n" if arch else '') +
                f"- **تاريخ الرفع:** {(top.get('uploaded') or '')[:10]}\n\n"
                f"| الرمز | المؤشر | آخر قراءة في التطبيق |\n|---|---|---|\n{rows}\n\n"
                "**للاعتماد:** راجع الأرقام في الإصدار، ثم اكتب تعليقاً لكل قراءة بالصيغة:\n"
                "`/اعتماد الرمز السنة القيمة` — مثل: `/اعتماد U-31 2026 3.0`\n"
                "يمكن كتابة عدة أسطر في تعليق واحد. يُسجَّل هذا الإصدار مصدراً للقراءة تلقائياً، ثم يُحدَّث التطبيق والإكسل.\n"
                "إذا لم يتضمن الإصدار جديداً للمؤشرات، أغلق التنبيه.\n\n"
                + marker('ncsi', key, {'src': src, 'url': url, 'codes': codes}))
        out.append({'title': f"{'تعديل على ملف' if updated else 'إصدار جديد'} من المركز: {title} — يخص {len(codes)} مؤشر" + ('اً' if len(codes) > 2 else ''),
                     'body': body, 'labels': [LABEL_ALERT], 'key': key})
    state['ncsi_seen'] = sorted(seen)
    return out


# ---------------------------------------------------------------- 2) البنك الدولي
def wb_series(ind, source):
    url = f'https://api.worldbank.org/v2/country/OMN/indicator/{ind}?source={source}&format=json&per_page=80'
    res = http_json(url)
    rows = res[1] if isinstance(res, list) and len(res) > 1 and res[1] else []
    return {int(r['date']): r['value'] for r in rows if r.get('value') is not None and str(r.get('date', '')).isdigit()}, url


def worldbank_requests(cfg, data, state, fetch=wb_series):
    out = []
    done = set(state.setdefault('wb_done', []))
    for m in cfg['worldbank']:
        code = m['code']; i = data.ind.get(code)
        if not i: continue
        try:
            series, url = fetch(m['indicator'], m.get('source', 2))
        except Exception as e:
            print(f'  worldbank {m["indicator"]}: تعذر الجلب ({e})'); continue
        if not series: continue
        have = data.read.get(code, {})
        props = []
        for y in sorted(series):
            v = round(float(series[y]), 4)
            old = have.get(y)
            if old is None or old[2] is None:
                if y >= (data.last(code)[0] or 0): props.append({'year': y, 'v': v, 'old': None})
            elif abs(old[2] - v) > 0.0006 * max(1, abs(v)):
                props.append({'year': y, 'v': v, 'old': old[2]})
        if not props: continue
        key = f"wb:{code}:" + ','.join(f"{p['year']}={p['v']}" for p in props)
        if key in done: continue
        done.add(key)
        src = f"{m['label']} — واجهة بيانات البنك الدولي ({m['indicator']})"
        rows = '\n'.join(f"| {p['year']} | {fmt(i, p['old'])} | **{fmt(i, p['v'])}** |" for p in props)
        body = (f"**طلب تحديث** للمؤشر **{code} — {i['name']}** من بيانات الجهة المُصدِرة مباشرة.\n\n"
                f"| السنة | القيمة في التطبيق | القيمة لدى البنك الدولي |\n|---|---|---|\n{rows}\n\n"
                f"- **المصدر:** {src}\n- **رابط البيانات:** {url.replace('format=json&', '')}\n\n"
                "**للاعتماد:** اكتب تعليقاً: `/اعتماد` — فتُضاف القيم أعلاه إلى التطبيق ويُعاد بناء الإكسل وتسجيل التغيير.\n"
                "لاعتماد سنة واحدة فقط: `/اعتماد " + code + " السنة القيمة`. للرفض: أغلق الطلب.\n\n"
                + marker('worldbank', key, {'src': src, 'url': url, 'codes': [code],
                                            'proposals': [{'code': code, 'year': p['year'], 'v': p['v']} for p in props]}))
        out.append({'title': f"طلب تحديث: {code} {i['name']} ({', '.join(str(p['year']) for p in props)})",
                    'body': body, 'labels': [LABEL_REQ], 'key': key})
    state['wb_done'] = sorted(done)
    return out


# ---------------------------------------------------------------- 3) تقويم الإصدارات
def due_requests(cfg, data, state, today):
    out = []
    done = set(state.setdefault('due_done', []))
    wb_codes = {m['code'] for m in cfg['worldbank']}
    for code, i in data.ind.items():
        if i.get('type') not in cfg['release_calendar']['types'] or code in wb_codes: continue
        if i.get('dup') or i.get('active') == 'لا': continue
        due = (i.get('rel_due') or '').strip()
        if not re.fullmatch(r'\d{4}-\d{2}(-\d{2})?', due): continue
        due_d = datetime.date.fromisoformat(due if len(due) == 10 else due + '-01')
        if due_d > today: continue
        key = f'due:{code}:{due}'
        if key in done: continue
        done.add(key)
        body = (f"**حلّ موعد إصدار** المؤشر **{code} — {i['name']}**.\n\n"
                f"- **الجهة المُصدِرة:** {i.get('issuer') or '—'}\n- **الإصدار المنتظر:** {i.get('rel_next') or '—'} (الموعد {due})\n"
                f"- **موقع الجهة:** {i.get('rel_src') or '—'}\n- **آخر قراءة في التطبيق:** {data.cur_txt(code)}\n\n"
                "تحقق من موقع الجهة المُصدِرة. إذا صدر الإصدار الجديد، اكتب تعليقاً:\n"
                f"`/اعتماد {code} السنة القيمة` — ويمكن إضافة الترتيب بعد القيمة.\n"
                "ثم حدّث موعد الإصدار القادم لاحقاً من صفحة الإدارة. إذا لم يصدر بعد، اترك التنبيه مفتوحاً.\n\n"
                + marker('due', key, {'src': f"{i.get('issuer') or ''} — {i.get('rel_next') or ''}".strip(' —'), 'url': i.get('rel_src'), 'codes': [code]}))
        out.append({'title': f"موعد إصدار: {code} {i['name']}", 'body': body, 'labels': [LABEL_ALERT], 'key': key})
    state['due_done'] = sorted(done)
    return out


# ---------------------------------------------------------------- GitHub
def ensure_labels(repo, token):
    have = {l['name'] for l in http_json(f'https://api.github.com/repos/{repo}/labels?per_page=100', token)}
    for name, (color, desc) in LABELS.items():
        if name not in have:
            http_json(f'https://api.github.com/repos/{repo}/labels', token, 'POST', {'name': name, 'color': color, 'description': desc})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--baseline', action='store_true')
    ap.add_argument('--publications'); ap.add_argument('--today')
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, 'config', 'indicator_sources.json'), encoding='utf-8'))
    data = Data(json.load(open(os.path.join(ROOT, 'data', 'dataset.json'), encoding='utf-8')))
    state = json.load(open(STATE, encoding='utf-8')) if os.path.exists(STATE) else {}
    baseline = a.baseline or not state.get('ncsi_seen')
    pubs = (json.load(open(a.publications, encoding='utf-8')) if a.publications else http_json(cfg['hub_publications']))['publications']
    today = datetime.date.fromisoformat(a.today) if a.today else datetime.date.today()
    reqs = ncsi_requests(cfg, data, pubs, state, baseline) + worldbank_requests(cfg, data, state) + due_requests(cfg, data, state, today)
    print(f'publications={len(pubs)} baseline={baseline} → {len(reqs)} طلب')
    for r in reqs: print(' •', r['labels'][0], '|', r['title'])
    if a.dry_run: return
    repo, token = os.environ.get('GITHUB_REPOSITORY'), os.environ.get('GITHUB_TOKEN')
    if reqs:
        ensure_labels(repo, token)
        for r in reqs[:20]:
            iss = http_json(f'https://api.github.com/repos/{repo}/issues', token, 'POST',
                            {'title': r['title'][:250], 'body': r['body'], 'labels': r['labels']})
            print('  opened', iss.get('html_url'))
    state['last_run'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    json.dump(state, open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
