const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { replaceGuards } = require('../api/_replace-guards');
const { validateShiftPairs } = require('../api/_guard-rules');
const original = () => ({ date: '2026-10-10', updatedAt: 'v1', assignments: Array.from({ length: 7 }, (_, i) => ({ slot: i + 1, name: 'Old ' + i, rank: 'old', ban: 'A' })) });
const state = (names, statuses = {}) => ({ people: names.map(name => ({ name, rank: 'new', ban: 'B' })), statuses });

test('preserves unaffected shifts and synchronizes replacement details', () => {
  const doc = original();
  const result = replaceGuards(doc, [3], state(['Old 2', 'New']), []);
  assert.deepEqual(result.filter(a => a.slot !== 3), doc.assignments.filter(a => a.slot !== 3));
  assert.deepEqual(result[2], { slot: 3, name: 'New', rank: 'new', ban: 'B', note: '' });
});
test('one selected shift excludes the absent person from the whole day', () => {
  const doc = original();doc.assignments[4].name = doc.assignments[0].name;
  const result = replaceGuards(doc, [1], state(['Old 0', 'New A', 'New B']), []);
  assert.equal(result.some(a => a.name === 'Old 0'), false);
  assert.equal(result[4].name, 'New B');
  assert.deepEqual(result.filter(a => ![1, 5].includes(a.slot)), doc.assignments.filter(a => ![1, 5].includes(a.slot)));
});
test('previously absent people remain excluded in later replacement attempts that day', () => {
  const doc = original();doc.unavailableNames = ['Absent A'];
  doc.replacements = [{ changes: [{ before: { name: 'Absent B' } }] }];
  const result = replaceGuards(doc, [3], state(['Absent A', 'Absent B', 'New']), []);
  assert.equal(result[2].name, 'New');
});
test('rejects unavailable personnel without modifying original schedule', () => {
  for (const flag of ['phep', 'vien', 'ct', 'tbCong', 'moi', 'nt', 'hoi']) {
    const doc = original(), before = JSON.stringify(doc);
    assert.throws(() => replaceGuards(doc, [3], state(['New'], { 0: { [flag]: true } }), []), /Không đủ người/);
    assert.equal(JSON.stringify(doc), before);
  }
  assert.throws(() => replaceGuards(original(), [7], state(['New'], { 0: { drive: true } }), []));
});
test('finds a complete solution when a special restriction limits one shift', () => {
  const result = replaceGuards(original(), [1, 3], state(['General', 'Sports'], { 1: { hoi: true } }), []);
  assert.equal(result[0].name, 'Sports');
  assert.equal(result[2].name, 'General');
});
test('allows only a nonconsecutive day/night pair when personnel are scarce', () => {
  assert.deepEqual(replaceGuards(original(), [1, 5], state(['New']), []).filter(a => a.name === 'New').map(a => a.slot), [1, 5]);
  assert.throws(() => replaceGuards(original(), [1, 3], state(['New']), []));
  assert.throws(() => replaceGuards(original(), [5, 7], state(['New']), []));
  assert.throws(() => replaceGuards(original(), [4, 5], state(['New']), []));
  assert.throws(() => replaceGuards(original(), [1, 2], state(['New']), []));
  assert.throws(() => replaceGuards(original(), [1, 3, 5], state(['New']), []));
});
test('prefers an unused person before giving a second shift to anyone', () => {
  const result = replaceGuards(original(), [5], state(['Old 0', 'New']), []);
  assert.equal(result[4].name, 'New');
});
test('a replacement can take a second eligible shift while other shifts stay fixed', () => {
  const result = replaceGuards(original(), [5], state(['Old 0']), []);
  assert.equal(result[4].name, 'Old 0');
  assert.deepEqual(result.filter(a => a.slot !== 5), original().assignments.filter(a => a.slot !== 5));
  assert.throws(() => replaceGuards(original(), [5], state(['Old 3']), []));
  assert.throws(() => replaceGuards(original(), [7], state(['Old 4']), []));
});
test('validates every day/night pair and rejects all same-period, consecutive or third shifts', () => {
  for (let first = 1; first <= 7; first++) for (let second = first + 1; second <= 7; second++) {
    const assignments = [{ slot: first, name: 'New' }, { slot: second, name: 'New' }];
    if (first <= 4 && second >= 5 && second - first > 1) assert.doesNotThrow(() => validateShiftPairs(assignments));
    else assert.throws(() => validateShiftPairs(assignments));
  }
  assert.throws(() => validateShiftPairs([1, 5, 7].map(slot => ({ slot, name: 'New' }))));
});
test('initial cutting applies the same day/night and adjacency rules', () => {
  const source = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const fn = source.slice(source.indexOf('function eligibleForSlot('), source.indexOf('function score('));
  const context = { people: [{ name: 'New' }], statuses: {}, isUnavailable: () => false, saturday: () => false, friday: () => false, sunday: () => false, getHist: () => [], daysAgo: () => '' };
  vm.runInNewContext(fn, context);
  const chosen = slots => slots.map(slot => ({ slot, name: 'New', idx: 0 }));
  assert.equal(context.eligibleForSlot(0, 5, original().date, chosen([1])), true);
  for (const [slot, existing] of [[3, [1]], [7, [5]], [5, [4]], [7, [1, 5]]]) assert.equal(context.eligibleForSlot(0, slot, original().date, chosen(existing)), false);
});
test('respects previous late shifts and calculates consecutive-day notes', () => {
  const previous = [{ date: '2026-10-09', assignments: [{ slot: 6, name: 'New' }] }];
  assert.throws(() => replaceGuards(original(), [7], state(['New']), previous));
  assert.equal(replaceGuards(original(), [3], state(['New']), previous)[2].note, 'Gác 2 ngày liên tục');
});

async function request(role, body, matchedCount = 1, doc = original()) {
  const writes = [];
  const col = { findOne: async () => doc, find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }), updateOne: async (...args) => { writes.push(args); return { matchedCount }; } };
  const database = { collection: name => name === 'guard_history' ? col : { findOne: async () => state(['New']) } };
  const context = { module: { exports: {} }, console, require: name => name === './_mongo' ? { db: async () => database } : name === './_auth' ? { requireAuth: () => ({ role, username: 'tester' }) } : require('../api/' + name.slice(2)) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/history'), 'utf8'), context);
  const response = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await context.module.exports({ method: 'PATCH', body }, response);
  return { response, writes };
}
test('both roles can replace guards; updates are atomic and record an audit trail', async () => {
  for (const role of ['user', 'admin']) {
    const { response, writes } = await request(role, { action: 'replace', date: original().date, slots: [3], expectedAssignments: original().assignments });
    assert.equal(response.code, 200);
    assert.equal(writes[0][0].updatedAt, 'v1');
    assert.equal(writes[0][1].$push.replacements.by, 'tester');
    assert.equal(writes[0][1].$push.replacements.changes[0].before.name, 'Old 2');
    assert.deepEqual(Array.from(writes[0][1].$set.unavailableNames), ['Old 2']);
  }
});
test('stale schedules and invalid shifts cannot overwrite history', async () => {
  const body = { action: 'replace', date: original().date, slots: [3], expectedAssignments: [] };
  const stale = await request('user', body);
  assert.equal(stale.response.code, 409);assert.equal(stale.writes.length, 0);
  const invalid = await request('user', { ...body, slots: [3, 3] });
  assert.equal(invalid.response.code, 400);assert.equal(invalid.writes.length, 0);
  const race = await request('user', { ...body, expectedAssignments: original().assignments }, 0);
  assert.equal(race.response.code, 409);
});
test('API expands one selected shift to every shift of an absent person and audits them', async () => {
  const doc = original();doc.assignments[4].name = doc.assignments[0].name;
  const { response, writes } = await request('user', { action: 'replace', date: doc.date, slots: [1], expectedAssignments: doc.assignments }, 1, doc);
  assert.equal(response.code, 200);
  assert.equal(response.body.assignments.some(a => a.name === 'Old 0'), false);
  assert.deepEqual(Array.from(writes[0][1].$push.replacements.changes, c => c.slot), [1, 5]);
});
test('regular users still cannot freely edit history names', async () => {
  assert.equal((await request('user', { date: original().date, changes: [{ slot: 3, name: 'New' }] })).response.code, 403);
});
