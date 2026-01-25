import fs from 'fs';
import path from 'path';
import os from 'os';

const SERVER_DIR = path.join(os.homedir(), '.mcp-knowledge-mind');

/**
 * Logger utility for MCP server
 * Logs to stderr (console.error) which is captured by MCP for debugging
 * Also logs to file for persistent logging
 */
export class Logger {
  /**
   * Log informational messages
   * @param {string} message - Message to log
   */
  static info(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;

    // Log to stderr (visible in MCP logs)
    console.error(logMessage);

    // Log to file
    try {
      fs.appendFileSync(`${SERVER_DIR}/server_info.log`, `${logMessage}\n`);
    } catch (error) {
      // Ignore file write errors
    }
  }

  /**
   * Log error messages
   * @param {string} message - Error message to log
   */
  static error(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;

    // Log to stderr
    console.error(logMessage);

    // Log to file
    try {
      fs.appendFileSync(`${SERVER_DIR}/server_error.log`, `${logMessage}\n`);
    } catch (error) {
      // Ignore file write errors
    }
  }

  /**
   * Log progress updates
   * @param {number} current - Current progress count
   * @param {number} total - Total count
   * @param {string} itemType - Type of item being processed (e.g., 'files', 'chunks')
   */
  static progress(current, total, itemType = 'items') {
    const percentage = Math.round((current / total) * 100);
    Logger.info(
      `📊 Progress: ${current}/${total} ${itemType} (${percentage}%)`,
    );
  }
}
