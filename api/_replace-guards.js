// Find replacements without moving unaffected shifts or relaxing eligibility rules.
const { canAddShift, validateShiftPairs } = require('./_guard-rules');
function replaceGuards(doc, slots, state, previous) {
  const people = state?.people || [], statuses = state?.statuses || {};
  const date = doc.date, weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  const normalize = n => String(n || '').normalize('NFC').trim().toLocaleLowerCase('vi');
  const absent = new Set([...(doc.unavailableNames || []), ...(doc.replacements || []).flatMap(r => (r.changes || []).map(c => c.before?.name)), ...doc.assignments.filter(a => slots.includes(a.slot)).map(a => a.name)].map(normalize));
  slots = doc.assignments.filter(a => absent.has(normalize(a.name))).map(a => a.slot);
  const dayBefore = offset => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - offset); return d.toISOString().slice(0, 10); };
  const had = (p, offset) => previous.find(h => h.date === dayBefore(offset))?.assignments?.some(a => normalize(a.name) === normalize(p.name));
  const streak = p => { let n = 0; while (n < 30 && had(p, n + 1)) n++; return n; };
  const kept = doc.assignments.filter(a => !slots.includes(a.slot));
  const eligible = (p, i, slot, chosen) => {
    const s = statuses[i] || {}, name = normalize(p.name);
    if (absent.has(name) || s.phep || s.vien || s.ct || s.tbCong || s.moi) return false;
    if (!canAddShift(chosen, p.name, slot)) return false;
    if (s.hoi && slot !== 1 && slot !== 7 || s.drive && slot > 4) return false;
    if (s.nt && (weekday === 6 || weekday === 5 && slot >= 4 || weekday === 0 && slot <= 4)) return false;
    return !([6, 7].includes(slot) && previous.find(h => h.date === dayBefore(1))?.assignments?.some(a => normalize(a.name) === name && [6, 7].includes(a.slot)));
  };
  const score = (p, i, slot, chosen) => {
    const s = statuses[i] || {}; let gap = 6;
    for (let n = 1; n <= 5; n++) if (had(p, n)) { gap = n; break; }
    return gap * 100 - streak(p) * 80 + (s.hoi ? 25 : 0) + (s.drive ? 12 : 0) + (s.nt ? 8 : 0) + (weekday === 0 && slot >= 5 && s.nt ? 10000 : 0) - (chosen.some(a => a.ban === p.ban) ? 25 : 0) - (chosen.some(a => a.slot === slot - 1 && a.ban === p.ban) ? 80 : 0) + (p.ban === 'Ban Hành chính' ? 8 : 0);
  };
  function search(pending, chosen, repeat) {
    if (!pending.length) return chosen;
    const options = pending.map(slot => ({ slot, candidates: people.map((p, i) => ({ p, i })).filter(({ p, i }) => eligible(p, i, slot, chosen) && (repeat ? chosen.filter(a => normalize(a.name) === normalize(p.name)).length < 2 : !chosen.some(a => normalize(a.name) === normalize(p.name)))).sort((a, b) => score(b.p, b.i, slot, chosen) - score(a.p, a.i, slot, chosen)) }));
    options.sort((a, b) => a.candidates.length - b.candidates.length);
    const { slot, candidates } = options[0];
    for (const { p } of candidates) {
      const n = streak(p);
      const result = search(pending.filter(s => s !== slot), [...chosen, { slot, name: p.name, rank: p.rank || '', ban: p.ban || '', note: n ? 'Gác ' + (n + 1) + ' ngày liên tục' : '' }], repeat);
      if (result) return result;
    }
    return null;
  }
  const result = search(slots, kept, false) || search(slots, kept, true);
  if (!result) throw Object.assign(new Error('Không đủ người phù hợp để thay các ca đã chọn. Vui lòng kiểm tra trạng thái hoặc bổ sung quân số. Lịch cũ vẫn được giữ nguyên.'), { statusCode: 400 });
  validateShiftPairs(result);
  return result.sort((a, b) => a.slot - b.slot);
}
module.exports = { replaceGuards };
