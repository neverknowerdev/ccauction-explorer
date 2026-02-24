// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract EIP1967Proxy {
    // EIP-1967: keccak256("eip1967.proxy.implementation") - 1
    bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(address _logic) {
        assembly {
            sstore(_IMPLEMENTATION_SLOT, _logic)
        }
    }

    fallback() external payable {
        assembly {
            let _impl := sload(_IMPLEMENTATION_SLOT)
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), _impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
