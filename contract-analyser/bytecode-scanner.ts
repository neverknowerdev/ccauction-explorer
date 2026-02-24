import { Contract } from 'sevm';

export function hasDelegateCall(bytecode: string): boolean {
  if (bytecode && !bytecode.startsWith('0x')) {
    bytecode = '0x' + bytecode;
  }

  if (!bytecode || bytecode.length <= 2) return false;

  const contract = new Contract(bytecode);

  for (const op of contract.opcodes()) {
      if (op.mnemonic === 'DELEGATECALL' || op.mnemonic === 'CALLCODE') {
          return true;
      }
  }

  return false;
}
