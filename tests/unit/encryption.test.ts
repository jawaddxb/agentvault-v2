import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { encrypt, decrypt, getPassphrase, readEncryptedFile, writeEncryptedFile, _clearPassphraseCache } from '../../src/vault/encryption.js';

describe('encryption', () => {
  const passphrase = 'test-passphrase-12345';

  describe('encrypt/decrypt roundtrip', () => {
    it('should encrypt and decrypt a string', () => {
      const plaintext = 'Hello, World!';
      const envelope = encrypt(plaintext, passphrase);

      expect(envelope.salt).toBeTruthy();
      expect(envelope.iv).toBeTruthy();
      expect(envelope.tag).toBeTruthy();
      expect(envelope.data).toBeTruthy();

      const decrypted = decrypt(envelope, passphrase);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt JSON data', () => {
      const data = { key: 'value', nested: { array: [1, 2, 3] } };
      const plaintext = JSON.stringify(data);
      const envelope = encrypt(plaintext, passphrase);
      const decrypted = JSON.parse(decrypt(envelope, passphrase));
      expect(decrypted).toEqual(data);
    });

    it('should produce different salt per encryption', () => {
      const plaintext = 'same content';
      const env1 = encrypt(plaintext, passphrase);
      const env2 = encrypt(plaintext, passphrase);
      expect(env1.salt).not.toBe(env2.salt);
      expect(env1.iv).not.toBe(env2.iv);
    });

    it('should fail with wrong passphrase', () => {
      const envelope = encrypt('secret data', passphrase);
      expect(() => decrypt(envelope, 'wrong-passphrase-abc')).toThrow();
    });

    it('should handle empty string', () => {
      const envelope = encrypt('', passphrase);
      expect(decrypt(envelope, passphrase)).toBe('');
    });

    it('should handle large data', () => {
      const plaintext = 'x'.repeat(100000);
      const envelope = encrypt(plaintext, passphrase);
      expect(decrypt(envelope, passphrase)).toBe(plaintext);
    });
  });

  describe('readEncryptedFile / writeEncryptedFile', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-enc-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should write and read encrypted file', () => {
      const filePath = path.join(tmpDir, 'test.json');
      const data = [{ key: 'API_KEY', value: 'sk-123' }];
      writeEncryptedFile(filePath, data, passphrase);
      expect(fs.existsSync(filePath)).toBe(true);

      const loaded = readEncryptedFile(filePath, passphrase, []);
      expect(loaded).toEqual(data);
    });

    it('should return fallback for missing file', () => {
      const loaded = readEncryptedFile('/nonexistent/path.json', passphrase, []);
      expect(loaded).toEqual([]);
    });
  });

  describe('getPassphrase', () => {
    const originalEnv = process.env.AGENTVAULT_PASSPHRASE;

    afterEach(() => {
      _clearPassphraseCache();
      if (originalEnv !== undefined) {
        process.env.AGENTVAULT_PASSPHRASE = originalEnv;
      } else {
        delete process.env.AGENTVAULT_PASSPHRASE;
      }
    });

    it('should return env var passphrase', () => {
      process.env.AGENTVAULT_PASSPHRASE = 'env-passphrase';
      expect(getPassphrase()).toBe('env-passphrase');
    });

    it('should read passphrase from file', () => {
      delete process.env.AGENTVAULT_PASSPHRASE;
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-pp-test-'));
      const avDir = path.join(tmpDir, '.agentvault');
      fs.mkdirSync(avDir, { recursive: true });
      fs.writeFileSync(path.join(avDir, '.passphrase'), 'file-passphrase');

      expect(getPassphrase(tmpDir)).toBe('file-passphrase');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should throw when no passphrase available', () => {
      delete process.env.AGENTVAULT_PASSPHRASE;
      expect(() => getPassphrase('/tmp/nonexistent-av-test')).toThrow('No passphrase found');
    });
  });
});
