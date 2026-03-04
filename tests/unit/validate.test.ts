import { describe, it, expect } from 'vitest';
import { validateKey, validateSecretValue, validateMemoryContent, validateTags } from '../../src/config/validate.js';

describe('Input validation', () => {
  describe('validateKey', () => {
    it('should accept valid keys', () => {
      expect(() => validateKey('STRIPE_KEY')).not.toThrow();
      expect(() => validateKey('my-secret')).not.toThrow();
      expect(() => validateKey('api.key.v2')).not.toThrow();
      expect(() => validateKey('_private')).not.toThrow();
    });

    it('should reject empty keys', () => {
      expect(() => validateKey('')).toThrow('required');
    });

    it('should reject keys starting with numbers', () => {
      expect(() => validateKey('123key')).toThrow('invalid');
    });

    it('should reject keys with null bytes', () => {
      expect(() => validateKey('key\x00evil')).toThrow('null bytes');
    });

    it('should reject keys exceeding 256 chars', () => {
      expect(() => validateKey('A'.repeat(257))).toThrow('invalid');
    });

    it('should reject keys with spaces', () => {
      expect(() => validateKey('my key')).toThrow('invalid');
    });

    it('should reject keys with path separators', () => {
      expect(() => validateKey('../../etc/passwd')).toThrow('invalid');
    });
  });

  describe('validateSecretValue', () => {
    it('should accept normal values', () => {
      expect(() => validateSecretValue('sk_test_abc123')).not.toThrow();
    });

    it('should reject null bytes', () => {
      expect(() => validateSecretValue('value\x00evil')).toThrow('null bytes');
    });

    it('should reject values exceeding 64KB', () => {
      expect(() => validateSecretValue('x'.repeat(65537))).toThrow('byte limit');
    });

    it('should accept values up to 64KB', () => {
      expect(() => validateSecretValue('x'.repeat(65536))).not.toThrow();
    });
  });

  describe('validateMemoryContent', () => {
    it('should accept normal content', () => {
      expect(() => validateMemoryContent('Stripe requires raw body for webhooks')).not.toThrow();
    });

    it('should reject empty content', () => {
      expect(() => validateMemoryContent('')).toThrow('required');
    });

    it('should reject content exceeding 1MB', () => {
      expect(() => validateMemoryContent('x'.repeat(1048577))).toThrow('1MB');
    });
  });

  describe('validateTags', () => {
    it('should accept valid tags', () => {
      expect(() => validateTags(['stripe', 'webhook', 'api-v2'])).not.toThrow();
    });

    it('should reject more than 50 tags', () => {
      const tags = Array.from({ length: 51 }, (_, i) => `tag${i}`);
      expect(() => validateTags(tags)).toThrow('limit of 50');
    });

    it('should reject tags with spaces', () => {
      expect(() => validateTags(['bad tag'])).toThrow('Invalid tag');
    });

    it('should reject empty tags', () => {
      expect(() => validateTags([''])).toThrow('Invalid tag');
    });

    it('should reject tags exceeding 64 chars', () => {
      expect(() => validateTags(['a'.repeat(65)])).toThrow('Invalid tag');
    });

    it('should accept empty array', () => {
      expect(() => validateTags([])).not.toThrow();
    });
  });

  describe('validateTags - comma rejection', () => {
    it('should reject tags containing commas (use CLI --tags for auto-split)', () => {
      expect(() => validateTags(['performance,metrics'])).toThrow('Invalid tag');
    });
    it('should reject tags with spaces', () => {
      expect(() => validateTags(['bad tag'])).toThrow('Invalid tag'); // Re-verify this existing test
    });
    it('should accept hyphenated tags and dot-separated tags', () => {
      expect(() => validateTags(['api-v2', 'my.tag', 'test123'])).not.toThrow();
    });
  });
});
