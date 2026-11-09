// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VDFIYearReserve
 * @notice Publicly auditable USDC reserve. Each primary-sale deposit is
 *         unavailable for >=365 days. There is NO early unlock or admin sweep.
 *
 * Days are grouped for affordable withdrawals. Every deposit is rounded
 * forward to the next UTC day and then locked for another 365 days.
 * The beneficiary receives it only after the corresponding timestamp.
 *
 * Important: only proceeds of the associated PRIMARY SALE are credited.
 * Secondary-market DEX trades do not flow into this contract.
 */
contract VDFIYearReserve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error UnauthorizedSale();
    error InvalidAddress();
    error InvalidDeposit();
    error ReserveUnderfunded();
    error NothingReleasable();
    error TooManyDays();
    error StillLocked(uint256 unlockAt);

    uint256 public constant MINIMUM_LOCK = 365 days;

    IERC20 public immutable paymentToken;
    address public immutable sale;
    address public immutable beneficiary;
    uint256 public lockedOutstanding;
    uint256 public totalCredited;
    uint256 public totalReleased;

    mapping(uint256 => uint256) public unlockableAt;

    event ReserveCredited(uint256 indexed unlockAt, uint256 amount);
    event ReserveReleased(address indexed beneficiary, uint256 amount);

    constructor(IERC20 paymentToken_, address sale_, address beneficiary_) {
        if (
            address(paymentToken_) == address(0) ||
            sale_ == address(0) ||
            beneficiary_ == address(0)
        ) revert InvalidAddress();
        paymentToken = paymentToken_;
        sale = sale_;
        beneficiary = beneficiary_;
    }

    /**
     * @dev The sale sends USDC into this contract BEFORE invoking credit.
     *      An underfunded accounting record cannot be created.
     */
    function credit(uint256 amount) external {
        if (msg.sender != sale) revert UnauthorizedSale();
        if (amount == 0) revert InvalidDeposit();

        uint256 unlockAt = ((block.timestamp / 1 days) + 366) * 1 days;
        lockedOutstanding += amount;
        totalCredited += amount;
        unlockableAt[unlockAt] += amount;

        if (paymentToken.balanceOf(address(this)) < lockedOutstanding) {
            revert ReserveUnderfunded();
        }
        emit ReserveCredited(unlockAt, amount);
    }

    /**
     * Anyone can release matured days, but the only payout recipient
     * is the immutable beneficiary. A duplicate day can never pay twice.
     */
    function release(uint256[] calldata unlockDays) external nonReentrant returns (uint256 released) {
        if (unlockDays.length == 0 || unlockDays.length > 90) revert TooManyDays();

        for (uint256 i = 0; i < unlockDays.length; ++i) {
            uint256 day = unlockDays[i];
            uint256 amount = unlockableAt[day];
            if (amount == 0) continue;
            if (block.timestamp < day) revert StillLocked(day);
            unlockableAt[day] = 0;
            released += amount;
        }
        if (released == 0) revert NothingReleasable();

        lockedOutstanding -= released;
        totalReleased += released;
        paymentToken.safeTransfer(beneficiary, released);
        emit ReserveReleased(beneficiary, released);
    }
}
