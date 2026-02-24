// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library ChaosLib {
    function internalDelegate(address impl) internal {
        (bool s, ) = impl.delegatecall("");
        require(s);
    }
}

contract Chaos {
    address public implementation;
    address[] public implementations;
    mapping(uint => address) public implMap;

    struct Config {
        address impl;
    }
    Config public config;

    constructor(address _impl) {
        implementation = _impl;
        implementations.push(_impl);
        implMap[0] = _impl;
        config.impl = _impl;
    }

    // 1. Ternary Operator
    function ternary(bool condition) external {
        (bool s, ) = (condition ? implementation : address(0)).delegatecall("");
        require(s);
    }

    // 2. Array Access
    function arrayAccess() external {
        (bool s, ) = implementations[0].delegatecall("");
        require(s);
    }

    // 3. Mapping Access
    function mappingAccess() external {
        (bool s, ) = implMap[0].delegatecall("");
        require(s);
    }

    // 4. Struct Member Access
    function structAccess() external {
        (bool s, ) = config.impl.delegatecall("");
        require(s);
    }

    // 5. Tuple / Parentheses
    function tupleAccess() external {
        (bool s, ) = (implementation).delegatecall("");
        require(s);
    }

    // 6. Msg.sender
    function msgSender() external {
        (bool s, ) = msg.sender.delegatecall("");
        require(s);
    }

    // 7. Address(this) - Self-delegate
    function selfDelegate() external {
        (bool s, ) = address(this).delegatecall("");
        require(s);
    }

    // 8. ABI Decode
    function decodeDelegate(bytes calldata data) external {
        address target = abi.decode(data, (address));
        (bool s, ) = target.delegatecall("");
        require(s);
    }

    // 9. Internal Library Call
    function libDelegate() external {
        ChaosLib.internalDelegate(implementation);
    }

    // 10. Callcode (Inline Assembly)
    function asmCallcode() external {
        address impl = implementation;
        assembly {
            // callcode(gas, addr, value, input, insize, output, outsize)
            let result := callcode(gas(), impl, 0, 0, 0, 0, 0)
        }
    }
}
