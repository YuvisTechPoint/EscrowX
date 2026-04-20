// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title EscrowConditions
 * @notice Escrow that releases based on external data feeds and custom conditions.
 *         Integrates with oracle providers to enable event-driven escrow releases.
 *         Users can set conditions like: "Release when ETH price > $3000" or "Release on API callback".
 */
contract EscrowConditions {
    enum ConditionType {
        PRICE_ABOVE,        // Asset price > threshold
        PRICE_BELOW,        // Asset price < threshold
        TIMESTAMP_REACHED,    // Specific time
        API_CALLBACK,       // External API callback
        MULTISIG_APPROVAL,  // Multiple signatures required
        COMPOUND_AND,       // All sub-conditions must pass
        COMPOUND_OR         // Any sub-condition must pass
    }

    enum EscrowStatus {
        PENDING,
        CONDITION_MET,
        RELEASED,
        REFUNDED,
        EXPIRED
    }

    struct Condition {
        ConditionType conditionType;
        address oracle;           // Price feed or oracle address
        bytes parameters;       // Encoded condition parameters
        uint256 threshold;      // For numeric comparisons
        string apiEndpoint;     // For API conditions
        bool isMet;
        uint256 metAt;
    }

    struct ConditionalEscrow {
        uint256 id;
        address buyer;
        address seller;
        uint256 amount;
        string description;
        Condition[] conditions;
        uint256 createdAt;
        uint256 expiryDate;
        EscrowStatus status;
        uint256[] subConditionIds;  // For compound conditions
    }

    struct OracleProvider {
        address oracleAddress;
        string name;
        bool isActive;
        uint256 trustedSince;
    }

    uint256 public escrowCount;
    mapping(uint256 => ConditionalEscrow) public escrows;
    mapping(address => OracleProvider) public oracleProviders;
    mapping(address => bool) public isOracleProvider;
    
    // Multi-sig tracking
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    mapping(uint256 => uint256) public approvalCount;

    // API callback nonces
    mapping(bytes32 => bool) public usedApiCallbacks;
    
    address public owner;
    address public defaultPriceOracle;

    uint256 public constant MAX_CONDITIONS = 5;
    uint256 public constant MAX_EXPIRY_DAYS = 365;

    event ConditionalEscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        ConditionType[] conditionTypes
    );

    event ConditionMet(
        uint256 indexed escrowId,
        uint256 conditionIndex,
        ConditionType conditionType
    );

    event EscrowReleased(
        uint256 indexed escrowId,
        address indexed seller,
        uint256 amount,
        string releaseReason
    );

    event OracleRegistered(
        address indexed oracle,
        string name
    );

    event ApiCallbackReceived(
        uint256 indexed escrowId,
        bytes32 callbackId,
        bool conditionMet
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyOracle() {
        require(isOracleProvider[msg.sender], "Only registered oracle");
        _;
    }

    modifier escrowExists(uint256 _escrowId) {
        require(escrows[_escrowId].id != 0, "Escrow does not exist");
        _;
    }

    modifier onlyBuyer(uint256 _escrowId) {
        require(msg.sender == escrows[_escrowId].buyer, "Only buyer");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Register an oracle provider
     */
    function registerOracle(address _oracle, string memory _name) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle");
        require(!isOracleProvider[_oracle], "Already registered");

        oracleProviders[_oracle] = OracleProvider({
            oracleAddress: _oracle,
            name: _name,
            isActive: true,
            trustedSince: block.timestamp
        });
        
        isOracleProvider[_oracle] = true;
        
        emit OracleRegistered(_oracle, _name);
    }

    /**
     * @notice Set default price oracle
     */
    function setDefaultPriceOracle(address _oracle) external onlyOwner {
        require(isOracleProvider[_oracle], "Must be registered oracle");
        defaultPriceOracle = _oracle;
    }

    /**
     * @notice Create a conditional escrow
     */
    function createConditionalEscrow(
        address _seller,
        string memory _description,
        uint256 _expiryDays
    ) external payable {
        require(_seller != address(0), "Invalid seller");
        require(_seller != msg.sender, "Cannot escrow to self");
        require(msg.value > 0, "Must send ETH");
        require(_expiryDays > 0 && _expiryDays <= MAX_EXPIRY_DAYS, "Invalid expiry");

        escrowCount++;

        // Initialize with empty conditions array - conditions added separately
        ConditionalEscrow storage newEscrow = escrows[escrowCount];
        newEscrow.id = escrowCount;
        newEscrow.buyer = msg.sender;
        newEscrow.seller = _seller;
        newEscrow.amount = msg.value;
        newEscrow.description = _description;
        newEscrow.createdAt = block.timestamp;
        newEscrow.expiryDate = block.timestamp + (_expiryDays * 1 days);
        newEscrow.status = EscrowStatus.PENDING;

        emit ConditionalEscrowCreated(escrowCount, msg.sender, _seller, msg.value, new ConditionType[](0));
    }

    /**
     * @notice Add price condition to escrow
     */
    function addPriceCondition(
        uint256 _escrowId,
        bool _isAbove,          // true = above, false = below
        uint256 _priceThreshold,
        string memory _assetPair  // e.g., "ETH/USD"
    ) external escrowExists(_escrowId) onlyBuyer(_escrowId) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        require(escrow.conditions.length < MAX_CONDITIONS, "Max conditions reached");
        require(escrow.status == EscrowStatus.PENDING, "Escrow not pending");

        Condition memory condition = Condition({
            conditionType: _isAbove ? ConditionType.PRICE_ABOVE : ConditionType.PRICE_BELOW,
            oracle: defaultPriceOracle,
            parameters: abi.encode(_assetPair),
            threshold: _priceThreshold,
            apiEndpoint: "",
            isMet: false,
            metAt: 0
        });

        escrow.conditions.push(condition);
    }

    /**
     * @notice Add timestamp condition
     */
    function addTimestampCondition(
        uint256 _escrowId,
        uint256 _targetTimestamp
    ) external escrowExists(_escrowId) onlyBuyer(_escrowId) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        require(escrow.conditions.length < MAX_CONDITIONS, "Max conditions reached");
        require(escrow.status == EscrowStatus.PENDING, "Escrow not pending");
        require(_targetTimestamp > block.timestamp, "Must be future");
        require(_targetTimestamp <= escrow.expiryDate, "After escrow expiry");

        Condition memory condition = Condition({
            conditionType: ConditionType.TIMESTAMP_REACHED,
            oracle: address(0),
            parameters: abi.encode(_targetTimestamp),
            threshold: _targetTimestamp,
            apiEndpoint: "",
            isMet: false,
            metAt: 0
        });

        escrow.conditions.push(condition);
    }

    /**
     * @notice Add API callback condition
     */
    function addApiCondition(
        uint256 _escrowId,
        string memory _apiEndpoint,
        bytes32 _callbackId
    ) external escrowExists(_escrowId) onlyBuyer(_escrowId) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        require(escrow.conditions.length < MAX_CONDITIONS, "Max conditions reached");
        require(escrow.status == EscrowStatus.PENDING, "Escrow not pending");
        require(!usedApiCallbacks[_callbackId], "Callback ID used");

        Condition memory condition = Condition({
            conditionType: ConditionType.API_CALLBACK,
            oracle: address(0),
            parameters: abi.encode(_callbackId),
            threshold: 0,
            apiEndpoint: _apiEndpoint,
            isMet: false,
            metAt: 0
        });

        usedApiCallbacks[_callbackId] = true;
        escrow.conditions.push(condition);
    }

    /**
     * @notice Add multi-sig approval condition
     */
    function addMultisigCondition(
        uint256 _escrowId,
        address[] memory _approvers,
        uint256 _requiredApprovals
    ) external escrowExists(_escrowId) onlyBuyer(_escrowId) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        require(escrow.conditions.length < MAX_CONDITIONS, "Max conditions reached");
        require(escrow.status == EscrowStatus.PENDING, "Escrow not pending");
        require(_approvers.length >= _requiredApprovals, "Invalid requirement");
        require(_requiredApprovals > 0, "Need at least 1");

        Condition memory condition = Condition({
            conditionType: ConditionType.MULTISIG_APPROVAL,
            oracle: address(0),
            parameters: abi.encode(_approvers, _requiredApprovals),
            threshold: _requiredApprovals,
            apiEndpoint: "",
            isMet: false,
            metAt: 0
        });

        escrow.conditions.push(condition);
    }

    /**
     * @notice Check and update conditions (can be called by anyone)
     */
    function checkConditions(uint256 _escrowId) external escrowExists(_escrowId) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        require(escrow.status == EscrowStatus.PENDING, "Escrow not pending");

        bool allConditionsMet = true;
        bool anyConditionMet = false;
        bool isCompoundAnd = false;
        bool isCompoundOr = false;

        for (uint256 i = 0; i < escrow.conditions.length; i++) {
            Condition storage condition = escrow.conditions[i];
            
            if (condition.conditionType == ConditionType.TIMESTAMP_REACHED) {
                if (block.timestamp >= condition.threshold) {
                    condition.isMet = true;
                    condition.metAt = block.timestamp;
                    emit ConditionMet(_escrowId, i, condition.conditionType);
                }
            }
            
            // Track compound logic
            if (condition.conditionType == ConditionType.COMPOUND_AND) {
                isCompoundAnd = true;
            } else if (condition.conditionType == ConditionType.COMPOUND_OR) {
                isCompoundOr = true;
            } else {
                if (!condition.isMet) allConditionsMet = false;
                if (condition.isMet) anyConditionMet = true;
            }
        }

        // Determine if release condition is met
        bool shouldRelease = isCompoundAnd ? allConditionsMet : anyConditionMet;
        
        if (shouldRelease && escrow.status == EscrowStatus.PENDING) {
            escrow.status = EscrowStatus.CONDITION_MET;
        }
    }

    /**
     * @notice Submit oracle price update
     */
    function submitPriceUpdate(
        uint256 _escrowId,
        uint256 _conditionIndex,
        uint256 _currentPrice,
        uint256 _timestamp
    ) external onlyOracle escrowExists(_escrowId) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        require(_conditionIndex < escrow.conditions.length, "Invalid condition");
        
        Condition storage condition = escrow.conditions[_conditionIndex];
        require(
            condition.conditionType == ConditionType.PRICE_ABOVE || 
            condition.conditionType == ConditionType.PRICE_BELOW,
            "Not price condition"
        );

        bool priceConditionMet = false;
        if (condition.conditionType == ConditionType.PRICE_ABOVE) {
            priceConditionMet = _currentPrice >= condition.threshold;
        } else {
            priceConditionMet = _currentPrice <= condition.threshold;
        }

        if (priceConditionMet && !condition.isMet) {
            condition.isMet = true;
            condition.metAt = block.timestamp;
            emit ConditionMet(_escrowId, _conditionIndex, condition.conditionType);
        }
    }

    /**
     * @notice Submit API callback
     */
    function submitApiCallback(
        uint256 _escrowId,
        uint256 _conditionIndex,
        bytes32 _callbackId,
        bool _conditionMet
    ) external onlyOracle escrowExists(_escrowId) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        require(_conditionIndex < escrow.conditions.length, "Invalid condition");
        
        Condition storage condition = escrow.conditions[_conditionIndex];
        require(condition.conditionType == ConditionType.API_CALLBACK, "Not API condition");

        bytes32 storedCallbackId = abi.decode(condition.parameters, (bytes32));
        require(storedCallbackId == _callbackId, "Callback ID mismatch");

        if (_conditionMet && !condition.isMet) {
            condition.isMet = true;
            condition.metAt = block.timestamp;
            emit ConditionMet(_escrowId, _conditionIndex, condition.conditionType);
        }

        emit ApiCallbackReceived(_escrowId, _callbackId, _conditionMet);
    }

    /**
     * @notice Approve multi-sig condition
     */
    function approveMultisig(
        uint256 _escrowId,
        uint256 _conditionIndex
    ) external escrowExists(_escrowId) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        require(_conditionIndex < escrow.conditions.length, "Invalid condition");
        
        Condition storage condition = escrow.conditions[_conditionIndex];
        require(condition.conditionType == ConditionType.MULTISIG_APPROVAL, "Not multisig");
        require(!hasApproved[_escrowId][msg.sender], "Already approved");

        // Decode approved list from parameters (simplified)
        hasApproved[_escrowId][msg.sender] = true;
        approvalCount[_escrowId]++;

        if (approvalCount[_escrowId] >= condition.threshold && !condition.isMet) {
            condition.isMet = true;
            condition.metAt = block.timestamp;
            emit ConditionMet(_escrowId, _conditionIndex, condition.conditionType);
        }
    }

    /**
     * @notice Release escrow if conditions are met
     */
    function releaseIfConditionsMet(uint256 _escrowId) external escrowExists(_escrowId) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        require(escrow.status == EscrowStatus.CONDITION_MET, "Conditions not met");

        escrow.status = EscrowStatus.RELEASED;

        (bool success, ) = payable(escrow.seller).call{value: escrow.amount}("");
        require(success, "Transfer failed");

        emit EscrowReleased(_escrowId, escrow.seller, escrow.amount, "Conditions satisfied");
    }

    /**
     * @notice Refund if escrow expired
     */
    function refundIfExpired(uint256 _escrowId) external escrowExists(_escrowId) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        require(block.timestamp > escrow.expiryDate, "Not expired");
        require(escrow.status == EscrowStatus.PENDING || escrow.status == EscrowStatus.CONDITION_MET, "Invalid status");

        escrow.status = EscrowStatus.EXPIRED;

        (bool success, ) = payable(escrow.buyer).call{value: escrow.amount}("");
        require(success, "Refund failed");
    }

    /**
     * @notice Get escrow details with conditions
     */
    function getEscrow(uint256 _escrowId) external view returns (ConditionalEscrow memory) {
        ConditionalEscrow memory e = escrows[_escrowId];
        require(e.id != 0, "Escrow does not exist");
        return e;
    }

    /**
     * @notice Get condition status
     */
    function getConditionStatus(uint256 _escrowId) external view escrowExists(_escrowId) returns (
        bool[] memory metStatus,
        uint256[] memory metTimestamps
    ) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        
        metStatus = new bool[](escrow.conditions.length);
        metTimestamps = new uint256[](escrow.conditions.length);
        
        for (uint256 i = 0; i < escrow.conditions.length; i++) {
            metStatus[i] = escrow.conditions[i].isMet;
            metTimestamps[i] = escrow.conditions[i].metAt;
        }
    }

    /**
     * @notice Check if all conditions are met
     */
    function areConditionsMet(uint256 _escrowId) external view escrowExists(_escrowId) returns (bool) {
        ConditionalEscrow storage escrow = escrows[_escrowId];
        
        for (uint256 i = 0; i < escrow.conditions.length; i++) {
            if (!escrow.conditions[i].isMet) {
                return false;
            }
        }
        
        return escrow.conditions.length > 0;
    }

    /**
     * @notice Get buyer's conditional escrows
     */
    function getBuyerEscrows(address _buyer) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= escrowCount; i++) {
            if (escrows[i].buyer == _buyer) count++;
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= escrowCount; i++) {
            if (escrows[i].buyer == _buyer) {
                result[index] = i;
                index++;
            }
        }
        return result;
    }

    receive() external payable {}
}
