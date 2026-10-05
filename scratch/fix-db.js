const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function fixName() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  await db.collection('devices').updateMany(
    { name: /Yeni Cihaz/ },
    [ { $set: { name: "$deviceId" } } ]
  );
  console.log("Device names updated.");
  process.exit(0);
}
fixName();
