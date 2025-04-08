import morgan, { TokenIndexer } from "morgan";
import { Request, Response } from "express";
import { IncomingMessage, ServerResponse } from "http";
import winston from "winston";
import fs from "fs";
import path from "path";
// import chalk from "chalk";

const { File } = winston.transports;
const { combine, timestamp, json, errors } = winston.format;

const logDir = "logs";

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  level: "http",
  format: combine(
    timestamp({ format: "YYYY-MM-DD hh:mm:ss.SSS A" }),
    json()
  ),
  transports: [
    new File({
      filename: path.join(logDir, "/requests.log"),
      level: "http",
      format: combine(
        errors({ stack: true }),
        timestamp({ format: "DD-MMM-YYYY hh:mm:ss.SSS A" }),
        json()
      ),
    }),
    new File({
      filename: path.join(logDir, "/request-errors.log"),
      level: "error",
      format: combine(
        errors({ stack: true }),
        timestamp({ format: "DD-MMM-YYYY hh:mm:ss.SSS A" }),
        json()
      ),
    }),
  ],
});

morgan.token("host", (req: Request) => req.hostname);

export const morganMiddleware = morgan(
  (
    tokens: TokenIndexer<IncomingMessage, ServerResponse>,
    req: IncomingMessage,
    res: ServerResponse
  ) => {
    const status = Number.parseInt(tokens.status(req, res) || "0", 10);
    const responseTime = Number.parseFloat(tokens["response-time"](req, res) || "0");

    const logEntry = {
      hostname: tokens.host(req, res),
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status,
      content_length: tokens.res(req, res, "content-length") || "0",
      response_time: responseTime,
      total_time: Number.parseFloat(tokens["total-time"](req, res) || "0"),
      user_agent: tokens["user-agent"](req, res),
      remote_addr: tokens["remote-addr"](req, res),
      remote_user: tokens["remote-user"](req, res) || "N/A",
      http_version: tokens["http-version"](req, res),
      referrer: tokens.referrer(req, res),
    };
    if (status >= 500) {
      const errorLog = `[ERROR] ${JSON.stringify(logEntry)}`;
      // console.log(chalk.bgRed.white(`500 ERROR: ${tokens.method(req, res)} ${tokens.url(req, res)} - ${status}`));
      logger.error(errorLog);
    } else if (responseTime > 500) {
      const slowRequestLog = `[SLOW] ${JSON.stringify(logEntry)}`;
      // console.log(chalk.yellow(`⚠️ SLOW REQUEST: ${JSON.stringify(slowRequestLog)}`));
    } else {
      const normalLog = JSON.stringify(logEntry);
      // console.log(chalk.green(normalLog));
    }

    return JSON.stringify(logEntry);
  },
  {
    stream: {
      write: (message: string) => {
        try {
          const data = JSON.parse(message);
          logger.http("Incoming request:", data);
        } catch (error) {
          logger.error("Error parsing morgan log message:", error);
        }
      },
    },
  }
);

