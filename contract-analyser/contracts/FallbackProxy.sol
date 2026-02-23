// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract FallbackProxy {
    address public lib;

    constructor(address _lib) {
        lib = _lib;
    }

    // Standard fallback proxy
    fallback() external payable {
        (bool success, ) = lib.delegatecall(msg.data);
        require(success);
    }
}
