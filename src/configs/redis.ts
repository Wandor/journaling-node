import { RedisClientType } from "redis";
import logger from "./logger";

const redis = require("redis");

let redisClient: RedisClientType;

redisClient = redis.createClient();

redisClient.on("error", (error: Error) => logger.error(`Error : ${error}`));

redisClient.connect();
export default redisClient;
