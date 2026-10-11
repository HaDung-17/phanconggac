const { MongoClient, ServerApiVersion } = require('mongodb');

let clientPromise;

function getClient() {
  if (!process.env.MONGODB_URI) throw new Error('Thiếu biến môi trường MONGODB_URI');
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
    });
    clientPromise = client.connect();
  }
  return clientPromise;
}

async function db() {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB || 'cat_gac');
}

module.exports = { db };
