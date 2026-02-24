// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ImmutableTarget {
    address public immutable target;

    constructor(address _target) {
        target = _target;
    }

    fallback() external payable {
        // This uses delegatecall, but the target is immutable (embedded in bytecode)
        // Our tool should ideally see this as "safe" or at least distinguishable from a mutable proxy
        // However, technically it IS a proxy to a specific implementation.
        // But since it cannot be changed, it's not a "backdoor" in the sense of "changeable logic".
        address implementation = target;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
