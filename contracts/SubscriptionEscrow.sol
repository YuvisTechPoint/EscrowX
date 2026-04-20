// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SubscriptionEscrow
 * @notice A recurring escrow that automatically releases ETH at set intervals.
 *         Buyer funds a vault upfront; contract auto-releases to seller each cycle.
 *         Perfect for freelancers, SaaS subscriptions, and retainer agreements.
 *         Anyone can trigger releases (permissionless for Gelato/Keeper automation).
 */
contract SubscriptionEscrow {
    enum SubscriptionStatus {
        ACTIVE,
        CANCELLED,
        COMPLETED
    }

    struct Subscription {
        uint256 id;
        address buyer;
        address seller;
        uint256 amountPerCycle;
        uint256 totalCycles;
        uint256 cyclesCompleted;
        uint256 nextReleaseAt;
        uint256 intervalSeconds;
        uint256 vaultBalance;
        SubscriptionStatus status;
        string description;
        uint256 createdAt;
    }

    uint256 public subscriptionCount;
    mapping(uint256 => Subscription) public subscriptions;
    
    // Efficient lookup
    mapping(address => uint256[]) public buyerSubscriptions;
    mapping(address => uint256[]) public sellerSubscriptions;

    // Minimum values
    uint256 public constant MIN_CYCLE_AMOUNT = 0.001 ether;
    uint256 public constant MAX_CYCLES = 100;
    uint256 public constant MIN_INTERVAL = 1 days;
    uint256 public constant MAX_INTERVAL = 365 days;

    event SubscriptionCreated(
        uint256 indexed subscriptionId,
        address indexed buyer,
        address indexed seller,
        uint256 amountPerCycle,
        uint256 totalCycles,
        uint256 intervalSeconds,
        uint256 nextReleaseAt,
        string description
    );

    event CycleReleased(
        uint256 indexed subscriptionId,
        uint256 indexed cycleNumber,
        uint256 amount,
        uint256 releasedAt,
        address triggeredBy
    );

    event SubscriptionCancelled(
        uint256 indexed subscriptionId,
        uint256 refundAmount,
        uint256 cancelledAt
    );

    event SubscriptionToppedUp(
        uint256 indexed subscriptionId,
        uint256 addedCycles,
        uint256 newTotalCycles,
        uint256 newVaultBalance
    );

    event SubscriptionCompleted(
        uint256 indexed subscriptionId,
        uint256 totalReleased,
        uint256 completedAt
    );

    modifier subscriptionExists(uint256 _subId) {
        require(subscriptions[_subId].id != 0, "Subscription does not exist");
        _;
    }

    modifier onlyBuyer(uint256 _subId) {
        require(msg.sender == subscriptions[_subId].buyer, "Only buyer can call");
        _;
    }

    modifier onlyActive(uint256 _subId) {
        require(subscriptions[_subId].status == SubscriptionStatus.ACTIVE, "Subscription not active");
        _;
    }

    /**
     * @notice Create a new subscription escrow
     * @param _seller Address to receive payments
     * @param _cycles Number of payment cycles to fund upfront
     * @param _intervalSeconds Seconds between each cycle (e.g., 604800 = 1 week)
     * @param _description Purpose of the subscription
     */
    function createSubscription(
        address _seller,
        uint256 _cycles,
        uint256 _intervalSeconds,
        string memory _description
    ) external payable {
        require(_seller != address(0), "Seller cannot be zero address");
        require(_seller != msg.sender, "Cannot subscribe to yourself");
        require(_cycles > 0 && _cycles <= MAX_CYCLES, "Cycles must be 1-100");
        require(_intervalSeconds >= MIN_INTERVAL && _intervalSeconds <= MAX_INTERVAL, 
                "Interval must be 1 day to 1 year");
        require(msg.value > 0, "Must send ETH");
        require(msg.value >= MIN_CYCLE_AMOUNT * _cycles, "Amount too small for cycles");
        require(msg.value % _cycles == 0, "Amount must be divisible by cycles");

        uint256 amountPerCycle = msg.value / _cycles;
        require(amountPerCycle >= MIN_CYCLE_AMOUNT, "Amount per cycle too small");

        subscriptionCount++;
        uint256 nextRelease = block.timestamp + _intervalSeconds;

        subscriptions[subscriptionCount] = Subscription({
            id: subscriptionCount,
            buyer: msg.sender,
            seller: _seller,
            amountPerCycle: amountPerCycle,
            totalCycles: _cycles,
            cyclesCompleted: 0,
            nextReleaseAt: nextRelease,
            intervalSeconds: _intervalSeconds,
            vaultBalance: msg.value,
            status: SubscriptionStatus.ACTIVE,
            description: _description,
            createdAt: block.timestamp
        });

        buyerSubscriptions[msg.sender].push(subscriptionCount);
        sellerSubscriptions[_seller].push(subscriptionCount);

        emit SubscriptionCreated(
            subscriptionCount,
            msg.sender,
            _seller,
            amountPerCycle,
            _cycles,
            _intervalSeconds,
            nextRelease,
            _description
        );
    }

    /**
     * @notice Trigger a release for the next cycle
     * @dev Anyone can call (permissionless for automation bots)
     * @param _subId ID of the subscription
     */
    function triggerRelease(uint256 _subId) external subscriptionExists(_subId) onlyActive(_subId) {
        Subscription storage sub = subscriptions[_subId];
        
        require(block.timestamp >= sub.nextReleaseAt, "Not time for release yet");
        require(sub.cyclesCompleted < sub.totalCycles, "All cycles completed");
        require(sub.vaultBalance >= sub.amountPerCycle, "Insufficient vault balance");

        // Update state before transfer (reentrancy protection)
        sub.cyclesCompleted++;
        sub.vaultBalance -= sub.amountPerCycle;
        
        if (sub.cyclesCompleted < sub.totalCycles) {
            sub.nextReleaseAt = block.timestamp + sub.intervalSeconds;
        } else {
            // All cycles complete
            sub.status = SubscriptionStatus.COMPLETED;
        }

        // Transfer to seller
        (bool success, ) = payable(sub.seller).call{value: sub.amountPerCycle}("");
        require(success, "ETH transfer to seller failed");

        emit CycleReleased(_subId, sub.cyclesCompleted, sub.amountPerCycle, block.timestamp, msg.sender);

        // If just completed
        if (sub.status == SubscriptionStatus.COMPLETED) {
            emit SubscriptionCompleted(_subId, sub.amountPerCycle * sub.totalCycles, block.timestamp);
            
            // Refund any remaining balance (shouldn't happen but safety)
            if (sub.vaultBalance > 0) {
                uint256 refund = sub.vaultBalance;
                sub.vaultBalance = 0;
                (bool refundSuccess, ) = payable(sub.buyer).call{value: refund}("");
                require(refundSuccess, "Refund failed");
            }
        }
    }

    /**
     * @notice Cancel subscription and refund remaining vault balance
     * @param _subId ID of the subscription
     */
    function cancelSubscription(uint256 _subId) external subscriptionExists(_subId) onlyBuyer(_subId) onlyActive(_subId) {
        Subscription storage sub = subscriptions[_subId];
        
        uint256 refundAmount = sub.vaultBalance;
        sub.vaultBalance = 0;
        sub.status = SubscriptionStatus.CANCELLED;

        (bool success, ) = payable(sub.buyer).call{value: refundAmount}("");
        require(success, "ETH refund failed");

        emit SubscriptionCancelled(_subId, refundAmount, block.timestamp);
    }

    /**
     * @notice Top up subscription with more cycles
     * @param _subId ID of the subscription
     */
    function topUpSubscription(uint256 _subId) external payable subscriptionExists(_subId) onlyBuyer(_subId) onlyActive(_subId) {
        Subscription storage sub = subscriptions[_subId];
        
        require(msg.value > 0, "Must send ETH");
        require(msg.value % sub.amountPerCycle == 0, "Amount must be multiple of cycle amount");
        
        uint256 addedCycles = msg.value / sub.amountPerCycle;
        require(sub.totalCycles + addedCycles <= MAX_CYCLES, "Would exceed max cycles");

        sub.totalCycles += addedCycles;
        sub.vaultBalance += msg.value;

        emit SubscriptionToppedUp(_subId, addedCycles, sub.totalCycles, sub.vaultBalance);
    }

    /**
     * @notice Get subscription details
     */
    function getSubscription(uint256 _subId) external view returns (Subscription memory) {
        Subscription memory sub = subscriptions[_subId];
        require(sub.id != 0, "Subscription does not exist");
        return sub;
    }

    /**
     * @notice Get all subscriptions for a buyer
     */
    function getBuyerSubscriptions(address _buyer) external view returns (uint256[] memory) {
        return buyerSubscriptions[_buyer];
    }

    /**
     * @notice Get all subscriptions where address is seller
     */
    function getSellerSubscriptions(address _seller) external view returns (uint256[] memory) {
        return sellerSubscriptions[_seller];
    }

    /**
     * @notice Get active subscriptions for a user (as buyer)
     */
    function getActiveSubscriptions(address _buyer) external view returns (uint256[] memory) {
        uint256[] memory allSubs = buyerSubscriptions[_buyer];
        
        // Count active
        uint256 activeCount = 0;
        for (uint256 i = 0; i < allSubs.length; i++) {
            if (subscriptions[allSubs[i]].status == SubscriptionStatus.ACTIVE) {
                activeCount++;
            }
        }
        
        // Populate
        uint256[] memory active = new uint256[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < allSubs.length; i++) {
            if (subscriptions[allSubs[i]].status == SubscriptionStatus.ACTIVE) {
                active[index] = allSubs[i];
                index++;
            }
        }
        
        return active;
    }

    /**
     * @notice Check if a subscription is ready for release
     */
    function isReleaseReady(uint256 _subId) external view subscriptionExists(_subId) returns (bool) {
        Subscription memory sub = subscriptions[_subId];
        return sub.status == SubscriptionStatus.ACTIVE && 
               block.timestamp >= sub.nextReleaseAt && 
               sub.cyclesCompleted < sub.totalCycles;
    }

    /**
     * @notice Get time remaining until next release
     */
    function getTimeUntilNextRelease(uint256 _subId) external view subscriptionExists(_subId) returns (uint256) {
        Subscription memory sub = subscriptions[_subId];
        if (sub.status != SubscriptionStatus.ACTIVE || block.timestamp >= sub.nextReleaseAt) {
            return 0;
        }
        return sub.nextReleaseAt - block.timestamp;
    }

    /**
     * @notice Get progress percentage (0-10000 for 0-100%)
     */
    function getProgressBps(uint256 _subId) external view subscriptionExists(_subId) returns (uint256) {
        Subscription memory sub = subscriptions[_subId];
        if (sub.totalCycles == 0) return 0;
        return (sub.cyclesCompleted * 10000) / sub.totalCycles;
    }

    /**
     * @notice Get paginated list of all subscriptions
     */
    function getSubscriptionsPaginated(uint256 _start, uint256 _count) external view returns (Subscription[] memory) {
        require(_start >= 1 && _start <= subscriptionCount, "Invalid start");
        require(_count > 0 && _count <= 100, "Count must be 1-100");
        
        uint256 end = _start + _count - 1;
        if (end > subscriptionCount) {
            end = subscriptionCount;
        }
        
        uint256 resultCount = end - _start + 1;
        Subscription[] memory result = new Subscription[](resultCount);
        
        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = subscriptions[_start + i];
        }
        
        return result;
    }

    /**
     * @notice Get subscriptions ready for automation (next release within window)
     */
    function getReleasableSubscriptions(uint256 _withinSeconds) external view returns (uint256[] memory) {
        uint256 cutoff = block.timestamp + _withinSeconds;
        
        // Count first
        uint256 count = 0;
        for (uint256 i = 1; i <= subscriptionCount; i++) {
            if (subscriptions[i].status == SubscriptionStatus.ACTIVE &&
                subscriptions[i].nextReleaseAt <= cutoff &&
                subscriptions[i].cyclesCompleted < subscriptions[i].totalCycles) {
                count++;
            }
        }
        
        // Populate
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= subscriptionCount; i++) {
            if (subscriptions[i].status == SubscriptionStatus.ACTIVE &&
                subscriptions[i].nextReleaseAt <= cutoff &&
                subscriptions[i].cyclesCompleted < subscriptions[i].totalCycles) {
                result[index] = i;
                index++;
            }
        }
        
        return result;
    }
}
