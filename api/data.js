const { db } = require('./_mongo');
const { requireAuth } = require('./_auth');

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const database = await db();
    const col = database.collection('app_state');
    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: 'main' });
      return res.status(200).json(doc ? { people: doc.people || [], statuses: doc.statuses || {} } : null);
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      await col.updateOne(
        { _id: 'main' },
        { $set: { people: body.people || [], statuses: body.statuses || {}, updatedAt: new Date() } },
        { upsert: true }
      );
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};
