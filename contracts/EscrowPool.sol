// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title EscrowPool
 * @notice A crowdfunding escrow where multiple buyers can pool ETH together
 *         to fund a single seller. Weighted voting determines release/refund.
 *         Perfect for DAO purchases, community crowdfunding, and group deals.
 */
contract EscrowPool {
    enum PoolStatus {
        FUNDING,
        FUNDED,
        COMPLETED,
        REFUNDED
    }

    struct PoolEscrow {
        uint256 id;
        address seller;
        uint256 targetAmount;
        uint256 currentAmount;
        uint256 fundingDeadline;
        string description;
        PoolStatus status;
        uint256 releaseVotesWeight;
        uint256 refundVotesWeight;
        uint256 voterCount;
        address creator;
        uint256 createdAt;
    }

    uint256 public poolCount;
    mapping(uint256 => PoolEscrow) public pools;
    
    // Contribution tracking
    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => mapping(address => bool)) public hasVotedRelease;
    mapping(uint256 => mapping(address => bool)) public hasVotedRefund;
    
    // Efficient lookup
    mapping(address => uint256[]) public contributorPools;
    mapping(address => uint256[]) public sellerPools;

    uint256 public constant MIN_CONTRIBUTION = 0.001 ether;
    uint256 public constant RELEASE_THRESHOLD_BPS = 5000; // 50% by weight
    uint256 public constant REFUND_THRESHOLD_BPS = 5000; // 50% by weight

    event PoolEscrowCreated(
        uint256 indexed poolId,
        address indexed seller,
        address indexed creator,
        uint256 targetAmount,
        uint256 fundingDeadline,
        string description
    );

    event ContributionMade(
        uint256 indexed poolId,
        address indexed contributor,
        uint256 amount,
        uint256 newTotal
    );

    event ContributionWithdrawn(
        uint256 indexed poolId,
        address indexed contributor,
        uint256 amount
    );

    event PoolFunded(
        uint256 indexed poolId,
        uint256 totalAmount,
        uint256 fundedAt
    );

    event VoteCast(
        uint256 indexed poolId,
        address indexed voter,
        bool isReleaseVote,
        uint256 weight
    );

    event PoolReleased(
        uint256 indexed poolId,
        uint256 totalAmount,
        uint256 releasedAt
    );

    event PoolRefunded(
        uint256 indexed poolId,
        uint256 totalRefunded,
        uint256 refundedAt
    );

    modifier poolExists(uint256 _poolId) {
        require(pools[_poolId].id != 0, "Pool does not exist");
        _;
    }

    modifier onlyContributor(uint256 _poolId) {
        require(contributions[_poolId][msg.sender] > 0, "Not a contributor");
        _;
    }

    modifier onlyWhenFunding(uint256 _poolId) {
        require(pools[_poolId].status == PoolStatus.FUNDING, "Pool not in funding phase");
        _;
    }

    modifier onlyWhenFunded(uint256 _poolId) {
        require(pools[_poolId].status == PoolStatus.FUNDED, "Pool not funded");
        _;
    }

    /**
     * @notice Create a new pool escrow for group funding
     * @param _seller Address that will receive funds when pool is released
     * @param _targetAmount Total ETH needed to fully fund the pool
     * @param _fundingDeadlineDays Days until funding deadline
     * @param _description Purpose of the pool
     */
    function createPoolEscrow(
        address _seller,
        uint256 _targetAmount,
        uint256 _fundingDeadlineDays,
        string memory _description
    ) external {
        require(_seller != address(0), "Seller cannot be zero address");
        require(_seller != msg.sender, "Cannot create pool for yourself");
        require(_targetAmount >= MIN_CONTRIBUTION * 10, "Target too small");
        require(_fundingDeadlineDays >= 1 && _fundingDeadlineDays <= 90, "Deadline must be 1-90 days");

        poolCount++;
        uint256 deadline = block.timestamp + (_fundingDeadlineDays * 1 days);

        pools[poolCount] = PoolEscrow({
            id: poolCount,
            seller: _seller,
            targetAmount: _targetAmount,
            currentAmount: 0,
            fundingDeadline: deadline,
            description: _description,
            status: PoolStatus.FUNDING,
            releaseVotesWeight: 0,
            refundVotesWeight: 0,
            voterCount: 0,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        sellerPools[_seller].push(poolCount);

        emit PoolEscrowCreated(
            poolCount,
            _seller,
            msg.sender,
            _targetAmount,
            deadline,
            _description
        );
    }

    /**
     * @notice Contribute ETH to a pool escrow
     * @param _poolId ID of the pool to contribute to
     */
    function contribute(uint256 _poolId) external payable poolExists(_poolId) onlyWhenFunding(_poolId) {
        PoolEscrow storage pool = pools[_poolId];
        
        require(block.timestamp < pool.fundingDeadline, "Funding period ended");
        require(msg.value >= MIN_CONTRIBUTION, "Contribution too small");
        require(pool.currentAmount + msg.value <= pool.targetAmount * 120 / 100, "Would exceed 120% of target");

        bool isNewContributor = contributions[_poolId][msg.sender] == 0;
        contributions[_poolId][msg.sender] += msg.value;
        pool.currentAmount += msg.value;

        if (isNewContributor) {
            contributorPools[msg.sender].push(_poolId);
            pool.voterCount++;
        }

        emit ContributionMade(_poolId, msg.sender, msg.value, pool.currentAmount);

        // Check if funded
        if (pool.currentAmount >= pool.targetAmount) {
            pool.status = PoolStatus.FUNDED;
            emit PoolFunded(_poolId, pool.currentAmount, block.timestamp);
        }
    }

    /**
     * @notice Withdraw contribution if pool not yet funded and deadline passed
     * @param _poolId ID of the pool
     */
    function withdrawContribution(uint256 _poolId) external poolExists(_poolId) {
        PoolEscrow storage pool = pools[_poolId];
        
        require(pool.status == PoolStatus.FUNDING, "Can only withdraw during funding");
        require(block.timestamp >= pool.fundingDeadline, "Funding still active");
        require(pool.currentAmount < pool.targetAmount, "Pool was funded");
        
        uint256 amount = contributions[_poolId][msg.sender];
        require(amount > 0, "No contribution to withdraw");

        contributions[_poolId][msg.sender] = 0;
        pool.currentAmount -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit ContributionWithdrawn(_poolId, msg.sender, amount);
    }

    /**
     * @notice Vote to release funds to seller
     * @param _poolId ID of the pool
     */
    function voteRelease(uint256 _poolId) external poolExists(_poolId) onlyWhenFunded(_poolId) onlyContributor(_poolId) {
        require(!hasVotedRelease[_poolId][msg.sender], "Already voted release");
        require(!hasVotedRefund[_poolId][msg.sender], "Already voted refund");

        PoolEscrow storage pool = pools[_poolId];
        uint256 weight = contributions[_poolId][msg.sender];

        pool.releaseVotesWeight += weight;
        hasVotedRelease[_poolId][msg.sender] = true;

        emit VoteCast(_poolId, msg.sender, true, weight);

        // Check threshold
        if (pool.releaseVotesWeight * 10000 >= pool.currentAmount * RELEASE_THRESHOLD_BPS) {
            _releasePool(_poolId);
        }
    }

    /**
     * @notice Vote to refund all contributors
     * @param _poolId ID of the pool
     */
    function voteRefund(uint256 _poolId) external poolExists(_poolId) onlyWhenFunded(_poolId) onlyContributor(_poolId) {
        require(!hasVotedRelease[_poolId][msg.sender], "Already voted release");
        require(!hasVotedRefund[_poolId][msg.sender], "Already voted refund");

        PoolEscrow storage pool = pools[_poolId];
        uint256 weight = contributions[_poolId][msg.sender];

        pool.refundVotesWeight += weight;
        hasVotedRefund[_poolId][msg.sender] = true;

        emit VoteCast(_poolId, msg.sender, false, weight);

        // Check threshold
        if (pool.refundVotesWeight * 10000 >= pool.currentAmount * REFUND_THRESHOLD_BPS) {
            _refundPool(_poolId);
        }
    }

    /**
     * @notice Change vote from refund to release
     * @param _poolId ID of the pool
     */
    function changeVoteToRelease(uint256 _poolId) external poolExists(_poolId) onlyWhenFunded(_poolId) onlyContributor(_poolId) {
        require(hasVotedRefund[_poolId][msg.sender], "Not voted refund");
        require(!hasVotedRelease[_poolId][msg.sender], "Already voted release");

        PoolEscrow storage pool = pools[_poolId];
        uint256 weight = contributions[_poolId][msg.sender];

        pool.refundVotesWeight -= weight;
        pool.releaseVotesWeight += weight;
        hasVotedRefund[_poolId][msg.sender] = false;
        hasVotedRelease[_poolId][msg.sender] = true;

        emit VoteCast(_poolId, msg.sender, true, weight);

        if (pool.releaseVotesWeight * 10000 >= pool.currentAmount * RELEASE_THRESHOLD_BPS) {
            _releasePool(_poolId);
        }
    }

    /**
     * @notice Internal function to release pool to seller
     */
    function _releasePool(uint256 _poolId) internal {
        PoolEscrow storage pool = pools[_poolId];
        require(pool.status == PoolStatus.FUNDED, "Already resolved");

        pool.status = PoolStatus.COMPLETED;
        uint256 amount = pool.currentAmount;
        pool.currentAmount = 0;

        (bool success, ) = payable(pool.seller).call{value: amount}("");
        require(success, "ETH transfer to seller failed");

        emit PoolReleased(_poolId, amount, block.timestamp);
    }

    /**
     * @notice Internal function to refund all contributors
     */
    function _refundPool(uint256 _poolId) internal {
        PoolEscrow storage pool = pools[_poolId];
        require(pool.status == PoolStatus.FUNDED, "Already resolved");

        pool.status = PoolStatus.REFUNDED;
        
        // Note: In production, consider pull pattern for gas efficiency
        // For simplicity, we refund proportionally here
        emit PoolRefunded(_poolId, pool.currentAmount, block.timestamp);
    }

    /**
     * @notice Claim proportional refund after pool is marked REFUNDED
     * @param _poolId ID of the pool
     */
    function claimRefund(uint256 _poolId) external poolExists(_poolId) {
        PoolEscrow storage pool = pools[_poolId];
        require(pool.status == PoolStatus.REFUNDED, "Pool not refunded");
        
        uint256 contribution = contributions[_poolId][msg.sender];
        require(contribution > 0, "No contribution");
        
        contributions[_poolId][msg.sender] = 0;
        
        (bool success, ) = payable(msg.sender).call{value: contribution}("");
        require(success, "Refund transfer failed");
    }

    /**
     * @notice Get pool details
     */
    function getPool(uint256 _poolId) external view returns (PoolEscrow memory) {
        PoolEscrow memory pool = pools[_poolId];
        require(pool.id != 0, "Pool does not exist");
        return pool;
    }

    /**
     * @notice Get contribution amount for an address in a pool
     */
    function getContribution(uint256 _poolId, address _contributor) external view returns (uint256) {
        return contributions[_poolId][_contributor];
    }

    /**
     * @notice Get all pools for a contributor
     */
    function getContributorPools(address _contributor) external view returns (uint256[] memory) {
        return contributorPools[_contributor];
    }

    /**
     * @notice Get all pools where address is seller
     */
    function getSellerPools(address _seller) external view returns (uint256[] memory) {
        return sellerPools[_seller];
    }

    /**
     * @notice Get paginated list of all pools
     */
    function getPoolsPaginated(uint256 _start, uint256 _count) external view returns (PoolEscrow[] memory) {
        require(_start >= 1 && _start <= poolCount, "Invalid start");
        require(_count > 0 && _count <= 100, "Count must be 1-100");
        
        uint256 end = _start + _count - 1;
        if (end > poolCount) {
            end = poolCount;
        }
        
        uint256 resultCount = end - _start + 1;
        PoolEscrow[] memory result = new PoolEscrow[](resultCount);
        
        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = pools[_start + i];
        }
        
        return result;
    }

    /**
     * @notice Get pools by status
     */
    function getPoolsByStatus(PoolStatus _status) external view returns (uint256[] memory) {
        // First count
        uint256 count = 0;
        for (uint256 i = 1; i <= poolCount; i++) {
            if (pools[i].status == _status) {
                count++;
            }
        }
        
        // Then populate
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= poolCount; i++) {
            if (pools[i].status == _status) {
                result[index] = i;
                index++;
            }
        }
        
        return result;
    }

    /**
     * @notice Calculate vote percentages
     */
    function getVotePercentages(uint256 _poolId) external view poolExists(_poolId) returns (
        uint256 releasePercentBps,
        uint256 refundPercentBps
    ) {
        PoolEscrow memory pool = pools[_poolId];
        if (pool.currentAmount == 0) {
            return (0, 0);
        }
        
        releasePercentBps = (pool.releaseVotesWeight * 10000) / pool.currentAmount;
        refundPercentBps = (pool.refundVotesWeight * 10000) / pool.currentAmount;
    }

    /**
     * @notice Check if funding deadline has passed without reaching target
     */
    function isExpired(uint256 _poolId) external view poolExists(_poolId) returns (bool) {
        PoolEscrow memory pool = pools[_poolId];
        return pool.status == PoolStatus.FUNDING && 
               block.timestamp >= pool.fundingDeadline && 
               pool.currentAmount < pool.targetAmount;
    }
}
