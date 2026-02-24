// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CallcodeBypass {
    // Uses deprecated CALLCODE (0xF2) instead of DELEGATECALL (0xF4).
    // Scanner currently only checks 0xF4.
    // CALLCODE executes in caller's context (like DELEGATECALL) but msg.sender behaves differently.
    // It is still a proxy/backdoor.

    function exploit(address target) external {
        assembly {
            // callcode(gas, addr, value, in, insize, out, outsize)
            // value is 0
            pop(callcode(gas(), target, 0, 0, 0, 0, 0))
        }
    }
}
