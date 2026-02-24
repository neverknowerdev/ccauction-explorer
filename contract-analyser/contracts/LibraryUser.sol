// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library MathLib {
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        return a + b;
    }
}

contract LibraryUser {
    using MathLib for uint256;

    uint256 public total;

    function addToTotal(uint256 value) public {
        // This uses internal library call which is inlined, so no delegatecall in bytecode usually
        total = total.add(value);
    }
}
