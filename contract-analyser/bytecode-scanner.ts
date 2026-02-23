import { Contract } from 'sevm';

export function hasDelegateCall(bytecode: string): boolean {
  // Ensure bytecode starts with 0x
  if (bytecode && !bytecode.startsWith('0x')) {
    bytecode = '0x' + bytecode;
  }

  if (!bytecode || bytecode.length <= 2) return false;

  const contract = new Contract(bytecode);

  // contract.opcodes() is a generator in newer SEVM versions
  for (const op of contract.opcodes()) {
      if (op.mnemonic === 'DELEGATECALL') {
          return true;
      }
  }

  return false;
}
