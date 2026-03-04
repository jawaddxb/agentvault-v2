import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWallet, getWalletAddress, getSignerWallet, signMessage, verifySignature } from '../../src/wallet/wallet.js';

describe('Wallet', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-wallet-'));
    fs.mkdirSync(path.join(tmpDir, '.agentvault'), { recursive: true });
    process.env.AGENTVAULT_PASSPHRASE = 'test-passphrase-123';
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.AGENTVAULT_PASSPHRASE;
  });

  it('should create a wallet with valid Ethereum address', () => {
    const info = createWallet(tmpDir);
    expect(info.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(info.createdAt).toBeTruthy();
  });

  it('should reject creating a wallet twice', () => {
    createWallet(tmpDir);
    expect(() => createWallet(tmpDir)).toThrow('already exists');
  });

  it('should encrypt the wallet file', () => {
    createWallet(tmpDir);
    const walletFile = path.join(tmpDir, '.agentvault', 'wallet.json');
    const raw = fs.readFileSync(walletFile, 'utf-8');
    const data = JSON.parse(raw);
    // Should be an encrypted envelope, not plaintext
    expect(data.salt).toBeTruthy();
    expect(data.iv).toBeTruthy();
    expect(data.tag).toBeTruthy();
    expect(data.data).toBeTruthy();
    // Should NOT contain plaintext address
    expect(raw).not.toContain('0x');
  });

  it('should set wallet file permissions to 0o600', () => {
    createWallet(tmpDir);
    const walletFile = path.join(tmpDir, '.agentvault', 'wallet.json');
    const stats = fs.statSync(walletFile);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('should load wallet and return address', () => {
    const created = createWallet(tmpDir);
    const address = getWalletAddress(tmpDir);
    expect(address).toBe(created.address);
  });

  it('should load full wallet with private key', () => {
    createWallet(tmpDir);
    const signer = getSignerWallet(tmpDir);
    expect(signer.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(signer.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('should sign and verify messages', async () => {
    createWallet(tmpDir);
    const message = 'checkout:test-bank:1234567890';
    const signature = await signMessage(tmpDir, message);
    const recovered = verifySignature(message, signature);
    const address = getWalletAddress(tmpDir);
    expect(recovered.toLowerCase()).toBe(address.toLowerCase());
  });

  it('should fail to load wallet without passphrase', () => {
    createWallet(tmpDir);
    delete process.env.AGENTVAULT_PASSPHRASE;
    expect(() => getWalletAddress(tmpDir)).toThrow('passphrase');
  });
});
