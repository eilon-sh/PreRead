import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const MAX_CONCURRENT = 1;
const workerPath = fileURLToPath(new URL('../workers/pdfWorker.js', import.meta.url));

let activeCount = 0;
const pendingJobs = [];

function finishJob(job, err, result) {
  if (job.settled) return;
  job.settled = true;
  activeCount -= 1;

  if (err) {
    job.reject(err);
  } else {
    job.resolve(result);
  }

  runNextJob();
}

function runNextJob() {
  if (activeCount >= MAX_CONCURRENT || pendingJobs.length === 0) return;

  activeCount += 1;
  const job = pendingJobs.shift();
  const worker = new Worker(workerPath, { workerData: { filePath: job.filePath } });

  worker.on('message', (message) => {
    if (message.error) {
      finishJob(job, new Error(message.error));
      return;
    }
    finishJob(job, null, message);
  });

  worker.on('error', (err) => {
    finishJob(job, err);
  });

  worker.on('exit', (code) => {
    if (code === 0 || job.settled) return;
    finishJob(job, new Error(`PDF worker exited with code ${code}`));
  });
}

export function enqueuePdfConversion(filePath) {
  return new Promise((resolve, reject) => {
    pendingJobs.push({ filePath, resolve, reject, settled: false });
    runNextJob();
  });
}
