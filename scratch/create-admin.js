const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });
const crypto = require('crypto');

// Generate a random API key
const generateApiKey = () => crypto.randomBytes(32).toString('hex');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' },
  apiKey: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function createAdmin() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const email = "admin@glacio.com";
  const password = "glacioadmin2026";
  const name = "Glacio Super Admin";
  
  const existingAdmin = await User.findOne({ email });
  if (existingAdmin) {
    console.log("Admin zaten mevcut. API Key:", existingAdmin.apiKey);
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const apiKey = generateApiKey();

  const admin = await User.create({
    name,
    email,
    password: hashedPassword,
    role: 'admin',
    apiKey
  });

  console.log("Super Admin basariyla olusturuldu!");
  console.log("-----------------------------------");
  console.log("Email: " + email);
  console.log("Sifre: " + password);
  console.log("Admin API Key (Cihaza girilecek): " + apiKey);
  console.log("-----------------------------------");
  
  process.exit(0);
}

createAdmin();
