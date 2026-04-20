// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TrustGraph
 * @notice On-chain social reputation graph. Every completed escrow creates a trust edge.
 *         Trust scores computed using weighted average of historical deals.
 *         Enables reputation-based escrow decisions.
 */
contract TrustGraph {
    struct TrustEdge {
        address from;
        address to;
        uint8 weight;        // 100 = completed, 50 = refunded, 0 = disputed
        uint256 timestamp;
        uint256 escrowId;
    }

    // Outgoing edges: who this address has trusted
    mapping(address => TrustEdge[]) public outgoingEdges;
    
    // Incoming edges: who has trusted this address
    mapping(address => TrustEdge[]) public incomingEdges;
    
    // Trust score: 0-1000 scale
    mapping(address => uint256) public trustScore;
    
    // Total deals (for averaging)
    mapping(address => uint256) public totalDeals;
    
    // 2-hop connections cache
    mapping(address => mapping(address => bool)) public hasMutualConnection;

    // Authorized escrow contracts that can record edges
    mapping(address => bool) public authorizedEscrowContracts;
    address public owner;

    uint256 public constant MAX_SCORE = 1000;
    uint256 public constant MIN_SCORE = 0;
    uint256 public constant COMPLETED_WEIGHT = 100;
    uint256 public constant REFUNDED_WEIGHT = 50;
    uint256 public constant DISPUTED_WEIGHT = 0;

    event TrustEdgeRecorded(
        address indexed from,
        address indexed to,
        uint8 weight,
        uint256 escrowId,
        uint256 timestamp
    );

    event TrustScoreUpdated(
        address indexed user,
        uint256 newScore,
        uint256 totalDeals
    );

    event EscrowContractAuthorized(address indexed escrowContract);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedEscrowContracts[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Authorize an escrow contract to record trust edges
     */
    function authorizeEscrowContract(address _contract) external onlyOwner {
        require(_contract != address(0), "Invalid address");
        authorizedEscrowContracts[_contract] = true;
        emit EscrowContractAuthorized(_contract);
    }

    /**
     * @notice Revoke authorization
     */
    function revokeEscrowContract(address _contract) external onlyOwner {
        authorizedEscrowContracts[_contract] = false;
    }

    /**
     * @notice Record a trust edge after escrow completion
     * @param _from Buyer address (trustor)
     * @param _to Seller address (trustee)
     * @param _weight 100=completed, 50=refunded, 0=disputed
     * @param _escrowId Reference to the escrow
     */
    function recordTrustEdge(
        address _from,
        address _to,
        uint8 _weight,
        uint256 _escrowId
    ) external onlyAuthorized {
        require(_from != address(0) && _to != address(0), "Invalid addresses");
        require(_from != _to, "Cannot trust self");
        require(_weight <= 100, "Weight must be 0-100");

        TrustEdge memory edge = TrustEdge({
            from: _from,
            to: _to,
            weight: _weight,
            timestamp: block.timestamp,
            escrowId: _escrowId
        });

        outgoingEdges[_from].push(edge);
        incomingEdges[_to].push(edge);

        // Update trust score for recipient
        _updateTrustScore(_to, _weight);

        // Check and record mutual connections
        _updateMutualConnections(_from, _to);

        emit TrustEdgeRecorded(_from, _to, _weight, _escrowId, block.timestamp);
    }

    /**
     * @notice Internal: Update trust score using weighted average
     */
    function _updateTrustScore(address _user, uint256 _newWeight) internal {
        uint256 currentScore = trustScore[_user];
        uint256 currentDeals = totalDeals[_user];

        // New score = (current * currentDeals + newWeight * 10) / (currentDeals + 1)
        // We multiply weight by 10 to get 0-1000 scale
        uint256 newScore = (currentScore * currentDeals + uint256(_newWeight) * 10) / (currentDeals + 1);

        // Cap at MAX_SCORE
        if (newScore > MAX_SCORE) {
            newScore = MAX_SCORE;
        }

        trustScore[_user] = newScore;
        totalDeals[_user] = currentDeals + 1;

        emit TrustScoreUpdated(_user, newScore, totalDeals[_user]);
    }

    /**
     * @notice Internal: Update mutual connection cache
     */
    function _updateMutualConnections(address _from, address _to) internal {
        // Check if _to has any outgoing edges to addresses that _from also trusts
        TrustEdge[] memory toOutgoing = outgoingEdges[_to];
        
        for (uint256 i = 0; i < toOutgoing.length; i++) {
            address mutual = toOutgoing[i].to;
            
            // Check if _from also trusts this mutual connection
            for (uint256 j = 0; j < outgoingEdges[_from].length; j++) {
                if (outgoingEdges[_from][j].to == mutual) {
                    hasMutualConnection[_from][_to] = true;
                    hasMutualConnection[_to][_from] = true;
                    break;
                }
            }
        }
    }

    /**
     * @notice Get trust score for a user
     */
    function getTrustScore(address _user) external view returns (uint256 score, uint256 deals) {
        return (trustScore[_user], totalDeals[_user]);
    }

    /**
     * @notice Get trust tier based on score
     */
    function getTrustTier(address _user) external view returns (string memory tier) {
        uint256 score = trustScore[_user];
        
        if (score >= 800) return "Elite";
        if (score >= 500) return "Trusted";
        if (score >= 200) return "Building";
        return "New";
    }

    /**
     * @notice Get incoming edges (who trusts this user)
     */
    function getIncomingEdges(address _user) external view returns (TrustEdge[] memory) {
        return incomingEdges[_user];
    }

    /**
     * @notice Get outgoing edges (who this user trusts)
     */
    function getOutgoingEdges(address _user) external view returns (TrustEdge[] memory) {
        return outgoingEdges[_user];
    }

    /**
     * @notice Check if two users share a mutual connection
     */
    function getTrustPath(address _from, address _to) external view returns (bool connected, uint8 avgTrust) {
        // Direct connection check
        for (uint256 i = 0; i < outgoingEdges[_from].length; i++) {
            if (outgoingEdges[_from][i].to == _to) {
                return (true, outgoingEdges[_from][i].weight);
            }
        }

        // Mutual connection check
        if (hasMutualConnection[_from][_to]) {
            // Calculate average trust through mutual connections
            uint256 totalWeight = 0;
            uint256 count = 0;
            
            TrustEdge[] memory fromOutgoing = outgoingEdges[_from];
            
            for (uint256 i = 0; i < fromOutgoing.length; i++) {
                address potentialMutual = fromOutgoing[i].to;
                
                // Check if this mutual also trusts _to
                TrustEdge[] memory mutualOutgoing = outgoingEdges[potentialMutual];
                for (uint256 j = 0; j < mutualOutgoing.length; j++) {
                    if (mutualOutgoing[j].to == _to) {
                        totalWeight += (uint256(fromOutgoing[i].weight) + uint256(mutualOutgoing[j].weight)) / 2;
                        count++;
                        break;
                    }
                }
            }
            
            if (count > 0) {
                return (true, uint8(totalWeight / count));
            }
        }

        return (false, 0);
    }

    /**
     * @notice Get top trusted addresses by score
     */
    function getTopTrusted(uint256 _count) external view returns (address[] memory, uint256[] memory) {
        require(_count > 0 && _count <= 100, "Count must be 1-100");

        // In production, this would use an indexed data structure
        // For simplicity, we return addresses with score > 500
        
        // First pass: count
        uint256 qualifiedCount = 0;
        // Note: This is a simplified implementation
        // A production version would maintain a sorted list

        address[] memory topAddresses = new address[](_count);
        uint256[] memory topScores = new uint256[](_count);

        // This is a placeholder implementation
        // Real implementation would need off-chain indexing or more sophisticated on-chain sorting

        return (topAddresses, topScores);
    }

    /**
     * @notice Get connection strength between two addresses
     */
    function getConnectionStrength(address _from, address _to) external view returns (uint256 strength) {
        // Count mutual connections
        uint256 mutualCount = 0;
        
        TrustEdge[] memory fromOutgoing = outgoingEdges[_from];
        TrustEdge[] memory toOutgoing = outgoingEdges[_to];

        for (uint256 i = 0; i < fromOutgoing.length; i++) {
            for (uint256 j = 0; j < toOutgoing.length; j++) {
                if (fromOutgoing[i].to == toOutgoing[j].to) {
                    mutualCount++;
                }
            }
        }

        return mutualCount;
    }

    /**
     * @notice Get deal statistics for a user
     */
    function getDealStats(address _user) external view returns (
        uint256 completed,
        uint256 refunded,
        uint256 disputed
    ) {
        TrustEdge[] memory incoming = incomingEdges[_user];
        
        for (uint256 i = 0; i < incoming.length; i++) {
            if (incoming[i].weight == 100) {
                completed++;
            } else if (incoming[i].weight == 50) {
                refunded++;
            } else {
                disputed++;
            }
        }
    }
}
