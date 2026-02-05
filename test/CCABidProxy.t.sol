// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "../lib/forge-std/src/Test.sol";
import {CCABidProxy} from "../contracts/CCABidProxy.sol";
import {MockCCA} from "../contracts/mock/MockCCA.sol";

contract CCABidProxyTest is Test {
    CCABidProxy proxy;
    MockCCA mockCca;

    address owner;
    address user;
    uint256 constant INITIAL_FEE_BPS = 20;

    /// @dev Build submitBid calldata for submitBidPayload (same as CCA submitBid selector + args)
    function _encodeSubmitBidPayload(
        uint256 maxPrice,
        uint128 amount,
        address bidOwner,
        uint256 prevTickPrice,
        bytes memory hookData
    ) internal pure returns (bytes memory) {
        return
            abi.encodeWithSignature(
                "submitBid(uint256,uint128,address,uint256,bytes)",
                maxPrice,
                amount,
                bidOwner,
                prevTickPrice,
                hookData
            );
    }

    function setUp() public {
        mockCca = new MockCCA();
        owner = address(0x1);
        user = address(0x2);
        proxy = new CCABidProxy(owner, INITIAL_FEE_BPS);
        vm.deal(user, 2_000_000 ether);
    }

    /* ---------- Fee logic ---------- */

    function test_FeeSetInConstructor() public view {
        assertEq(proxy.feeBps(), 20);
    }

    function test_SubmitBid_TakesCorrectFee_ExactDivision() public {
        uint256 value = 1_000_000 ether; // 1M ether
        uint256 expectedFee = (value * INITIAL_FEE_BPS) / 10_000; // 2000 ether = 0.2%
        uint256 expectedForward = value - expectedFee;

        vm.prank(user);
        proxy.submitBid{value: value}(address(mockCca), 1, 100, user, 0, "");

        assertEq(address(proxy).balance, expectedFee, "proxy should hold fee");
        assertEq(expectedFee, 2000 ether);
        assertEq(mockCca.lastValueReceived(), expectedForward);
        assertEq(mockCca.nextBidId(), 2);
    }

    function test_SubmitBid_TakesCorrectFee_SmallValue() public {
        uint256 value = 1000 wei;
        uint256 expectedFee = (value * INITIAL_FEE_BPS) / 10_000; // 1000 * 20 / 10000 = 2
        uint256 expectedForward = value - expectedFee;

        vm.prank(user);
        proxy.submitBid{value: value}(address(mockCca), 0, 1, user, 0, "0x");

        assertEq(address(proxy).balance, expectedFee);
        assertEq(expectedFee, 2);
        assertEq(mockCca.lastValueReceived(), expectedForward);
    }

    function test_SubmitBid_ZeroValue_ZeroFee() public {
        vm.prank(user);
        proxy.submitBid{value: 0}(address(mockCca), 0, 0, user, 0, "");

        assertEq(address(proxy).balance, 0);
        assertEq(mockCca.lastValueReceived(), 0);
    }

    function test_SubmitBid_FeeRoundsDown() public {
        uint256 value = 99 wei;
        uint256 fee = (value * INITIAL_FEE_BPS) / 10_000;
        assertEq(fee, 0);

        vm.prank(user);
        proxy.submitBid{value: value}(address(mockCca), 0, 0, user, 0, "");

        assertEq(address(proxy).balance, 0);
        assertEq(mockCca.lastValueReceived(), 99);
    }

    function test_SubmitBid_ForwardsCorrectParams() public {
        uint256 maxPrice = 12345;
        uint128 amount = 67890;
        uint256 prevTickPrice = 111;
        bytes memory hookData = hex"deadbeef";

        vm.prank(user);
        uint256 bidId = proxy.submitBid{value: 1 ether}(
            address(mockCca),
            maxPrice,
            amount,
            user,
            prevTickPrice,
            hookData
        );

        assertEq(mockCca.lastMaxPrice(), maxPrice);
        assertEq(mockCca.lastAmount(), amount);
        assertEq(mockCca.lastOwner(), user);
        assertEq(mockCca.lastPrevTickPrice(), prevTickPrice);
        assertEq(mockCca.lastHookData(), hookData);
        assertEq(bidId, 1);
    }

    /* ---------- submitBidPayload ---------- */

    function test_SubmitBidPayload_TakesCorrectFee() public {
        uint256 value = 1 ether;
        uint256 expectedFee = (value * INITIAL_FEE_BPS) / 10_000;
        uint256 expectedForward = value - expectedFee;
        bytes memory payload = _encodeSubmitBidPayload(0, 0, user, 0, "");

        vm.prank(user);
        proxy.submitBidPayload{value: value}(address(mockCca), payload);

        assertEq(address(proxy).balance, expectedFee);
        assertEq(mockCca.lastValueReceived(), expectedForward);
        assertEq(mockCca.nextBidId(), 2);
    }

    function test_SubmitBidPayload_ReturnsBidId() public {
        bytes memory payload = _encodeSubmitBidPayload(1, 100, user, 0, "");

        vm.prank(user);
        uint256 bidId = proxy.submitBidPayload{value: 1 ether}(
            address(mockCca),
            payload
        );

        assertEq(bidId, 1);
    }

    function test_SubmitBidPayload_ForwardsCorrectParams() public {
        uint256 maxPrice = 12345;
        uint128 amount = 67890;
        uint256 prevTickPrice = 111;
        bytes memory hookData = hex"deadbeef";
        bytes memory payload = _encodeSubmitBidPayload(
            maxPrice,
            amount,
            user,
            prevTickPrice,
            hookData
        );

        vm.prank(user);
        uint256 bidId = proxy.submitBidPayload{value: 1 ether}(
            address(mockCca),
            payload
        );

        assertEq(mockCca.lastMaxPrice(), maxPrice);
        assertEq(mockCca.lastAmount(), amount);
        assertEq(mockCca.lastOwner(), user);
        assertEq(mockCca.lastPrevTickPrice(), prevTickPrice);
        assertEq(mockCca.lastHookData(), hookData);
        assertEq(bidId, 1);
    }

    function test_SubmitBidPayload_RevertsWhenCCAReverts() public {
        mockCca.setShouldRevert(true);
        bytes memory payload = _encodeSubmitBidPayload(0, 0, user, 0, "");

        vm.prank(user);
        vm.expectRevert("MockCCA: reverted");
        proxy.submitBidPayload{value: 1 ether}(address(mockCca), payload);
    }

    function test_SubmitBidPayload_NoFeeRetainedWhenCCAReverts() public {
        mockCca.setShouldRevert(true);
        bytes memory payload = _encodeSubmitBidPayload(0, 0, user, 0, "");

        vm.prank(user);
        vm.expectRevert();
        proxy.submitBidPayload{value: 1 ether}(address(mockCca), payload);

        assertEq(address(proxy).balance, 0);
    }

    function test_SubmitBidPayload_ZeroValue_ZeroFee() public {
        bytes memory payload = _encodeSubmitBidPayload(0, 0, user, 0, "");

        vm.prank(user);
        proxy.submitBidPayload{value: 0}(address(mockCca), payload);

        assertEq(address(proxy).balance, 0);
        assertEq(mockCca.lastValueReceived(), 0);
    }

    function test_SubmitBid_MultipleBids_AccumulateFees() public {
        vm.startPrank(user);

        proxy.submitBid{value: 1 ether}(address(mockCca), 0, 0, user, 0, "");
        uint256 fee1 = (1 ether * 20) / 10_000;
        assertEq(address(proxy).balance, fee1);

        proxy.submitBid{value: 10 ether}(address(mockCca), 0, 0, user, 0, "");
        uint256 fee2 = (10 ether * 20) / 10_000;
        assertEq(address(proxy).balance, fee1 + fee2);

        vm.stopPrank();
    }

    function test_Constructor_SetsFeeBps() public {
        CCABidProxy proxy100 = new CCABidProxy(owner, 100); // 1%
        vm.deal(user, 10 ether);
        vm.prank(user);
        proxy100.submitBid{value: 1 ether}(address(mockCca), 0, 0, user, 0, "");
        uint256 expectedFee = (1 ether * 100) / 10_000;
        assertEq(address(proxy100).balance, expectedFee);
    }

    /* ---------- setFeeBps ---------- */

    function test_SetFeeBps_OnlyOwner() public {
        vm.prank(owner);
        proxy.setFeeBps(100);
        assertEq(proxy.feeBps(), 100);
    }

    function test_SetFeeBps_RevertsWhenNotOwner() public {
        vm.prank(user);
        vm.expectRevert(CCABidProxy.Unauthorized.selector);
        proxy.setFeeBps(50);
    }

    function test_SetFeeBps_ThenSubmitBid_UsesNewFee() public {
        vm.prank(owner);
        proxy.setFeeBps(100); // 1%

        vm.prank(user);
        proxy.submitBid{value: 1 ether}(address(mockCca), 0, 0, user, 0, "");

        uint256 expectedFee = (1 ether * 100) / 10_000; // 0.01 ether
        assertEq(address(proxy).balance, expectedFee);
        assertEq(mockCca.lastValueReceived(), 1 ether - expectedFee);
    }

    /* ---------- collectFees ---------- */

    function test_CollectFees_OnlyOwner() public {
        vm.prank(user);
        proxy.submitBid{value: 1 ether}(address(mockCca), 0, 0, user, 0, "");
        uint256 fee = address(proxy).balance;

        uint256 ownerBefore = owner.balance;
        vm.prank(owner);
        proxy.collectFees();
        assertEq(owner.balance, ownerBefore + fee);
        assertEq(address(proxy).balance, 0);
    }

    function test_CollectFees_RevertsWhenNotOwner() public {
        vm.prank(user);
        proxy.submitBid{value: 1 ether}(address(mockCca), 0, 0, user, 0, "");

        vm.prank(user);
        vm.expectRevert(CCABidProxy.Unauthorized.selector);
        proxy.collectFees();
    }

    function test_CollectFees_WhenZeroBalance_DoesNotRevert() public {
        vm.prank(owner);
        proxy.collectFees(); // no revert
        assertEq(owner.balance, 0);
    }

    function test_CollectFees_WithdrawsAllAccumulated() public {
        vm.startPrank(user);
        proxy.submitBid{value: 1 ether}(address(mockCca), 0, 0, user, 0, "");
        proxy.submitBid{value: 5 ether}(address(mockCca), 0, 0, user, 0, "");
        vm.stopPrank();

        uint256 totalFee = address(proxy).balance;
        uint256 ownerBefore = owner.balance;

        vm.prank(owner);
        proxy.collectFees();

        assertEq(owner.balance, ownerBefore + totalFee);
        assertEq(address(proxy).balance, 0);
    }

    /* ---------- Mock CCA failure ---------- */

    function test_SubmitBid_RevertsWhenCCAReverts() public {
        mockCca.setShouldRevert(true);

        vm.prank(user);
        vm.expectRevert("MockCCA: reverted");
        proxy.submitBid{value: 1 ether}(address(mockCca), 0, 0, user, 0, "");
    }

    function test_SubmitBid_NoFeeRetainedWhenCCAReverts() public {
        mockCca.setShouldRevert(true);

        vm.prank(user);
        vm.expectRevert();
        proxy.submitBid{value: 1 ether}(address(mockCca), 0, 0, user, 0, "");

        assertEq(address(proxy).balance, 0);
    }

    /* ---------- Constructor ---------- */

    function test_Constructor_RevertsZeroOwner() public {
        vm.expectRevert(CCABidProxy.ZeroAddress.selector);
        new CCABidProxy(address(0), 20);
    }
}
