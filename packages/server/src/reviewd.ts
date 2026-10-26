#!/usr/bin/env node
import { startDaemon } from './daemon/server.js';

const token = process.env.CODE_REVIEW_TOKEN;
if (token === undefined || token === '') {
  process.stderr.write('CODE_REVIEW_TOKEN is required\n');
  process.exitCode = 1;
} else {
  const storeDir = process.env.CODE_REVIEW_STORE ?? './.review-store';
  const host = process.env.CODE_REVIEW_HOST;
  const port = Number(process.env.CODE_REVIEW_PORT ?? '3100');
  const publicUrl = process.env.CODE_REVIEW_PUBLIC_URL;
  try {
    const daemon = await startDaemon({
      storeDir,
      token,
      ...(host === undefined ? {} : { host }),
      port,
      ...(publicUrl === undefined ? {} : { publicUrl }),
    });
    process.stdout.write(`reviewd listening on ${daemon.url}\n`);
    const stop = async (): Promise<void> => {
      await daemon.close();
      process.exit(0);
    };
    process.once('SIGINT', () => void stop());
    process.once('SIGTERM', () => void stop());
  } catch (error) {
    process.stderr.write(`reviewd failed to start: ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}
