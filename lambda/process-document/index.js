import { processS3Record } from './processor.js';

export const handler = async (event) => {
  const records = event.Records || [];
  const failures = [];

  for (const record of records) {
    try {
      await processS3Record(record);
    } catch (err) {
      console.error('Failed processing SQS record', { err, record });
      failures.push({
        itemIdentifier: record.messageId || record.messageID || String(Date.now()),
      });
    }
  }

  return { batchItemFailures: failures };
};
