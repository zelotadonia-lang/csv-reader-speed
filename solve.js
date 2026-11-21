// Fast drop-in for csv-reader 1.0.0 (make.fun's own reference program).
// Same answers for every input, same error records, same order —
// just without the character-at-a-time loop.
//
// Strategy: most records are plain lines (no quotes, no stray CRs), so a
// record is read as one line slice and split on ',' with String.split,
// which V8 does natively. Only a line that carries a '"' or a stray CR
// falls back to a field-by-field scan, which itself jumps with indexOf
// instead of stepping one character at a time.
//
// Semantics follow vendor/csv-reader/index.js exactly:
// - U+FEFF at the very start is dropped.
// - A record ends at LF or CRLF; a line left with no characters is no record.
// - Outside quotes a CR not followed by LF is dropped (stray_cr).
// - A field opening with '"' runs to the next quote that is not doubled;
//   "" inside is one '"', each CRLF or lone CR inside reads as LF; what
//   follows the closing quote up to the next comma or line break is
//   appended as it stands (quote_junk, when the field ends); a quote that
//   never closes is a literal character and the text after it is read again
//   as unquoted (unterminated_quote).
// - A quote inside an unquoted field is a literal character.
// - columns is the first record when header is true, else null; rows are
//   padded with "" (short_row, with fields: its count) or cut (long_row,
//   with extra: the cut fields) to the first record's width.
// - Each error is {code, line, row}: line the 1-based line its record
//   starts on, row its record's index in rows (null for the header), in
//   the order met; a record's short_row/long_row when the record ends.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// Field result, written by readUnquoted/readQuoted instead of allocating
// one small object per field.
let fv = '';
let fe = END;
let fa = 0;

const DELIM = /[,\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on and its index in rows (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). `added` counts
  // the characters kept, so a caller can tell whether junk followed a quote.
  function readUnquoted(value) {
    let v = value;
    let added = 0;
    while (pos < n) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        v += text.slice(pos);
        added += n - pos;
        pos = n;
        break;
      }
      const idx = m.index;
      const kind = m[0];
      if (idx > pos) {
        v += text.slice(pos, idx);
        added += idx - pos;
      }
      if (kind === ',') {
        pos = idx + 1;
        fv = v; fe = COMMA; fa = added;
        return;
      }
      if (kind === '\n') {
        pos = idx + 1;
        line += 1;
        fv = v; fe = LINE_BREAK; fa = added;
        return;
      }
      // a CR.
      if (text.charCodeAt(idx + 1) === 10) {
        pos = idx + 2;
        line += 1;
        fv = v; fe = LINE_BREAK; fa = added;
        return;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = idx + 1;
    }
    fv = v; fe = END; fa = added;
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let close = -1;
    let q = text.indexOf('"', pos);
    while (q !== -1) {
      if (text.charCodeAt(q + 1) === 34) {
        q = text.indexOf('"', q + 2);
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted('"');
      return;
    }
    const raw = text.slice(pos, close);
    // Every LF, CRLF and lone CR inside the quotes counts one line.
    const breaks = raw.match(/\n|\r(?!\n)/g);
    if (breaks !== null) line += breaks.length;
    let value = raw;
    if (value.indexOf('"') !== -1) value = value.replace(/""/g, '"');
    if (value.indexOf('\r') !== -1) value = value.replace(/\r\n?/g, '\n');
    pos = close + 1;
    if (pos >= n) { fv = value; fe = END; fa = 0; return; }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fv = value; fe = COMMA; fa = 0;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fv = value; fe = LINE_BREAK; fa = 0;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fv = value; fe = LINE_BREAK; fa = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    readUnquoted(value);
    if (fa > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  // Finishes a record's fields: header, width fix-ups, or a row.
  // Returns false when the fields were no record at all.
  function finishRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return false;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return true;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
    return true;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      if (text.charCodeAt(pos) === 10) {
        pos += 1;
        line += 1;
      } else if (text.charCodeAt(pos) === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the rest of this line holds no quote and no CR except a
    // trailing one before its LF, so the record ends at the line end and
    // its fields are one split. The segment is sliced once (a view, no
    // copy) so every scan below stays inside this line.
    const lineEnd = text.indexOf('\n', pos);
    const segEnd = lineEnd === -1 ? n : lineEnd;
    const seg = text.slice(pos, segEnd);
    const qi = seg.indexOf('"');
    const ri = seg.indexOf('\r');
    if (qi === -1 && (ri === -1 || (lineEnd !== -1 && ri === seg.length - 1))) {
      const fields = (ri === seg.length - 1 ? seg.slice(0, -1) : seg).split(',');
      pos = lineEnd === -1 ? n : lineEnd + 1;
      if (lineEnd !== -1) line += 1;
      finishRecord(fields, false);
      continue;
    }

    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted(); else readUnquoted('');
      fields.push(fv);
    } while (fe === COMMA);
    finishRecord(fields, quoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
