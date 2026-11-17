/**
 * 英検 口頭カード（Google Apps Script 版）
 * このスクリプトは、記録用スプレッドシートの「拡張機能 → Apps Script」に貼り付けて使う。
 * シート「設定」のA列に書いた合言葉ごとに、別々の記録をためる。
 */

const SHEET_SETTING = '設定';
const SHEET_LOG = '練習記録';
const SHEET_ITEM = '問題ごと';
const SHEET_STICKER = 'シール';

const HEAD_LOG = ['合言葉', '日付', '時刻', '内容', '種類', '級', 'レベル', 'やり方', '問題数', '正解数', 'ID'];
const HEAD_ITEM = ['合言葉', '問題ID', '種類', '日本語', '英語', '○の回数', '△×の回数', '最後にまちがえた日', 'にがて'];
const HEAD_STICKER = ['合言葉', '日付', 'シール', 'キラキラ'];

function doGet() {
  setup_();
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('英検 口頭カード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** 外のページ（GitHub Pages）からの呼び出し口 */
function doPost(e) {
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const req = JSON.parse(e.postData.contents);
    const fns = { login, loadAll, apply };
    if (!fns[req.fn]) throw new Error('unknown');
    return out({ ok: true, result: fns[req.fn].apply(null, req.args || []) });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

/** 最初に1回、シートがなければ作る（エディタから実行してもよい） */
function setup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const make = (name, head) => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    return sh;
  };
  const st = ss.getSheetByName(SHEET_SETTING);
  if (!st) {
    const s = ss.insertSheet(SHEET_SETTING, 0);
    s.getRange('A1:B1').setValues([['合言葉', 'メモ']]).setFontWeight('bold');
    s.getRange('A2:B3').setValues([['あん', ''], ['じん', '']]);
    s.setFrozenRows(1);
  }
  make(SHEET_LOG, HEAD_LOG);
  make(SHEET_ITEM, HEAD_ITEM);
  make(SHEET_STICKER, HEAD_STICKER);
}

function passwords_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTING);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 1).getValues()
    .map(r => String(r[0]).trim()).filter(Boolean);
}

function check_(pass) {
  const p = String(pass || '').trim();
  if (!p || passwords_().indexOf(p) < 0) throw new Error('合言葉がちがいます');
  return p;
}

function rows_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  const last = sh.getLastRow();
  if (last < 2) return { sh, rows: [] };
  return { sh, rows: sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() };
}

const fmtDate_ = v => v instanceof Date
  ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd')
  : String(v || '');

/** 合言葉の確認だけ */
function login(pass) {
  setup_();
  return { name: check_(pass) };
}

/** その合言葉の記録をすべて返す */
function loadAll(pass) {
  setup_();
  const p = check_(pass);
  const log = rows_(SHEET_LOG).rows.filter(r => r[0] === p).map(r => ({
    d: fmtDate_(r[1]), t: Number(r[10]) || 0, kind: r[4] === '単語' ? 'w' : 's',
    lv: r[5] === '5級' ? '5' : r[5] === '4級' ? '4' : 'mix', st: ({'かんたん':'1','ふつう':'2','むずかしい':'3'})[r[6]] || 'mix',
    mode: r[7] === '英語 → 日本語' ? 'ej' : 'je', src: String(r[3]).indexOf('にがて') >= 0 ? 'weak' : (r[3] === 'まちがえた問題' ? 'miss' : 'normal'),
    n: Number(r[8]) || 0, ok: Number(r[9]) || 0, label: String(r[3])
  }));
  const stats = {}, weak = [];
  rows_(SHEET_ITEM).rows.filter(r => r[0] === p).forEach(r => {
    stats[r[1]] = { c: Number(r[5]) || 0, w: Number(r[6]) || 0, lw: fmtDate_(r[7]) || undefined };
    if (r[8] === true || r[8] === 'TRUE') weak.push(r[1]);
  });
  const stickers = rows_(SHEET_STICKER).rows.filter(r => r[0] === p)
    .map(r => ({ d: fmtDate_(r[1]), e: String(r[2]), rare: r[3] === true || r[3] === 'TRUE' }));
  return { name: p, log, stats, weak, stickers };
}

/**
 * 画面からの記録をまとめて書く。
 * ops: [{type:'judge', id, kind, ja, en, ok:boolean, d, weak:boolean},
 *       {type:'session', entry:{...}, label, sticker:{e,rare,d}|null}]
 */
function apply(pass, ops) {
  const p = check_(pass);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const items = rows_(SHEET_ITEM);
    const index = {};
    items.rows.forEach((r, i) => { if (r[0] === p) index[r[1]] = i; });
    const changed = new Set(), added = [];
    const logRows = [], stickerRows = [];
    const doneLog = new Set(rows_(SHEET_LOG).rows.filter(r => r[0] === p).map(r => String(r[10])));

    (ops || []).forEach(op => {
      if (op.type === 'judge') {
        let row;
        if (op.id in index) { row = items.rows[index[op.id]]; changed.add(index[op.id]); }
        else {
          row = [p, op.id, op.kind === 'w' ? '単語' : '例文', op.ja, op.en, 0, 0, '', false];
          items.rows.push(row); index[op.id] = items.rows.length - 1; added.push(index[op.id]);
        }
        if (op.ok) row[5] = (Number(row[5]) || 0) + 1;
        else { row[6] = (Number(row[6]) || 0) + 1; row[7] = op.d; }
        row[8] = !!op.weak;
      } else if (op.type === 'session') {
        const e = op.entry;
        if (doneLog.has(String(e.t))) return;
        doneLog.add(String(e.t));
        const time = Utilities.formatDate(new Date(e.t), Session.getScriptTimeZone(), 'HH:mm');
        logRows.push([p, e.d, time, op.label, e.kind === 'w' ? '単語' : '例文',
          e.lv === 'mix' ? '5・4級' : e.lv + '級', e.kind === 'w' ? '' : ({1:'かんたん',2:'ふつう',3:'むずかしい',mix:'まぜる'})[e.st] || '',
          e.mode === 'ej' ? '英語 → 日本語' : '日本語 → 英語', e.n, e.ok, String(e.t)]);
        if (op.sticker) stickerRows.push([p, op.sticker.d, op.sticker.e, !!op.sticker.rare]);
      }
    });

    const width = HEAD_ITEM.length;
    changed.forEach(i => { if (added.indexOf(i) < 0) items.sh.getRange(i + 2, 1, 1, width).setValues([items.rows[i]]); });
    if (added.length) {
      const start = items.sh.getLastRow() + 1;
      items.sh.getRange(start, 1, added.length, width).setValues(added.map(i => items.rows[i]));
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (logRows.length) {
      const sh = ss.getSheetByName(SHEET_LOG);
      sh.getRange(sh.getLastRow() + 1, 1, logRows.length, HEAD_LOG.length).setValues(logRows);
    }
    if (stickerRows.length) {
      const sh = ss.getSheetByName(SHEET_STICKER);
      sh.getRange(sh.getLastRow() + 1, 1, stickerRows.length, HEAD_STICKER.length).setValues(stickerRows);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
