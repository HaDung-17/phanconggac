const normalizeName = name => String(name || '').normalize('NFC').trim().toLocaleLowerCase('vi');
const isDayShift = slot => slot >= 1 && slot <= 4;

function canAddShift(assignments, name, slot) {
  const existing = assignments.filter(a => normalizeName(a.name) === normalizeName(name));
  return existing.length < 2 && existing.every(a => isDayShift(a.slot) !== isDayShift(slot) && Math.abs(a.slot - slot) > 1);
}

function validateShiftPairs(assignments) {
  const chosen = [];
  for (const assignment of assignments) {
    if (!canAddShift(chosen, assignment.name, assignment.slot)) {
      throw Object.assign(new Error('Đồng chí ' + assignment.name + ' chỉ được gác tối đa 2 ca: một ca ngày (1–4), một ca đêm (5–7), và tuyệt đối không hai ca liên tiếp.'), { statusCode: 400 });
    }
    chosen.push(assignment);
  }
}
module.exports = { canAddShift, validateShiftPairs };
