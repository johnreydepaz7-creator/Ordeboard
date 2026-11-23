// Run once while setting up OrderBoard, then store the plaintext key OFFLINE.
import { randomBytes, createHash } from 'node:crypto';
const key = randomBytes(32).toString('base64url');
const digest = createHash('sha256').update(key).digest('hex');
console.log('SAVE THIS PRIVATE OWNER RECOVERY KEY OFFLINE (shown once):');
console.log(key);
console.log('Add this hash to server/.env (the real key must NOT be stored there):');
console.log(`OWNER_RECOVERY_KEY_HASH=${digest}`);
console.log('Do not upload either value to GitHub or share this output.');
