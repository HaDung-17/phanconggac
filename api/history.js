const { db } = require('./_mongo');
const { requireAuth } = require('./_auth');
const { replaceGuards } = require('./_replace-guards');
const { validateShiftPairs } = require('./_guard-rules');

module.exports = async (req, res) => {
  try {
    const session = requireAuth(req, res);
    if (!session) return;
    const database = await db();
    const col = database.collection('guard_history');
    if (req.method === 'GET') {
      if (req.query.date) {
        const doc = await col.findOne({ _id: req.query.date });
        return res.status(200).json(doc ? [doc] : []);
      }
      const limit = Math.min(Math.max(Number(req.query.limit || 5), 1), 30);
      const docs = await col.find({}).sort({ date: -1 }).limit(limit).toArray();
      return res.status(200).json(docs.map(({ _id, ...x }) => x));
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.date || !Array.isArray(body.assignments)) return res.status(400).json({ error: 'Thiếu date hoặc assignments' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date) || body.assignments.length !== 7) return res.status(400).json({ error: 'Ngày hoặc danh sách 7 ca gác không hợp lệ.' });
      if (body.assignments.some(a => !a || !Number.isInteger(a.slot) || a.slot < 1 || a.slot > 7 || typeof a.name !== 'string' || !a.name.trim()) || new Set(body.assignments.map(a => a.slot)).size !== 7) return res.status(400).json({ error: 'Danh sách phải có đủ 7 ca khác nhau và tên người gác.' });
      validateShiftPairs(body.assignments);
      try {
        await col.insertOne({
          _id: body.date, date: body.date, assignments: body.assignments,
          peopleSnapshot: body.peopleSnapshot || [], statusesSnapshot: body.statusesSnapshot || {},
          updatedAt: new Date()
        });
      } catch (e) {
        if (e.code === 11000) return res.status(409).json({ error: 'Ngày này đã cắt gác rồi, vui lòng xem lại lịch sử cắt gác.' });
        throw e;
      }
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'PATCH') {
      if (req.body?.action === 'replace') {
        const { date, expectedAssignments } = req.body;
        let { slots } = req.body;
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(slots) || !slots.length || slots.length > 7 || new Set(slots).size !== slots.length || slots.some(s => !Number.isInteger(s) || s < 1 || s > 7)) return res.status(400).json({ error: 'Ngày hoặc ca cần thay không hợp lệ.' });
        const doc = await col.findOne({ _id: date });
        if (!doc) return res.status(404).json({ error: 'Không tìm thấy lịch đã cắt.' });
        if (!Array.isArray(doc.assignments) || doc.assignments.length !== 7 || new Set(doc.assignments.map(a => a.slot)).size !== 7 || slots.some(s => !doc.assignments.some(a => a.slot === s))) return res.status(400).json({ error: 'Lịch phải có đủ 7 ca hợp lệ để thay người.' });
        if (JSON.stringify(expectedAssignments) !== JSON.stringify(doc.assignments)) return res.status(409).json({ error: 'Lịch vừa thay đổi. Vui lòng mở lại Cắt gác lại để chọn ca.' });
        const absent = new Set(doc.assignments.filter(a => slots.includes(a.slot)).map(a => a.name));
        // A sudden absence applies to the whole day, including all shifts of that person.
        const unavailableNames = [...new Set([...(doc.unavailableNames || []), ...(doc.replacements || []).flatMap(r => (r.changes || []).map(c => c.before?.name)).filter(Boolean), ...absent])];
        const normalize = name => String(name || '').normalize('NFC').trim().toLocaleLowerCase('vi');
        const unavailable = new Set(unavailableNames.map(normalize));
        slots = doc.assignments.filter(a => unavailable.has(normalize(a.name))).map(a => a.slot);
        const state = await database.collection('app_state').findOne({ _id: 'main' });
        const previous = await col.find({ date: { $lt: date } }).sort({ date: -1 }).limit(30).toArray();
        const assignments = replaceGuards(doc, slots, state, previous);
        const result = await col.updateOne({ _id: date, updatedAt: doc.updatedAt, assignments: doc.assignments }, {
          $set: { assignments, unavailableNames, updatedAt: new Date(), lastEditedBy: session.username },
          $push: { replacements: { at: new Date(), by: session.username, changes: slots.map(slot => ({ slot, before: doc.assignments.find(a => a.slot === slot), after: assignments.find(a => a.slot === slot) })) } }
        });
        if (!result.matchedCount) return res.status(409).json({ error: 'Lịch vừa được cập nhật ở nơi khác. Vui lòng mở lại Cắt gác lại.' });
        return res.status(200).json({ ok: true, date, assignments });
      }
      if (session.role !== 'admin') return res.status(403).json({ error: 'Chỉ Admin được sửa tên trong lịch sử.' });
      const { date, changes } = req.body || {};
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(changes) || !changes.length || changes.length > 30) {
        return res.status(400).json({ error: 'Ngày hoặc danh sách sửa tên không hợp lệ.' });
      }
      const doc = await col.findOne({ _id: date });
      if (!doc) return res.status(404).json({ error: 'Không tìm thấy lịch sử cần sửa.' });
      if (!Array.isArray(doc.assignments)) return res.status(400).json({ error: 'Dữ liệu lịch sử không hợp lệ.' });
      const existingSlots = new Set(doc.assignments.map(a => Number(a.slot)));
      const changed = new Map();
      for (const c of changes) {
        if (!c || !Number.isInteger(c.slot) || !existingSlots.has(c.slot) || changed.has(c.slot) || typeof c.name !== 'string' || !c.name.trim() || c.name.trim().length > 120 || /[\x00-\x1F\x7F]/.test(c.name)) {
          return res.status(400).json({ error: 'Ca gác hoặc tên nhập vào không hợp lệ.' });
        }
        changed.set(c.slot, c.name.trim());
      }
      // Đồng bộ thông tin theo Danh sách Tổng hiện tại, không giữ Ban/Cấp bậc của người cũ.
      const state = await database.collection('app_state').findOne({ _id: 'main' });
      const personnel = Array.isArray(state?.people) ? state.people : [];
      const normalize = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
      const previous = await col.find({ date: { $lt: date } }).sort({ date: -1 }).limit(30).toArray();
      const assignments = doc.assignments.map(a => {
        if (!changed.has(Number(a.slot))) return a;
        const name = changed.get(Number(a.slot));
        const key = normalize(name);
        const exact = personnel.filter(p => normalize(p.name) === key);
        const matches = exact.length ? exact : (!key.includes(' ') ? personnel.filter(p => normalize(p.name).split(' ').pop() === key) : []);
        // Tên gõ tự do nhưng phải khớp duy nhất Danh sách Tổng để đồng bộ đúng.
        if (matches.length !== 1) throw Object.assign(new Error('Tên "' + name + '" không khớp duy nhất với Danh sách Tổng. Vui lòng kiểm tra hoặc thêm quân nhân vào Danh sách Tổng trước.'), { statusCode: 400 });
        const person = matches[0];
        let consecutive = 0;
        for (let offset = 1; offset <= 30; offset++) {
          const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - offset);
          const day = previous.find(h => h.date === d.toISOString().slice(0, 10));
          if (!day?.assignments?.some(x => normalize(x.name) === normalize(person.name))) break;
          consecutive++;
        }
        return { ...a, name: person.name, rank: person.rank || '', ban: person.ban || '', note: consecutive ? 'Gác ' + (consecutive + 1) + ' ngày liên tục' : '' };
      });
      validateShiftPairs(assignments);
      const result = await col.updateOne({ _id: date, updatedAt: doc.updatedAt }, { $set: { assignments, updatedAt: new Date(), lastEditedBy: session.username } });
      if (!result.matchedCount) return res.status(409).json({ error: 'Lịch sử vừa được cập nhật ở nơi khác. Vui lòng mở lại và sửa.' });
      return res.status(200).json({ ok: true, date, assignments });
    }
    if (req.method === 'DELETE') {
      if (session.role !== 'admin') { return res.status(403).json({ error: 'Chỉ tài khoản quản trị mới có quyền xóa lịch sử.' }); }
      const date = req.query.date;
      if (!date) return res.status(400).json({ error: 'Thiếu ngày cần xóa' });
      const result = await col.deleteOne({ _id: date });
      if (!result.deletedCount) return res.status(404).json({ error: 'Không tìm thấy lịch sử của ngày này' });
      return res.status(200).json({ ok: true, date });
    }
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
};
