import { randomBytes } from 'node:crypto';
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

export class DeliveryQueue {
  private readonly byId = new Map<string, DeliveryRecord>();
  private readonly byKey = new Map<string, string>();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  create(input: {
    deliveryKey: string;
    reviewId: string;
    round: number;
    submissionId: string;
    harness: string;
    initiator?: Initiator;
    feedback: FeedbackPackage;
  }): DeliveryRecord {
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
    return { ...record };
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

  ack(id: string, by: string): DeliveryRecord | null {
    const record = this.byId.get(id);
    if (record === undefined) return null;
    if (record.status === 'pending') {
      record.status = 'acked';
      record.ackedBy = by;
      record.updatedAt = this.now().toISOString();
    }
    return { ...record };
  }

  fail(id: string, error: string): DeliveryRecord | null {
    const record = this.byId.get(id);
    if (record === undefined) return null;
    if (record.status === 'pending') {
      record.status = 'failed';
      record.error = error;
      record.updatedAt = this.now().toISOString();
    }
    return { ...record };
  }
}
