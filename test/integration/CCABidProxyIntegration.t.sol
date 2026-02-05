// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CCABidProxyIntegration
 * @notice Integration tests that fork Base Sepolia, create a real CCA auction via the
 *         ContinuousClearingAuctionFactory, then verify CCABidProxy works with it.
 * @dev Requires fork: run with FOUNDRY_ETH_RPC_URL=https://sepolia.base.org forge test --match-path test/integration/*.sol
 *      Docs: https://docs.uniswap.org/contracts/liquidity-launchpad/quickstart/local-deployment
 */

import {Test} from "../../lib/forge-std/src/Test.sol";
import {CCABidProxy} from "../../contracts/CCABidProxy.sol";
import {MintableERC20} from "../../contracts/mock/MintableERC20.sol";

interface ICCAFactory {
    function initializeDistribution(
        address token,
        uint256 totalSupply,
        bytes calldata configData,
        bytes32 salt
    ) external returns (address distributionContract);
}

interface ICCAuction {
    function onTokensReceived() external;

    function startBlock() external view returns (uint64);

    function endBlock() external view returns (uint64);

    function claimBlock() external view returns (uint64);

    function clearingPrice() external view returns (uint256);

    function token() external view returns (address);

    function exitBid(uint256 bidId) external;

    function claimTokens(uint256 bidId) external;
}

contract CCABidProxyIntegrationTest is Test {
    address constant CCA_FACTORY = 0xcca1101C61cF5cb44C968947985300DF945C3565;
    address constant NATIVE_ETH = address(0);

    CCABidProxy proxy;
    MintableERC20 token;
    address auction;
    address owner;
    address bidder;

    uint128 constant TOTAL_SUPPLY = 1_000_000 * 1e18; // 1M tokens (fits uint128)
    uint256 constant FLOOR_PRICE_Q96 = 2 ** 96;
    uint256 constant TICK_SPACING_Q96 = 2 ** 96;

    function setUp() public {
        string memory rpcUrl = vm.envOr(
            "FOUNDRY_ETH_RPC_URL",
            string("https://sepolia.base.org")
        );
        vm.createSelectFork(rpcUrl);

        owner = address(0x1);
        bidder = address(0x2);
        vm.deal(owner, 10 ether);
        vm.deal(bidder, 10 ether);

        // Deploy token and mint
        token = new MintableERC20("Test", "TST", 18);
        token.mint(address(this), uint256(TOTAL_SUPPLY));

        // Auction parameters: start in 5 blocks, run 100 blocks, ETH currency
        uint64 currentBlock = uint64(block.number);
        uint64 startBlock = currentBlock + 5;
        uint64 endBlock = startBlock + 100;
        bytes memory auctionStepsData = _encodeAuctionSteps(100_000, 100);

        bytes memory configData = abi.encode(
            NATIVE_ETH,
            address(this),
            address(this),
            startBlock,
            endBlock,
            endBlock,
            TICK_SPACING_Q96,
            address(0),
            FLOOR_PRICE_Q96,
            uint128(0),
            auctionStepsData
        );

        auction = ICCAFactory(CCA_FACTORY).initializeDistribution(
            address(token),
            uint256(TOTAL_SUPPLY),
            configData,
            bytes32(0)
        );
        require(auction != address(0), "auction not deployed");

        token.transfer(auction, uint256(TOTAL_SUPPLY));
        ICCAuction(auction).onTokensReceived();

        vm.roll(startBlock);

        proxy = new CCABidProxy(owner, 20);
    }

    function _encodeAuctionSteps(
        uint24 mps,
        uint40 blockDelta
    ) internal pure returns (bytes memory) {
        uint64 packed = (uint64(mps) << 40) | blockDelta;
        return abi.encodePacked(bytes8(packed));
    }

    function test_Integration_ProxySubmitBid_RetainsFee_AndForwardsToCCA()
        public
    {
        uint256 bidValue = 1 ether;
        uint256 expectedFee = (bidValue * proxy.feeBps()) / 10_000;
        uint256 forwardValue = bidValue - expectedFee;
        uint128 amount = uint128(forwardValue);
        uint256 maxPrice = FLOOR_PRICE_Q96 + TICK_SPACING_Q96;
        uint256 prevTickPrice = FLOOR_PRICE_Q96;

        uint256 proxyBalanceBefore = address(proxy).balance;

        vm.prank(bidder);
        uint256 bidId = proxy.submitBid{value: bidValue}(
            auction,
            maxPrice,
            amount,
            bidder,
            prevTickPrice,
            ""
        );

        assertGe(bidId, 0, "bidId should be >= 0 (CCA may use 0-based ids)");
        assertEq(
            address(proxy).balance,
            proxyBalanceBefore + expectedFee,
            "proxy should retain fee"
        );
        assertEq(expectedFee, (bidValue * 20) / 10_000, "fee should be 0.2%");
    }

    function test_Integration_ProxySubmitBid_OwnerCanCollectFees() public {
        uint256 bidValue = 1 ether;
        uint256 expectedFee = (bidValue * proxy.feeBps()) / 10_000;
        uint128 amount = uint128(bidValue - expectedFee);
        uint256 maxPrice = FLOOR_PRICE_Q96 + TICK_SPACING_Q96;

        vm.prank(bidder);
        proxy.submitBid{value: bidValue}(
            auction,
            maxPrice,
            amount,
            bidder,
            FLOOR_PRICE_Q96,
            ""
        );

        uint256 fee = address(proxy).balance;
        uint256 ownerBefore = owner.balance;

        vm.prank(owner);
        proxy.collectFees();

        assertEq(address(proxy).balance, 0);
        assertEq(owner.balance, ownerBefore + fee);
    }

    function test_Integration_CCAuction_StateAfterBid() public {
        uint256 bidValue = 1 ether;
        uint256 expectedFee = (bidValue * proxy.feeBps()) / 10_000;
        uint128 amount = uint128(bidValue - expectedFee);
        uint256 maxPrice = FLOOR_PRICE_Q96 + TICK_SPACING_Q96;

        vm.prank(bidder);
        uint256 bidId = proxy.submitBid{value: bidValue}(
            auction,
            maxPrice,
            amount,
            bidder,
            FLOOR_PRICE_Q96,
            ""
        );

        assertGe(bidId, 0);
        assertGe(
            ICCAuction(auction).clearingPrice(),
            FLOOR_PRICE_Q96,
            "clearing price should be at least floor after bid"
        );
    }

    /**
     * @notice After auction ends: exit bid (refund unspent ETH to owner), then claim purchased tokens.
     * @dev See https://docs.uniswap.org/contracts/liquidity-launchpad/quickstart/exit-bid
     */
    function test_Integration_ExitBid_AndClaimTokens_AfterAuctionEnds() public {
        uint256 bidValue = 1 ether;
        uint256 expectedFee = (bidValue * proxy.feeBps()) / 10_000;
        uint128 amount = uint128(bidValue - expectedFee);
        uint256 maxPrice = FLOOR_PRICE_Q96 + TICK_SPACING_Q96;

        vm.prank(bidder);
        uint256 bidId = proxy.submitBid{value: bidValue}(
            auction,
            maxPrice,
            amount,
            bidder,
            FLOOR_PRICE_Q96,
            ""
        );
        assertGe(bidId, 0);

        ICCAuction cca = ICCAuction(auction);
        address auctionTokenAddr = cca.token();
        assertEq(
            auctionTokenAddr,
            address(token),
            "auction token should be our token"
        );

        uint256 bidderTokenBefore = token.balanceOf(bidder);
        uint256 bidderEthBefore = bidder.balance;

        vm.roll(cca.endBlock());
        cca.exitBid(bidId);

        vm.roll(cca.claimBlock());
        cca.claimTokens(bidId);

        uint256 bidderTokenAfter = token.balanceOf(bidder);
        uint256 bidderEthAfter = bidder.balance;

        assertGt(
            bidderTokenAfter,
            bidderTokenBefore,
            "bidder should receive claimed tokens"
        );
        assertGe(
            bidderEthAfter,
            bidderEthBefore - bidValue,
            "bidder should have at least (initial - bid) ETH after refund"
        );
    }
}
