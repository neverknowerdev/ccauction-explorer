// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockCCA
 * @notice Mock CCA contract for testing CCABidProxy. Accepts submitBid with value and returns a bidId.
 */
contract MockCCA {
    uint256 public nextBidId = 1;

    /// @dev If true, submitBid reverts (for failure tests)
    bool public shouldRevert;

    /// @dev Last call args for assertions
    uint256 public lastMaxPrice;
    uint128 public lastAmount;
    address public lastOwner;
    uint256 public lastPrevTickPrice;
    bytes public lastHookData;
    uint256 public lastValueReceived;

    function submitBid(
        uint256 maxPrice,
        uint128 amount,
        address owner,
        uint256 prevTickPrice,
        bytes calldata hookData
    ) external payable returns (uint256 bidId) {
        if (shouldRevert) revert("MockCCA: reverted");

        lastMaxPrice = maxPrice;
        lastAmount = amount;
        lastOwner = owner;
        lastPrevTickPrice = prevTickPrice;
        lastHookData = hookData;
        lastValueReceived = msg.value;

        bidId = nextBidId++;
    }

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }
}
