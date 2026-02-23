import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { detectProxy } from './detector';
import { compile } from './compiler';

const contractsDir = path.join(__dirname, 'contracts');

// Define expected outcomes
const expectedResults: Record<string, boolean> = {
  'SimpleStorage.sol': false,
  'LibraryUser.sol': false,
  'ImmutableTarget.sol': true, // Immutable target is technically a proxy
  'HardcodedDelegate.sol': false,

  'EIP1967Proxy.sol': true,
  'MinimalProxy.sol': true,
  'BackdoorFunction.sol': true,
  'StorageSlotBackdoor.sol': true,
  'FallbackProxy.sol': true,
  'ObfuscatedAssembly.sol': true,
};

describe('Proxy Detector', () => {
  const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.sol'));

  files.forEach(file => {
    it(`should correctly classify ${file}`, () => {
      const sourcePath = path.join(contractsDir, file);
      const source = fs.readFileSync(sourcePath, 'utf8');

      // We compile first to get the "real" bytecode for the test
      // In a real scenario, the user provides source and bytecode.
      const { bytecode } = compile(source, file);

      const result = detectProxy(source, bytecode, file);

      const expected = expectedResults[file];

      if (expected === undefined) {
        throw new Error(`No expectation defined for ${file}`);
      }

      if (result.isProxy !== expected) {
        console.log(`Failed ${file}: Expected ${expected}, got ${result.isProxy}. Reason: ${result.reason}`);
        if (result.details) {
            console.log('Details:', JSON.stringify(result.details, null, 2));
        }
      }

      expect(result.isProxy).toBe(expected);

      if (expected === false) {
          expect(result.reason).toBe('No proxy patterns detected.');
      } else {
          expect(result.reason).not.toBe('No proxy patterns detected.');
      }
    });
  });

  it('should detect bytecode mismatch', () => {
    const file = 'SimpleStorage.sol';
    const sourcePath = path.join(contractsDir, file);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const { bytecode } = compile(source, file);

    // Tamper with bytecode (change one byte in the middle)
    // We need to be careful not to hit metadata if we are stripping it, but stripping only removes end.
    // Changing the beginning/middle is fine.
    const tamperedBytecode = bytecode.replace('6080', '6081');

    const result = detectProxy(source, tamperedBytecode, file);

    expect(result.isProxy).toBe(true);
    expect(result.reason).toContain('Bytecode mismatch');
  });
});
