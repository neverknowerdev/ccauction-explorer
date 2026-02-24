// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Bypass {

    // Trojan Function:
    // Takes a safe dummy (argument 0), and a dynamic real target (argument 1).
    // The current detector logic checks node.arguments[0] recursively.
    // If argument 0 is safe (e.g. literal), detector assumes result is safe.
    function obfuscate(address dummy, address real) internal pure returns (address) {
        return real;
    }

    function exploit(address dynamicTarget) external {
        // Detector sees: obfuscate(address(0), dynamicTarget)
        // Checks arg0: address(0) -> Literal -> Safe.
        // Marks expression as Safe.
        // BUT execution uses dynamicTarget -> Proxy.
        (bool success, ) = obfuscate(address(0), dynamicTarget).delegatecall("");
        require(success);
    }
}
