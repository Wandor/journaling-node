import fse from "fs-extra";
import pino, {
  multistream,
  Logger,
  LevelWithSilent,
} from "pino";
import pretty from "pino-pretty";
import { createWriteStream } from "pino-http-send";
import config from "../../appConfig";

const FileStreamRotator = require('file-stream-rotator');


/* Type definition for logging configuration */
interface LoggingConfig {
  postLevel?: string;
  stdout?: boolean;
  logLevel?: string;
  logFolder?: string;
  mixin?: any;
  [key: string]: any;
}

/* Type definition for pretty print configuration */
interface PrettyPrintConfig {
  translateTime: string;
  ignore: string;
  colorize: boolean;
  singleLine: boolean;
  levelFirst: boolean;
  [key: string]: any;
}

/* Type definition for file stream configuration */
interface FileStreamConfig {
  frequency: string;
  max_logs: string;
  date_format: string;
  size: string;
  extension: string;
  [key: string]: any;
}

/* Load configuration, override with defaults where necessary */
const { logging: loggingConfigOverrides = {} } = config || {};

/* Destructure the logging configuration */
const {
  prettyPrint: prettyConfig = {},
  file: fileConfig = {},
  otherConfig = {},
  customLevels = {},
} = loggingConfigOverrides;

/* Set up default values */
const loggingConfig: LoggingConfig = {
  postLevel: "error",
  stdout: true,
  logLevel: "debug",
  logFolder: "./logs",
  mixin: null,
  ...otherConfig,
};

/* configuration for pretty formatting */
const prettyPrintConfig: PrettyPrintConfig = {
  translateTime: "SYS:yyyy-mm-dd h:MM:ss",
  ignore: "",
  colorize: false,
  singleLine: false,
  levelFirst: false,
  ...prettyConfig,
};

/* file rotating configuration */
const fileStreamConfig: FileStreamConfig = {
  frequency: "daily",
  max_logs: "10d",
  date_format: "YYYY-MM-DD",
  size: "1m",
  extension: ".log",
  ...fileConfig,
};

function getStream({
  level,
  destination,
  prettyPrint,
}: {
  level: string;
  destination: NodeJS.WritableStream;
  prettyPrint: PrettyPrintConfig;
}) {
  return {
    level,
    stream: pretty({ ...prettyPrint, destination }),
  };
}

const { logFolder = "./logs" } = loggingConfig;

fse.ensureDirSync(logFolder); // Use ensureDirSync for synchronous behavior in TypeScript

const logLevel: LevelWithSilent =
  (loggingConfig.logLevel as LevelWithSilent) || "info";

const mainStream = FileStreamRotator.getStream({
  ...fileStreamConfig,
  filename: `${logFolder}/%DATE%-logs`,
}) as unknown as NodeJS.WritableStream; /* Casting to WritableStream type for compatibility with pino */

const errorStream = FileStreamRotator.getStream({
  ...fileStreamConfig,
  filename: `${logFolder}/%DATE%-errors`,
}) as unknown as NodeJS.WritableStream;

const slowStream = FileStreamRotator.getStream({
  ...fileStreamConfig,
  filename: `${logFolder}/%DATE%-slows`,
}) as unknown as NodeJS.WritableStream;

const streams = [
  getStream({
    level: "error",
    destination: errorStream,
    prettyPrint: prettyPrintConfig,
  }),
  getStream({
    level: "slow",
    destination: slowStream,
    prettyPrint: { ...prettyPrintConfig },
  }),
];

if (loggingConfig.stdout !== false) {
  streams.push(
    getStream({
      level: logLevel,
      destination: process.stdout,
      prettyPrint: { ...prettyPrintConfig, colorize: true },
    })
  );
}

if (loggingConfig.logLevel !== "error") {
  streams.push(
    getStream({
      level: logLevel,
      destination: mainStream,
      prettyPrint: prettyPrintConfig,
    })
  );
}

/* set up for sending logs to a logging system via http */
if (otherConfig.httpConfig) {
  const { httpConfig = {} } = otherConfig;
  streams.push({
    level: loggingConfig.postLevel || "error",
    stream: createWriteStream({
      method: "post",
      retries: 0,
      ...httpConfig,
    }),
  });
}

const logger: Logger = pino(
  {
    level: logLevel || "info", // this MUST be set at the lowest level of the destination
    customLevels,
    mixin: loggingConfig.mixin,
  },
  multistream(streams, {
    dedupe: true,
    levels: { ...pino.levels, ...customLevels },
  })
);

export default logger;
