/**
 * Ticker Display System Backend v1.1 - Robust Edition
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const SHEET_CONFIG = "CONFIG";
const SHEET_DATA = "DATA";
const SHEET_QUA = "QUA";

/** ================== CORE HANDLERS ================== */

function doGet(e) {
  const p = e.parameter;
  const action = String(p.action || '').toLowerCase();
  
  try {
    if (action === "config") return output_(getConfig_(), p);
    if (action === "saveconfig") {
      saveConfig_(JSON.parse(p.payload));
      return output_({ ok: true }, p);
    }
    if (action === "data") return output_(getTickerData_(), p);
    if (action === "listrows") return output_({ ok: true, rows: listRows_() }, p);
    if (action === "addrow") {
      addRow_(JSON.parse(p.payload));
      return output_({ ok: true }, p);
    }
    if (action === "updaterow") {
      updateRow_(JSON.parse(p.payload));
      return output_({ ok: true }, p);
    }
    if (action === "deleterow") {
      deleteRow_(JSON.parse(p.payload).rowIndex);
      return output_({ ok: true }, p);
    }
    if (action === "listimages") return output_({ ok: true, images: listDriveImages_(p.folderId) }, p);
    
    // GIFT ACTIONS (UPGRADED)
    if (action === "listgifts") return output_({ ok: true, gifts: listGifts_(false) }, p);
    if (action === "listgiftsall") return output_({ ok: true, gifts: listGifts_(true) }, p);
    if (action === "markgift") {
      const payload = JSON.parse(p.payload);
      return output_({ ok: true, gift: markGift_(payload.rowIndex) }, p);
    }
    if (action === "resetgifts") {
      resetGifts_();
      return output_({ ok: true }, p);
    }
    if (action === "addgift") {
      const payload = JSON.parse(p.payload);
      const result = addGift_(payload.name);
      return output_({ ok: true, rowIndex: result.rowIndex, id: result.id }, p);
    }
    if (action === "updategift") {
      const pl = JSON.parse(p.payload);
      updateGift_(pl.rowIndex, pl.name);
      return output_({ ok: true }, p);
    }
    if (action === "deletegift") {
      const pl = JSON.parse(p.payload);
      deleteGift_(pl.rowIndex);
      return output_({ ok: true }, p);
    }
    if (action === "listclasses") return output_({ ok: true, classes: listClasses_() }, p);
    
    return output_({ ok: false, error: "Invalid action: " + action }, p);
  } catch (err) {
    return output_({ ok: false, error: err.toString(), stack: err.stack }, p);
  }
}

function output_(data, p) {
  const json = JSON.stringify(data);
  if (p.callback) {
    return ContentService.createTextOutput(p.callback + "(" + json + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/** ================== ROBUST GIFT LOGIC (QUA SHEET) ================== */

function withQuaLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // Đợi tối đa 20s
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function ensureQuaSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_QUA);
  if (!sh) {
    sh = ss.insertSheet(SHEET_QUA);
    sh.getRange(1, 1, 1, 4).setValues([["ID", "Quà", "Đã quay", "Thời gian"]]);
  }

  const lastRow = sh.getLastRow();
  if (lastRow === 0) {
    sh.getRange(1, 1, 1, 4).setValues([["ID", "Quà", "Đã quay", "Thời gian"]]);
  }

  // Tự động sửa lỗi tiêu đề nếu bị lệch
  const hdr = sh.getRange(1, 1, 1, Math.max(4, sh.getLastColumn())).getValues()[0];
  const a = String(hdr[0] || "").toLowerCase();
  if (a !== "id") {
    // Nếu cột A không phải ID, có thể là cấu trúc cũ 3 cột
    if (a.includes("quà") || a.includes("qua")) {
      sh.insertColumnBefore(1);
      sh.getRange(1, 1, 1, 4).setValues([["ID", "Quà", "Đã quay", "Thời gian"]]);
    }
  }

  fillMissingGiftIds_(sh);
  return sh;
}

function fillMissingGiftIds_(sh) {
  const lr = sh.getLastRow();
  if (lr < 2) return;
  const rng = sh.getRange(2, 1, lr - 1, 1);
  const ids = rng.getValues();
  let changed = false;
  for (let i = 0; i < ids.length; i++) {
    if (!ids[i][0]) {
      ids[i][0] = Utilities.getUuid().slice(0, 8);
      changed = true;
    }
  }
  if (changed) rng.setValues(ids);
}

function getQuaIndexes_(sh) {
  const hdr = sh.getRange(1, 1, 1, Math.max(4, sh.getLastColumn())).getValues()[0]
    .map(x => String(x || "").trim().toLowerCase());
  const idx = {};
  for (let i = 0; i < hdr.length; i++) {
    if (hdr[i] === "id") idx.id = i + 1;
    if (hdr[i] === "quà" || hdr[i] === "qua") idx.name = i + 1;
    if (hdr[i] === "đã quay" || hdr[i] === "da quay") idx.spun = i + 1;
    if (hdr[i] === "thời gian" || hdr[i] === "thoi gian") idx.time = i + 1;
  }
  return idx;
}

function listGifts_(includeSpun) {
  return withQuaLock_(function() {
    const sh = ensureQuaSheet_();
    const idx = getQuaIndexes_(sh);
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return [];

    const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
    const gifts = [];
    for (let i = 0; i < values.length; i++) {
      const name = String(values[i][idx.name - 1] || "").trim();
      const spun = String(values[i][idx.spun - 1]).toUpperCase() === "TRUE";
      if (!name) continue;
      if (!includeSpun && spun) continue;

      gifts.push({
        rowIndex: i + 2,
        id: String(values[i][idx.id - 1] || ""),
        name: name,
        spun: spun,
        time: values[i][idx.time - 1] ? values[i][idx.time - 1].toString() : ""
      });
    }
    return gifts;
  });
}

function markGift_(rowIndex) {
  return withQuaLock_(function() {
    const sh = ensureQuaSheet_();
    const idx = getQuaIndexes_(sh);
    const now = new Date();
    sh.getRange(rowIndex, idx.spun).setValue(true);
    sh.getRange(rowIndex, idx.time).setValue(now);
    SpreadsheetApp.flush();
    return { 
      rowIndex: rowIndex, 
      name: sh.getRange(rowIndex, idx.name).getValue(), 
      spun: true, 
      time: now.toISOString() 
    };
  });
}

function resetGifts_() {
  return withQuaLock_(function() {
    const sh = ensureQuaSheet_();
    const idx = getQuaIndexes_(sh);
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    sh.getRange(2, idx.spun, lastRow - 1, 1).clearContent();
    sh.getRange(2, idx.time, lastRow - 1, 1).clearContent();
    SpreadsheetApp.flush();
  });
}

function addGift_(name) {
  return withQuaLock_(function() {
    const sh = ensureQuaSheet_();
    const idx = getQuaIndexes_(sh);
    const id = Utilities.getUuid().slice(0, 8);
    const row = [];
    const maxIdx = Math.max(idx.id, idx.name, idx.spun, idx.time);
    for(let i=1; i<=maxIdx; i++) row.push("");
    
    row[idx.id - 1] = id;
    row[idx.name - 1] = name;
    row[idx.spun - 1] = false;
    
    sh.appendRow(row);
    SpreadsheetApp.flush();
    return { rowIndex: sh.getLastRow(), id: id };
  });
}

function updateGift_(rowIndex, name) {
  return withQuaLock_(function() {
    const sh = ensureQuaSheet_();
    const idx = getQuaIndexes_(sh);
    sh.getRange(rowIndex, idx.name).setValue(name);
    SpreadsheetApp.flush();
  });
}

function deleteGift_(rowIndex) {
  return withQuaLock_(function() {
    const sh = ensureQuaSheet_();
    if (rowIndex < 2 || rowIndex > sh.getLastRow()) return;
    sh.deleteRow(rowIndex);
    SpreadsheetApp.flush();
  });
}

/** ================== CONFIG & DATA (EXISTING) ================== */

function getConfig_() {
  ensureConfigSheet_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONFIG);
  const data = sheet.getDataRange().getValues();
  const config = {};
  data.slice(1).forEach(r => { config[r[0]] = r[1]; });
  return config;
}

function ensureConfigSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CONFIG);
    sheet.appendRow(["Key", "Value"]);
  }
  const defaults = { speed: "50", position: "bottom", bgType: "image", bgValue: "https://picsum.photos/1920/1080", loseSlots: "0", spinDuration: "4.2" };
  const data = sheet.getDataRange().getValues();
  const existingKeys = data.slice(1).map(r => r[0]);
  for (let key in defaults) {
    if (existingKeys.indexOf(key) === -1) sheet.appendRow([key, defaults[key]]);
  }
}

function saveConfig_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONFIG);
  const data = sheet.getDataRange().getValues();
  for (let key in payload) {
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(String(payload[key]));
        found = true; break;
      }
    }
    if (!found) sheet.appendRow([key, String(payload[key])]);
  }
  SpreadsheetApp.flush();
}

function getTickerData_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return { rows: [], tickerText: "" };
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1).map((r, i) => ({ stt: r[0], name: r[1], cls: r[2], money: r[3] }));
  const config = getConfig_();
  const tickerText = rows.map(r => `${r.name}${config.showClass === "true" && r.cls ? " (" + r.cls + ")" : ""}: ${Number(r.money).toLocaleString()}đ`).join(config.separator || " - ");
  return { rows, tickerText };
}

function listRows_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1).map((r, i) => ({ rowIndex: i + 2, stt: r[0], name: r[1], cls: r[2], money: r[3] }));
}

function addRow_(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_DATA);
    sheet.appendRow(["STT", "Họ tên", "Lớp", "Số tiền"]);
  }
  const stt = sheet.getLastRow();
  sheet.appendRow([stt, p.name, p.cls || "", p.money]);
  SpreadsheetApp.flush();
}

function updateRow_(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  sheet.getRange(p.rowIndex, 2, 1, 3).setValues([[p.name, p.cls || "", p.money]]);
  SpreadsheetApp.flush();
}

function deleteRow_(idx) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  sheet.deleteRow(idx);
  SpreadsheetApp.flush();
}

function listClasses_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("LOP");
  if (!sheet) return [];
  return sheet.getDataRange().getValues().flat().filter(String);
}

function listDriveImages_(id) {
  if (!id) return [];
  const folder = DriveApp.getFolderById(id);
  const files = folder.getFiles();
  const imgs = [];
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType().startsWith("image/")) imgs.push({ id: f.getId(), name: f.getName(), url: "https://lh3.googleusercontent.com/d/" + f.getId() });
  }
  return imgs;
}
