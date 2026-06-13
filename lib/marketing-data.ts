"server-only";

import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

import type { EmailCampaign, Subscriber } from "@/lib/marketing-types";

const DATA_DIR = path.join(process.cwd(), "data");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "marketing-subscribers.json");
const CAMPAIGNS_FILE = path.join(DATA_DIR, "email-campaigns.json");

type SubscriberInput = Omit<
  Subscriber,
  "id" | "createdAt" | "updatedAt" | "status" | "optInAt"
> & {
  status?: Subscriber["status"];
  optInAt?: string;
};

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile<T>(filePath: string, value: T) {
  await mkdir(DATA_DIR, { recursive: true });
  // 임시 파일 + rename으로 원자적 교체 — 동시 쓰기 시 반쯤 쓰인 JSON 방지
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

function nextNumberId(items: Array<{ id: number }>) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

export async function getAllSubscribers(): Promise<Subscriber[]> {
  return readJsonFile<Subscriber[]>(SUBSCRIBERS_FILE, []);
}

export async function getSubscriberByEmail(email: string): Promise<Subscriber | undefined> {
  const normalized = email.trim().toLowerCase();
  const subscribers = await getAllSubscribers();
  return subscribers.find((subscriber) => subscriber.email.toLowerCase() === normalized);
}

export async function getActiveSubscribersByTags(tags: string[]): Promise<Subscriber[]> {
  const subscribers = await getAllSubscribers();
  const activeSubscribers = subscribers.filter((subscriber) => subscriber.status === "active");

  if (tags.length === 0) {
    return activeSubscribers;
  }

  return activeSubscribers.filter((subscriber) =>
    tags.some((tag) => subscriber.tags.includes(tag))
  );
}

export async function upsertSubscriber(input: SubscriberInput): Promise<Subscriber> {
  const subscribers = await getAllSubscribers();
  const now = new Date().toISOString();
  const normalizedEmail = input.email.trim().toLowerCase();
  const existingIndex = subscribers.findIndex(
    (subscriber) => subscriber.email.toLowerCase() === normalizedEmail
  );

  if (existingIndex >= 0) {
    const existing = subscribers[existingIndex];
    const nextSubscriber: Subscriber = {
      ...existing,
      ...input,
      email: input.email.trim(),
      tags: Array.from(new Set([...(existing.tags ?? []), ...(input.tags ?? [])])),
      status: input.status ?? existing.status,
      optInAt: input.optInAt ?? existing.optInAt,
      unsubscribedAt: input.status === "active" ? undefined : existing.unsubscribedAt,
      updatedAt: now,
    };

    subscribers[existingIndex] = nextSubscriber;
    await writeJsonFile(SUBSCRIBERS_FILE, subscribers);
    return nextSubscriber;
  }

  const subscriber: Subscriber = {
    id: nextNumberId(subscribers),
    name: input.name,
    email: input.email.trim(),
    org: input.org,
    role: input.role,
    size: input.size,
    phone: input.phone,
    tags: input.tags ?? [],
    status: input.status ?? "active",
    optInAt: input.optInAt ?? now,
    source: input.source,
    createdAt: now,
    updatedAt: now,
  };

  await writeJsonFile(SUBSCRIBERS_FILE, [subscriber, ...subscribers]);
  return subscriber;
}

export async function unsubscribe(email: string): Promise<boolean> {
  const subscribers = await getAllSubscribers();
  const normalized = email.trim().toLowerCase();
  const index = subscribers.findIndex((subscriber) => subscriber.email.toLowerCase() === normalized);
  if (index < 0) return false;

  subscribers[index] = {
    ...subscribers[index],
    status: "unsubscribed",
    unsubscribedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(SUBSCRIBERS_FILE, subscribers);
  return true;
}

export async function deleteSubscriber(id: number): Promise<boolean> {
  const subscribers = await getAllSubscribers();
  const nextSubscribers = subscribers.filter((subscriber) => subscriber.id !== id);
  if (nextSubscribers.length === subscribers.length) return false;

  await writeJsonFile(SUBSCRIBERS_FILE, nextSubscribers);
  return true;
}

export async function getAllCampaigns(): Promise<EmailCampaign[]> {
  return readJsonFile<EmailCampaign[]>(CAMPAIGNS_FILE, []);
}

export async function createCampaign(
  input: Omit<EmailCampaign, "id" | "createdAt">
): Promise<EmailCampaign> {
  const campaigns = await getAllCampaigns();
  const campaign: EmailCampaign = {
    ...input,
    id: nextNumberId(campaigns),
    createdAt: new Date().toISOString(),
  };

  await writeJsonFile(CAMPAIGNS_FILE, [campaign, ...campaigns]);
  return campaign;
}
