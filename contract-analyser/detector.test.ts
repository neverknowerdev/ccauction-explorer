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
  'ImmutableTarget.sol': true,
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

      const { bytecode } = compile(source, file);

      const result = detectProxy(source, bytecode, file);
      const expected = expectedResults[file];

      if (result.isProxy !== expected) {
        console.log(`Failed ${file}: Expected ${expected}, got ${result.isProxy}. Reason: ${result.reason}`);
      }

      expect(result.isProxy).toBe(expected);
    });
  });

  it('should fast-pass (safe) on mismatching bytecode IF no delegatecall present', () => {
    const file = 'SimpleStorage.sol';
    const sourcePath = path.join(contractsDir, file);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const { bytecode } = compile(source, file);

    // Tamper bytecode: Change PUSH1 0x80 (6080) to PUSH1 0x81 (6081)
    // SimpleStorage has NO DELEGATECALL.
    const tamperedBytecode = bytecode.replace('6080', '6081');

    const result = detectProxy(source, tamperedBytecode, file);
    expect(result.isProxy).toBe(false);
    expect(result.reason).toBe('No DELEGATECALL opcode found in bytecode.');
  });

  it('should fail (unsafe) on mismatching bytecode IF delegatecall present', () => {
    // We use MinimalProxy because SEVM reliably detects DELEGATECALL in it.
    const file = 'MinimalProxy.sol';
    const sourcePath = path.join(contractsDir, file);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const { bytecode } = compile(source, file);

    // Tamper bytecode safely (preserve DELEGATECALL, break verification)
    const tamperedBytecode = bytecode.replace('6080', '6081');

    const result = detectProxy(source, tamperedBytecode, file);

    // Mismatch -> Unsafe (isProxy: true)
    expect(result.isProxy).toBe(true);
    expect(result.reason).toContain('Bytecode mismatch');
  });

  it('should ignore DELEGATECALL in PUSH data (SEVM check)', () => {
    // 0x60f45000: PUSH1 0xF4 POP STOP
    // Has 0xF4 but as data.
    const trickyBytecode = '0x60f45000';
    const dummySource = 'contract Test {}';

    const result = detectProxy(dummySource, trickyBytecode);
    expect(result.isProxy).toBe(false);
    expect(result.reason).toBe('No DELEGATECALL opcode found in bytecode.');
  });
});
