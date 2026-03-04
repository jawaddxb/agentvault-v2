import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { resolvePaths } from '../config/paths.js';
import { encrypt, decrypt, getPassphrase } from '../vault/encryption.js';
import type { EncryptedEnvelope } from '../types/index.js';

const WALLET_FILE = 'wallet.json';

export interface WalletInfo {
  address: string;
  createdAt: string;
}

/** Resolve wallet file path */
function walletPath(projectDir: string): string {
  return path.join(resolvePaths(projectDir).base, WALLET_FILE);
}

/** Create a new wallet and encrypt the private key */
export function createWallet(projectDir: string): WalletInfo {
  const fp = walletPath(projectDir);
  if (fs.existsSync(fp)) {
    throw new Error('Wallet already exists. Use `agentvault wallet show` to see your address.');
  }

  const wallet = ethers.Wallet.createRandom();
  const passphrase = getPassphrase(projectDir);

  const walletData = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase,
    createdAt: new Date().toISOString(),
  };

  const envelope = encrypt(JSON.stringify(walletData), passphrase);
  fs.mkdirSync(path.dirname(fp), { recursive: true, mode: 0o700 });
  fs.writeFileSync(fp, JSON.stringify(envelope, null, 2), { mode: 0o600 });

  return { address: wallet.address, createdAt: walletData.createdAt };
}

/** Load wallet (decrypted) — private, only accessible within wallet.ts */
function _loadWallet(projectDir: string): { address: string; privateKey: string; mnemonic?: string; createdAt: string } {
  const fp = walletPath(projectDir);
  if (!fs.existsSync(fp)) {
    throw new Error('No wallet found. Run `agentvault wallet create` first.');
  }

  const passphrase = getPassphrase(projectDir);
  const envelope: EncryptedEnvelope = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  const plaintext = decrypt(envelope, passphrase);
  return JSON.parse(plaintext);
}

/** Get wallet address without exposing private key */
export function getWalletAddress(projectDir: string): string {
  return _loadWallet(projectDir).address;
}

/** Get an ethers.Wallet instance without exposing raw private key */
export function getSignerWallet(projectDir: string): ethers.Wallet {
  const { privateKey } = _loadWallet(projectDir);
  return new ethers.Wallet(privateKey);
}

/** Get an ethers.Wallet instance connected to a provider */
export function getConnectedWallet(projectDir: string, rpcUrl: string): ethers.Wallet {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return getSignerWallet(projectDir).connect(provider);
}

/** Sign a message with the wallet (for auth proofs) */
export async function signMessage(projectDir: string, message: string): Promise<string> {
  const wallet = getSignerWallet(projectDir);
  return wallet.signMessage(message);
}

/** Export the wallet mnemonic phrase — handle with extreme care */
export function exportMnemonic(projectDir: string): string {
  const { mnemonic } = _loadWallet(projectDir);
  if (!mnemonic) {
    throw new Error('No mnemonic available (wallet may have been imported from a private key).');
  }
  return mnemonic;
}

/** Verify a signed message */
export function verifySignature(message: string, signature: string): string {
  return ethers.verifyMessage(message, signature);
}
