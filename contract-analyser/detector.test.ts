import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { detectProxy } from './detector';
import { compile } from './compiler';

const contractsDir = path.join(__dirname, 'contracts');

const expectedResults: Record<string, boolean> = {
  'SimpleStorage.sol': false,
  'LibraryUser.sol': false,
  'ImmutableTarget.sol': true,
  'HardcodedDelegate.sol': false,

  'EIP1967Proxy.sol': true,
  'MinimalProxy.sol': true,
  'BackdoorFunction.sol': true,
  'StorageSlotBackdoor.sol': true,
  'FallbackProxy.sol': true,
  'ObfuscatedAssembly.sol': true,

  'Bypass.sol': true, // Should be true (unsafe) but current implementation fails
};

// ... implementation map ...
const expectedImplementations: Record<string, any> = {
  'EIP1967Proxy.sol': { type: 'storageSlot', value: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' },
  'StorageSlotBackdoor.sol': { type: 'storageSlot', value: '0x1122334455667788990011223344556677889900112233445566778899001122' },
};

describe('Proxy Detector', () => {
  const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.sol'));

  files.forEach(file => {
    it(`should correctly classify ${file}`, () => {
      const sourcePath = path.join(contractsDir, file);
      const source = fs.readFileSync(sourcePath, 'utf8');

      const { bytecode } = compile(source, file);

      const result = detectProxy(source, bytecode, file);
      const expected = expectedResults[file];

      if (result.isProxy !== expected) {
        console.log(`Failed ${file}: Expected ${expected}, got ${result.isProxy}. Reason: ${result.reason}`);
      }

      expect(result.isProxy).toBe(expected);

      if (expected && expectedImplementations[file]) {
          expect(result.implementation).toBeDefined();
          const expectedImpl = expectedImplementations[file];
          expect(result.implementation?.type).toBe(expectedImpl.type);
          if (expectedImpl.value) {
              const resVal = result.implementation?.value?.toLowerCase();
              const expVal = expectedImpl.value.toLowerCase();
              if (resVal !== expVal) {
                   if (BigInt(resVal || 0) === BigInt(expVal || 0)) {
                   } else {
                       expect(resVal).toBe(expVal);
                   }
              }
          }
      }
    });
  });

  it('should fast-pass (safe) on mismatching bytecode IF no delegatecall present', () => {
    const file = 'SimpleStorage.sol';
    const sourcePath = path.join(contractsDir, file);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const { bytecode } = compile(source, file);
    const tamperedBytecode = bytecode.replace('6080', '6081');
    const result = detectProxy(source, tamperedBytecode, file);
    expect(result.isProxy).toBe(false);
  });

  it('should fail (unsafe) on mismatching bytecode IF delegatecall present', () => {
    const file = 'MinimalProxy.sol';
    const sourcePath = path.join(contractsDir, file);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const { bytecode } = compile(source, file);
    const tamperedBytecode = bytecode.replace('6080', '6081');
    const result = detectProxy(source, tamperedBytecode, file);
    expect(result.isProxy).toBe(true);
    expect(result.reason).toContain('Bytecode mismatch');
  });

  it('should ignore DELEGATECALL in PUSH data (SEVM check)', () => {
    const trickyBytecode = '0x60f45000';
    const dummySource = 'contract Test {}';
    const result = detectProxy(dummySource, trickyBytecode);
    expect(result.isProxy).toBe(false);
  });
});
