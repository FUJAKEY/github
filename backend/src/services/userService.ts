import path from 'path';
import { randomUUID } from 'crypto';

import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { appEnv } from '../config/env.js';
import { UserRecord } from '../types/domain.js';
import { readJsonFile, updateJsonFile } from '../utils/fs.js';

const usersFile = path.join(appEnv.reposRoot, 'users', 'users.json');

const userInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['user', 'admin']).default('user')
});

export type CreateUserInput = z.infer<typeof userInputSchema>;

export async function getAllUsers(): Promise<UserRecord[]> {
  return readJsonFile<UserRecord[]>(usersFile, []);
}

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  const users = await getAllUsers();
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export async function findUserById(id: string): Promise<UserRecord | undefined> {
  const users = await getAllUsers();
  return users.find((user) => user.id === id);
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const parsed = userInputSchema.parse(input);
  const existing = await findUserByEmail(parsed.email);
  if (existing) {
    throw new Error('User with this email already exists');
  }
  const now = new Date().toISOString();
  const user: UserRecord = {
    id: randomUUID(),
    email: parsed.email.toLowerCase(),
    passwordHash: await bcrypt.hash(parsed.password, 10),
    createdAt: now,
    role: parsed.role
  };

  await updateJsonFile<UserRecord[]>(usersFile, [], (users) => {
    users.push(user);
  });

  return user;
}

export function sanitizeUser(user: UserRecord): Omit<UserRecord, 'passwordHash'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
}
