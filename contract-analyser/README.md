# Contract Analyser - Proxy Detector

A robust, low-level proxy detection system for EVM smart contracts. Designed to identify both standard and obfuscated proxy patterns, assuming a malicious actor attempting to bypass detection.

## How It Works

The detector employs a multi-stage analysis pipeline:

1.  **Bytecode Scanning (Fast Path)**:
    -   Scans the provided original bytecode for `DELEGATECALL` (0xF4) or `CALLCODE` (0xF2) opcodes.
    -   If neither is found, the contract is deemed **Safe** (Not a Proxy).

2.  **Source Verification**:
    -   Compiles the provided source code using `solc`.
    -   Strips CBOR metadata and compares the compiled bytecode with the original bytecode.
    -   **Result**: If bytecodes do not match, the check fails (**Unsafe**), preventing source-code spoofing.

3.  **AST Analysis**:
    -   Traverses the Abstract Syntax Tree (AST) to locate all `delegatecall` and `callcode` operations.
    -   **Hidden Delegatecall Check**: If the bytecode contains `DELEGATECALL` opcodes but the AST does not contain corresponding high-level nodes (e.g., due to `verbatim` or obscure assembly), the contract is flagged as **Unsafe**.
    -   **Verbatim Check**: Explicitly scans Yul `verbatim` instructions for injected `DELEGATECALL` (0xF4) or `CALLCODE` (0xF2) opcodes.

4.  **Target Safety Verification**:
    -   For every detected delegatecall, the analyzer examines the **target address expression**.
    -   **Safe Targets**: Only targets that are strictly **compile-time constants** or **literals** (e.g., `0x123...`, `LibraryName`) are considered safe.
    -   **Unsafe Targets**: Any target depending on runtime state is flagged as **Unsafe** (Proxy). This includes:
        -   Storage variables (SLOAD).
        -   Input data (Calldata/Memory).
        -   Immutable variables (set at deployment time, thus user-controlled).
        -   Function return values (unless type conversion of literals).
        -   Complex expressions (Ternary, Array access, Mappings, Struct members).
        -   `msg.sender` or `address(this)`.

## Security Features & Mitigations

This tool is hardened against various evasion techniques:

-   **Trojan Function Bypass**: Prevents using "safe" function calls (like `address(safe)`) to mask unsafe return values. Only explicit type conversions of literals are allowed.
-   **Immutable Bypass**: Detects and rejects `immutable` variables as targets, as they can be manipulated during deployment to point to malicious implementations.
-   **CALLCODE Legacy Attack**: Detects the deprecated `CALLCODE` opcode which functions similarly to `DELEGATECALL`.
-   **Verbatim / Inline Assembly**: specific checks for `verbatim` instruction injection in Yul/Assembly.
-   **Obfuscation / Bytecode Mismatch**: Strictly enforces source-to-bytecode correspondence.
-   **Chaos Patterns**: Tested against complex Solidity patterns (Ternary, Structs, Arrays, Tuples) to ensure the AST traverser is not confused.

## Testing

The module includes a comprehensive test suite covering:
1.  **Standard Proxies**: EIP-1967, EIP-1167 (Minimal), UUPS.
2.  **Safe Contracts**: Libraries, Hardcoded Delegations.
3.  **Chaos / Bypasses**: 10+ complex patterns designed to trick the analyzer.

Run tests with:
```bash
npx vitest run contract-analyser/chaos.test.ts
```
