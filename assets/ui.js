/* SECTION: ui-shell */
'use strict';
const UI = {};
const VIEWS = [
  { id: 'dash', name: '成本总览', icon: '◲', sub: '按 1 箱口径展示计划成本构成' },
  { id: 'product', name: '产品主数据', icon: '▤', sub: '产品编码、规格、箱规与制造/加工/运费' },
  { id: 'material', name: '材料价格维护', icon: '☘', sub: '原料与包材两个子页，单价与采购确认状态' },
  { id: 'bom', name: 'BOM 维护', icon: '⚙', sub: '多产品查询，以 1 箱用量维护原料与包材、损耗率' },
  { id: 'flow', name: '备份与审计', icon: '⇄', sub: '导入导出、JSON 备份恢复、操作审计日志' }
];
UI.view = 'dash';
UI.matTab = 'raw';   // 材料价格维护当前子页（raw/pack）
UI.bomSel = '';       // BOM 下拉当前选中产品编码
UI.bomKw = '';        // BOM 产品搜索词
UI.flowTab = 'flow';  // 备份与审计当前子页（flow/audit）
UI.keyword = '';

function navRender() {
  $('#nav').innerHTML = VIEWS.map(v =>
    '<button data-view="' + v.id + '" class="' + (v.id === UI.view ? 'on' : '') + '"><span class="ic">' + v.icon + '</span>' + v.name + '</button>').join('');
  $$('#nav button').forEach(b => b.onclick = () => UI.go(b.dataset.view));
}
UI.go = function (id) {
  UI.view = id; keywordReset(); render();
  const v = VIEWS.find(x => x.id === id);
  $('#pgTitle').textContent = v.name;
  $('#pgSub').textContent = v.sub;
};
function keywordReset() { UI.keyword = ''; }

/* SECTION: toast */
APP.toast = function (msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 2600);
};

/* SECTION: modal */
UI.modal = function (title, bodyHtml, footBtns, wide) {
  $('#mTitle').textContent = title;
  $('#mBody').innerHTML = bodyHtml;
  $('#modal').classList.toggle('wide', !!wide);
  $('#mFoot').innerHTML = footBtns.map((b, i) => '<button class="btn ' + (b.ghost ? 'gh' : '') + (b.danger ? ' danger' : '') + '" data-fi="' + i + '">' + esc(b.text) + '</button>').join('');
  $$('#mFoot button').forEach(btn => btn.onclick = () => {
    const b = footBtns[+btn.dataset.fi];
    if (!b.action || b.action() !== false) UI.closeModal();
  });
  $('#mask').classList.add('on');
};
UI.closeModal = function () { $('#mask').classList.remove('on'); };
$('#mask').addEventListener('click', e => { if (e.target.id === 'mask') UI.closeModal(); });
$('[data-m-close]').onclick = UI.closeModal;

/* SECTION: form helper */
function formHtml(fields, rec) {
  return '<div class="grid2">' + fields.map(f => {
    const v = rec[f.k] == null ? '' : rec[f.k];
    const t = f.type === 'bool'
      ? '<select data-f="' + f.k + '"><option value="1"' + (v ? ' selected' : '') + '>是</option><option value="0"' + (!v ? ' selected' : '') + '>否</option></select>'
      : '<input class="input" data-f="' + f.k + '" type="' + (f.type === 'num' || f.type === 'price' ? 'number' : 'text') + '" step="any" value="' + esc(v) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + '>';
    return '<div class="field"><label>' + esc(f.label) + (f.req ? ' *' : '') + '</label>' + t +
      '<div class="hint">' + esc(f.hint || '') + '</div></div>';
  }).join('') + '</div>';
}
function readForm(fields) {
  const out = {}, errs = [];
  fields.forEach(f => {
    const el = $('[data-f="' + f.k + '"]', $('#mBody'));
    let v = el.value;
    if (f.type === 'bool') v = v === '1';
    else if (f.type === 'num' || f.type === 'price') {
      if (String(v).trim() === '') { v = null; }
      else { v = n(v); if (isNaN(v)) { errs.push(f.label + ' 必须为数字'); v = null; } }
    } else v = clampStr(v);
    if (f.req && (v === '' || v == null)) errs.push(f.label + ' 不能为空');
    out[f.k] = v;
  });
  return { out: out, errs: errs };
}

/* SECTION: render-router */
function render() {
  navRender();
  const v = $('#view');
  if (UI.view === 'dash') dash(v);
  else if (UI.view === 'product') productView(v);
  else if (UI.view === 'material') materialView(v);
  else if (UI.view === 'bom') bomView(v);
  else flowView(v);
}

/* SECTION: view-dash (REQ-006) */
const CAT = { raw: '#2f54c9', pack: '#7c5cc6', overhead: '#d98324', processing: '#0f9d78', freight: '#d94a4a' };
function dash(host) {
  const list = APP.allCost();
  const stale = countStale();
  const avg = list.length ? list.reduce((s, c) => s + c.total, 0) / list.length : 0;
  const top = list.slice().sort((a, b) => b.total - a.total)[0];
  host.innerHTML =
    '<div class="kpis">' +
    kpi('产品数', list.length, '已维护主数据') +
    kpi('平均每箱计划成本', '¥' + fmt(avg), '含材料与三项费用') +
    kpi('最高成本产品', top ? top.p.name : '—', top ? '¥' + fmt(top.total) + ' /箱' : '') +
    kpi('价格超 30 天未更新', stale.n, stale.n ? '<span class="badge warn">建议发起采购确认</span>' : '<span class="badge ok">价格均为近期</span>') +
    '</div>' +
    '<div class="card"><h3>成本构成图例<span class="tag">悬停表格行查看构成</span></h3><div class="lg">' +
    ['原料费', '包材费', '分摊制造费', '加工费', '分摊运费'].map((t, i) => '<span><i style="background:' + [CAT.raw, CAT.pack, CAT.overhead, CAT.processing, CAT.freight][i] + '"></i>' + t + '</span>').join('') +
    '</div></div>' +
    '<div class="card"><h3>计划成本明细（1 箱口径）' +
    '<span class="row grow" style="justify-content:flex-end"><input class="input" id="dashKw" placeholder="搜索产品编码/名称" style="max-width:200px" value="' + esc(UI.keyword) + '"><button class="btn sm" data-x="exportCost">导出成本表</button></span></h3>' +
    costTable(list) + '</div>' +
    '<div class="note blue">制造费、加工费、运费取自产品主数据固定值；第二阶段将接入推导接口 <code>deriveOverhead()</code>（已在成本引擎预留，当前不覆盖固定值）。</div>';
  bindDash();
}
function kpi(lb, v, s) { return '<div class="kpi"><div class="lb">' + lb + '</div><div class="v">' + v + '</div><div class="s">' + (s || '') + '</div></div>'; }
function countStale() {
  let n = 0, names = [];
  APP.state.raw.concat(APP.state.pack).forEach(m => {
    const d = m.date ? new Date(m.date) : null;
    if (!d || (Date.now() - d.getTime()) / 86400000 > 30) { n++; names.push(m.name); }
  });
  return { n: n, names: names };
}
function costTable(list) {
  const kw = UI.keyword.trim().toLowerCase();
  const rows = list.filter(c => !kw || (c.p.code + c.p.name + (c.p.spec || '')).toLowerCase().includes(kw));
  if (!rows.length) return '<div class="empty"><b>暂无产品</b>请先在「产品主数据」新增或导入产品。</div>';
  return '<div class="tblwrap"><table><thead><tr>' +
    ['产品', '规格', '原料费', '包材费', '材料费', '制造费', '加工费', '运费', '每箱成本', '单袋成本', '每箱构成'].map(t => '<th>' + t + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map(c => {
      const tot = c.total || 1;
      const seg = (v, col) => '<i style="width:' + (Math.max(0, v) / tot * 100).toFixed(2) + '%;background:' + col + '" title="' + fmt(v) + ' 元"></i>';
      return '<tr><td><b>' + esc(c.p.name) + '</b><div class="mut mono">' + esc(c.p.code) + (c.noBom ? ' <span class="badge bad">未维护BOM</span>' : '') + (c.dynSource ? ' <span class="badge pri">推导值</span>' : '') + '</div></td>' +
        '<td class="mut">' + esc(c.p.spec || '—') + '</td>' +
        '<td class="num">' + fmt(c.rawFee) + '</td><td class="num">' + fmt(c.packFee) + '</td><td class="num"><b>' + fmt(c.material) + '</b></td>' +
        '<td class="num">' + fmt(c.overhead) + '</td><td class="num">' + fmt(c.processing) + '</td><td class="num">' + fmt(c.freight) + '</td>' +
        '<td class="num"><b style="color:var(--pri-d)">' + fmt(c.total) + '</b></td>' +
        '<td class="num">' + (isNaN(c.perBag) ? '—' : fmt(c.perBag, 4)) + '</td>' +
        '<td><div class="bar">' + seg(c.rawFee, CAT.raw) + seg(c.packFee, CAT.pack) + seg(c.overhead, CAT.overhead) + seg(c.processing, CAT.processing) + seg(c.freight, CAT.freight) + '</div></td></tr>';
    }).join('') + '</tbody></table></div>';
}
function bindDash() {
  const kw = $('#dashKw');
  if (kw) kw.oninput = () => {
    UI.keyword = kw.value;
    const t = $('#view .tblwrap'); if (t) t.outerHTML = costTable(APP.allCost());
    bindX();
  };
  bindX();
}

/* SECTION: view-product (REQ-001, 分组折叠展示) */
UI.collapsed = {};   // key: series/sub → true 表示折叠
function prodGroups(list) {
  const kw = UI.keyword.trim().toLowerCase();
  const hit = p => !kw || [p.code, p.name, p.series, p.sub, p.spec].some(x => String(x || '').toLowerCase().includes(kw));
  const groups = {};
  list.forEach(p => {
    const key = (p.series || '未分组') + '/' + (p.sub || '未分类');
    (groups[key] = groups[key] || { series: p.series || '未分组', sub: p.sub || '未分类', items: [], hit: false });
    groups[key].items.push(p);
    if (hit(p)) groups[key].hit = true;
  });
  return Object.keys(groups).sort().map(k => groups[k]).filter(g => g.hit);
}
function productView(host) {
  const list = APP.state.products;
  host.innerHTML = '<div class="card"><h3>产品主数据<span class="tag">共 ' + list.length + ' 条 · 按 产品系列 / 子分类 分组 · 点击分组行折叠</span>' +
    '<span class="row grow" style="justify-content:flex-end"><input class="input" id="kwP" placeholder="搜索编码/名称/系列/子分类/规格" style="max-width:250px"><button class="btn sm" data-x="tpl:product">导入模板</button><button class="btn sm" data-x="imp:product">导入</button><button class="btn sm gh" data-x="exp:product">导出</button><button class="btn sm" data-x="add:product">＋ 新增产品</button></span></h3>' +
    prodTable(list) + '</div>';
  const kw = $('#kwP');
  kw.oninput = () => {
    UI.keyword = kw.value;
    $('#view .tblwrap').outerHTML = prodTable(APP.state.products);
    bindGroupToggles(); bindX();
  };
  bindGroupToggles();
  bindX();
}
function prodTable(list) {
  const groups = prodGroups(list);
  if (!groups.length) return '<div class="empty"><b>没有匹配的产品</b>可调整搜索词，或点击右上角「＋ 新增产品」。</div>';
  const cols = 9;
  let html = '<div class="tblwrap"><table><thead><tr><th>产品编码</th><th>产品名称</th><th>规格型号</th><th class="num">箱规</th><th class="num">单袋克重(g)</th><th class="num">分摊制造费</th><th class="num">加工费</th><th class="num">分摊运费</th><th>操作</th></tr></thead><tbody>';
  groups.forEach(g => {
    const key = g.series + '/' + g.sub;
    const closed = !!UI.collapsed[key];
    html += '<tr class="grp" data-grp="' + esc(key) + '"><td colspan="' + cols + '"><span class="arw">' + (closed ? '▸' : '▾') + '</span>' +
      esc(g.series) + ' / ' + esc(g.sub) + '<b class="cnt">（' + g.items.length + ' 项）</b></td></tr>';
    if (closed) return;
    html += g.items.map(p => '<tr data-code="' + esc(p.code) + '"><td class="mono"><b>' + esc(p.code) + '</b></td><td>' + esc(p.name) + '</td><td class="mut">' + esc(p.spec || '—') + '</td>' +
      '<td class="num">' + (p.caseSize == null ? '—' : fmt(p.caseSize, 0)) + '</td><td class="num">' + (p.bagWeight == null ? '—' : fmt(p.bagWeight)) + '</td>' +
      '<td class="num">' + fmt(p.overhead) + '</td><td class="num">' + fmt(p.processing) + '</td><td class="num">' + fmt(p.freight) + '</td>' +
      '<td class="row"><button class="btn gh sm" data-act="editP">编辑</button><button class="btn gh sm" data-act="bomP">维护BOM</button><button class="btn danger sm" data-act="delP">删除</button></td></tr>').join('');
  });
  return html + '</tbody></table></div>';
}
function bindGroupToggles() {
  $$('tr.grp', $('#view')).forEach(tr => tr.onclick = () => {
    const k = tr.dataset.grp;
    UI.collapsed[k] = !UI.collapsed[k];
    $('#view .tblwrap').outerHTML = prodTable(APP.state.products);
    bindGroupToggles(); bindX();
  });
}
function productForm(rec, isNew) {
  const F = [
    { k: 'code', label: '产品编码', req: true, hint: '导入/更新按此编码匹配' },
    { k: 'name', label: '产品名称', req: true },
    { k: 'spec', label: '规格型号', hint: '如 500g×30袋' },
    { k: 'series', label: '产品系列', hint: '用于分组展示' },
    { k: 'sub', label: '子分类', hint: '用于分组展示' },
    { k: 'caseSize', label: '箱规(袋/箱)', type: 'num' },
    { k: 'bagWeight', label: '单袋克重(g)', type: 'num' },
    { k: 'overhead', label: '分摊制造费(元/箱)', type: 'num', hint: '每月分摊固定值' },
    { k: 'processing', label: '加工费(元/箱)', type: 'num', hint: '以箱为单位' },
    { k: 'freight', label: '分摊运费(元/箱)', type: 'num' }
  ];
  const body = '<div id="deriveBar" class="row" style="margin-bottom:10px"><button class="btn gh sm" data-x="derive">从规格型号推导箱规与单袋克重</button><span class="mut" id="deriveMsg"></span></div>' + formHtml(F, rec);
  UI.modal(isNew ? '新增产品' : '编辑产品', body, [
    { text: '保存', action: () => {
        const r = readForm(F);
        if (r.errs.length) { UI.toast(r.errs[0], 'bad'); return false; }
        if (isNew && APP.findProduct(r.out.code)) { UI.toast('产品编码 ' + r.out.code + ' 已存在', 'bad'); return false; }
        if (isNew) { APP.state.products.push(r.out); } else { Object.assign(rec, r.out); }
        APP.audit(isNew ? 'create' : 'update', '产品 ' + r.out.code, isNew ? '新增产品：' + r.out.name : '修改产品信息');
        APP.save(); render(); UI.toast('已保存产品 ' + r.out.code, 'ok');
      } },
    { text: '取消', ghost: true }
  ]);
  bindModalX();
}
// 弹窗内「从规格推导」按钮：读当前弹窗表单的规格值
function bindModalX() {
  const btn = $('[data-x="derive"]', $('#mBody'));
  if (btn) btn.onclick = () => {
    const spec = $('[data-f="spec"]', $('#mBody')).value;
    const d = APP.parseSpec(spec);
    const msg = $('#deriveMsg');
    if (isNaN(d.caseSize) && isNaN(d.bagWeight)) { msg.textContent = '未能从「' + spec + '」推导，请检查写法（如 500g×30袋）。'; return; }
    if (!isNaN(d.caseSize)) $('[data-f="caseSize"]', $('#mBody')).value = d.caseSize;
    if (!isNaN(d.bagWeight)) $('[data-f="bagWeight"]', $('#mBody')).value = d.bagWeight;
    msg.textContent = '已推导：' + (isNaN(d.caseSize) ? '箱规未识别' : '箱规 ' + d.caseSize + ' 袋/箱') + '、' + (isNaN(d.bagWeight) ? '克重未识别' : '单袋 ' + d.bagWeight + ' g');
  };
}

/* SECTION: view-material (REQ-002 / REQ-008, 原料/包材合并为一个菜单) */
function materialView(host) {
  const kind = UI.matTab === 'pack' ? 'pack' : 'raw';
  const list = APP.matOf(kind);
  const stale = list.filter(m => { const d = m.date ? new Date(m.date) : null; return !d || (Date.now() - d.getTime()) / 86400000 > 30; }).length;
  const unconf = list.filter(m => !m.confirmed).length;
  host.innerHTML =
    '<div class="row" style="margin-bottom:14px"><div class="seg">' +
    '<button data-mt="raw" class="' + (kind === 'raw' ? 'on' : '') + '">原料价格（' + APP.state.raw.length + '）</button>' +
    '<button data-mt="pack" class="' + (kind === 'pack' ? 'on' : '') + '">包材价格（' + APP.state.pack.length + '）</button></div>' +
    '<span class="badge' + (stale ? ' warn' : ' ok') + '">超 30 天未更新 ' + stale + ' 项</span>' +
    '<span class="badge' + (unconf ? ' warn' : ' ok') + '">待采购确认 ' + unconf + ' 项</span></div>' +
    '<div class="note" style="margin-bottom:14px">价格确认流程：先「导出采购确认表」发给采购 → 采购在"采购确认价"列填写最新市价 → 回到「备份与审计」重新导入，成本即时重算。</div>' +
    '<div class="card"><h3>' + (kind === 'raw' ? '原料' : '包材') + '价格<span class="tag">共 ' + list.length + ' 条</span>' +
    '<span class="row grow" style="justify-content:flex-end"><input class="input" id="kwM" placeholder="搜索编码/名称" style="max-width:190px"><button class="btn sm" data-x="tpl:' + kind + '">导入模板</button><button class="btn sm" data-x="imp:' + kind + '">导入</button><button class="btn sm gh" data-x="exp:' + kind + '">导出</button><button class="btn sm gh" data-x="expConfirm:' + kind + '">导出采购确认表</button><button class="btn sm" data-x="add:' + kind + '">＋ 新增物料</button></span></h3>' +
    matTable(kind) + '</div>';
  $$('[data-mt]').forEach(b => b.onclick = () => { UI.matTab = b.dataset.mt; keywordReset(); render(); });
  const kw = $('#kwM');
  if (kw) kw.oninput = () => {
    UI.keyword = kw.value;
    $('#view .tblwrap').outerHTML = matTable(kind);
    bindX();
  };
  bindX();
}
function matTable(kind) {
  const list = APP.matOf(kind);
  const kw = UI.keyword.trim().toLowerCase();
  const rows = list.filter(m => !kw || (m.code + m.name + (m.spec || '')).toLowerCase().includes(kw));
  if (!rows.length) return '<div class="empty"><b>没有匹配物料</b>可点击「＋ 新增物料」或使用模板导入。</div>';
  return '<div class="tblwrap"><table><thead><tr><th>物料编码</th><th>物料名称</th><th>规格型号</th><th>主单位</th><th class="num">单价(元)</th><th>价格采集日</th><th>采购确认</th><th>用于</th><th>操作</th></tr></thead><tbody>' +
    rows.map(m => {
      const d = m.date ? new Date(m.date) : null;
      const old = !d || (Date.now() - d.getTime()) / 86400000 > 30;
      const use = usedIn(m.code, kind);
      return '<tr data-code="' + esc(m.code) + '"><td class="mono"><b>' + esc(m.code) + '</b></td><td>' + esc(m.name) + '</td><td class="mut">' + esc(m.spec || '—') + '</td><td>' + esc(m.unit || '—') + '</td>' +
        '<td class="num"><b>' + fmt(m.price) + '</b></td><td class="mut' + (old ? '" style="color:var(--warn)' : '') + '">' + esc(m.date || '—') + '</td>' +
        '<td>' + (m.confirmed ? '<span class="badge ok">已确认</span>' : '<span class="badge warn">待确认</span>') + '</td>' +
        '<td class="mut">' + (use.length ? use.join('、') : '<span class="badge">未引用</span>') + '</td>' +
        '<td class="row"><button class="btn gh sm" data-act="editM">编辑</button><button class="btn gh sm" data-act="confM">' + (m.confirmed ? '取消确认' : '标记确认') + '</button><button class="btn danger sm" data-act="delM">删除</button></td></tr>';
    }).join('') + '</tbody></table></div>';
}
function usedIn(code, kind) {
  const t = kind === 'pack' ? 'pack' : 'raw';
  const set = [];
  APP.state.bom.filter(b => b.matCode === code && b.matType === t).forEach(b => {
    const p = APP.findProduct(b.productCode);
    if (p && !set.includes(p.name)) set.push(p.name);
  });
  return set;
}
function matForm(kind, rec, isNew) {
  const F = [
    { k: 'code', label: '物料编码', req: true, hint: '导入/更新按此编码匹配' },
    { k: 'name', label: '物料名称', req: true },
    { k: 'spec', label: '规格型号' },
    { k: 'unit', label: '主单位', ph: 'kg / 个 / 张' },
    { k: 'price', label: '单价(元)', type: 'price', req: true },
    { k: 'date', label: '价格采集日期', type: 'text', ph: 'YYYY-MM-DD' },
    { k: 'confirmed', label: '采购已确认', type: 'bool' }
  ];
  UI.modal((isNew ? '新增' : '编辑') + (kind === 'raw' ? '原料' : '包材'), formHtml(F, rec), [
    { text: '保存', action: () => {
        const r = readForm(F);
        if (r.errs.length) { UI.toast(r.errs[0], 'bad'); return false; }
        if (isNew && APP.findMat(r.out.code, kind)) { UI.toast('物料编码已存在：' + r.out.code, 'bad'); return false; }
        if (!r.out.date) r.out.date = today();
        if (isNew) APP.matOf(kind).push(r.out); else Object.assign(rec, r.out);
        APP.audit(isNew ? 'create' : 'update', '物料 ' + r.out.code, (isNew ? '新增' : '修改') + (kind === 'raw' ? '原料' : '包材') + '，单价 ' + r.out.price);
        APP.save(); render(); UI.toast('已保存 ' + r.out.code, 'ok');
      } },
    { text: '取消', ghost: true }
  ]);
}

/* SECTION: view-bom (REQ-003 默认全部 BOM + 搜索筛选 + 下拉选产品维护) */
function bomMatch(ps) {
  const kw = UI.bomKw.trim().toLowerCase();
  if (!kw) return ps;
  return ps.filter(p => [p.code, p.name, p.series, p.sub, p.spec].some(x => String(x || '').toLowerCase().includes(kw)));
}
function bomOptHtml(cs) {
  return cs.length ? cs.map(p => '<option value="' + esc(p.code) + '">' + esc(p.code + ' · ' + p.name + (p.series ? ' · ' + p.series + '/' + (p.sub || '未分类') : '')) + '</option>').join('') : '<option value="">（无匹配产品）</option>';
}
function bomCardHtml(c) {
  const hasMissing = c.lines.some(l => l.missing);
  return '<div class="card" data-bomcard="' + esc(c.p.code) + '"><h3><span class="' + (hasMissing ? 'redc mono' : 'mono') + '">' + esc(c.p.code) + '</span> ' + esc(c.p.name) +
    '<span class="tag">' + esc((c.p.series || '未分组') + '/' + (c.p.sub || '未分类') + ' · ' + (c.p.spec || '—')) + (hasMissing ? ' <span class="badge bad">存在缺失物料，编码已标红</span>' : '') + '</span></h3>' +
    '<div class="row" style="margin-bottom:12px"><span class="badge pri">箱规 ' + (c.p.caseSize || '—') + ' 袋/箱</span><span class="badge">单袋 ' + (c.p.bagWeight || '—') + ' g</span>' +
    '<span class="badge">原料费 ¥' + fmt(c.rawFee) + '</span><span class="badge">包材费 ¥' + fmt(c.packFee) + '</span>' +
    '<span class="badge">每箱成本 ¥' + fmt(c.total) + '</span></div>' +
    bomTable(c) + costBar(c) + '</div>';
}
function bomAllHtml(cand) {
  if (!cand.length) return '<div class="card"><div class="empty"><b>没有匹配的产品</b>请调整搜索词。</div></div>';
  return cand.map(p => bomCardHtml(APP.cost(p))).join('');
}
function bomView(host) {
  const ps = APP.state.products;
  if (!ps.length) { host.innerHTML = '<div class="card"><div class="empty"><b>还没有产品</b>请先在「产品主数据」新增或导入产品，再维护 BOM。</div></div>'; bindX(); return; }
  const cand = bomMatch(ps);
  if (!cand.some(p => p.code === UI.bomSel)) UI.bomSel = cand.length ? cand[0].code : '';
  host.innerHTML =
    '<div class="card"><h3>BOM 维护<span class="tag">默认展示全部产品 BOM · 以 1 箱用量为基准</span></h3>' +
    '<div class="row" style="margin-bottom:10px">' +
    '<input class="input" id="bomKw" placeholder="搜索产品编码/名称/系列/子分类/规格" style="max-width:280px" value="' + esc(UI.bomKw) + '">' +
    '<select id="bomSel" style="max-width:320px">' + bomOptHtml(cand) + '</select>' +
    '<button class="btn sm" data-x="addBom:raw"' + (UI.bomSel ? '' : ' disabled') + '>＋ 添加原料</button>' +
    '<button class="btn sm" data-x="addBom:pack"' + (UI.bomSel ? '' : ' disabled') + '>＋ 添加包材</button></div>' +
    '<p class="mut" style="margin-top:2px;font-size:12.5px">搜索框输入即筛选下方 BOM 数据（按产品编码 / 名称 / 产品系列 / 子分类 / 规格型号模糊匹配）；下拉菜单选择产品后，「添加原料 / 添加包材」将作用于该产品（下拉选项同样跟随搜索结果）。</p></div>' +
    '<div id="bomList">' + bomAllHtml(cand) + '</div>' +
    '<div class="card"><h3>BOM 导入导出</h3><div class="row"><button class="btn sm gh" data-x="tpl:bom">BOM导入模板</button><button class="btn sm gh" data-x="imp:bom">导入BOM</button><button class="btn sm gh" data-x="exp:bom">导出全产品BOM</button>' +
    '<span class="mut" style="font-size:12.5px">模板仅需填 <b>产品编码 / 物料编码 / 单箱用量</b>（损耗率选填），名称、单位、单价等自动从产品主数据与材料价格引入；物料编码在原料和包材中查不到时，导入报告会提示并把该产品编码与物料编码标红。</span></div><div id="impRep"></div></div>';
  const kw = $('#bomKw');
  const refresh = () => {
    const c2 = bomMatch(APP.state.products);
    if (!c2.some(p => p.code === UI.bomSel)) UI.bomSel = c2.length ? c2[0].code : '';
    $('#bomSel').innerHTML = bomOptHtml(c2);
    $('#bomSel').value = UI.bomSel || '';
    $('#bomList').innerHTML = bomAllHtml(c2);
    $$('[data-x="addBom:raw"],[data-x="addBom:pack"]').forEach(b => { b.disabled = !UI.bomSel; });
    bindX();
  };
  kw.oninput = () => { UI.bomKw = kw.value; refresh(); };
  $('#bomSel').onchange = e => {
    UI.bomSel = e.target.value;
    $$('[data-x="addBom:raw"],[data-x="addBom:pack"]').forEach(b => { b.disabled = !UI.bomSel; });
  };
  bindX();
}
function bomTable(c) {
  if (!c.lines.length) return '<div class="empty"><b>该产品还没有 BOM 行</b>在上方选中该产品后点「＋ 添加原料 / ＋ 添加包材」。</div>';
  const g = t => c.lines.filter(l => (l.b.matType === 'pack' ? 'pack' : 'raw') === t);
  const sec = (title, lines) => {
    if (!lines.length) return '';
    return '<tr><td colspan="9" style="background:#f2f5fb;font-weight:700;color:var(--ink2)">' + title + ' · 小计 ¥' + fmt(lines.reduce((s, l) => s + l.fee, 0)) + '</td></tr>' +
      lines.map(l => {
        const m = l.m || {};
        const red = l.missing ? ' redc' : '';
        return '<tr><td class="mono' + red + '">' + esc(c.p.code) + '</td><td class="mono' + red + '"><b>' + esc(l.b.matCode) + '</b></td><td>' + esc(m.name || '（物料缺失）') + '</td><td>' + esc(m.unit || '—') + '</td>' +
          '<td class="num">' + (l.missing ? '—' : fmt(l.price)) + '</td><td class="num"><input class="input" style="width:92px;text-align:right" data-q="' + esc(l.b.id) + '" value="' + esc(l.b.qty) + '"></td>' +
          '<td class="num"><input class="input" style="width:80px;text-align:right" data-l="' + esc(l.b.id) + '" value="' + esc(l.b.loss) + '"></td>' +
          '<td class="num">' + (l.missing ? '<b class="redc">—</b>' : '<b>' + fmt(l.fee) + '</b>') + '</td>' +
          '<td class="row" style="justify-content:flex-end">' + (l.missing ? '<span class="badge bad">无对应物料</span>' : '') + '<button class="btn danger sm" data-act="delBom" data-id="' + esc(l.b.id) + '">删除</button></td></tr>';
      }).join('');
  };
  return '<div class="tblwrap"><table><thead><tr><th>产品编码</th><th>物料编码</th><th>物料名称</th><th>主单位</th><th class="num">当前单价</th><th class="num">单箱用量</th><th class="num">损耗率%</th><th class="num">单箱金额</th><th>操作</th></tr></thead><tbody>' +
    sec('原料', g('raw')) + sec('包材', g('pack')) +
    '<tr class="total-row"><td colspan="7">材料费合计（原料+包材，缺失物料不计入）</td><td class="num">¥' + fmt(c.material) + '</td><td></td></tr></tbody></table></div>';
}
function costBar(c) {
  const items = [['原料费', c.rawFee, CAT.raw], ['包材费', c.packFee, CAT.pack], ['分摊制造费', c.overhead, CAT.overhead], ['加工费', c.processing, CAT.processing], ['分摊运费', c.freight, CAT.freight]];
  const tot = c.total || 1;
  return '<div class="bar" style="height:14px">' + items.map(it => '<i style="width:' + (Math.max(0, it[1]) / tot * 100).toFixed(2) + '%;background:' + it[2] + '" title="' + it[0] + ' ¥' + fmt(it[1]) + '"></i>').join('') + '</div>' +
    '<div class="lg">' + items.map(it => '<span><i style="background:' + it[2] + '"></i>' + it[0] + ' ¥' + fmt(it[1]) + '（' + (Math.max(0, it[1]) / tot * 100).toFixed(1) + '%）</span>').join('') + '</div>' +
    '<div class="row" style="margin-top:12px"><span class="badge pri" style="font-size:13px">每箱计划成本 ¥' + fmt(c.total) + '</span>' +
    '<span class="badge">单袋 ¥' + (isNaN(c.perBag) ? '—' : fmt(c.perBag, 4)) + '</span>' +
    '<span class="badge">每公斤 ¥' + (isNaN(c.perKg) ? '—' : fmt(c.perKg)) + '</span></div>';
}
function bomAddForm(productCode, matType) {
  const list = APP.matOf(matType);
  if (!list.length) { UI.toast((matType === 'pack' ? '包材' : '原料') + '价格还没有数据，请先新增或导入', 'warn'); return; }
  const F = [
    { k: 'matCode', label: '选择物料', req: true, sel: list.map(m => ({ v: m.code, t: m.code + ' · ' + m.name + '（¥' + fmt(m.price) + '/' + (m.unit || '—') + '）' })) },
    { k: 'qty', label: '单箱用量', type: 'num', req: true, hint: '以产品 1 箱为基准' },
    { k: 'loss', label: '损耗率(%)', type: 'num', hint: '留空默认 0' }
  ];
  const body = '<div class="grid2">' + F.map(f => {
    const ctl = f.sel ? '<select data-f="' + f.k + '">' + f.sel.map(o => '<option value="' + esc(o.v) + '">' + esc(o.t) + '</option>').join('') + '</select>'
      : '<input class="input" data-f="' + f.k + '" type="number" step="any">';
    return '<div class="field"><label>' + f.label + (f.req ? ' *' : '') + '</label>' + ctl + '<div class="hint">' + esc(f.hint || '') + '</div></div>';
  }).join('') + '</div>';
  UI.modal('添加' + (matType === 'pack' ? '包材' : '原料') + '到 ' + productCode + ' 的 BOM', body, [
    { text: '添加', action: () => {
        const code = $('[data-f="matCode"]', $('#mBody')).value;
        const qty = n($('[data-f="qty"]', $('#mBody')).value);
        const lossRaw = $('[data-f="loss"]', $('#mBody')).value;
        const loss = String(lossRaw).trim() === '' ? 0 : n(lossRaw);
        if (isNaN(qty) || qty <= 0) { UI.toast('单箱用量必须为大于 0 的数字', 'bad'); return false; }
        if (isNaN(loss) || loss < 0) { UI.toast('损耗率不能为负数', 'bad'); return false; }
        if (APP.state.bom.some(b => b.productCode === productCode && b.matCode === code && b.matType === matType)) { UI.toast('该物料已在 BOM 中，可直接修改用量', 'warn'); return false; }
        APP.state.bom.push({ id: uid(), productCode: productCode, matType: matType, matCode: code, qty: qty, loss: loss });
        APP.audit('create', 'BOM ' + productCode, '添加' + (matType === 'pack' ? '包材' : '原料') + ' ' + code + '，用量 ' + qty + '，损耗 ' + loss + '%');
        APP.save(); render(); UI.toast('已添加 ' + code, 'ok');
      } },
    { text: '取消', ghost: true }
  ]);
}

/* SECTION: view-flow (备份与审计：导入导出 + JSON 备份恢复 + 操作审计) */
function flowView(host) {
  const tab = UI.flowTab;
  const segbar = '<div class="row" style="margin-bottom:14px"><div class="seg">' +
    '<button data-ft="flow" class="' + (tab === 'flow' ? 'on' : '') + '">导入导出与流程</button>' +
    '<button data-ft="backup" class="' + (tab === 'backup' ? 'on' : '') + '">数据备份与恢复</button>' +
    '<button data-ft="audit" class="' + (tab === 'audit' ? 'on' : '') + '">操作审计日志（' + (APP.state.audit || []).length + '）</button></div></div>';
  if (tab === 'audit') { host.innerHTML = segbar + auditCard(); bindX(); bindFlowTab(); return; }
  if (tab === 'backup') { host.innerHTML = segbar + backupCard(); bindX(); bindFlowTab(); return; }
  const st = countStale();
  host.innerHTML = segbar +
    '<div class="card"><h3>价格确认与成本刷新流程</h3><div class="steps">' +
    step(1, '导出原料/包材价格', '导出带"采购确认价"空列的价格表，发给采购同事。', '<button class="btn sm" data-x="expConfirm:raw">导出原料确认表</button> <button class="btn sm" data-x="expConfirm:pack">导出包材确认表</button>') +
    step(2, '采购确认市场价格', '采购在 Excel 中填写最新确认价与备注，保存后回传。', '<span class="mut">线下进行，本工具不连接外部系统</span>') +
    step(3, '重新导入更新', '导入文件按物料编码更新单价与日期；"采购确认价"列优先于"单价"列。', '<button class="btn sm" data-x="imp:raw">导入原料</button> <button class="btn sm" data-x="imp:pack">导入包材</button>') +
    step(4, '实时查看计划成本', '导入成功后成本引擎即时重算，切到「成本总览」即可看到最新每箱成本。', '<button class="btn sm gh" data-x="goDash">前往成本总览</button> <button class="btn sm gh" data-x="exportCost">导出成本表</button>') +
    '</div></div>' +
    '<div class="card"><h3>数据导入<span class="tag">按编码更新：编码已存在则更新，不存在则新增；每次导入都会记入审计日志</span></h3>' +
    '<div class="row" style="margin-bottom:12px">' +
    impBtn('product', '产品主数据') + impBtn('raw', '原料价格') + impBtn('pack', '包材价格') + impBtn('bom', '产品 BOM') + '</div>' +
    '<div class="row" style="margin-bottom:12px"><span class="mut">模板：</span>' + tplBtn('product') + tplBtn('raw') + tplBtn('pack') + tplBtn('bom') + '</div>' +
    '<div class="note">导入导出均为 .xlsx Excel 格式。产品模板不含"箱规/单袋克重"两列，导入时按规格型号自动推导；BOM 模板仅需填产品编码/物料编码/单箱用量，其余字段自动从产品与材料主数据引入，物料编码查无对应原料/包材时会标红提示。</div>' +
    '<div id="impRep"></div></div>' +
    '<div class="card"><h3>数据导出</h3><div class="row">' +
    '<button class="btn sm gh" data-x="exp:product">产品主数据</button><button class="btn sm gh" data-x="exp:raw">原料价格</button><button class="btn sm gh" data-x="exp:pack">包材价格</button><button class="btn sm gh" data-x="exp:bom">全部 BOM</button><button class="btn sm" data-x="exportCost">计划成本计算表</button></div>' +
    '<p class="mut" style="margin-top:10px;font-size:12.5px">导出均为标准 .xlsx Excel 工作簿，下载后可直接用 Excel / WPS 打开编辑，改完即可重新导入。</p></div>' +
    '<div class="card"><h3>维护与重置</h3><div class="row"><span class="badge' + (st.n ? ' warn">有 ' + st.n + ' 项价格超 30 天' : ' ok">价格均为近期') + '</span>' +
    '<button class="btn sm gh" data-x="goBackup">前往数据备份</button>' +
    '<button class="btn danger sm" data-x="resetAll">清除全部数据并恢复示例</button></div></div>';
  bindX(); bindFlowTab();
}
function bindFlowTab() {
  $$('[data-ft]').forEach(b => b.onclick = () => { UI.flowTab = b.dataset.ft; render(); });
}
function step(num, title, desc, act) { return '<div class="step"><div class="n">' + num + '</div><h4>' + title + '</h4><p>' + desc + '</p><div class="row">' + act + '</div></div>'; }
function impBtn(kind, label) { return '<button class="btn sm" data-x="imp:' + kind + '" data-kind="' + kind + '">导入' + label + '</button>'; }
function tplBtn(kind) { const t = APP.template(kind); return '<button class="btn gh sm" data-x="tpl:' + kind + '">' + t.name + '</button>'; }

/* SECTION: backup & restore (JSON, 跨设备迁移) */
function backupCard() {
  const st = APP.state;
  return '<div class="card"><h3>导出全部数据（JSON 备份）</h3>' +
    '<p class="mut" style="margin-bottom:12px">把产品主数据、原料/包材价格、BOM、审计日志与设置打包为一个 .json 文件。上传 GitHub 或其他电脑/平板部署本应用后，用「导入备份文件」即可整体恢复数据。</p>' +
    '<div class="row"><button class="btn" data-x="expBackup">导出全部数据（JSON）</button>' +
    '<button class="btn gh" data-x="impRestore">导入备份文件（JSON）恢复</button></div>' +
    '<div class="note" style="margin-top:12px">当前数据量：产品 ' + st.products.length + ' · 原料 ' + st.raw.length + ' · 包材 ' + st.pack.length + ' · BOM ' + st.bom.length + ' · 审计日志 ' + (st.audit || []).length + ' 条</div></div>' +
    '<div class="card"><h3>恢复说明</h3><div class="steps">' +
    step(1, '备份', '在旧设备点「导出全部数据（JSON）」保存文件。', '') +
    step(2, '部署', '把应用（HTML 文件）放到 GitHub Pages 或拷贝到其他电脑/平板打开。', '') +
    step(3, '恢复', '在新设备点「导入备份文件（JSON）」选择备份文件，确认后全量替换当前数据。', '') +
    '</div><div class="note" style="margin-top:12px">恢复为<b>整体替换</b>：新设备上的原有数据会被备份内容覆盖，操作会记入审计日志。备份文件包含业务数据，请仅存放到你受信任的位置。</div></div>';
}
function doRestore() {
  UI.pickJson();
}
/* SECTION: audit log (操作审计) */
function auditCard() {
  const logs = APP.state.audit || [];
  const typeBadge = t => ({ import: 'pri', create: 'ok', update: '', delete: 'bad', restore: 'pri', backup: '', reset: 'bad', confirm: 'ok' }[t] || '');
  return '<div class="card"><h3>操作审计日志<span class="tag">记录每次导入 / 新增 / 修改 / 删除 / 备份 / 恢复，最多保留最近 500 条</span>' +
    '<span class="row grow" style="justify-content:flex-end"><button class="btn sm gh" data-x="expAudit">导出审计日志(JSON)</button><button class="btn sm danger" data-x="clearAudit">清空日志</button></span></h3>' +
    (logs.length
      ? '<div class="tblwrap"><table class="audiotbl"><thead><tr><th>时间</th><th>操作</th><th>对象</th><th>明细</th></tr></thead><tbody>' +
        logs.map(a => '<tr><td class="mut mono">' + esc(a.time) + '</td><td><span class="badge ' + typeBadge(a.type) + '">' + esc(APP.auditName(a.type)) + '</span></td><td class="mono">' + esc(a.target) + '</td><td>' + esc(a.detail) + '</td></tr>').join('') +
        '</tbody></table></div>'
      : '<div class="empty"><b>暂无审计记录</b>导入、修改、备份、恢复等操作发生后会自动记录在这里。</div>') +
    '</div>';
}

/* SECTION: import-file */
let pendingKind = null, pendingJson = false;
UI.pickFile = function (kind) {
  pendingKind = kind; pendingJson = false;
  const inp = $('#filePick');
  if (inp) inp.click();
};
UI.pickJson = function () {
  pendingJson = true;
  const inp = $('#jsonPick');
  if (inp) inp.click();
};
document.addEventListener('change', e => {
  if (e.target.id === 'jsonPick') {
    const f = e.target.files && e.target.files[0]; pendingJson = false;
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let count;
      try { count = APP.restoreJson(String(rd.result)); }
      catch (err) { UI.toast('恢复失败：' + err.message, 'bad'); e.target.value = ''; return; }
      UI.toast('恢复成功：产品 ' + count.products + ' · 原料 ' + count.raw + ' · 包材 ' + count.pack + ' · BOM ' + count.bom, 'ok');
      render();
    };
    rd.onerror = () => UI.toast('文件读取失败', 'bad');
    rd.readAsText(f, 'utf-8');
    e.target.value = '';
    return;
  }
  if (e.target.id !== 'filePick' || !e.target.files || !e.target.files[0] || !pendingKind) return;
  const f = e.target.files[0], kind = pendingKind; pendingKind = null;
  if (!/\.xlsx$/i.test(f.name)) { UI.toast('请选择 .xlsx 格式文件（导入模板即为 xlsx）', 'bad'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    XLSX.readAsync(reader.result).then(rows => {
      let rep;
      try { rep = APP.importRows(kind, rows); }
      catch (err) { UI.toast('导入失败：' + err.message, 'bad'); return; }
      showImpRep(kind, rep);
      APP.audit('import', KIND_NAME(kind), '文件 ' + f.name + '：新增 ' + rep.add + ' 更新 ' + rep.upd + ' 跳过 ' + rep.skip + (rep.missing ? '，缺失物料 ' + rep.missing + ' 条' : ''));
      APP.save(); render(); flowRefreshReport(kind, rep);
    }).catch(err => UI.toast('Excel 解析失败：' + err.message, 'bad'));
  };
  reader.onerror = () => UI.toast('文件读取失败', 'bad');
  reader.readAsArrayBuffer(f);
  e.target.value = '';
});
function KIND_NAME(k) { return k === 'product' ? '产品主数据' : k === 'bom' ? '产品BOM' : k === 'raw' ? '原料价格' : '包材价格'; }
function showImpRep(kind, rep) {
  const msg = '新增 ' + rep.add + ' 条 · 更新 ' + rep.upd + ' 条 · 跳过 ' + rep.skip + ' 条' + (rep.auto ? ' · 自动推导 ' + rep.auto + ' 项箱规/克重' : '');
  rep.errs = rep.errs.slice(0, 12);
  if (rep.add || rep.upd) UI.toast('导入成功：' + msg, 'ok');
  else UI.toast('未导入任何数据：' + msg, rep.skip ? 'warn' : 'bad');
  UI._lastRep = { kind: kind, msg: msg, errs: rep.errs, missingMat: rep.missingMat || [] };
}
function flowRefreshReport(kind, rep) {
  const box = $('#impRep');
  if (!box) return;
  const r = UI._lastRep;
  const missHtml = (r.missingMat && r.missingMat.length)
    ? '<br><b class="redc">物料编码缺失（已标红）：</b>' + r.missingMat.map(x => '<span class="redc mono">第' + x.row + '行 产品 ' + esc(x.pc) + ' · 物料 ' + esc(x.mc) + '</span>').join('；')
    : '';
  box.innerHTML = '<div class="note" style="margin-top:12px">' +
    '<b>' + KIND_NAME(kind) + '导入结果</b>：' + esc(r ? r.msg : '') + missHtml +
    (r && r.errs && r.errs.length ? '<br>' + r.errs.map(x => '<span class="mut">· ' + esc(x) + '</span>').join('<br>') : '') +
    (kind !== 'product' ? '<br>成本已按最新价格自动重算，可在「成本总览」查看。' : '') + '</div>';
}

/* SECTION: actions-router */
function bindX() {
  $$('[data-x]', $('#view')).forEach(el => {
    const x = el.dataset.x;
    el.onclick = ev => {
      ev.stopPropagation();
      const [cmd, arg] = x.split(':');
      if (cmd === 'add' && arg === 'product') productForm({ code: '', name: '', spec: '', series: '', sub: '', caseSize: '', bagWeight: '', overhead: '', processing: '', freight: '' }, true);
      else if (cmd === 'add') matForm(arg, { code: '', name: '', spec: '', unit: '', price: '', date: today(), confirmed: false }, true);
      else if (cmd === 'tpl') APP.download(APP.template(arg));
      else if (cmd === 'exp') {
        const map = { product: APP.exportProduct, raw: () => APP.exportMaterial('raw', false), pack: () => APP.exportMaterial('pack', false), bom: APP.exportBom };
        if (map[arg]) APP.download(map[arg]());
      } else if (cmd === 'expConfirm') APP.download(APP.exportMaterial(arg, true));
      else if (cmd === 'imp') UI.pickFile(arg);
      else if (cmd === 'addBom') { const sel = $('#bomSel'); const pc = (sel && sel.value) || UI.bomSel; if (pc) bomAddForm(pc, arg); }
      else if (cmd === 'exportCost') APP.download(APP.exportCost());
      else if (cmd === 'goDash') UI.go('dash');
      else if (cmd === 'goBackup') { UI.flowTab = 'backup'; render(); }
      else if (cmd === 'resetAll') resetAll();
      // 备份 / 恢复 / 审计
      else if (cmd === 'expBackup') { APP.audit('backup', '全量数据', '导出 JSON 备份：产品 ' + APP.state.products.length + ' · 原料 ' + APP.state.raw.length + ' · 包材 ' + APP.state.pack.length + ' · BOM ' + APP.state.bom.length); APP.save(); APP.downloadJson(APP.backupJson(), '计划成本_全量备份'); render(); }
      else if (cmd === 'impRestore') UI.modal('导入备份文件恢复', '<p>将选择本应用导出的 <b>.json 备份文件</b>，恢复后<b>当前设备上的全部数据将被备份内容覆盖</b>（此操作会记入审计日志）。</p><p class="mut" style="margin-top:8px">建议先点「取消」并导出当前数据作为保险备份。</p>', [
        { text: '选择备份文件并恢复', action: () => { doRestore(); } },
        { text: '取消', ghost: true }
      ]);
      else if (cmd === 'expAudit') { const logs = APP.state.audit || []; APP.downloadJson(JSON.stringify({ app: 'plan-cost-audit', exportedAt: new Date().toLocaleString('zh-CN', { hour12: false }), logs: logs }, null, 2), '操作审计日志'); UI.toast('已导出 ' + logs.length + ' 条审计日志', 'ok'); }
      else if (cmd === 'clearAudit') confirmDelete('全部审计日志（' + (APP.state.audit || []).length + ' 条），业务数据不受影响', () => { APP.state.audit = []; APP.audit('delete', '审计日志', '清空全部审计日志'); });
      else if (cmd === 'derive') { /* 弹窗内按钮，见 bindModalX */ }
    };
  });
  $$('[data-act]', $('#view')).forEach(el => {
    el.onclick = ev => {
      ev.stopPropagation();
      const tr = el.closest('tr');
      const code = tr ? tr.dataset.code : '';
      const act = el.dataset.act;
      if (act === 'editP') productForm(APP.findProduct(code), false);
      else if (act === 'bomP') { UI.bomSel = code; UI.bomKw = ''; UI.go('bom'); }
      else if (act === 'delP') confirmDelete('产品 ' + code + '，其 BOM 行将一并删除', () => {
        APP.audit('delete', '产品 ' + code, '删除产品及其 BOM 行');
        APP.state.products = APP.state.products.filter(p => p.code !== code);
        APP.state.bom = APP.state.bom.filter(b => b.productCode !== code);
      });
      else if (act === 'editM') matForm(UI.matTab, APP.findMat(code, UI.matTab), false);
      else if (act === 'confM') { const m = APP.findMat(code, UI.matTab); m.confirmed = !m.confirmed; APP.audit('confirm', '物料 ' + code, m.confirmed ? '标记采购确认' : '取消采购确认'); APP.save(); render(); UI.toast((m.confirmed ? '已标记采购确认：' : '已取消确认：') + code, 'ok'); }
      else if (act === 'delM') {
        const kind = UI.matTab, inUse = usedIn(code, kind);
        if (inUse.length) { confirmDelete('物料 ' + code + '，仍被 BOM 引用：' + inUse.join('、'), () => {
          APP.audit('delete', '物料 ' + code, '删除物料，同时移除 ' + inUse.length + ' 个产品中的引用行');
          APP.state[kind] = APP.matOf(kind).filter(m => m.code !== code);
          APP.state.bom = APP.state.bom.filter(b => !(b.matCode === code && b.matType === (kind === 'pack' ? 'pack' : 'raw')));
        }); }
        else { APP.audit('delete', '物料 ' + code, '删除' + (kind === 'pack' ? '包材' : '原料')); APP.state[kind] = APP.matOf(kind).filter(m => m.code !== code); APP.save(); render(); UI.toast('已删除物料 ' + code, 'ok'); }
      }
      else if (act === 'delBom') { const b = APP.state.bom.find(x => x.id === el.dataset.id); APP.audit('delete', 'BOM ' + (b ? b.productCode + '/' + b.matCode : ''), '移除 BOM 行'); APP.state.bom = APP.state.bom.filter(x => x.id !== el.dataset.id); APP.save(); render(); UI.toast('已从 BOM 移除', 'ok'); }
    };
  });
  // BOM 行内编辑：改用量/损耗即时重算
  $$('[data-q],[data-l]', $('#view')).forEach(inp => {
    inp.onchange = () => {
      const id = inp.dataset.q || inp.dataset.l;
      const b = APP.state.bom.find(x => x.id === id);
      if (!b) return;
      const v = n(inp.value);
      if (isNaN(v) || v < 0) { UI.toast('请输入不小于 0 的数字', 'bad'); render(); return; }
      const isQ = !!inp.dataset.q;
      const old = isQ ? b.qty : b.loss;
      if (isQ) b.qty = v; else b.loss = v;
      APP.audit('update', 'BOM ' + b.productCode + '/' + b.matCode, (isQ ? '单箱用量 ' : '损耗率% ') + old + ' → ' + v);
      APP.save(); render(); UI.toast('已更新，成本已重算', 'ok');
    };
  });
}
function confirmDelete(what, doIt) {
  UI.modal('确认删除', '<p>确定删除 <b>' + esc(what) + '</b> 吗？此操作不可撤销。</p>', [
    { text: '删除', danger: true, action: () => { doIt(); APP.save(); render(); UI.toast('已删除', 'ok'); } },
    { text: '取消', ghost: true }
  ]);
}
function resetAll() {
  UI.modal('清除全部数据', '<p>将清除浏览器中保存的产品、原料/包材价格、BOM 与审计日志，并恢复为内置示例数据。建议先到「备份与审计 → 数据备份与恢复」导出 JSON 备份。</p>', [
    { text: '清除并恢复示例', danger: true, action: () => {
        localStorage.removeItem(SKEY); APP.state = APP.defaults();
        APP.audit('reset', '全量数据', '清除全部数据并恢复内置示例');
        APP.save(); render(); UI.toast('已恢复示例数据', 'ok');
      } },
    { text: '取消', ghost: true }
  ]);
}

/* SECTION: boot */
APP.load();
UI.go('dash');
