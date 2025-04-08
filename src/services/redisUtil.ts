import prisma from "../../prisma";
import logger from "../configs/logger";
import redisClient from "../configs/redis";

interface DataActions {
  setAsArray: boolean;
  actionIfExists: "append" | "replace" | "delete";
  uniqueKey: string;
}

interface SetParams {
  dbOperation?: boolean;
  operationName?: string;
  actionOnError?: "log" | "dbOperation";
  key: string;
  expiry?: number;
  value: Record<string, any>;
  dataActions?: DataActions;
}

/**
 * Finds an object in a stored array in Redis
 */
const findObjectInArray = async (
  key: string,
  predicate: (item: any) => boolean,
  action: "many" | "one" = "many"
): Promise<any | any[]> => {
  try {
    const arrayString = await redisClient.get(key);
    const array: any[] = JSON.parse(arrayString || "[]");
    if (array.length === 0) {
      logger.warn(`No data found for key: ${key}`);
    }
    return action === "many" ? array.filter(predicate) : array.find(predicate);
  } catch (error) {
    logger.error(`Error in findObjectInArray for key ${key}: ${error}`);
    throw error;
  }
};

export default {
  /**
   * Sets a value in Redis, optionally performs a database operation using Prisma
   */
  set: async (params: SetParams): Promise<boolean> => {
    try {
      if (params.dbOperation && params.operationName) {
        /* TO DO: Ensure this saves  */
        await (prisma as any)[params.key][params.operationName]({
          data: params.value,
        });
      }

      if (params.dataActions?.setAsArray) {
        const existingData = await redisClient.get(
          `${params.key}-${params.value[params.dataActions.uniqueKey]}`
        );
        const dataArray: any[] = JSON.parse(existingData || "[]");

        let data: any[] = [];

        switch (params.dataActions.actionIfExists) {
          case "delete":
            data = dataArray.filter(
              (entry) =>
                entry[params.dataActions!.uniqueKey] !==
                params.value[params.dataActions!.uniqueKey]
            );
            break;
          case "replace":
            data = dataArray.filter(
              (entry) =>
                entry[params.dataActions!.uniqueKey] !==
                params.value[params.dataActions!.uniqueKey]
            );
            data.push(params.value);
            break;
          case "append":
          default:
            data = [...dataArray, params.value];
        }

        if (params.expiry) {
          await redisClient.setEx(
            params.key,
            params.expiry,
            JSON.stringify(data)
          );
        } else {
          await redisClient.set(params.key, JSON.stringify(data));
        }
      } else {
        if (params.dataActions?.uniqueKey) {
          if (params.expiry) {
            await redisClient.setEx(
              `${params.key}-${params.value[params.dataActions.uniqueKey]}`,
              params.expiry,
              JSON.stringify(params.value)
            );
          } else {
            await redisClient.set(
              `${params.key}-${params.value[params.dataActions.uniqueKey]}`,
              JSON.stringify(params.value)
            );
          }
        } else {
          logger.warn("uniqueKey is missing in dataActions.");
        }
      }
      return true;
    } catch (error) {
      logger.error(error);
      return false;
    }
  },

  /**
   * Retrieves a value from Redis
   */
  get: async (key: string): Promise<any | null> => {
    try {
      const res = await redisClient.get(key);
      if (!res) {
        logger.warn(`Key not found in Redis: ${key}`);
      }
      return res ? JSON.parse(res) : null;
    } catch (error) {
      logger.error(`Error retrieving key ${key}: ${error}`);
      return null;
    }
  },

  /**
   * Finds an object in a stored array in Redis
   */
  find: findObjectInArray,

  /**
   * Deletes a key from Redis
   */
  del: async (key: string): Promise<void> => {
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error(`Error deleting key ${key}: ${error}`);
    }
  },
};
