import { checkAndDeactivateExpiredPasswords } from "./functions";



const cron = require('node-cron');
class CronJobs {
    static checkExpiredPasswords() {
      const task = cron.schedule(
        '0 0 * * *',
        async () => {
            console.log('Checking and deactivating expired passwords...');
            await checkAndDeactivateExpiredPasswords();
          },
        {
          scheduled: true,
          timezone: 'Africa/Nairobi',
        }
      );
      task.start();
    }
  }

export default CronJobs;
