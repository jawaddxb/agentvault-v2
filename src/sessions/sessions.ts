import crypto from 'node:crypto';
import fs from 'node:fs';
import { resolvePaths } from '../config/paths.js';
import { getPassphrase, readEncryptedFile, writeEncryptedFile } from '../vault/encryption.js';
import type { Session } from '../types/index.js';

function loadSessions(projectDir: string): Session[] {
  const fp = resolvePaths(projectDir).sessions;
  if (!fs.existsSync(fp)) return [];

  const passphrase = getPassphrase(projectDir);

  // Try encrypted format first; fall back to plaintext (migration path)
  try {
    return readEncryptedFile<Session[]>(fp, passphrase, []);
  } catch {
    // Fallback: try reading as plaintext JSON (migrating from unencrypted)
    try {
      const raw = fs.readFileSync(fp, 'utf-8');
      const sessions = JSON.parse(raw) as Session[];
      // Re-save in encrypted format immediately
      writeEncryptedFile(fp, sessions, passphrase);
      return sessions;
    } catch {
      return [];
    }
  }
}

function saveSessions(projectDir: string, sessions: Session[]): void {
  const fp = resolvePaths(projectDir).sessions;
  const passphrase = getPassphrase(projectDir);
  writeEncryptedFile(fp, sessions, passphrase);
}

/** Create a new agent session */
export function createSession(
  projectDir: string, agentId: string, profileName: string, pid: number
): Session {
  const sessions = loadSessions(projectDir);
  const session: Session = {
    id: crypto.randomUUID(),
    agentId,
    profileName,
    pid,
    startedAt: new Date().toISOString(),
    active: true,
  };
  sessions.push(session);
  saveSessions(projectDir, sessions);
  return session;
}

/** Get all active sessions */
export function getActiveSessions(projectDir: string): Session[] {
  return loadSessions(projectDir).filter(s => s.active);
}

/** Revoke a specific session by ID */
export function revokeSession(projectDir: string, sessionId: string): boolean {
  const sessions = loadSessions(projectDir);
  const s = sessions.find(s => s.id === sessionId);
  if (!s) return false;
  s.active = false;
  try { process.kill(s.pid, 'SIGTERM'); } catch { /* already dead */ }
  saveSessions(projectDir, sessions);
  return true;
}

/** Revoke all active sessions */
export function revokeAll(projectDir: string): number {
  const sessions = loadSessions(projectDir);
  let count = 0;
  for (const s of sessions) {
    if (s.active) {
      s.active = false;
      try { process.kill(s.pid, 'SIGTERM'); } catch { /* already dead */ }
      count++;
    }
  }
  saveSessions(projectDir, sessions);
  return count;
}
