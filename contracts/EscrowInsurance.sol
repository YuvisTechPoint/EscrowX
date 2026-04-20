// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title EscrowInsurance
 * @notice Decentralized insurance pool for escrow disputes.
 *         Buyers pay small premium; if escrow is disputed, claim up to 50% compensation.
 *         Premiums accumulate in pool; stakers earn yield by providing liquidity.
 */
contract EscrowInsurance {
    enum ClaimStatus {
        PENDING,
        APPROVED,
        REJECTED,
        PAID
    }

    struct Policy {
        uint256 id;
        address buyer;
        uint256 escrowId;
        address escrowContract;
        uint256 coverageAmount;
        uint256 premiumPaid;
        uint256 expiryDate;
        bool claimed;
        bool isActive;
    }

    struct Claim {
        uint256 id;
        uint256 policyId;
        string reason;
        string evidenceHash;
        uint256 amountRequested;
        ClaimStatus status;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 createdAt;
        uint256 resolvedAt;
    }

    struct Staker {
        uint256 amount;
        uint256 stakedAt;
        uint256 lastRewardCalc;
        uint256 accumulatedRewards;
    }

    uint256 public policyCount;
    uint256 public claimCount;
    uint256 public totalStaked;
    uint256 public totalPoolBalance;
    
    mapping(uint256 => Policy) public policies;
    mapping(uint256 => Claim) public claims;
    mapping(address => Staker) public stakers;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    
    // Parameters
    uint256 public constant PREMIUM_RATE_BPS = 500;      // 5% of escrow
    uint256 public constant MAX_COVERAGE_BPS = 5000;     // 50% of escrow
    uint256 public constant CLAIM_WINDOW_DAYS = 30;
    uint256 public constant MIN_STAKE = 0.1 ether;
    uint256 public constant REWARD_RATE_BPS = 1000;      // 10% APR base rate
    
    // Governance
    mapping(address => bool) public isVerifier;
    address[] public verifiers;
    address public owner;
    uint256 public constant MIN_VERIFIER_VOTES = 3;

    event PolicyCreated(
        uint256 indexed policyId,
        address indexed buyer,
        uint256 indexed escrowId,
        uint256 coverageAmount,
        uint256 premium
    );

    event ClaimFiled(
        uint256 indexed claimId,
        uint256 indexed policyId,
        address indexed buyer,
        uint256 amountRequested
    );

    event ClaimVoted(
        uint256 indexed claimId,
        address indexed verifier,
        bool approved
    );

    event ClaimResolved(
        uint256 indexed claimId,
        ClaimStatus status,
        uint256 payoutAmount
    );

    event Staked(
        address indexed staker,
        uint256 amount,
        uint256 totalStaked
    );

    event Unstaked(
        address indexed staker,
        uint256 amount,
        uint256 rewards
    );

    event RewardsClaimed(
        address indexed staker,
        uint256 amount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyVerifier() {
        require(isVerifier[msg.sender], "Only verifier");
        _;
    }

    modifier policyExists(uint256 _policyId) {
        require(policies[_policyId].id != 0, "Policy does not exist");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Add a verifier
     */
    function addVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Invalid address");
        require(!isVerifier[_verifier], "Already verifier");
        isVerifier[_verifier] = true;
        verifiers.push(_verifier);
    }

    /**
     * @notice Remove a verifier
     */
    function removeVerifier(address _verifier) external onlyOwner {
        require(isVerifier[_verifier], "Not a verifier");
        isVerifier[_verifier] = false;
    }

    /**
     * @notice Purchase insurance policy for an escrow
     * @param _escrowId ID of the escrow to insure
     * @param _escrowContract Address of the escrow contract
     * @param _escrowAmount Full amount of the escrow
     */
    function purchasePolicy(
        uint256 _escrowId,
        address _escrowContract,
        uint256 _escrowAmount
    ) external payable {
        require(_escrowAmount > 0, "Invalid escrow amount");
        
        uint256 maxCoverage = (_escrowAmount * MAX_COVERAGE_BPS) / 10000;
        uint256 premium = (maxCoverage * PREMIUM_RATE_BPS) / 10000;
        
        require(msg.value >= premium, "Insufficient premium");
        require(premium >= 0.001 ether, "Premium too small");

        policyCount++;
        
        policies[policyCount] = Policy({
            id: policyCount,
            buyer: msg.sender,
            escrowId: _escrowId,
            escrowContract: _escrowContract,
            coverageAmount: maxCoverage,
            premiumPaid: premium,
            expiryDate: block.timestamp + (90 days),
            claimed: false,
            isActive: true
        });

        // Add premium to pool
        totalPoolBalance += premium;

        // Refund excess
        uint256 excess = msg.value - premium;
        if (excess > 0) {
            (bool success, ) = payable(msg.sender).call{value: excess}("");
            require(success, "Refund failed");
        }

        emit PolicyCreated(policyCount, msg.sender, _escrowId, maxCoverage, premium);
    }

    /**
     * @notice File a claim on a policy
     */
    function fileClaim(
        uint256 _policyId,
        string memory _reason,
        string memory _evidenceHash,
        uint256 _amountRequested
    ) external policyExists(_policyId) {
        Policy storage policy = policies[_policyId];
        
        require(policy.buyer == msg.sender, "Only policy buyer");
        require(policy.isActive, "Policy not active");
        require(!policy.claimed, "Already claimed");
        require(block.timestamp <= policy.expiryDate, "Policy expired");
        require(_amountRequested <= policy.coverageAmount, "Request exceeds coverage");
        require(_amountRequested > 0, "Invalid amount");
        require(bytes(_reason).length > 0, "Reason required");

        policy.claimed = true;
        claimCount++;

        claims[claimCount] = Claim({
            id: claimCount,
            policyId: _policyId,
            reason: _reason,
            evidenceHash: _evidenceHash,
            amountRequested: _amountRequested,
            status: ClaimStatus.PENDING,
            votesFor: 0,
            votesAgainst: 0,
            createdAt: block.timestamp,
            resolvedAt: 0
        });

        emit ClaimFiled(claimCount, _policyId, msg.sender, _amountRequested);
    }

    /**
     * @notice Vote on a claim (verifiers only)
     */
    function voteOnClaim(
        uint256 _claimId,
        bool _approve
    ) external onlyVerifier {
        Claim storage claim = claims[_claimId];
        require(claim.id != 0, "Claim does not exist");
        require(claim.status == ClaimStatus.PENDING, "Claim not pending");
        require(!hasVoted[_claimId][msg.sender], "Already voted");

        hasVoted[_claimId][msg.sender] = true;

        if (_approve) {
            claim.votesFor++;
        } else {
            claim.votesAgainst++;
        }

        emit ClaimVoted(_claimId, msg.sender, _approve);

        // Auto-resolve if enough votes
        if (claim.votesFor >= MIN_VERIFIER_VOTES) {
            _resolveClaim(_claimId, true);
        } else if (claim.votesAgainst >= MIN_VERIFIER_VOTES) {
            _resolveClaim(_claimId, false);
        }
    }

    /**
     * @notice Resolve a claim and pay if approved
     */
    function _resolveClaim(uint256 _claimId, bool _approved) internal {
        Claim storage claim = claims[_claimId];
        Policy storage policy = policies[claim.policyId];

        claim.status = _approved ? ClaimStatus.APPROVED : ClaimStatus.REJECTED;
        claim.resolvedAt = block.timestamp;

        if (_approved) {
            claim.status = ClaimStatus.PAID;
            
            // Check pool has enough
            require(totalPoolBalance >= claim.amountRequested, "Insufficient pool balance");
            
            totalPoolBalance -= claim.amountRequested;
            
            (bool success, ) = payable(policy.buyer).call{value: claim.amountRequested}("");
            require(success, "Payout failed");
        }

        emit ClaimResolved(_claimId, claim.status, _approved ? claim.amountRequested : 0);
    }

    /**
     * @notice Stake ETH to provide insurance liquidity
     */
    function stake() external payable {
        require(msg.value >= MIN_STAKE, "Minimum 0.1 ETH");

        _calculateRewards(msg.sender);

        Staker storage staker = stakers[msg.sender];
        staker.amount += msg.value;
        staker.stakedAt = block.timestamp;

        totalStaked += msg.value;
        totalPoolBalance += msg.value;

        emit Staked(msg.sender, msg.value, staker.amount);
    }

    /**
     * @notice Unstake ETH with rewards
     */
    function unstake(uint256 _amount) external {
        Staker storage staker = stakers[msg.sender];
        require(staker.amount >= _amount, "Insufficient stake");
        require(_amount > 0, "Invalid amount");

        _calculateRewards(msg.sender);

        uint256 rewards = staker.accumulatedRewards;
        uint256 totalReturn = _amount + rewards;

        require(totalPoolBalance >= totalReturn, "Insufficient pool liquidity");

        staker.amount -= _amount;
        staker.accumulatedRewards = 0;
        staker.lastRewardCalc = block.timestamp;

        totalStaked -= _amount;
        totalPoolBalance -= totalReturn;

        (bool success, ) = payable(msg.sender).call{value: totalReturn}("");
        require(success, "Unstake failed");

        emit Unstaked(msg.sender, _amount, rewards);
    }

    /**
     * @notice Calculate and accumulate pending rewards
     */
    function _calculateRewards(address _staker) internal {
        Staker storage staker = stakers[_staker];
        
        if (staker.amount == 0 || staker.lastRewardCalc == 0) {
            staker.lastRewardCalc = block.timestamp;
            return;
        }

        uint256 timeElapsed = block.timestamp - staker.lastRewardCalc;
        uint256 rewardRate = REWARD_RATE_BPS; // Simplified: flat 10% APR
        
        // Rewards = amount * rate * time / (365 days * 10000)
        uint256 rewards = (staker.amount * rewardRate * timeElapsed) / (365 days * 10000);
        
        staker.accumulatedRewards += rewards;
        staker.lastRewardCalc = block.timestamp;
    }

    /**
     * @notice Claim accumulated rewards without unstaking
     */
    function claimRewards() external {
        _calculateRewards(msg.sender);
        
        Staker storage staker = stakers[msg.sender];
        uint256 rewards = staker.accumulatedRewards;
        
        require(rewards > 0, "No rewards to claim");
        require(totalPoolBalance >= rewards, "Insufficient pool balance");

        staker.accumulatedRewards = 0;
        totalPoolBalance -= rewards;

        (bool success, ) = payable(msg.sender).call{value: rewards}("");
        require(success, "Reward claim failed");

        emit RewardsClaimed(msg.sender, rewards);
    }

    /**
     * @notice Get policy details
     */
    function getPolicy(uint256 _policyId) external view returns (Policy memory) {
        Policy memory p = policies[_policyId];
        require(p.id != 0, "Policy does not exist");
        return p;
    }

    /**
     * @notice Get claim details
     */
    function getClaim(uint256 _claimId) external view returns (Claim memory) {
        Claim memory c = claims[_claimId];
        require(c.id != 0, "Claim does not exist");
        return c;
    }

    /**
     * @notice Get staker info with pending rewards
     */
    function getStakerInfo(address _staker) external view returns (
        uint256 amount,
        uint256 accumulatedRewards,
        uint256 pendingRewards,
        uint256 total
    ) {
        Staker memory staker = stakers[_staker];
        
        // Calculate pending
        uint256 pending = 0;
        if (staker.amount > 0 && staker.lastRewardCalc > 0) {
            uint256 timeElapsed = block.timestamp - staker.lastRewardCalc;
            pending = (staker.amount * REWARD_RATE_BPS * timeElapsed) / (365 days * 10000);
        }

        return (
            staker.amount,
            staker.accumulatedRewards,
            pending,
            staker.amount + staker.accumulatedRewards + pending
        );
    }

    /**
     * @notice Get pool statistics
     */
    function getPoolStats() external view returns (
        uint256 totalStakedAmount,
        uint256 poolBalance,
        uint256 policyCountTotal,
        uint256 claimCountTotal,
        uint256 verifierCount
    ) {
        return (
            totalStaked,
            totalPoolBalance,
            policyCount,
            claimCount,
            verifiers.length
        );
    }

    /**
     * @notice Check if user has policy for escrow
     */
    function hasPolicyForEscrow(address _buyer, uint256 _escrowId) external view returns (bool) {
        // Simple check - in production would use reverse mapping
        for (uint256 i = 1; i <= policyCount; i++) {
            if (policies[i].buyer == _buyer && policies[i].escrowId == _escrowId && policies[i].isActive) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Get claims pending votes
     */
    function getPendingClaims() external view returns (uint256[] memory) {
        // Count first
        uint256 count = 0;
        for (uint256 i = 1; i <= claimCount; i++) {
            if (claims[i].status == ClaimStatus.PENDING) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= claimCount; i++) {
            if (claims[i].status == ClaimStatus.PENDING) {
                result[index] = i;
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Emergency withdraw (owner only, for extreme cases)
     */
    function emergencyWithdraw(uint256 _amount) external onlyOwner {
        require(_amount <= address(this).balance - totalPoolBalance, "Cannot withdraw staked funds");
        (bool success, ) = payable(owner).call{value: _amount}("");
        require(success, "Withdraw failed");
    }

    receive() external payable {
        totalPoolBalance += msg.value;
    }
}
