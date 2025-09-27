import { getAllActiveUsers } from '../db/db.js';
import { runTradingLogic } from './botLogic.js';

console.log('Worker started');

async function loopOnce() {
  try {
    const users = await getAllActiveUsers();
    console.log(`Found ${users.length} users`);
    for (const u of users) {
      try {
        await runTradingLogic(u);
      } catch (err) {
        console.error('Error running user bot', u.id, err);
      }
    }
  } catch (err) {
    console.error('Worker main loop error', err);
  }
}

loopOnce();
setInterval(loopOnce, 5 * 60 * 1000);
