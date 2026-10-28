import fs from "fs";
import isDev from "@/utils/isDev";
import { readFile, writeFile } from "./utils/apiHelper";
import path from "path";
import { config } from "@/utils/config";

// Runtime data must stay outside the source tree: writing under src can
// trigger rebuilds, which reconnect clients and write the files again.
const storageDirectory = path.resolve(".amica-data");
fs.mkdirSync(storageDirectory, { recursive: true });
function storageFile(name: string, fallback: object | unknown[]) {
  const destination = path.join(storageDirectory, name);
  if (!fs.existsSync(destination)) {
    const legacy = path.resolve("src/features/externalAPI/dataHandlerStorage", name);
    if (fs.existsSync(legacy)) fs.copyFileSync(legacy, destination);
    else writeFile(destination, fallback);
  }
  return destination;
}
export const configFilePath = storageFile("config.json", {});
export const subconsciousFilePath = storageFile("subconscious.json", []);
export const logsFilePath = storageFile("logs.json", []);
export const userInputMessagesFilePath = storageFile("userInputMessages.json", []);
export const chatLogsFilePath = storageFile("chatLogs.json", []);

// GET Request Handlers
export const handleGetConfig = () => readFile(configFilePath);
export const handleGetSubconscious = () => readFile(subconsciousFilePath);
export const handleGetLogs = () => readFile(logsFilePath);
export const handleGetUserInputMessages = () =>
  readFile(userInputMessagesFilePath);
export const handleGetChatLogs = () => readFile(chatLogsFilePath);

// POST Request Handlers
export const handlePostConfig = (body: any) => updateConfig(body);
export const handlePostSubconscious = (body: any) => updateSubconscious(body);
export const handlePostUserInputMessages = (body: any) => updateUserInputMessages(body);
export const handlePostLogs = (body: any) => updateLogs(body);
export const handlePostChatLogs = (body: any) => updateChatLogs(body);

// Update Functions
const updateConfig = (body: any) => {
  const config = readFile(configFilePath);
  if (body.key && body.value !== undefined) {
    const { key, value } = body;
    if (!config.hasOwnProperty(key)) {
      throw new Error(`Config key "${key}" not found.`);
    }
    config[key] = value;
    writeFile(configFilePath, config);
    return { message: "Config updated successfully." };
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body)) {
      config[key] = value;
    }
    writeFile(configFilePath, config);
    return { message: "Config updated successfully." };
  }

  throw new Error("Invalid body format.");
};

const updateSubconscious = (body: any) => {
  if (!isDev || config("external_api_enabled") !== "true") {
    return;
  }

  if (!Array.isArray(body.subconscious)) {
    throw new Error("Subconscious data must be an array.");
  }
  writeFile(subconsciousFilePath, body.subconscious);
  return { message: "Subconscious data updated successfully." };
};

const updateUserInputMessages = (body: any) => {
  if (!isDev || config("external_api_enabled") !== "true") {
    return;
  }

  let existingMessage = readFile(userInputMessagesFilePath);
  if (!Array.isArray(existingMessage)) {
    existingMessage = [];
  }
  existingMessage.push(body);
  writeFile(userInputMessagesFilePath, existingMessage);
  return { message: "User input messages updated successfully." };
};

const updateLogs = (body: any) => {
  if (!isDev || config("external_api_enabled") !== "true") {
    return;
  }

  const { type, ts, arguments: logArguments } = body;
  const logEntry = { type, ts, arguments: logArguments };
  let existingLogs = readFile(logsFilePath);
  if (!Array.isArray(existingLogs)) {
    existingLogs = [];
  }
  existingLogs.push(logEntry);
  writeFile(logsFilePath, existingLogs);
  return { message: "Logs updated successfully." };
};

const updateChatLogs = (body: any) => {
  if (!isDev || config("external_api_enabled") !== "true") {
    return;
  }

  if (!Array.isArray(body)) {
    throw new Error("Chat logs data must be an array.");
  }
  writeFile(chatLogsFilePath, body);
  return { message: "Chat logs data updated successfully." };
};
