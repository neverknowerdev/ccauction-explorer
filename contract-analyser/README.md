# EVM Proxy & Backdoor Detector

This module provides a rigorous, programmatic way to detect proxy contracts and potential backdoors in EVM smart contracts, given their source code and deployed bytecode.

## Overview

The detector operates on the principle of **verification before analysis**:
1.  **Bytecode Pre-Scan (Fast Path)**: We scan the *Original Bytecode* (using SEVM) to check if the `DELEGATECALL` opcode (0xF4) is present.
    -   If NOT present -> The contract cannot be a proxy. **Mark as Safe**.
    -   If present -> Proceed to verification.
2.  **Verification**: We compile the provided source code and ensure it exactly matches the deployed bytecode. If they mismatch, the contract is flagged (source cannot be trusted).
3.  **Analysis**: We perform static analysis on the AST to identify *how* `delegatecall` is used.
4.  **Heuristics**: Distinguishes between "safe" usage (libraries) and "proxy/backdoor" usage.
5.  **Implementation Extraction**: If a proxy is detected, it attempts to extract the Implementation Address or Storage Slot.

## Algorithm

### 1. Bytecode Scanning (SEVM)
-   **Tool**: `sevm` (EVM Disassembler/Decompiler).
-   **Process**: Disassemble bytecode into opcodes.
-   **Check**: Does the opcode list contain `DELEGATECALL`?
    -   *Note*: This safely ignores `0xF4` bytes inside PUSH data (e.g., `uint x = 0xF4`).

### 2. Compilation & Verification
-   **Input**: Source Code, Original Bytecode.
-   **Process**:
    1.  Compile Source -> `CompiledBytecode`.
    2.  **Strip Metadata**: Remove CBOR-encoded metadata hash from both bytecodes.
    3.  **Compare**: `Strip(Original) == Strip(Compiled)`.
-   **Result**: Mismatch -> **Flag as Proxy/Malicious**.

### 3. AST Analysis (High-Level & Assembly)
-   **Target**: `FunctionCall` (Solidity) and `YulFunctionCall` (Assembly) to `delegatecall`.
-   **Check**: Analyze the target address expression.
    -   **Safe**: Literal address, Constant/Immutable variable, Library call.
    -   **Unsafe**: Dynamic target (Storage, Input, Calculation).

### 4. Implementation Extraction
If detected as a proxy, the tool scans for:
-   **EIP-1967 Slot**: Looks for `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc` usage (Literal or Constant).
-   **Minimal Proxy (EIP-1167)**: Detects standard bytecode pattern and extracts the embedded address.
-   **Generic Storage Slot**: Detects `sload(CONST)` calls in assembly and returns the constant value as the likely storage slot.

## Usage

```typescript
import { detectProxy } from './contract-analyser/detector';

const source = `...`;
const bytecode = `0x...`;

const result = detectProxy(source, bytecode);

if (result.isProxy) {
  console.log('Proxy Detected:', result.reason);
  if (result.implementation) {
      console.log('Implementation:', result.implementation);
      // { type: 'storageSlot', value: '0x...' } or { type: 'address', value: '0x...' }
  }
} else {
  console.log('Contract is Safe');
}
```

## Testing

Run tests:
```bash
npx vitest run contract-analyser/detector.test.ts
```
