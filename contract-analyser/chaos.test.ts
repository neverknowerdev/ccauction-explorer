import { describe, it, expect } from 'vitest';
import { detectProxy } from './detector';
import { compile } from './compiler';

const baseContract = (body: string) => `
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
    struct Config { address impl; }
    Config public config;

    constructor(address _impl) {
        implementation = _impl;
        implementations.push(_impl);
        implMap[0] = _impl;
        config.impl = _impl;
    }

    ${body}
}
`;

const testCases = [
    {
        name: 'Ternary Operator',
        code: `
        function ternary(bool condition) external {
            (bool s, ) = (condition ? implementation : address(0)).delegatecall("");
            require(s);
        }
        `
    },
    {
        name: 'Array Access',
        code: `
        function arrayAccess() external {
            (bool s, ) = implementations[0].delegatecall("");
            require(s);
        }
        `
    },
    {
        name: 'Mapping Access',
        code: `
        function mappingAccess() external {
            (bool s, ) = implMap[0].delegatecall("");
            require(s);
        }
        `
    },
    {
        name: 'Struct Member Access',
        code: `
        function structAccess() external {
            (bool s, ) = config.impl.delegatecall("");
            require(s);
        }
        `
    },
    {
        name: 'Tuple / Parentheses',
        code: `
        function tupleAccess() external {
            (bool s, ) = (implementation).delegatecall("");
            require(s);
        }
        `
    },
    {
        name: 'Msg.sender',
        code: `
        function msgSender() external {
            (bool s, ) = msg.sender.delegatecall("");
            require(s);
        }
        `
    },
    {
        name: 'Address(this)',
        code: `
        function selfDelegate() external {
            (bool s, ) = address(this).delegatecall("");
            require(s);
        }
        `
    },
    {
        name: 'ABI Decode',
        code: `
        function decodeDelegate(bytes calldata data) external {
            address target = abi.decode(data, (address));
            (bool s, ) = target.delegatecall("");
            require(s);
        }
        `
    },
    {
        name: 'Internal Library Call',
        code: `
        function libDelegate() external {
            ChaosLib.internalDelegate(implementation);
        }
        `
    },
    {
        name: 'Callcode (Inline Assembly)',
        code: `
        function asmCallcode() external {
            address impl = implementation;
            assembly {
                let result := callcode(gas(), impl, 0, 0, 0, 0, 0)
            }
        }
        `
    }
];

describe('Chaos Proxy Detection', () => {
    testCases.forEach(({ name, code }) => {
        it(`should detect proxy in: ${name}`, () => {
            const source = baseContract(code);
            // Compile to get bytecode
            try {
                const { bytecode } = compile(source, 'Chaos.sol');

                // Analyze
                const result = detectProxy(source, bytecode, 'Chaos.sol');

                // Assert
                if (!result.isProxy) {
                    console.error(`FAILED: ${name} was not detected as proxy.`);
                }
                expect(result.isProxy).toBe(true);
            } catch (e) {
                console.error(`Compilation/Analysis Error in ${name}:`, e);
                throw e;
            }
        });
    });
});
