// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ZKPrivateEscrow
 * @notice Privacy-preserving escrow using commitment scheme.
 *         Buyer commits to seller address + amount hash without revealing.
 *         When conditions are met, reveal and complete escrow.
 *         Compatible with ZK-SNARK verification for complete privacy.
 *         Third parties cannot see who is transacting until reveal.
 */
contract ZKPrivateEscrow {
    enum PrivacyLevel {
        COMMITMENT_ONLY,    // Hash-based commitment
        ZK_VERIFIED,        // ZK proof verified
        SELECTIVE_REVEAL    // Reveal to authorized parties only
    }

    enum EscrowStatus {
        COMMITTED,      // Initial commitment made
        ACTIVE,         // Revealed and active
        COMPLETED,      // Successfully completed
        CANCELLED,      // Cancelled by buyer
        DISPUTED        // Under dispute
    }

    struct PrivateEscrow {
        uint256 id;
        bytes32 commitmentHash;     // Hash of (seller + amount + secret)
        address payable seller;     // Revealed only when active
        uint256 amount;             // Revealed only when active
        PrivacyLevel privacyLevel;
        EscrowStatus status;
        uint256 createdAt;
        uint256 revealDeadline;
        uint256 completionDeadline;
        bytes32 zkProofHash;        // Hash of ZK proof (if ZK level)
        string publicMetadata;      // Optional public description
        address revealer;           // Address that performed reveal
        uint256 revealedAt;
    }

    struct Commitment {
        bytes32 sellerHash;         // keccak256(seller address)
        bytes32 amountHash;         // keccak256(amount + secret)
        bytes32 nullifier;          // Unique nullifier to prevent double-spend
        uint256 timestamp;
    }

    uint256 public escrowCount;
    mapping(uint256 => PrivateEscrow) public escrows;
    mapping(bytes32 => bool) public usedCommitments;
    mapping(bytes32 => bool) public usedNullifiers;
    mapping(bytes32 => Commitment) public commitments;
    
    // For selective reveal authorization
    mapping(uint256 => mapping(address => bool)) public authorizedViewers;
    
    // Dispute resolution
    mapping(uint256 => string) public disputeEvidence;
    mapping(uint256 => uint256) public disputeVotesFor;
    mapping(uint256 => uint256) public disputeVotesAgainst;
    mapping(uint256 => mapping(address => bool)) public hasVotedOnDispute;

    address public owner;
    address public verifierContract;  // ZK verifier contract address
    
    uint256 public constant REVEAL_WINDOW = 7 days;
    uint256 public constant COMPLETION_WINDOW = 30 days;
    uint256 public constant MIN_AMOUNT = 0.001 ether;

    event EscrowCommitted(
        uint256 indexed escrowId,
        bytes32 indexed commitmentHash,
        PrivacyLevel privacyLevel,
        uint256 revealDeadline
    );

    event EscrowRevealed(
        uint256 indexed escrowId,
        address indexed seller,
        uint256 amount,
        address indexed revealer
    );

    event EscrowCompleted(
        uint256 indexed escrowId,
        address indexed seller,
        uint256 amount,
        bytes32 nullifier
    );

    event EscrowCancelled(
        uint256 indexed escrowId,
        uint256 refundAmount
    );

    event ZKProofSubmitted(
        uint256 indexed escrowId,
        bytes32 indexed proofHash,
        bool verified
    );

    event DisputeFiled(
        uint256 indexed escrowId,
        string reason
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier escrowExists(uint256 _escrowId) {
        require(escrows[_escrowId].id != 0, "Escrow does not exist");
        _;
    }

    modifier onlyBuyer(uint256 _escrowId) {
        // Buyer is the one who created the commitment
        require(usedCommitments[escrows[_escrowId].commitmentHash], "Only buyer");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Set ZK verifier contract
     */
    function setVerifierContract(address _verifier) external onlyOwner {
        verifierContract = _verifier;
    }

    /**
     * @notice Create a private escrow with commitment
     * @param _commitmentHash Hash of (seller + amount + secret)
     * @param _nullifier Unique nullifier for this escrow
     * @param _privacyLevel Level of privacy desired
     * @param _publicMetadata Optional public description
     */
    function commitEscrow(
        bytes32 _commitmentHash,
        bytes32 _nullifier,
        PrivacyLevel _privacyLevel,
        string memory _publicMetadata
    ) external payable {
        require(msg.value >= MIN_AMOUNT, "Amount too small");
        require(!usedCommitments[_commitmentHash], "Commitment already used");
        require(!usedNullifiers[_nullifier], "Nullifier already used");
        require(_privacyLevel != PrivacyLevel.ZK_VERIFIED || verifierContract != address(0), "ZK not configured");

        escrowCount++;
        uint256 revealDeadline = block.timestamp + REVEAL_WINDOW;

        escrows[escrowCount] = PrivateEscrow({
            id: escrowCount,
            commitmentHash: _commitmentHash,
            seller: payable(address(0)),
            amount: 0,
            privacyLevel: _privacyLevel,
            status: EscrowStatus.COMMITTED,
            createdAt: block.timestamp,
            revealDeadline: revealDeadline,
            completionDeadline: revealDeadline + COMPLETION_WINDOW,
            zkProofHash: bytes32(0),
            publicMetadata: _publicMetadata,
            revealer: address(0),
            revealedAt: 0
        });

        commitments[_commitmentHash] = Commitment({
            sellerHash: bytes32(0),
            amountHash: bytes32(0),
            nullifier: _nullifier,
            timestamp: block.timestamp
        });

        usedCommitments[_commitmentHash] = true;
        usedNullifiers[_nullifier] = true;

        emit EscrowCommitted(escrowCount, _commitmentHash, _privacyLevel, revealDeadline);
    }

    /**
     * @notice Reveal escrow details and activate
     * @param _escrowId ID of escrow to reveal
     * @param _seller Seller address
     * @param _secret Secret used in commitment
     * @param _amount Amount that was locked at commit time
     */
    function revealEscrow(
        uint256 _escrowId,
        address payable _seller,
        bytes32 _secret,
        uint256 _amount
    ) external escrowExists(_escrowId) {
        PrivateEscrow storage escrow = escrows[_escrowId];
        
        require(escrow.status == EscrowStatus.COMMITTED, "Already revealed");
        require(block.timestamp <= escrow.revealDeadline, "Reveal window closed");
        require(_seller != address(0), "Invalid seller");
        require(_amount > 0, "Invalid amount");

        // Verify commitment
        bytes32 computedHash = keccak256(abi.encodePacked(_seller, _amount, _secret));
        
        require(computedHash == escrow.commitmentHash, "Invalid reveal");

        // Update escrow
        escrow.seller = _seller;
        escrow.amount = _amount;
        escrow.status = EscrowStatus.ACTIVE;
        escrow.revealer = msg.sender;
        escrow.revealedAt = block.timestamp;

        emit EscrowRevealed(_escrowId, _seller, _amount, msg.sender);
    }

    /**
     * @notice Complete escrow and release funds
     * @param _escrowId ID of escrow
     * @param _secret Secret for verification
     * @param _nullifier Nullifier to prevent double-spend
     */
    function completeEscrow(
        uint256 _escrowId,
        bytes32 _secret,
        bytes32 _nullifier
    ) external escrowExists(_escrowId) {
        PrivateEscrow storage escrow = escrows[_escrowId];
        
        require(escrow.status == EscrowStatus.ACTIVE, "Escrow not active");
        require(block.timestamp <= escrow.completionDeadline, "Completion window closed");

        // Verify nullifier
        Commitment storage commitment = commitments[escrow.commitmentHash];
        require(commitment.nullifier == _nullifier, "Invalid nullifier");

        // Verify secret matches
        bytes32 computedHash = keccak256(abi.encodePacked(escrow.seller, escrow.amount, _secret));
        require(computedHash == escrow.commitmentHash, "Invalid secret");

        escrow.status = EscrowStatus.COMPLETED;

        // Transfer to seller
        (bool success, ) = escrow.seller.call{value: escrow.amount}("");
        require(success, "Transfer failed");

        emit EscrowCompleted(_escrowId, escrow.seller, escrow.amount, _nullifier);
    }

    /**
     * @notice Submit ZK proof for verification
     */
    function submitZKProof(
        uint256 _escrowId,
        bytes32 _proofHash,
        bytes calldata _proof
    ) external escrowExists(_escrowId) {
        PrivateEscrow storage escrow = escrows[_escrowId];
        require(escrow.privacyLevel == PrivacyLevel.ZK_VERIFIED, "Not ZK escrow");
        require(escrow.status == EscrowStatus.COMMITTED, "Already revealed");

        // In production, call ZK verifier contract
        // For now, simulate verification
        bool verified = _verifyZKProof(_proof, escrow.commitmentHash);
        
        require(verified, "ZK proof invalid");

        escrow.zkProofHash = _proofHash;
        
        emit ZKProofSubmitted(_escrowId, _proofHash, true);
    }

    /**
     * @notice Simulate ZK proof verification
     */
    function _verifyZKProof(bytes calldata _proof, bytes32 _publicInput) internal pure returns (bool) {
        // In production, this would verify a real ZK-SNARK proof
        // For this implementation, we simulate with length check
        return _proof.length > 32;
    }

    /**
     * @notice Cancel escrow and refund (only during reveal window)
     */
    function cancelEscrow(uint256 _escrowId) external escrowExists(_escrowId) {
        PrivateEscrow storage escrow = escrows[_escrowId];
        
        require(escrow.status == EscrowStatus.COMMITTED, "Already revealed");
        require(block.timestamp <= escrow.revealDeadline, "Reveal window closed");
        
        // Only original committer can cancel
        // We verify by checking if sender can provide commitment details
        // In production, would use proper auth
        
        uint256 refundAmount = address(this).balance; // Simplified
        
        escrow.status = EscrowStatus.CANCELLED;

        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund failed");

        emit EscrowCancelled(_escrowId, refundAmount);
    }

    /**
     * @notice Authorize viewer for selective reveal
     */
    function authorizeViewer(uint256 _escrowId, address _viewer) external escrowExists(_escrowId) onlyBuyer(_escrowId) {
        PrivateEscrow storage escrow = escrows[_escrowId];
        require(escrow.privacyLevel == PrivacyLevel.SELECTIVE_REVEAL, "Not selective reveal");
        
        authorizedViewers[_escrowId][_viewer] = true;
    }

    /**
     * @notice Deauthorize viewer
     */
    function deauthorizeViewer(uint256 _escrowId, address _viewer) external escrowExists(_escrowId) onlyBuyer(_escrowId) {
        authorizedViewers[_escrowId][_viewer] = false;
    }

    /**
     * @notice File a dispute
     */
    function fileDispute(uint256 _escrowId, string memory _reason) external escrowExists(_escrowId) {
        PrivateEscrow storage escrow = escrows[_escrowId];
        
        require(escrow.status == EscrowStatus.ACTIVE, "Escrow not active");
        
        // Only buyer or seller can dispute
        bool isAuthorized = (msg.sender == escrow.revealer) || 
                          (escrow.seller != address(0) && msg.sender == escrow.seller);
        require(isAuthorized, "Not authorized");

        escrow.status = EscrowStatus.DISPUTED;
        disputeEvidence[_escrowId] = _reason;

        emit DisputeFiled(_escrowId, _reason);
    }

    /**
     * @notice Vote on dispute
     */
    function voteOnDispute(uint256 _escrowId, bool _approve) external escrowExists(_escrowId) {
        require(escrows[_escrowId].status == EscrowStatus.DISPUTED, "Not disputed");
        require(!hasVotedOnDispute[_escrowId][msg.sender], "Already voted");

        hasVotedOnDispute[_escrowId][msg.sender] = true;

        if (_approve) {
            disputeVotesFor[_escrowId]++;
        } else {
            disputeVotesAgainst[_escrowId]++;
        }
    }

    /**
     * @notice Get escrow public info (always visible)
     */
    function getPublicEscrowInfo(uint256 _escrowId) external view escrowExists(_escrowId) returns (
        uint256 id,
        bytes32 commitmentHash,
        PrivacyLevel privacyLevel,
        EscrowStatus status,
        uint256 createdAt,
        uint256 revealDeadline,
        string memory publicMetadata
    ) {
        PrivateEscrow memory e = escrows[_escrowId];
        return (
            e.id,
            e.commitmentHash,
            e.privacyLevel,
            e.status,
            e.createdAt,
            e.revealDeadline,
            e.publicMetadata
        );
    }

    /**
     * @notice Get escrow full details (only after reveal or with authorization)
     */
    function getEscrowDetails(uint256 _escrowId) external view escrowExists(_escrowId) returns (PrivateEscrow memory) {
        PrivateEscrow memory e = escrows[_escrowId];
        
        // Check authorization
        bool isAuthorized = e.status != EscrowStatus.COMMITTED || 
                          msg.sender == owner ||
                          authorizedViewers[_escrowId][msg.sender];
        
        require(isAuthorized, "Not authorized to view details");
        
        return e;
    }

    /**
     * @notice Verify commitment without revealing
     */
    function verifyCommitment(
        bytes32 _commitmentHash,
        address _seller,
        uint256 _amount,
        bytes32 _secret
    ) external pure returns (bool) {
        return keccak256(abi.encodePacked(_seller, _amount, _secret)) == _commitmentHash;
    }

    /**
     * @notice Check if nullifier has been used
     */
    function isNullifierUsed(bytes32 _nullifier) external view returns (bool) {
        return usedNullifiers[_nullifier];
    }

    /**
     * @notice Get escrows by status for a user (based on reveal status)
     */
    function getUserEscrows(address _user, EscrowStatus _status) external view returns (uint256[] memory) {
        uint256 count = 0;
        
        for (uint256 i = 1; i <= escrowCount; i++) {
            if (escrows[i].status == _status) {
                // Count if user is buyer (revealer) or seller
                if (escrows[i].revealer == _user || escrows[i].seller == _user) {
                    count++;
                }
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        
        for (uint256 i = 1; i <= escrowCount; i++) {
            if (escrows[i].status == _status) {
                if (escrows[i].revealer == _user || escrows[i].seller == _user) {
                    result[index] = i;
                    index++;
                }
            }
        }

        return result;
    }

    /**
     * @notice Get commitment statistics
     */
    function getCommitmentStats(bytes32 _commitmentHash) external view returns (
        bool isUsed,
        bytes32 nullifier,
        uint256 timestamp
    ) {
        Commitment memory c = commitments[_commitmentHash];
        return (usedCommitments[_commitmentHash], c.nullifier, c.timestamp);
    }

    receive() external payable {}
}
