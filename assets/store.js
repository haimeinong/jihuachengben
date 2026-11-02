/* SECTION: store-utils */
'use strict';
const APP = {};
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = v => { const x = parseFloat(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(x) ? x : NaN; };
const fmt = (v, d) => { const x = n(v); return isNaN(x) ? '—' : x.toLocaleString('zh-CN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => 'id' + Math.random().toString(36).slice(2, 9);
const clampStr = s => String(s == null ? '' : s).trim().slice(0, 120);

/* SECTION: schema */
// 字段定义：key=内部字段名，label=表头文案，type=text|num|price|date|bool
APP.FIELDS = {
  product: [
    { k: 'code', label: '产品编码', type: 'text', req: true },
    { k: 'name', label: '产品名称', type: 'text', req: true },
    { k: 'spec', label: '规格型号', type: 'text' },
    { k: 'series', label: '产品系列', type: 'text' },
    { k: 'sub', label: '子分类', type: 'text' },
    { k: 'caseSize', label: '箱规(袋/箱)', type: 'num' },
    { k: 'bagWeight', label: '单袋克重(g)', type: 'num' },
    { k: 'overhead', label: '分摊制造费(元/箱)', type: 'num' },
    { k: 'processing', label: '加工费(元/箱)', type: 'num' },
    { k: 'freight', label: '分摊运费(元/箱)', type: 'num' }
  ],
  material: [
    { k: 'code', label: '物料编码', type: 'text', req: true },
    { k: 'name', label: '物料名称', type: 'text', req: true },
    { k: 'spec', label: '规格型号', type: 'text' },
    { k: 'unit', label: '主单位', type: 'text' },
    { k: 'price', label: '单价(元)', type: 'price' },
    { k: 'date', label: '价格采集日期', type: 'date' },
    { k: 'confirmed', label: '采购已确认', type: 'bool' }
  ],
  bom: [
    { k: 'productCode', label: '产品编码', type: 'text', req: true },
    { k: 'productName', label: '产品名称', type: 'text' },
    { k: 'matType', label: '类别', type: 'text' },
    { k: 'matCode', label: '物料编码', type: 'text', req: true },
    { k: 'matName', label: '物料名称', type: 'text' },
    { k: 'unit', label: '主单位', type: 'text' },
    { k: 'qty', label: '单箱用量', type: 'num' },
    { k: 'loss', label: '损耗率(%)', type: 'num' },
    { k: 'price', label: '当前单价(元)', type: 'price' },
    { k: 'fee', label: '单箱金额(元)', type: 'price' }
  ]
};

/* SECTION: spec-parser (REQ-005)
   从规格型号推导箱规与单袋克重，支持 "500g×20袋" / "20袋×500g" / "1kg*12" / "500克 20包" 等写法 */
APP.parseSpec = function (spec) {
  const out = { caseSize: NaN, bagWeight: NaN };
  const s = String(spec || '').toLowerCase().replace(/（/g, '(').replace(/）/g, ')');
  if (!s) return out;
  const num = '(\\d+(?:\\.\\d+)?)';
  const gW = num + '\\s*(kg|千克|公斤|g|克)';
  const cnt = num + '\\s*(袋|包|盒|支|瓶|罐|条|片|个|粒|份)?';
  const mult = '[×x*＊]';
  let m = s.match(new RegExp(gW + '\\s*' + mult + '\\s*' + cnt));
  if (m) { out.bagWeight = n(m[1]) * (/kg|千克|公斤/.test(m[2]) ? 1000 : 1); out.caseSize = n(m[3]); return out; }
  m = s.match(new RegExp(cnt + '\\s*' + mult + '\\s*' + gW));
  if (m) { out.caseSize = n(m[1]); out.bagWeight = n(m[2]) * (/kg|千克|公斤/.test(m[3]) ? 1000 : 1); return out; }
  m = s.match(new RegExp(gW));
  if (m) out.bagWeight = n(m[1]) * (/kg|千克|公斤/.test(m[2]) ? 1000 : 1);
  const all = s.match(/\d+(?:\.\d+)?/g);
  if (isNaN(out.caseSize) && all && all.length >= 2) {
    // 无乘号时：取"较大值为克重、另一值为箱规"的保守推断，仅在两个数值差距明显时使用
    const a = n(all[0]), b = n(all[1]);
    if (a > 0 && b > 0 && a !== b) { out.bagWeight = Math.max(a, b); out.caseSize = Math.min(a, b); }
  }
  return out;
};

/* SECTION: state (localStorage) */
const SKEY = 'plan-cost-app.v1';
APP.defaults = () => ({
  products: [
    { code: 'P1001', name: '每日坚果礼盒', spec: '500g×30袋', series: '坚果系列', sub: '混合坚果', caseSize: 30, bagWeight: 500, overhead: 180, processing: 65, freight: 40 },
    { code: 'P1002', name: '高蛋白燕麦片', spec: '600g×20袋', series: '坚果系列', sub: '冲调谷物', caseSize: 20, bagWeight: 600, overhead: 140, processing: 52, freight: 35 },
    { code: 'P1003', name: '冻干咖啡速溶', spec: '2g×100条', series: '冲饮系列', sub: '咖啡', caseSize: 100, bagWeight: 2, overhead: 260, processing: 120, freight: 55 },
    { code: 'P2001', name: '低糖黑芝麻丸', spec: '9g×50袋', series: '冲饮系列', sub: '养生丸', caseSize: 50, bagWeight: 9, overhead: 155, processing: 78, freight: 30 }
  ],
  raw: [
    { code: 'M0101', name: '烤腰果', spec: '食品级 25kg/箱', unit: 'kg', price: 88.5, date: '2026-10-12', confirmed: true },
    { code: 'M0102', name: '蔓越莓干', spec: '20kg/箱', unit: 'kg', price: 42.0, date: '2026-10-12', confirmed: true },
    { code: 'M0103', name: '燕麦片(压片)', spec: '25kg/袋', unit: 'kg', price: 9.8, date: '2026-09-28', confirmed: false },
    { code: 'M0104', name: '阿拉比卡咖啡熟豆', spec: '60kg/袋', unit: 'kg', price: 56.0, date: '2026-10-08', confirmed: true },
    { code: 'M0105', name: '黑芝麻', spec: '50kg/袋', unit: 'kg', price: 16.5, date: '2026-10-01', confirmed: false },
    { code: 'M0106', name: '麦芽糖醇', spec: '25kg/袋', unit: 'kg', price: 21.0, date: '2026-10-05', confirmed: true }
  ],
  pack: [
    { code: 'B0201', name: '铝箔复合自立袋', spec: '180×260mm', unit: '个', price: 0.68, date: '2026-10-10', confirmed: true },
    { code: 'B0202', name: '牛皮纸外盒', spec: '350×240×120mm', unit: '个', price: 1.85, date: '2026-09-30', confirmed: false },
    { code: 'B0203', name: '五层瓦楞箱', spec: '400×300×250mm', unit: '个', price: 3.2, date: '2026-10-11', confirmed: true },
    { code: 'B0204', name: '三角茶包滤袋', spec: '85×110mm', unit: '个', price: 0.12, date: '2026-10-06', confirmed: true },
    { code: 'B0205', name: '标签不干胶', spec: '60×40mm', unit: '张', price: 0.08, date: '2026-08-20', confirmed: false }
  ],
  bom: [
    { id: uid(), productCode: 'P1001', matType: 'raw', matCode: 'M0101', qty: 0.35, loss: 2 },
    { id: uid(), productCode: 'P1001', matType: 'raw', matCode: 'M0102', qty: 0.15, loss: 3 },
    { id: uid(), productCode: 'P1001', matType: 'pack', matCode: 'B0201', qty: 30, loss: 1.5 },
    { id: uid(), productCode: 'P1001', matType: 'pack', matCode: 'B0202', qty: 30, loss: 1 },
    { id: uid(), productCode: 'P1001', matType: 'pack', matCode: 'B0203', qty: 1, loss: 0 },
    { id: uid(), productCode: 'P1001', matType: 'pack', matCode: 'B0205', qty: 30, loss: 2 },
    { id: uid(), productCode: 'P1002', matType: 'raw', matCode: 'M0103', qty: 12, loss: 2.5 },
    { id: uid(), productCode: 'P1002', matType: 'pack', matCode: 'B0201', qty: 20, loss: 1.5 },
    { id: uid(), productCode: 'P1002', matType: 'pack', matCode: 'B0203', qty: 1, loss: 0 },
    { id: uid(), productCode: 'P1003', matType: 'raw', matCode: 'M0104', qty: 0.22, loss: 3 },
    { id: uid(), productCode: 'P1003', matType: 'pack', matCode: 'B0204', qty: 100, loss: 1 },
    { id: uid(), productCode: 'P1003', matType: 'pack', matCode: 'B0203', qty: 1, loss: 0 },
    { id: uid(), productCode: 'P2001', matType: 'raw', matCode: 'M0105', qty: 0.4, loss: 2 },
    { id: uid(), productCode: 'P2001', matType: 'raw', matCode: 'M0106', qty: 0.05, loss: 4 },
    { id: uid(), productCode: 'P2001', matType: 'pack', matCode: 'B0201', qty: 50, loss: 1.5 },
    { id: uid(), productCode: 'P2001', matType: 'pack', matCode: 'B0205', qty: 50, loss: 2 }
  ],
  audit: [],
  settings: { autoDerive: true, priceDate: today() }
});
APP.state = null;
APP.load = function () {
  try {
    const raw = localStorage.getItem(SKEY);
    if (raw) {
      const d = JSON.parse(raw);
      const base = APP.defaults();
      APP.state = {
        products: Array.isArray(d.products) ? d.products : base.products,
        raw: Array.isArray(d.raw) ? d.raw : base.raw,
        pack: Array.isArray(d.pack) ? d.pack : base.pack,
        bom: Array.isArray(d.bom) ? d.bom : base.bom,
        audit: Array.isArray(d.audit) ? d.audit : [],
        settings: Object.assign({}, base.settings, d.settings || {})
      };
      return;
    }
  } catch (e) { /* 数据损坏时回落到初始示例 */ }
  APP.state = APP.defaults();
  APP.save();
};
APP.save = function () {
  try { localStorage.setItem(SKEY, JSON.stringify(APP.state)); }
  catch (e) { if (APP.toast) APP.toast('本地保存失败：浏览器存储空间不足', 'bad'); }
};
APP.matOf = t => (t === 'pack' ? APP.state.pack : APP.state.raw);
APP.findMat = (code, t) => APP.matOf(t).find(m => m.code === code);
APP.findProduct = code => APP.state.products.find(p => p.code === code);

/* SECTION: audit (操作审计日志) */
const AUDIT_TYPES = { import: '导入', create: '新增', update: '修改', delete: '删除', restore: '恢复备份', backup: '导出备份', reset: '重置数据', confirm: '采购确认' };
APP.audit = function (type, target, detail) {
  if (!APP.state.audit) APP.state.audit = [];
  const d = new Date();
  APP.state.audit.unshift({
    time: d.toLocaleString('zh-CN', { hour12: false }),
    type: type, target: String(target || '').slice(0, 60), detail: String(detail || '').slice(0, 160)
  });
  if (APP.state.audit.length > 500) APP.state.audit.length = 500;
};
APP.auditName = t => AUDIT_TYPES[t] || t;

/* SECTION: backup / restore (JSON 全量数据，跨设备迁移) */
APP.backupJson = function () {
  return JSON.stringify({
    app: 'plan-cost', version: 3, exportedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    products: APP.state.products, raw: APP.state.raw, pack: APP.state.pack, bom: APP.state.bom,
    audit: APP.state.audit || [], settings: APP.state.settings
  }, null, 2);
};
APP.downloadJson = function (text, name) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '_' + today() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
APP.restoreJson = function (text) {
  let d;
  try { d = JSON.parse(text); }
  catch (e) { throw new Error('文件不是有效的 JSON：' + e.message); }
  if (!d || d.app !== 'plan-cost') throw new Error('文件不是本应用导出的备份（缺少 app 标识）');
  const need = ['products', 'raw', 'pack', 'bom'];
  const miss = need.filter(k => !Array.isArray(d[k]));
  if (miss.length) throw new Error('备份缺少数据段：' + miss.join('、'));
  const base = APP.defaults();
  APP.state = {
    products: d.products, raw: d.raw, pack: d.pack, bom: d.bom,
    audit: Array.isArray(d.audit) ? d.audit : [],
    settings: Object.assign({}, base.settings, d.settings || {})
  };
  APP.audit('restore', '全量数据', '从备份文件恢复：产品 ' + d.products.length + ' · 原料 ' + d.raw.length + ' · 包材 ' + d.pack.length + ' · BOM ' + d.bom.length);
  APP.save();
  return { products: d.products.length, raw: d.raw.length, pack: d.pack.length, bom: d.bom.length };
};

/* SECTION: cost-engine (REQ-006 / REQ-007) */
// 第二阶段预留：制造费/加工费/运费的推导接口。
// 当前实现返回 null，表示沿用产品主数据中的固定值；二阶段接入公式或外部数据时，
// 只需在此返回 {overhead, processing, freight, source} 即可覆盖固定值。
function deriveOverhead(product /*, ctx */) {
  return null; // TODO(phase-2): 制造费推导逻辑待定，保持接口签名不变
}
APP.cost = function (p) {
  const rows = APP.state.bom.filter(b => b.productCode === p.code);
  let rawFee = 0, packFee = 0;
  const lines = rows.map(b => {
    const m = APP.findMat(b.matCode, b.matType);
    const price = m ? (n(m.price) || 0) : 0;
    const qty = n(b.qty) || 0, loss = n(b.loss) || 0;
    const fee = price * qty * (1 + loss / 100);
    if (b.matType === 'pack') packFee += fee; else rawFee += fee;
    return { b, m, price, qty, loss, fee, missing: !m };
  });
  const dyn = deriveOverhead(p, { lines: lines });
  const overhead = dyn && n(dyn.overhead) >= 0 ? n(dyn.overhead) : (n(p.overhead) || 0);
  const processing = dyn && n(dyn.processing) >= 0 ? n(dyn.processing) : (n(p.processing) || 0);
  const freight = dyn && n(dyn.freight) >= 0 ? n(dyn.freight) : (n(p.freight) || 0);
  const material = rawFee + packFee;
  const total = material + overhead + processing + freight;
  const cs = n(p.caseSize) || 0;
  return {
    p, lines, rawFee, packFee, material, overhead, processing, freight, total,
    perBag: cs > 0 ? total / cs : NaN,
    perKg: (cs > 0 && n(p.bagWeight) > 0) ? total / (cs * n(p.bagWeight) / 1000) : NaN,
    dynSource: dyn && dyn.source,
    noBom: rows.length === 0
  };
};
APP.allCost = () => APP.state.products.map(APP.cost);

/* SECTION: fieldIndex (表头匹配) */
APP.fieldIndex = function (header, label) {
  const norm = s => String(s || '').replace(/\s|\u3000/g, '').replace(/[（(].*?[)）]/g, '');
  const h = header.map(norm);
  let i = h.indexOf(norm(label));
  if (i >= 0) return i;
  const key = norm(label).replace(/[^0-9A-Za-z\u4e00-\u9fa5]/g, '');
  return h.findIndex(x => { const k = x.replace(/[^0-9A-Za-z\u4e00-\u9fa5]/g, ''); return k === key || (key.length > 1 && k.indexOf(key) === 0); });
};

/* SECTION: templates (REQ-004, Excel 格式)
   产品模板不含箱规/单袋克重：导入时按规格型号自动推导 */
APP.PROD_TPL_FIELDS = ['code', 'name', 'spec', 'series', 'sub', 'overhead', 'processing', 'freight'];
APP.template = function (kind) {
  const fl = k => APP.FIELDS.product.filter(f => k.includes(f.k)).map(f => f.label);
  if (kind === 'product') {
    return { name: '产品主数据导入模板', header: fl(APP.PROD_TPL_FIELDS), rows: [
      ['P1004', '示例：红枣夹核桃', '250g×40袋', '坚果系列', '混合坚果', '150', '60', '38'],
      ['P1001', '每日坚果礼盒(调价)', '500g×30袋', '坚果系列', '混合坚果', '190', '65', '42']
    ] };
  }
  if (kind === 'raw' || kind === 'pack') {
    const hd = APP.FIELDS.material.map(f => f.label);
    const demo = kind === 'raw'
      ? [['M0101', '烤腰果', '食品级 25kg/箱', 'kg', '88.5', today(), '是'], ['M0107', '示例新原料', '25kg/袋', 'kg', '12.5', today(), '否']]
      : [['B0201', '铝箔复合自立袋', '180×260mm', '个', '0.68', today(), '是'], ['B0206', '示例新包材', '350×240×120mm', '个', '1.9', today(), '否']];
    return { name: (kind === 'raw' ? '原料价格' : '包材价格') + '导入模板', header: hd, rows: demo };
  }
  // BOM 模板：产品编码 / 物料编码 / 单箱用量 必填；物料名称、单位、单价等自动从产品与材料主数据带入
  return { name: '产品BOM导入模板', header: ['产品编码', '物料编码', '单箱用量', '损耗率(%)'], rows: [
    ['P1001', 'M0101', '0.35', '2'],
    ['P1001', 'B0203', '1', '0'],
    ['P1002', 'B0201', '20', '1.5']
  ] };
};

/* SECTION: import (REQ-004/005, 按编码更新; rows 来自 Excel) */
function bool(v) { const s = String(v || '').trim(); return /^(是|y|yes|true|1|已确认|√|✓)$/i.test(s); }
// Excel 日期可能以序列号存储（如 45000），自动转回 YYYY-MM-DD
function normDate(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) return s.slice(0, 10).replace(/\//g, '-');
  const x = parseFloat(s);
  if (isFinite(x) && x > 20000 && x < 80000 && s.length <= 8) {
    const d = new Date(Math.round((x - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return s.slice(0, 10);
}
APP.importRows = function (kind, rows) {
  const rep = { add: 0, upd: 0, skip: 0, auto: 0, errs: [] };
  if (!rows || rows.length < 2) { rep.errs.push('文件只有表头或为空，未导入任何数据。'); return rep; }
  const hd = rows[0], body = rows.slice(1);
  const resolve = label => APP.fieldIndex(hd, label);
  if (kind === 'product') {
    const map = {};
    APP.FIELDS.product.forEach(f => { map[f.k] = resolve(f.label); });
    if (map.code < 0) { rep.errs.push('未找到表头"产品编码"，请使用导入模板。'); return rep; }
    body.forEach((r, ri) => {
      const code = clampStr(r[map.code]);
      if (!code) { rep.skip++; rep.errs.push('第' + (ri + 2) + '行：产品编码为空，已跳过。'); return; }
      const rec = APP.findProduct(code);
      const src = rec || { code: code };
      const val = k => (map[k] >= 0 ? r[map[k]] : undefined);
      const name = clampStr(val('name')); if (name) src.name = name;
      const series = clampStr(val('series')); if (series) src.series = series;
      const sub = clampStr(val('sub')); if (sub) src.sub = sub;
      const spec = clampStr(val('spec'));
      if (spec) src.spec = spec;
      // 箱规/单袋克重：模板不提供该两列，按规格型号推导；若文件里带了数值列则优先采用
      let cs = map.caseSize >= 0 ? n(val('caseSize')) : NaN;
      let bw = map.bagWeight >= 0 ? n(val('bagWeight')) : NaN;
      const derived = APP.parseSpec(spec || src.spec || '');
      if (isNaN(cs) || cs <= 0) { if (!isNaN(derived.caseSize)) { cs = derived.caseSize; rep.auto++; } }
      if (isNaN(bw) || bw <= 0) { if (!isNaN(derived.bagWeight)) { bw = derived.bagWeight; rep.auto++; } }
      if (!isNaN(cs) && cs > 0) src.caseSize = cs;
      if (!isNaN(bw) && bw > 0) src.bagWeight = bw;
      ['overhead', 'processing', 'freight'].forEach(k => { const v = n(val(k)); if (!isNaN(v)) src[k] = v; });
      if (!src.name) { rep.skip++; rep.errs.push('第' + (ri + 2) + '行（' + code + '）：产品名称为空，已跳过。'); return; }
      if (rec) { rep.upd++; } else { rep.add++; APP.state.products.push(src); }
    });
  } else if (kind === 'raw' || kind === 'pack') {
    const map = {};
    APP.FIELDS.material.forEach(f => { map[f.k] = resolve(f.label); });
    if (map.code < 0) { rep.errs.push('未找到表头"物料编码"，请使用导入模板。'); return rep; }
    const list = APP.matOf(kind);
    body.forEach((r, ri) => {
      const code = clampStr(r[map.code]);
      if (!code) { rep.skip++; rep.errs.push('第' + (ri + 2) + '行：物料编码为空，已跳过。'); return; }
      let rec = list.find(m => m.code === code);
      const src = rec || { code: code };
      const val = k => (map[k] >= 0 ? r[map[k]] : undefined);
      const name = clampStr(val('name')); if (name) src.name = name;
      const spec = clampStr(val('spec')); if (spec) src.spec = spec;
      const unit = clampStr(val('unit')); if (unit) src.unit = unit;
      const priceCell = map.price >= 0 ? val('price') : '';
      const confirmIdx = resolve('采购确认价');
      const cp = confirmIdx >= 0 ? n(r[confirmIdx]) : NaN;
      const use = !isNaN(cp) && cp > 0 ? cp : n(priceCell);
      if (!isNaN(use) && use >= 0) src.price = use;
      const d = normDate(val('date')); if (d) src.date = d;
      if (map.confirmed >= 0 && String(val('confirmed')).trim() !== '') src.confirmed = bool(val('confirmed'));
      else if (src.confirmed == null) src.confirmed = false;
      if (!src.name) { rep.skip++; rep.errs.push('第' + (ri + 2) + '行（' + code + '）：物料名称为空，已跳过。'); return; }
      if (rec) rep.upd++; else { rep.add++; list.push(src); }
    });
  } else {
    const map = {};
    ['产品编码', '物料编码', '单箱用量', '损耗率(%)', '类别'].forEach(l => { map[l] = resolve(l); });
    if (map['产品编码'] < 0 || map['物料编码'] < 0) { rep.errs.push('未找到表头"产品编码"或"物料编码"，请使用导入模板。'); return rep; }
    if (map['单箱用量'] < 0) { rep.errs.push('未找到表头"单箱用量"（必填列），请使用导入模板。'); return rep; }
    rep.missingMat = [];
    body.forEach((r, ri) => {
      const line = ri + 2;
      const pc = clampStr(r[map['产品编码']]), mc = clampStr(r[map['物料编码']]);
      const q = n(r[map['单箱用量']]);
      const lack = [];
      if (!pc) lack.push('产品编码'); if (!mc) lack.push('物料编码');
      if (isNaN(q) || q <= 0) lack.push('单箱用量');
      if (lack.length) { rep.skip++; rep.errs.push('第' + line + '行：必填项缺失（' + lack.join('、') + '），已跳过。'); return; }
      if (!APP.findProduct(pc)) { rep.skip++; rep.errs.push('第' + line + '行：产品 ' + pc + ' 不存在，请先导入产品主数据。'); return; }
      let matType = null;
      if (map['类别'] >= 0) {
        const t = String(r[map['类别']] || '').trim();
        matType = /包材|包装|pack/i.test(t) ? 'pack' : /原料|raw/i.test(t) ? 'raw' : null;
      }
      if (!matType) matType = APP.findMat(mc, 'raw') ? 'raw' : APP.findMat(mc, 'pack') ? 'pack' : null;
      if (!matType) {
        rep.skip++; rep.missing = (rep.missing || 0) + 1;
        rep.missingMat.push({ row: line, pc: pc, mc: mc });
        rep.errs.push('第' + line + '行：物料编码 ' + mc + ' 在原料和包材信息中都不存在（产品 ' + pc + ' · 物料 ' + mc + ' 已标红），请先维护材料价格。');
        return;
      }
      const rec = APP.state.bom.find(b => b.productCode === pc && b.matCode === mc && b.matType === matType);
      const src = rec || { id: uid(), productCode: pc, matType: matType, matCode: mc };
      src.qty = q;
      const l = map['损耗率(%)'] >= 0 ? n(r[map['损耗率(%)']]) : NaN;
      src.loss = (!isNaN(l) && l >= 0) ? l : (src.loss == null ? 0 : src.loss);
      if (rec) rep.upd++; else { rep.add++; APP.state.bom.push(src); }
    });
  }
  if (rep.add || rep.upd) APP.save();
  return rep;
};

/* SECTION: export (REQ-004/008, Excel 格式) */
APP.exportProduct = () => {
  const F = APP.FIELDS.product;
  return { name: '产品主数据', header: F.map(f => f.label), rows: APP.state.products.map(p => F.map(f => p[f.k])) };
};
APP.exportMaterial = (kind, withConfirm) => {
  const list = APP.matOf(kind);
  const hd = APP.FIELDS.material.map(f => f.label);
  if (withConfirm) hd.push('采购确认价', '采购备注');
  const rows = list.map(m => {
    const base = APP.FIELDS.material.map(f => (f.k === 'confirmed' ? (m.confirmed ? '是' : '否') : m[f.k]));
    return withConfirm ? base.concat(['', '']) : base;
  });
  return { name: (kind === 'raw' ? '原料价格' : '包材价格') + (withConfirm ? '_采购确认' : ''), header: hd, rows: rows };
};
APP.exportBom = () => {
  const rows = [];
  APP.state.products.map(APP.cost).forEach(c => c.lines.forEach(l => {
    const m = l.m || {};
    rows.push([c.p.code, c.p.name, l.b.matType === 'pack' ? '包材' : '原料', l.b.matCode, m.name || '', m.unit || '', l.qty, l.loss, l.price, +l.fee.toFixed(2)]);
  }));
  return { name: '产品BOM', header: APP.FIELDS.bom.map(f => f.label), rows: rows };
};
APP.exportCost = () => {
  const hd = ['产品编码', '产品名称', '产品系列', '子分类', '规格型号', '箱规(袋/箱)', '单袋克重(g)', '原料费', '包材费', '材料费', '分摊制造费', '加工费', '分摊运费', '每箱计划成本', '单袋计划成本'];
  const rows = APP.allCost().map(c => [c.p.code, c.p.name, c.p.series || '', c.p.sub || '', c.p.spec, c.p.caseSize, c.p.bagWeight,
    +c.rawFee.toFixed(2), +c.packFee.toFixed(2), +c.material.toFixed(2), +c.overhead.toFixed(2), +c.processing.toFixed(2), +c.freight.toFixed(2),
    +c.total.toFixed(2), isNaN(c.perBag) ? '' : +c.perBag.toFixed(4)]);
  return { name: '计划成本计算表', header: hd, rows: rows };
};
APP.download = function (obj) {
  const u8 = XLSX.build(obj.header, obj.rows);
  const blob = new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = obj.name + '_' + today() + '.xlsx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
