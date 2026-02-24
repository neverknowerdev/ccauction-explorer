// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ImmutableBypass {
    address immutable implementation;

    constructor(address _impl) {
        implementation = _impl;
    }

    fallback() external payable {
        // High-level delegatecall using immutable variable.
        // Detector sees "immutable" -> Safe (currently).
        // But implementation is set at deployment time (could be malicious).
        (bool success, ) = implementation.delegatecall(msg.data);
        require(success);
    }
}
