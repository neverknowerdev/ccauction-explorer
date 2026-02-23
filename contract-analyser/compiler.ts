import solc from 'solc';

export interface CompilationResult {
  bytecode: string;
  ast: any;
  errors?: any[];
}

export function compile(source: string, fileName: string): CompilationResult {
  const input = {
    language: 'Solidity',
    sources: {
      [fileName]: {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'],
          '': ['ast'],
        },
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter((e: any) => e.severity === 'error');
    if (errors.length > 0) {
      throw new Error(`Compilation failed: ${JSON.stringify(errors, null, 2)}`);
    }
  }

  const contractFile = output.contracts[fileName];
  const contractName = Object.keys(contractFile)[0]; // Assume one contract per file for simplicity
  const contract = contractFile[contractName];

  return {
    bytecode: contract.evm.deployedBytecode.object, // Runtime bytecode
    ast: output.sources[fileName].ast,
  };
}

export function stripMetadata(bytecode: string): string {
  if (!bytecode || bytecode.length === 0) return bytecode;

  // The last 2 bytes (4 hex chars) encode the length of the CBOR metadata
  const metadataLengthHex = bytecode.slice(-4);
  const metadataLength = parseInt(metadataLengthHex, 16);

  // Total length to strip = metadata length * 2 (hex chars) + 4 (length bytes themselves)
  // Wait, the length at the end is the length in BYTES of the CBOR data.
  // So we strip (metadataLength * 2) characters + 4 characters.

  const stripLength = (metadataLength * 2) + 4;

  if (stripLength > bytecode.length) {
    // Should not happen for valid solidity bytecode, but return as is or empty
    return bytecode;
  }

  return bytecode.slice(0, -stripLength);
}
