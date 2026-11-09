// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VDFIYearReserve} from "./VDFIYearReserve.sol";

/**
 * @title VDFIPrimarySale
 * @notice Optional PRIMARY distribution of existing fixed-supply VDFI tokens.
 *         Purchases are paid in Circle-native USDC on Polygon PoS.
 *
 *         EVERY purchase:
 *           50% of USDC -> disclosed founder/operating treasury immediately.
 *           50% of USDC -> VDFIYearReserve for at least 365 days.
 *
 *         Price follows an immutable, transparent arithmetic sale curve;
 *         this is NOT a secondary-market quotation and cannot promise profit.
 *         DEX swaps are separate, and their proceeds do not enter this sale.
 *
 *         Founder cannot change the price, drain VDFI inventory, or unlock
 *         the reserve. There are no hidden taxes or transfer fees.
 */
contract VDFIPrimarySale is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidConfiguration();
    error NoAvailableInventory();
    error ZeroPurchase();
    error SoldOut();
    error QuoteExpired();
    error SlippageExceeded(uint256 quoted, uint256 maximum);
    error ExactHalfRequired();
    error InsufficientPayment();

    uint256 private constant UNIT = 1e18;
    uint256 private constant HALF = 2;

    IERC20 public immutable vdfi;
    IERC20 public immutable usdc;
    address public immutable founderTreasury;
    VDFIYearReserve public immutable reserve;

    uint256 public immutable initialPriceMicroUSDC;
    uint256 public immutable increasePerUnitMicroUSDC;
    uint256 public immutable saleCapWholeTokens;

    uint256 public soldWholeTokens;
    uint256 public totalRaisedMicroUSDC;

    event VDFIPurchased(
        address indexed buyer,
        uint256 quantityWholeTokens,
        uint256 priceMicroUSDC,
        uint256 paidToTreasuryMicroUSDC,
        uint256 lockedForYearMicroUSDC
    );

    /**
     * @param vdfi_ Fixed-supply VanDeFi ERC20 already deployed.
     * @param usdc_ Circle-native USDC (6 decimals) for the deployment chain.
     * @param founderTreasury_ Address receiving the freely available half.
     * @param reserveBeneficiary_ Address eligible for the locked half
     *        ONLY after its one-year release time (can be a public treasury).
     * @param initialPriceMicroUSDC_ Initial price per whole VDFI in 6-decimal USDC.
     * @param increasePerUnitMicroUSDC_ Price increment per whole VDFI sold.
     * @param saleCapWholeTokens_ Maximum whole VDFI sold by this contract.
     *
     * The constructor creates the immutable 365-day reserve. Tokens must be
     * transferred into this sale contract by the treasury before sales begin.
     */
    constructor(
        IERC20 vdfi_,
        IERC20Metadata usdc_,
        address founderTreasury_,
        address reserveBeneficiary_,
        uint256 initialPriceMicroUSDC_,
        uint256 increasePerUnitMicroUSDC_,
        uint256 saleCapWholeTokens_
    ) {
        if (
            address(vdfi_) == address(0) ||
            address(usdc_) == address(0) ||
            address(vdfi_) == address(usdc_) ||
            address(vdfi_).code.length == 0 ||
            address(usdc_).code.length == 0 ||
            founderTreasury_ == address(0) ||
            reserveBeneficiary_ == address(0) ||
            saleCapWholeTokens_ == 0 ||
            initialPriceMicroUSDC_ == 0 ||
            increasePerUnitMicroUSDC_ == 0 ||
            initialPriceMicroUSDC_ % HALF != 0 ||
            increasePerUnitMicroUSDC_ % HALF != 0 ||
            usdc_.decimals() != 6
        ) revert InvalidConfiguration();

        vdfi = vdfi_;
        usdc = usdc_;
        founderTreasury = founderTreasury_;
        initialPriceMicroUSDC = initialPriceMicroUSDC_;
        increasePerUnitMicroUSDC = increasePerUnitMicroUSDC_;
        saleCapWholeTokens = saleCapWholeTokens_;
        reserve = new VDFIYearReserve(usdc_, address(this), reserveBeneficiary_);
    }

    function currentPrimaryPriceMicroUSDC() external view returns (uint256) {
        return initialPriceMicroUSDC + soldWholeTokens * increasePerUnitMicroUSDC;
    }

    function inventoryWholeTokens() external view returns (uint256) {
        uint256 inventory = vdfi.balanceOf(address(this)) / UNIT;
        uint256 capRemaining = saleCapWholeTokens - soldWholeTokens;
        return inventory < capRemaining ? inventory : capRemaining;
    }

    /**
     * Arithmetic curve for WHOLE VDFI:
     *   total = quantity * initialPrice
     *         + increase * (quantity * sold + quantity*(quantity-1)/2)
     * Even micro-USDC prices guarantee mathematically exact 50/50 splits.
     */
    function quoteWholeTokens(uint256 quantity) public view returns (uint256) {
        if (quantity == 0) revert ZeroPurchase();
        if (quantity > saleCapWholeTokens - soldWholeTokens) revert SoldOut();
        uint256 n = soldWholeTokens;
        uint256 steps = quantity * n + quantity * (quantity - 1) / 2;
        return quantity * initialPriceMicroUSDC + steps * increasePerUnitMicroUSDC;
    }

    /**
     * @dev VDFI is transferred to the buyer. The buyer must have approved
     *      this sale to spend the quoted USDC amount. No private keys are
     *      requested and no token is minted here.
     */
    function buyWholeTokens(
        uint256 quantity,
        uint256 maximumUSDCMicro,
        uint256 deadline
    ) external nonReentrant returns (uint256 cost) {
        if (block.timestamp > deadline) revert QuoteExpired();
        cost = quoteWholeTokens(quantity);
        if (cost > maximumUSDCMicro) revert SlippageExceeded(cost, maximumUSDCMicro);

        uint256 tokenUnits = quantity * UNIT;
        if (vdfi.balanceOf(address(this)) < tokenUnits) revert NoAvailableInventory();

        // Effects are reverted atomically if any ERC20 transfer fails.
        soldWholeTokens += quantity;
        totalRaisedMicroUSDC += cost;

        uint256 beforeUSDC = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), cost);
        if (usdc.balanceOf(address(this)) - beforeUSDC != cost) revert InsufficientPayment();

        uint256 half = cost / HALF;
        // Do not permit imprecise 50/50 split even at USDC's 6-decimal floor.
        if (half * HALF != cost) revert ExactHalfRequired();
        usdc.safeTransfer(founderTreasury, half);
        usdc.safeTransfer(address(reserve), half);
        reserve.credit(half);

        vdfi.safeTransfer(msg.sender, tokenUnits);
        emit VDFIPurchased(msg.sender, quantity, cost, half, half);
    }
}
