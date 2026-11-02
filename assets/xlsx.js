/* SECTION: xlsx-min —— 轻量 XLSX 读写（纯 JS，无外部依赖）
   写：单 sheet、STORED 打包 zip；读：STORED + DEFLATE（浏览器原生 DecompressionStream）
   兼容：Chrome 80+ / Edge / Firefox 113+ / Safari 16.4+ / Node 18+ */
'use strict';
const XLSX = {};
const _enc = new TextEncoder();
const _dec = new TextDecoder();

/* SECTION: xml-helpers */
function xEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function xUnesc(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&');
}
function colIdx(ref) { let i = 0; for (const ch of ref) { if (ch >= 'A' && ch <= 'Z') i = i * 26 + (ch.charCodeAt(0) - 64); else if (ch >= 'a' && ch <= 'z') i = i * 26 + (ch.charCodeAt(0) - 96); else break; } return i - 1; }
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; }

/* SECTION: zip-writer (STORED，无需压缩即可被 Excel 打开) */
function crc32(u8) {
  let c = ~0;
  for (let i = 0; i < u8.length; i++) {
    c ^= u8[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function zipStore(files) { // files: [{name, u8}]
  const parts = [], central = []; let off = 0;
  const le16 = v => [v & 255, (v >>> 8) & 255];
  const le32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  files.forEach(f => {
    const name = _enc.encode(f.name), crc = crc32(f.u8), size = f.u8.length;
    const lh = new Uint8Array([80, 75, 3, 4, ...le16(20), ...le16(0), ...le16(0), ...le16(0), ...le16(0),
      ...le32(crc), ...le32(size), ...le32(size), ...le16(name.length), ...le16(0)]);
    parts.push(lh, name, f.u8);
    central.push(new Uint8Array([80, 75, 1, 2, ...le16(20), ...le16(20), ...le16(0), ...le16(0), ...le16(0), ...le16(0),
      ...le32(crc), ...le32(size), ...le32(size), ...le16(name.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0),
      ...le32(0), ...le32(off)]), name);
    off += lh.length + name.length + size;
  });
  const cd = []; let cdSize = 0;
  central.forEach(p => { cd.push(p); cdSize += p.length; });
  const eocd = new Uint8Array([80, 75, 5, 6, ...le16(0), ...le16(0), ...le16(files.length), ...le16(files.length),
    ...le32(cdSize), ...le32(off), ...le16(0)]);
  let total = off + cdSize + eocd.length, u8 = new Uint8Array(total), p = 0;
  parts.forEach(x => { u8.set(x, p); p += x.length; });
  cd.forEach(x => { u8.set(x, p); p += x.length; });
  u8.set(eocd, p);
  return u8;
}

/* SECTION: build (header + rows -> xlsx Uint8Array) */
XLSX.build = function (header, rows) {
  const cell = (v, ref) => {
    if (v == null || v === '') return '';
    const isNum = typeof v === 'number' ? isFinite(v) : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.length < 15 && !/^0\d/.test(v));
    if (isNum) return '<c r="' + ref + '"><v>' + v + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xEsc(v) + '</t></is></c>';
  };
  const rowXml = (arr, r) => '<row r="' + r + '">' + arr.map((v, i) => cell(v, colName(i) + r)).join('') + '</row>';
  let sd = rowXml(header, 1);
  rows.forEach((rw, i) => { sd += rowXml(rw, i + 2); });
  const widths = header.map((h, i) => {
    let w = String(h).replace(/[^\x00-\xff]/g, 'xx').length + 4;
    rows.forEach(r => { const t = String(r[i] == null ? '' : r[i]); const L = t.replace(/[^\x00-\xff]/g, 'xx').length; if (L + 3 > w) w = Math.min(L + 3, 42); });
    return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
  }).join('');
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>' + widths + '</cols><sheetData>' + sd + '</sheetData></worksheet>';
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
  return zipStore([
    { name: '[Content_Types].xml', u8: _enc.encode(ct) },
    { name: '_rels/.rels', u8: _enc.encode(rels) },
    { name: 'xl/workbook.xml', u8: _enc.encode(wb) },
    { name: 'xl/_rels/workbook.xml.rels', u8: _enc.encode(wbRels) },
    { name: 'xl/worksheets/sheet1.xml', u8: _enc.encode(sheet) }
  ]);
};

/* SECTION: unzip (STORED 直读；DEFLATE 用原生 DecompressionStream) */
async function inflateRaw(u8) {
  if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持解析压缩 Excel，请用 Chrome/Edge 80+ 或 Safari 16.4+ 打开');
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 xlsx 文件（未找到压缩包结构）');
  const cnt = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let i = 0; i < cnt; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const loff = dv.getUint32(p + 42, true);
    const name = _dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(loff + 26, true), lelen = dv.getUint16(loff + 28, true);
    const dstart = loff + 30 + lnlen + lelen;
    const raw = u8.slice(dstart, dstart + csize);
    files[name] = method === 0 ? raw : await inflateRaw(raw);
    p += 46 + nlen + elen + clen;
  }
  return files;
}

/* SECTION: read (async: xlsx ArrayBuffer -> rows[][]) */
XLSX.readAsync = async function (buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const files = await unzip(u8);
  let sst = [];
  if (files['xl/sharedStrings.xml']) {
    const xml = _dec.decode(files['xl/sharedStrings.xml']);
    xml.replace(/<si>([\s\S]*?)<\/si>/g, (m, inner) => {
      let t = ''; inner.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, (m2, x) => { t += x; return ''; });
      sst.push(xUnesc(t)); return '';
    });
  }
  const sheetKey = Object.keys(files).find(k => /^xl\/worksheets\/[^/]+\.xml$/.test(k));
  if (!sheetKey) throw new Error('xlsx 中未找到工作表');
  const xml = _dec.decode(files[sheetKey]);
  const rows = [];
  xml.replace(/<row[^>]*>([\s\S]*?)<\/row>/g, (m, inner) => {
    const row = [];
    inner.replace(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m2, attrs, body) => {
      const rAttr = (attrs.match(/r="([A-Za-z]+)\d+"/) || [])[1];
      const tAttr = (attrs.match(/t="([^"]+)"/) || [])[1];
      let ci = row.length;
      if (rAttr) ci = colIdx(rAttr);
      let val = '';
      if (body) {
        if (tAttr === 's') { const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1]; val = sst[+v] || ''; }
        else if (tAttr === 'inlineStr') { let t = ''; body.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, (m3, x) => { t += x; return ''; }); val = xUnesc(t); }
        else { const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1]; val = v == null ? '' : (tAttr === 'b' ? (+v ? 'TRUE' : 'FALSE') : xUnesc(v)); }
      }
      while (row.length < ci) row.push('');
      row[ci] = val;
      return '';
    });
    rows.push(row.map(x => String(x == null ? '' : x).trim()));
    return '';
  });
  return rows.filter(r => r.some(x => x !== ''));
};
