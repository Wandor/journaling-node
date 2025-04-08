import fs from 'fs-extra';

interface Config {
  [key: string]: any; // Allow any kind of value, since the config structure is dynamic
}

/**
 * Reads and merges multiple JSON configuration files.
 * @param configFiles - An array of file paths to configuration files.
 * @returns An object containing the merged configuration from all the provided files.
 */
const readConfig = (configFiles: string[]): Config => {
  const config: Config = {};

  configFiles.forEach((file) => {
    if (fs.existsSync(file)) {
      try {
        Object.assign(config, fs.readJSONSync(file));
      } catch (error) {
        console.error(`Error reading config file ${file}:`, error);
      }
    }
  });

  return config;
};

// Load the configuration files
const appConfig = readConfig(['./config.json', './config.local.json']);

export { readConfig };

export default appConfig;
