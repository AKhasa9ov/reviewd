import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FeedbackPackage, Initiator } from '@dsh-code-review/core';

export interface DeliveryRecord {
  id: string;
  deliveryKey: string;
  reviewId: string;
  round: number;
  submissionId: string;
  harness: string;
  /** Initiating session route; absent for legacy/CLI deliveries. */
  initiator?: Initiator;
  status: 'pending' | 'acked' | 'failed';
  feedback: FeedbackPackage;
  createdAt: string;
  updatedAt: string;
  ackedBy?: string;
  error?: string;
}

interface DeliveryFile {
  version: 1;
  deliveries: DeliveryRecord[];
}

export interface DeliveryQueueOptions {
  /** Absolute path to the JSON file; omit to keep the queue in memory only. */
  path?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDeliveryRecord(value: unknown): value is DeliveryRecord {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || typeof value.deliveryKey !== 'string') return false;
  if (typeof value.reviewId !== 'string' || typeof value.round !== 'number') return false;
  if (typeof value.submissionId !== 'string' || typeof value.harness !== 'string') return false;
  if (value.status !== 'pending' && value.status !== 'acked' && value.status !== 'failed') {
    return false;
  }
  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return false;
  if (!isRecord(value.feedback)) return false;
  if (
    typeof value.feedback.markdown !== 'string' ||
    typeof value.feedback.deliveryKey !== 'string' ||
    !('json' in value.feedback)
  ) {
    return false;
  }
  return true;
}

export class DeliveryQueue {
  private readonly byId = new Map<string, DeliveryRecord>();
  private readonly byKey = new Map<string, string>();
  private readonly now: () => Date;
  private readonly path: string | undefined;
  private operation: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(now: () => Date = () => new Date(), options: DeliveryQueueOptions = {}) {
    this.now = now;
    this.path = options.path;
  }

  /** Loads persisted deliveries; a missing file starts an empty queue. */
  async load(): Promise<void> {
    if (this.path === undefined) return;
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(`delivery store is not valid JSON: ${this.path}`);
    }
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.deliveries)) {
      throw new Error(`delivery store has an unsupported shape: ${this.path}`);
    }
    this.byId.clear();
    this.byKey.clear();
    for (const item of value.deliveries) {
      if (!isDeliveryRecord(item)) {
        throw new Error(`delivery store contains an invalid record: ${this.path}`);
      }
      this.byId.set(item.id, item);
      this.byKey.set(item.deliveryKey, item.id);
    }
  }

  async create(input: {
    deliveryKey: string;
    reviewId: string;
    round: number;
    submissionId: string;
    harness: string;
    initiator?: Initiator;
    feedback: FeedbackPackage;
  }): Promise<DeliveryRecord> {
    return await this.enqueue(async () => {
      const existing = this.byKey.get(input.deliveryKey);
      if (existing !== undefined) {
        const record = this.byId.get(existing);
        if (record !== undefined) return { ...record };
      }
      const id = `dlv_${randomBytes(12).toString('base64url')}`;
      const at = this.now().toISOString();
      const record: DeliveryRecord = {
        id,
        deliveryKey: input.deliveryKey,
        reviewId: input.reviewId,
        round: input.round,
        submissionId: input.submissionId,
        harness: input.harness,
        ...(input.initiator === undefined ? {} : { initiator: input.initiator }),
        status: 'pending',
        feedback: input.feedback,
        createdAt: at,
        updatedAt: at,
      };
      this.byId.set(id, record);
      this.byKey.set(input.deliveryKey, id);
      try {
        await this.persist();
      } catch (error) {
        this.byId.delete(id);
        this.byKey.delete(input.deliveryKey);
        throw error;
      }
      return { ...record };
    });
  }

  pending(harness: string): DeliveryRecord[] {
    return [...this.byId.values()]
      .filter((record) => record.harness === harness && record.status === 'pending')
      .map((record) => ({ ...record }));
  }

  get(id: string): DeliveryRecord | null {
    const record = this.byId.get(id);
    return record === undefined ? null : { ...record };
  }

  async ack(id: string, by: string): Promise<DeliveryRecord | null> {
    return await this.enqueue(async () => {
      const record = this.byId.get(id);
      if (record === undefined) return null;
      if (record.status !== 'pending') return { ...record };
      const previous = { ...record };
      record.status = 'acked';
      record.ackedBy = by;
      record.updatedAt = this.now().toISOString();
      try {
        await this.persist();
      } catch (error) {
        this.byId.set(id, previous);
        throw error;
      }
      return { ...record };
    });
  }

  async fail(id: string, error: string): Promise<DeliveryRecord | null> {
    return await this.enqueue(async () => {
      const record = this.byId.get(id);
      if (record === undefined) return null;
      if (record.status !== 'pending') return { ...record };
      const previous = { ...record };
      record.status = 'failed';
      record.error = error;
      record.updatedAt = this.now().toISOString();
      try {
        await this.persist();
      } catch (persistError) {
        this.byId.set(id, previous);
        throw persistError;
      }
      return { ...record };
    });
  }

  /** Waits for queued writes so the daemon can shut down without losing state. */
  async close(): Promise<void> {
    this.closed = true;
    await this.operation.catch(() => undefined);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('delivery queue is closed'));
    const result = this.operation.catch(() => undefined).then(operation);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async persist(): Promise<void> {
    if (this.path === undefined) return;
    const payload: DeliveryFile = {
      version: 1,
      deliveries: [...this.byId.values()].map((record) => ({ ...record })),
    };
    const dir = dirname(this.path);
    await mkdir(dir, { recursive: true });
    const temp = `${this.path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(JSON.stringify(payload), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temp, this.path);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
    // Rename is not durable until the directory entry is synced; otherwise a
    // power loss can resurrect an acked delivery and prompt the agent again.
    const directory = await open(dir, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}
