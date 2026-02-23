# EVM Proxy & Backdoor Detector

This module provides a rigorous, programmatic way to detect proxy contracts and potential backdoors in EVM smart contracts, given their source code and deployed bytecode.

## Overview

The detector operates on the principle of **verification before analysis**:
1.  **Verification**: It ensures the provided source code exactly matches the deployed bytecode. If they mismatch, the contract is flagged immediately (as the source cannot be trusted).
2.  **Analysis**: It performs a static analysis on the Abstract Syntax Tree (AST) generated from the source code to identify `delegatecall` usage.
3.  **Heuristics**: It distinguishes between "safe" usage (e.g., constant addresses for libraries) and "proxy/backdoor" usage (dynamic targets).

## Algorithm

### 1. Compilation & Verification

The first step is to compile the provided source code using `solc`.

-   **Input**: Source Code string, Original Deployed Bytecode (hex string).
-   **Process**:
    1.  Compile Source -> `CompiledBytecode` + `AST`.
    2.  **Strip Metadata**: Solidity appends a CBOR-encoded metadata hash to the end of the bytecode. This hash includes version info and IPFS hashes of source files. To compare bytecode logic, we strip this metadata from both the `OriginalBytecode` and `CompiledBytecode`.
        -   The length of the metadata is encoded in the last 2 bytes of the bytecode.
    3.  **Compare**: `Strip(OriginalBytecode) == Strip(CompiledBytecode)`.
-   **Result**: If mismatch -> **Flag as Proxy/Malicious**.

### 2. AST Analysis (High-Level)

If verification passes, we traverse the Solidity AST to find `delegatecall` usages.

-   **Target**: `FunctionCall` nodes where the function is `delegatecall`.
-   **Pattern**: `address(target).delegatecall(data)`.
-   **Check**: We analyze the `target` expression.
    -   **Safe**:
        -   `Literal` address (e.g., `0x123...`).
        -   `Identifier` referencing a `constant` variable.
        -   `Identifier` referencing an `immutable` variable (these are embedded in bytecode at construction).
        -   `Library` function calls (which compile to `delegatecall` but are static).
    -   **Unsafe (Proxy/Backdoor)**:
        -   State variables (storage).
        -   Function arguments.
        -   Return values from other calls.
        -   Any expression that is not explicitly constant.

### 3. Yul/Assembly Analysis (Low-Level)

We also analyze `InlineAssembly` blocks within the contract, as bad actors often hide logic here.

-   **Target**: `YulFunctionCall` nodes calling `delegatecall`.
-   **Pattern**: `delegatecall(gas(), target, ...)`
-   **Check**:
    -   **Safe**: The `target` is a `YulLiteral`.
    -   **Unsafe**: The `target` is a variable or expression.
        -   *Note*: While some assembly usage might use immutable variables, mapping Yul variables back to Solidity constants is complex. We aggressively flag dynamic assembly delegates as proxies to be safe.

## Usage

```typescript
import { detectProxy } from './contract-analyser/detector';

const source = `...`;
const bytecode = `0x...`;

const result = detectProxy(source, bytecode);

if (result.isProxy) {
  console.log('Proxy Detected:', result.reason);
} else {
  console.log('Contract is Safe');
}
```

## Testing

The module includes a comprehensive test suite with 10+ contracts covering:
-   **Safe Patterns**: Simple storage, Libraries, Immutable variables, Hardcoded delegates.
-   **Proxy Patterns**: EIP-1967, Minimal Proxies, Fallback proxies.
-   **Backdoors**: Hidden storage slots, Assembly obfuscation, "Emergency" functions.

Run tests:
```bash
npx vitest run contract-analyser/detector.test.ts
```
