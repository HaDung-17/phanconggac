const { db } = require('./_mongo');
const { requireAuth } = require('./_auth');

module.exports = async (req, res) => {
  try {
    const session = requireAuth(req, res);
    if (!session) return;
    const database = await db();
    const col = database.collection('guard_history');
    if (req.method === 'GET') {
      const limit = Math.min(Math.max(Number(req.query.limit || 5), 1), 30);
      const docs = await col.find({}).sort({ date: -1 }).limit(limit).toArray();
      return res.status(200).json(docs.map(({ _id, ...x }) => x));
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.date || !Array.isArray(body.assignments)) return res.status(400).json({ error: 'Thiếu date hoặc assignments' });
      await col.updateOne(
        { _id: body.date },
        { $set: {
          date: body.date,
          assignments: body.assignments,
          peopleSnapshot: body.peopleSnapshot || [],
          statusesSnapshot: body.statusesSnapshot || {},
          updatedAt: new Date()
        } },
        { upsert: true }
      );
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'PATCH') {
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
      const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
      const assignments = doc.assignments.map(a => {
        if (!changed.has(Number(a.slot))) return a;
        const name = changed.get(Number(a.slot));
        const matches = personnel.filter(p => normalize(p.name) === normalize(name));
        // Tên gõ tự do nhưng phải khớp duy nhất Danh sách Tổng để đồng bộ đúng.
        if (matches.length !== 1) throw Object.assign(new Error('Tên "' + name + '" không khớp duy nhất với Danh sách Tổng. Vui lòng kiểm tra hoặc thêm quân nhân vào Danh sách Tổng trước.'), { statusCode: 400 });
        const person = matches[0];
        return { ...a, name: person.name, rank: person.rank || '', ban: person.ban || '' };
      });
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
