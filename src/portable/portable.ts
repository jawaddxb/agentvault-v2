import fs from 'node:fs';
import { encrypt, decrypt } from '../vault/encryption.js';
import { loadVault } from '../vault/vault.js';
import { loadMemories } from '../memory/memory.js';
import type { PortableVault, MemoryPortable, MemoryEntry, EncryptedEnvelope } from '../types/index.js';

/** Export vault and memories to a portable .avault file */
export function exportPortable(
  projectDir: string,
  outputPath: string,
  exportPassphrase: string,
  opts?: { includeMemories?: boolean }
): void {
  const entries = loadVault(projectDir);
  const memories = opts?.includeMemories !== false ? loadMemories(projectDir) : [];

  const portable: PortableVault = {
    schema: 'agentvault-portable/1.0',
    exportedAt: new Date().toISOString(),
    entries,
    memories,
  };

  const plaintext = JSON.stringify(portable);
  const envelope = encrypt(plaintext, exportPassphrase);

  fs.writeFileSync(outputPath, JSON.stringify(envelope, null, 2), { mode: 0o600 });
}

/** Import from a portable .avault file */
export function importPortable(
  inputPath: string,
  importPassphrase: string
): PortableVault {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, 'utf-8');
  const envelope: EncryptedEnvelope = JSON.parse(raw);
  const plaintext = decrypt(envelope, importPassphrase);
  const portable: PortableVault = JSON.parse(plaintext);

  if (portable.schema !== 'agentvault-portable/1.0') {
    throw new Error(`Unsupported portable vault schema: ${portable.schema}`);
  }

  return portable;
}

/** Export memories only to an encrypted .avault file */
export function exportMemoryPortable(
  entries: MemoryEntry[],
  outputPath: string,
  exportPassphrase: string
): void {
  const portable: MemoryPortable = {
    schema: 'agentvault-memory/1.0',
    exportedAt: new Date().toISOString(),
    memories: entries,
  };

  const plaintext = JSON.stringify(portable);
  const envelope = encrypt(plaintext, exportPassphrase);

  fs.writeFileSync(outputPath, JSON.stringify(envelope, null, 2), { mode: 0o600 });
}

/** Import memories from an encrypted .avault file (supports both memory-only and full vault formats) */
export function importMemoryPortable(
  inputPath: string,
  importPassphrase: string
): MemoryEntry[] {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, 'utf-8');
  const envelope: EncryptedEnvelope = JSON.parse(raw);
  const plaintext = decrypt(envelope, importPassphrase);
  const parsed = JSON.parse(plaintext) as { schema: string; memories?: MemoryEntry[] };

  if (parsed.schema === 'agentvault-memory/1.0') {
    return (parsed as MemoryPortable).memories;
  }
  if (parsed.schema === 'agentvault-portable/1.0') {
    return (parsed as PortableVault).memories;
  }

  throw new Error(`Unsupported schema: ${parsed.schema}. Expected agentvault-memory/1.0 or agentvault-portable/1.0`);
}
