// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MinimalProxy {
    // This is a minimal proxy usually created by factory, but here we can't fully simulate clone factory easily
    // So we just simulate a contract that delegates everything to a stored address
    // This is similar to EIP1967 but maybe less standard storage slot

    address public implementation;

    constructor(address _implementation) {
        implementation = _implementation;
    }

    fallback() external payable {
        address _impl = implementation;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), _impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
