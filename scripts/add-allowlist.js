// Adiciona um e-mail à allowlist do site.
// Uso: node scripts/add-allowlist.js email@dominio.com [outro@dominio.com ...]
// Requer service-account.json na raiz (ou FIREBASE_SERVICE_ACCOUNT no ambiente).

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase()).filter(Boolean);
if (emails.length === 0) {
  console.error('Uso: node scripts/add-allowlist.js email@dominio.com [...]');
  process.exit(1);
}

const credJson = process.env.FIREBASE_SERVICE_ACCOUNT
  || readFileSync(new URL('../service-account.json', import.meta.url), 'utf8');

initializeApp({ credential: cert(JSON.parse(credJson)) });
const db = getFirestore();

for (const email of emails) {
  await db.collection('allowlist').doc(email).set({ addedAt: new Date() });
  console.log(`allowlist: ${email}`);
}
