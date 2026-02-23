// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract BackdoorFunction {
    uint256 public value;

    function safeFunction(uint256 _value) external {
        value = _value;
    }

    // Backdoor: allows executing arbitrary code via delegatecall
    function emergencyExecute(address target, bytes calldata data) external {
        // This is a clear backdoor proxy pattern
        (bool success, ) = target.delegatecall(data);
        require(success, "Failed");
    }
}
