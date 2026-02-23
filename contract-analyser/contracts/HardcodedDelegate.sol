// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HardcodedDelegate {
    address constant IMPL = 0x1234567890123456789012345678901234567890;

    function delegate() external {
        // Hardcoded address via constant
        (bool success, ) = IMPL.delegatecall(abi.encodeWithSignature("foo()"));
        require(success);
    }
}
