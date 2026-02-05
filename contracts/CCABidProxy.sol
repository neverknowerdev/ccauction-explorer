// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Interface for abi.encodeCall (gas: no runtime selector hash)
interface ICCASubmitBid {
    function submitBid(
        uint256 maxPrice,
        uint128 amount,
        address owner,
        uint256 prevTickPrice,
        bytes calldata hookData
    ) external payable returns (uint256 bidId);
}

/**
 * @title CCABidProxy
 * @notice Proxy for CCA submitBid that forwards calls to the original contract
 *         and retains a fee from each transaction's msg.value. Fee can be updated by owner.
 *         Fees accumulate in the contract until the owner calls collectFees().
 */
contract CCABidProxy {
    /// @dev Fee in basis points (e.g. 20 = 0.2%). Set in constructor, updatable by owner via setFeeBps.
    uint256 public feeBps;

    /// @dev Owner: can collect fees
    address public owner;

    error ZeroAddress();
    error Unauthorized();
    error CollectFailed();
    error CallFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _owner, uint256 _feeBps) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
        feeBps = _feeBps;
    }

    /**
     * @notice Submit a bid via the given CCA auction, retaining feeBps of msg.value as fee (accumulated in contract).
     * @param auction      CCA auction contract to submit the bid to
     * @param maxPrice     Same as CCA submitBid
     * @param amount       Same as CCA submitBid
     * @param bidOwner     Same as CCA submitBid (owner of the bid)
     * @param prevTickPrice Same as CCA submitBid
     * @param hookData     Same as CCA submitBid
     * @return bidId       Return value from CCA submitBid
     */
    function submitBid(
        address auction,
        uint256 maxPrice,
        uint128 amount,
        address bidOwner,
        uint256 prevTickPrice,
        bytes calldata hookData
    ) external payable returns (uint256 bidId) {
        uint256 fee = (msg.value * feeBps) / 10_000;
        uint256 forwardValue;
        unchecked {
            // fee <= msg.value (feeBps <= 10_000)
            forwardValue = msg.value - fee;
        }

        bytes memory payload = abi.encodeCall(
            ICCASubmitBid.submitBid,
            (maxPrice, amount, bidOwner, prevTickPrice, hookData)
        );

        (bool success, bytes memory data) = auction.call{value: forwardValue}(
            payload
        );
        if (!success) {
            if (data.length > 0) {
                assembly {
                    revert(add(data, 32), mload(data))
                }
            }
            revert CallFailed();
        }
        assembly {
            bidId := mload(add(data, 32))
        }
    }

    /**
     * @notice Submit a bid via the given CCA auction using pre-encoded calldata. Retains feeBps of msg.value.
     * @dev Caller must encode the CCA submitBid calldata off-chain (e.g. with abi.encodeCall). Saves ~2k gas vs submitBid.
     * @param auction     CCA auction contract to submit the bid to
     * @param callPayload ABI-encoded submitBid(...) calldata (selector + args)
     * @return bidId      Return value from CCA submitBid
     */
    function submitBidPayload(
        address auction,
        bytes calldata callPayload
    ) external payable returns (uint256 bidId) {
        uint256 fee = (msg.value * feeBps) / 10_000;
        uint256 forwardValue;
        unchecked {
            forwardValue = msg.value - fee;
        }

        (bool success, bytes memory data) = auction.call{value: forwardValue}(
            callPayload
        );
        if (!success) {
            if (data.length > 0) {
                assembly {
                    revert(add(data, 32), mload(data))
                }
            }
            revert CallFailed();
        }
        assembly {
            bidId := mload(add(data, 32))
        }
    }

    /**
     * @notice Set the fee in basis points (e.g. 20 = 0.2%). Only owner.
     */
    function setFeeBps(uint256 _feeBps) external onlyOwner {
        feeBps = _feeBps;
    }

    /**
     * @notice Withdraw all accumulated fees to owner. Only owner.
     */
    function collectFees() external onlyOwner {
        uint256 amount = address(this).balance;
        if (amount == 0) return;
        (bool sent, ) = owner.call{value: amount}("");
        if (!sent) revert CollectFailed();
    }
}
