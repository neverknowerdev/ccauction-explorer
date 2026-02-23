import { Contract } from 'sevm';

export interface BytecodeAnalysis {
  hasDelegateCall: boolean;
  opcodes?: string[];
}

export function hasDelegateCall(bytecode: string): boolean {
  // Ensure bytecode starts with 0x
  if (bytecode && !bytecode.startsWith('0x')) {
    bytecode = '0x' + bytecode;
  }

  if (!bytecode || bytecode.length <= 2) return false;

  try {
    const contract = new Contract(bytecode);

    // contract.opcodes() is a generator in newer SEVM versions
    for (const op of contract.opcodes()) {
        if (op.mnemonic === 'DELEGATECALL') {
            return true;
        }
    }

    return false;

  } catch (e) {
    // If SEVM fails, we should be conservative.
    // If we assume SAFE on error, we might miss a proxy.
    // But if bytecode is invalid, it won't run.
    console.error('SEVM Parse Error:', e);
    return false;
  }
}
