
import  app from "./app";
import logger from "./configs/logger";
import CronJobs from "./services/cronJobs";

const redis = require('redis');

const client = redis.createClient();

client.on('error', (err: Error) => logger.error(err));

client.connect();

client.on('connect', () => {
  logger.info('Redis Connected!');
});

client.on('error', (err: Error) => {
  logger.error('Redis Error:', err);
});

client.on('end', () => {
  logger.info('Redis Connection Clos ed!');
});

CronJobs.checkExpiredPasswords();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
