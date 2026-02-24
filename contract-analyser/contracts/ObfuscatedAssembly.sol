// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ObfuscatedAssembly {

    function hiddenDelegate(address target) external {
        // Trying to hide delegatecall
        // In assembly, opcodes are just numbers. delegatecall is 0xF4
        assembly {
            // We can't easily execute raw bytes in Solidity assembly without `verbatim` (which is dangerous/not always avail)
            // But we can just use `delegatecall` instruction which is standard

            // Just standard assembly delegatecall but inside a function not fallback
            let result := delegatecall(gas(), target, 0, 0, 0, 0)
        }
    }
}
