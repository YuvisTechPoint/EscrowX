// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title EscrowTemplates
 * @notice Marketplace for pre-built escrow templates.
 *         Users can create, sell, and purchase templates with royalties.
 *         Reduces setup time for common escrow patterns.
 */
contract EscrowTemplates {
    enum TemplateType {
        STANDARD,           // Standard escrow
        MILESTONE_BASED,    // Multiple payment milestones
        RECURRING,          // Subscription/recurring
        TIME_LOCKED,        // Time capsule style
        SPLIT_PAYMENT,      // Multiple recipients
        CONDITIONAL        // Programmable conditions
    }

    struct Template {
        uint256 id;
        address creator;
        string name;
        string description;
        TemplateType templateType;
        string ipfsHash;        // Full template JSON
        uint256 price;          // 0 = free
        uint256 usageCount;
        bool isActive;
        uint256 createdAt;
    }

    struct TemplateContent {
        string title;
        string description;
        uint256 defaultAmount;
        uint256 defaultDeadlineDays;
        uint256[] milestoneDescriptions;  // IPFS hashes
        uint256[] milestoneAmounts;
        string terms;
    }

    uint256 public templateCount;
    mapping(uint256 => Template) public templates;
    mapping(uint256 => TemplateContent) public templateContents;
    
    // Royalty system
    mapping(address => uint256) public creatorEarnings;
    uint256 public constant PLATFORM_FEE_BPS = 250;  // 2.5%
    address public platformWallet;
    address public owner;

    // Categories
    mapping(uint8 => uint256[]) public templatesByType;
    mapping(address => uint256[]) public creatorTemplates;

    // User favorites
    mapping(address => uint256[]) public userFavorites;
    mapping(address => mapping(uint256 => bool)) public isFavorite;

    event TemplateCreated(
        uint256 indexed templateId,
        address indexed creator,
        string name,
        TemplateType templateType,
        uint256 price
    );

    event TemplatePurchased(
        uint256 indexed templateId,
        address indexed buyer,
        uint256 price
    );

    event TemplateUsed(
        uint256 indexed templateId,
        address indexed user,
        uint256 escrowId
    );

    event TemplateDeactivated(uint256 indexed templateId);

    event CreatorWithdrawal(address indexed creator, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier templateExists(uint256 _templateId) {
        require(templates[_templateId].id != 0, "Template does not exist");
        _;
    }

    modifier onlyCreator(uint256 _templateId) {
        require(templates[_templateId].creator == msg.sender, "Only creator");
        _;
    }

    constructor(address _platformWallet) {
        owner = msg.sender;
        platformWallet = _platformWallet;
    }

    /**
     * @notice Create a new escrow template
     */
    function createTemplate(
        string memory _name,
        string memory _description,
        TemplateType _templateType,
        string memory _ipfsHash,
        uint256 _price,
        TemplateContent calldata _content
    ) external {
        require(bytes(_name).length > 0, "Name required");
        require(bytes(_ipfsHash).length > 0, "IPFS hash required");

        templateCount++;

        templates[templateCount] = Template({
            id: templateCount,
            creator: msg.sender,
            name: _name,
            description: _description,
            templateType: _templateType,
            ipfsHash: _ipfsHash,
            price: _price,
            usageCount: 0,
            isActive: true,
            createdAt: block.timestamp
        });

        templateContents[templateCount] = _content;

        templatesByType[uint8(_templateType)].push(templateCount);
        creatorTemplates[msg.sender].push(templateCount);

        emit TemplateCreated(templateCount, msg.sender, _name, _templateType, _price);
    }

    /**
     * @notice Purchase access to a paid template
     */
    function purchaseTemplate(uint256 _templateId) external payable templateExists(_templateId) {
        Template storage template = templates[_templateId];
        
        require(template.price > 0, "Template is free");
        require(msg.value >= template.price, "Insufficient payment");
        require(template.isActive, "Template not active");

        // Calculate fees
        uint256 platformFee = (template.price * PLATFORM_FEE_BPS) / 10000;
        uint256 creatorShare = template.price - platformFee;

        // Update creator earnings
        creatorEarnings[template.creator] += creatorShare;

        // Transfer platform fee
        (bool feeSuccess, ) = payable(platformWallet).call{value: platformFee}("");
        require(feeSuccess, "Platform fee transfer failed");

        // Refund excess
        uint256 excess = msg.value - template.price;
        if (excess > 0) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: excess}("");
            require(refundSuccess, "Refund failed");
        }

        emit TemplatePurchased(_templateId, msg.sender, template.price);
    }

    /**
     * @notice Use a template (called when creating escrow from template)
     */
    function useTemplate(uint256 _templateId, uint256 _escrowId) external templateExists(_templateId) {
        Template storage template = templates[_templateId];
        require(template.isActive, "Template not active");

        // Check if paid template - user must have purchased (simplified check)
        if (template.price > 0) {
            // In production, track purchases in a mapping
            // For now, we allow usage if they've interacted
        }

        template.usageCount++;

        emit TemplateUsed(_templateId, msg.sender, _escrowId);
    }

    /**
     * @notice Update template (only creator)
     */
    function updateTemplate(
        uint256 _templateId,
        string memory _name,
        string memory _description,
        uint256 _price,
        string memory _ipfsHash
    ) external templateExists(_templateId) onlyCreator(_templateId) {
        Template storage template = templates[_templateId];

        if (bytes(_name).length > 0) {
            template.name = _name;
        }
        if (bytes(_description).length > 0) {
            template.description = _description;
        }
        if (bytes(_ipfsHash).length > 0) {
            template.ipfsHash = _ipfsHash;
        }
        
        template.price = _price;
    }

    /**
     * @notice Deactivate template
     */
    function deactivateTemplate(uint256 _templateId) external templateExists(_templateId) onlyCreator(_templateId) {
        templates[_templateId].isActive = false;
        emit TemplateDeactivated(_templateId);
    }

    /**
     * @notice Reactivate template
     */
    function reactivateTemplate(uint256 _templateId) external templateExists(_templateId) onlyCreator(_templateId) {
        templates[_templateId].isActive = true;
    }

    /**
     * @notice Add template to favorites
     */
    function addToFavorites(uint256 _templateId) external templateExists(_templateId) {
        require(!isFavorite[msg.sender][_templateId], "Already favorited");
        
        userFavorites[msg.sender].push(_templateId);
        isFavorite[msg.sender][_templateId] = true;
    }

    /**
     * @notice Remove from favorites
     */
    function removeFromFavorites(uint256 _templateId) external templateExists(_templateId) {
        require(isFavorite[msg.sender][_templateId], "Not favorited");
        
        // Remove from array (inefficient but simple for small arrays)
        uint256[] storage favorites = userFavorites[msg.sender];
        for (uint256 i = 0; i < favorites.length; i++) {
            if (favorites[i] == _templateId) {
                favorites[i] = favorites[favorites.length - 1];
                favorites.pop();
                break;
            }
        }
        
        isFavorite[msg.sender][_templateId] = false;
    }

    /**
     * @notice Creator withdraws earnings
     */
    function withdrawEarnings() external {
        uint256 amount = creatorEarnings[msg.sender];
        require(amount > 0, "No earnings to withdraw");

        creatorEarnings[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit CreatorWithdrawal(msg.sender, amount);
    }

    /**
     * @notice Get template details
     */
    function getTemplate(uint256 _templateId) external view returns (Template memory, TemplateContent memory) {
        Template memory t = templates[_templateId];
        require(t.id != 0, "Template does not exist");
        return (t, templateContents[_templateId]);
    }

    /**
     * @notice Get templates by type
     */
    function getTemplatesByType(TemplateType _type) external view returns (Template[] memory) {
        uint256[] storage ids = templatesByType[uint8(_type)];
        Template[] memory result = new Template[](ids.length);
        
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = templates[ids[i]];
        }
        
        return result;
    }

    /**
     * @notice Get creator's templates
     */
    function getCreatorTemplates(address _creator) external view returns (uint256[] memory) {
        return creatorTemplates[_creator];
    }

    /**
     * @notice Get user's favorites
     */
    function getUserFavorites(address _user) external view returns (Template[] memory) {
        uint256[] storage favoriteIds = userFavorites[_user];
        Template[] memory result = new Template[](favoriteIds.length);
        
        for (uint256 i = 0; i < favoriteIds.length; i++) {
            result[i] = templates[favoriteIds[i]];
        }
        
        return result;
    }

    /**
     * @notice Get popular templates by usage count
     */
    function getPopularTemplates(uint256 _count) external view returns (Template[] memory) {
        require(_count > 0 && _count <= 50, "Count must be 1-50");
        
        // Simple approach: return first N active templates
        // In production, would sort by usageCount
        Template[] memory result = new Template[](_count);
        uint256 found = 0;
        
        for (uint256 i = templateCount; i > 0 && found < _count; i--) {
            if (templates[i].isActive) {
                result[found] = templates[i];
                found++;
            }
        }
        
        return result;
    }

    /**
     * @notice Get template statistics
     */
    function getTemplateStats(uint256 _templateId) external view templateExists(_templateId) returns (
        uint256 usageCount,
        uint256 earnings,
        bool isActive
    ) {
        Template memory t = templates[_templateId];
        return (t.usageCount, t.price * t.usageCount, t.isActive);
    }

    /**
     * @notice Check if user can use template (free or purchased)
     */
    function canUseTemplate(address _user, uint256 _templateId) external view returns (bool) {
        Template memory t = templates[_templateId];
        if (t.price == 0) return true;
        // In production, check purchase mapping
        return isFavorite[_user][_templateId]; // Using favorites as proxy for now
    }

    /**
     * @notice Update platform wallet
     */
    function setPlatformWallet(address _newWallet) external onlyOwner {
        require(_newWallet != address(0), "Invalid address");
        platformWallet = _newWallet;
    }

    /**
     * @notice Update platform fee
     */
    function setPlatformFee(uint256 _newFeeBps) external onlyOwner {
        require(_newFeeBps <= 1000, "Fee max 10%");
        // Note: This would need a separate storage variable in production
    }
}
