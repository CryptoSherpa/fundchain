// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Crowdfund is ReentrancyGuard {
    enum Currency { ETH, USDC }

    uint256 public constant PLATFORM_FEE_BPS = 500;      // 5%
    uint256 public constant CLAIM_THRESHOLD_BPS = 8000;  // 80%
    uint256 public constant MAX_DURATION = 365 days;
    uint256 public constant CLAIM_WINDOW = 7 days;

    // Goal bounds are currency-aware since ETH (18 dp) and USDC (6 dp) are wildly
    // different scales. Raw base units.
    uint256 public constant MIN_GOAL_ETH  = 0.001 ether;
    uint256 public constant MAX_GOAL_ETH  = 10_000 ether;
    uint256 public constant MIN_GOAL_USDC = 1e6;          // 1 USDC
    uint256 public constant MAX_GOAL_USDC = 10_000_000e6; // 10M USDC

    address public immutable owner;
    IERC20 public immutable USDC_TOKEN;

    struct Campaign {
        address payable creator;
        string title;
        string description;
        string category;
        string imageUrl;
        uint256 goal;
        uint256 deadline;
        uint256 amountRaised;
        bool claimed;
        bool refundsProcessed;
        bool exists;
        Currency currency;
    }

    uint256 public campaignCount;
    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => address[]) private _donors;

    event CampaignCreated(
        uint256 indexed id,
        address indexed creator,
        string title,
        string category,
        uint256 goal,
        uint256 deadline,
        Currency currency
    );
    event DonationReceived(uint256 indexed id, address indexed donor, uint256 amount);
    event FundsClaimed(uint256 indexed id, uint256 creatorAmount, uint256 feeAmount);
    event RefundIssued(uint256 indexed id, address indexed donor, uint256 amount);
    event RefundsProcessed(uint256 indexed id, uint256 successCount, uint256 skippedCount);
    event RefundSkipped(uint256 indexed id, address indexed donor, uint256 amount);

    error CampaignNotFound();
    error DeadlineMustBeFuture();
    error DeadlineTooFar();
    error GoalBelowMin();
    error GoalAboveMax();
    error CampaignEnded();
    error CampaignNotEnded();
    error CampaignAlreadyClaimed();
    error ClaimThresholdNotMet();
    error ClaimThresholdMet();
    error ClaimWindowNotOpen();
    error AlreadyClaimed();
    error AlreadyProcessed();
    error NothingToRefund();
    error NotCreator();
    error TransferFailed();
    error ZeroDonation();
    error AmountMustBeZeroForETH();
    error MsgValueMustBeZeroForUSDC();

    constructor(address usdcToken, address _owner) {
        owner = _owner == address(0) ? msg.sender : _owner;
        USDC_TOKEN = IERC20(usdcToken);
    }

    function createCampaign(
        string calldata title,
        string calldata description,
        string calldata category,
        string calldata imageUrl,
        uint256 goal,
        uint256 deadline,
        Currency currency
    ) external returns (uint256) {
        _validateGoal(goal, currency);
        if (deadline <= block.timestamp) revert DeadlineMustBeFuture();
        if (deadline > block.timestamp + MAX_DURATION) revert DeadlineTooFar();

        uint256 id = campaignCount++;
        campaigns[id] = Campaign({
            creator: payable(msg.sender),
            title: title,
            description: description,
            category: category,
            imageUrl: imageUrl,
            goal: goal,
            deadline: deadline,
            amountRaised: 0,
            claimed: false,
            refundsProcessed: false,
            exists: true,
            currency: currency
        });

        emit CampaignCreated(id, msg.sender, title, category, goal, deadline, currency);
        return id;
    }

    function _validateGoal(uint256 goal, Currency currency) internal pure {
        if (currency == Currency.ETH) {
            if (goal < MIN_GOAL_ETH) revert GoalBelowMin();
            if (goal > MAX_GOAL_ETH) revert GoalAboveMax();
        } else {
            if (goal < MIN_GOAL_USDC) revert GoalBelowMin();
            if (goal > MAX_GOAL_USDC) revert GoalAboveMax();
        }
    }

    /// @notice Donate to a campaign. For ETH campaigns, pass `amount = 0` and
    ///         the donation is `msg.value`. For USDC campaigns, pass
    ///         `msg.value = 0` and the donation is `amount` (must be
    ///         pre-approved: `USDC_TOKEN.approve(crowdfund, amount)`).
    function donate(uint256 id, uint256 amount) external payable nonReentrant {
        Campaign storage c = _requireCampaign(id);
        if (block.timestamp >= c.deadline) revert CampaignEnded();
        if (c.claimed) revert CampaignAlreadyClaimed();

        uint256 value;
        if (c.currency == Currency.ETH) {
            if (amount != 0) revert AmountMustBeZeroForETH();
            if (msg.value == 0) revert ZeroDonation();
            value = msg.value;
        } else {
            if (msg.value != 0) revert MsgValueMustBeZeroForUSDC();
            if (amount == 0) revert ZeroDonation();
            value = amount;
        }

        // Effects BEFORE any external interaction — strict CEI. If the USDC
        // transferFrom below reverts, the whole tx (including these updates)
        // reverts, so zeroing-then-restoring is not required.
        if (contributions[id][msg.sender] == 0) {
            _donors[id].push(msg.sender);
        }
        c.amountRaised += value;
        contributions[id][msg.sender] += value;

        // Interaction last (USDC only).
        if (c.currency == Currency.USDC) {
            bool ok = USDC_TOKEN.transferFrom(msg.sender, address(this), amount);
            if (!ok) revert TransferFailed();
        }

        emit DonationReceived(id, msg.sender, value);
    }

    function claimFunds(uint256 id) external nonReentrant {
        Campaign storage c = _requireCampaign(id);
        if (msg.sender != c.creator) revert NotCreator();
        if (c.amountRaised * 10_000 < c.goal * CLAIM_THRESHOLD_BPS) revert ClaimThresholdNotMet();
        if (block.timestamp < c.deadline - CLAIM_WINDOW) revert ClaimWindowNotOpen();
        if (c.claimed) revert AlreadyClaimed();

        c.claimed = true;

        uint256 fee = (c.amountRaised * PLATFORM_FEE_BPS) / 10_000;
        uint256 creatorAmount = c.amountRaised - fee;

        if (c.currency == Currency.ETH) {
            (bool s1, ) = c.creator.call{value: creatorAmount}("");
            if (!s1) revert TransferFailed();
            (bool s2, ) = payable(owner).call{value: fee}("");
            if (!s2) revert TransferFailed();
        } else {
            bool s1 = USDC_TOKEN.transfer(c.creator, creatorAmount);
            if (!s1) revert TransferFailed();
            bool s2 = USDC_TOKEN.transfer(owner, fee);
            if (!s2) revert TransferFailed();
        }

        emit FundsClaimed(id, creatorAmount, fee);
    }

    function processRefunds(uint256 id) external nonReentrant {
        Campaign storage c = _requireCampaign(id);
        if (block.timestamp < c.deadline) revert CampaignNotEnded();
        if (c.amountRaised * 10_000 >= c.goal * CLAIM_THRESHOLD_BPS) revert ClaimThresholdMet();
        if (c.refundsProcessed) revert AlreadyProcessed();

        c.refundsProcessed = true;

        address[] storage donorList = _donors[id];
        uint256 count = donorList.length;
        uint256 successCount;
        uint256 skippedCount;
        for (uint256 i = 0; i < count; i++) {
            address donor = donorList[i];
            uint256 amount = contributions[id][donor];
            if (amount == 0) continue;
            contributions[id][donor] = 0;
            bool ok;
            if (c.currency == Currency.ETH) {
                (ok, ) = payable(donor).call{value: amount}("");
            } else {
                // Catch any revert from a malicious ERC-20-like donor contract
                // so one bad actor can't brick the batch.
                try USDC_TOKEN.transfer(donor, amount) returns (bool r) { ok = r; }
                catch { ok = false; }
            }
            if (!ok) {
                contributions[id][donor] = amount;
                skippedCount++;
                emit RefundSkipped(id, donor, amount);
                continue;
            }
            successCount++;
            emit RefundIssued(id, donor, amount);
        }

        emit RefundsProcessed(id, successCount, skippedCount);
    }

    function refund(uint256 id) external nonReentrant {
        Campaign storage c = _requireCampaign(id);
        if (block.timestamp < c.deadline) revert CampaignNotEnded();
        if (c.amountRaised * 10_000 >= c.goal * CLAIM_THRESHOLD_BPS) revert ClaimThresholdMet();

        uint256 amount = contributions[id][msg.sender];
        if (amount == 0) revert NothingToRefund();

        contributions[id][msg.sender] = 0;

        if (c.currency == Currency.ETH) {
            (bool sent, ) = payable(msg.sender).call{value: amount}("");
            if (!sent) revert TransferFailed();
        } else {
            bool sent = USDC_TOKEN.transfer(msg.sender, amount);
            if (!sent) revert TransferFailed();
        }

        emit RefundIssued(id, msg.sender, amount);
    }

    function getClaimThreshold() external pure returns (uint256) {
        return 80;
    }

    function getCampaignCurrency(uint256 id) external view returns (Currency) {
        return _requireCampaign(id).currency;
    }

    function getCampaign(uint256 id)
        external
        view
        returns (
            address creator,
            string memory title,
            string memory description,
            string memory category,
            string memory imageUrl,
            uint256 goal,
            uint256 deadline,
            uint256 amountRaised,
            bool claimed,
            bool refundsProcessed,
            uint256 donorCount,
            Currency currency
        )
    {
        Campaign storage c = _requireCampaign(id);
        return (
            c.creator,
            c.title,
            c.description,
            c.category,
            c.imageUrl,
            c.goal,
            c.deadline,
            c.amountRaised,
            c.claimed,
            c.refundsProcessed,
            _donors[id].length,
            c.currency
        );
    }

    function getContribution(uint256 id, address donor) external view returns (uint256) {
        return contributions[id][donor];
    }

    function _requireCampaign(uint256 id) internal view returns (Campaign storage) {
        if (!campaigns[id].exists) revert CampaignNotFound();
        return campaigns[id];
    }
}
