import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { parentPort, workerData } from 'node:worker_threads';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { getBinaryPath } = require('@mote-software/markitdown');

const MARKDOWN_MAX_BUFFER = 20 * 1024 * 1024;

async function convertPdfToMarkdown(filePath) {
  const resolvedPath = path.resolve(filePath);
  const { stdout } = await execFileAsync(getBinaryPath(), [resolvedPath], {
    encoding: 'utf-8',
    maxBuffer: MARKDOWN_MAX_BUFFER,
  });
  const markdown = stdout.trim();

  return {
    markdown,
    textLength: markdown.length,
  };
}

convertPdfToMarkdown(workerData.filePath)
  .then((result) => {
    parentPort.postMessage(result);
  })
  .catch((err) => {
    const message = err.stderr?.toString?.() || err.message || 'MarkItDown conversion failed';
    parentPort.postMessage({ error: message });
  });
