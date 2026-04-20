// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title EscrowAuction
 * @notice A reverse Dutch auction for escrow services. Sellers bid down from a max budget.
 *         When buyer accepts, an escrow is created at that price.
 *         This transforms EscrowX into a decentralized freelance marketplace.
 */
contract EscrowAuction {
    struct AuctionListing {
        uint256 id;
        address buyer;
        string jobDescription;
        string requiredSkills;      // JSON string array
        uint256 maxBudgetWei;
        uint256 startPrice;
        uint256 floorPrice;
        uint256 startTime;
        uint256 duration;
        uint256 decrementPerHour;
        bool filled;
        uint256 winningBidIndex;
        address winner;
    }

    struct Bid {
        address seller;
        uint256 bidAmount;
        string proposalHash;      // IPFS hash
        uint256 timestamp;
    }

    uint256 public listingCount;
    mapping(uint256 => AuctionListing) public listings;
    mapping(uint256 => Bid[]) public bids;

    // Reference to main escrow contract
    address public escrowMarketplace;

    // Efficient lookup
    mapping(address => uint256[]) public buyerListings;
    mapping(address => uint256[]) public sellerBids;

    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 30 days;
    uint256 public constant MIN_BID = 0.001 ether;

    event ListingCreated(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 maxBudget,
        uint256 startPrice,
        uint256 floorPrice,
        uint256 startTime,
        uint256 duration
    );

    event BidPlaced(
        uint256 indexed listingId,
        address indexed seller,
        uint256 bidAmount,
        string proposalHash
    );

    event BidAccepted(
        uint256 indexed listingId,
        address indexed seller,
        uint256 finalPrice,
        uint256 escrowId
    );

    event ListingCancelled(
        uint256 indexed listingId,
        uint256 cancelledAt
    );

    modifier listingExists(uint256 _listingId) {
        require(listings[_listingId].id != 0, "Listing does not exist");
        _;
    }

    modifier onlyBuyer(uint256 _listingId) {
        require(msg.sender == listings[_listingId].buyer, "Only buyer can call");
        _;
    }

    modifier notFilled(uint256 _listingId) {
        require(!listings[_listingId].filled, "Listing already filled");
        _;
    }

    constructor(address _escrowMarketplace) {
        require(_escrowMarketplace != address(0), "Invalid escrow address");
        escrowMarketplace = _escrowMarketplace;
    }

    /**
     * @notice Create a new Dutch auction listing
     * @param _jobDescription Description of the work needed
     * @param _skills Comma-separated list of required skills
     * @param _maxBudget Maximum budget (and locked amount)
     * @param _floorPrice Lowest acceptable price (auction stops here)
     * @param _durationHours Auction duration in hours
     * @param _decrementPerHour How much price drops per hour
     */
    function createListing(
        string memory _jobDescription,
        string memory _skills,
        uint256 _maxBudget,
        uint256 _floorPrice,
        uint256 _durationHours,
        uint256 _decrementPerHour
    ) external payable {
        require(_maxBudget > 0 && _maxBudget >= MIN_BID * 10, "Budget too small");
        require(_floorPrice >= MIN_BID && _floorPrice <= _maxBudget, "Invalid floor price");
        require(_durationHours >= 1 && _durationHours <= 720, "Duration 1-720 hours");
        require(msg.value == _maxBudget, "Must lock max budget");
        require(_decrementPerHour > 0, "Decrement must be > 0");
        require(
            _maxBudget - (_decrementPerHour * _durationHours) <= _floorPrice || 
            _decrementPerHour * _durationHours >= _maxBudget - _floorPrice,
            "Decrement too small for duration"
        );

        listingCount++;
        uint256 durationSeconds = _durationHours * 1 hours;

        listings[listingCount] = AuctionListing({
            id: listingCount,
            buyer: msg.sender,
            jobDescription: _jobDescription,
            requiredSkills: _skills,
            maxBudgetWei: _maxBudget,
            startPrice: _maxBudget,
            floorPrice: _floorPrice,
            startTime: block.timestamp,
            duration: durationSeconds,
            decrementPerHour: _decrementPerHour,
            filled: false,
            winningBidIndex: 0,
            winner: address(0)
        });

        buyerListings[msg.sender].push(listingCount);

        emit ListingCreated(
            listingCount,
            msg.sender,
            _maxBudget,
            _maxBudget,
            _floorPrice,
            block.timestamp,
            durationSeconds
        );
    }

    /**
     * @notice Calculate current Dutch price
     * @param _listingId ID of the listing
     * @return Current price (clamped to floorPrice)
     */
    function getCurrentPrice(uint256 _listingId) public view listingExists(_listingId) returns (uint256) {
        AuctionListing memory listing = listings[_listingId];
        
        if (listing.filled || block.timestamp >= listing.startTime + listing.duration) {
            return listing.floorPrice;
        }

        uint256 elapsedHours = (block.timestamp - listing.startTime) / 1 hours;
        uint256 priceDrop = elapsedHours * listing.decrementPerHour;
        
        if (priceDrop >= listing.startPrice - listing.floorPrice) {
            return listing.floorPrice;
        }

        return listing.startPrice - priceDrop;
    }

    /**
     * @notice Place a bid at or below current Dutch price
     * @param _listingId ID of the listing
     * @param _proposalHash IPFS hash of proposal document
     */
    function placeBid(
        uint256 _listingId, 
        string memory _proposalHash
    ) external listingExists(_listingId) notFilled(_listingId) {
        AuctionListing storage listing = listings[_listingId];
        
        require(block.timestamp < listing.startTime + listing.duration, "Auction ended");
        require(msg.sender != listing.buyer, "Buyer cannot bid");

        uint256 currentPrice = getCurrentPrice(_listingId);
        
        // Bid at current price (Dutch auction style)
        uint256 bidAmount = currentPrice;
        require(bidAmount >= listing.floorPrice, "Auction at floor price, accept directly");

        // Check if seller already bid
        for (uint256 i = 0; i < bids[_listingId].length; i++) {
            require(bids[_listingId][i].seller != msg.sender, "Already bid");
        }

        bids[_listingId].push(Bid({
            seller: msg.sender,
            bidAmount: bidAmount,
            proposalHash: _proposalHash,
            timestamp: block.timestamp
        }));

        sellerBids[msg.sender].push(_listingId);

        emit BidPlaced(_listingId, msg.sender, bidAmount, _proposalHash);

        // If bid at floor price, auto-accept
        if (bidAmount == listing.floorPrice) {
            _acceptBid(_listingId, bids[_listingId].length - 1);
        }
    }

    /**
     * @notice Accept a specific bid and create escrow
     * @param _listingId ID of the listing
     * @param _bidIndex Index of the bid to accept
     */
    function acceptBid(uint256 _listingId, uint256 _bidIndex) 
        external 
        listingExists(_listingId) 
        onlyBuyer(_listingId) 
        notFilled(_listingId) 
    {
        require(_bidIndex < bids[_listingId].length, "Invalid bid index");
        _acceptBid(_listingId, _bidIndex);
    }

    function _acceptBid(uint256 _listingId, uint256 _bidIndex) internal {
        AuctionListing storage listing = listings[_listingId];
        Bid memory winningBid = bids[_listingId][_bidIndex];

        listing.filled = true;
        listing.winningBidIndex = _bidIndex;
        listing.winner = winningBid.seller;

        // Create escrow in main contract via low-level call
        // Note: In production, consider a direct integration or escrow factory pattern
        (bool success, ) = escrowMarketplace.call{value: winningBid.bidAmount}(
            abi.encodeWithSignature("createEscrow(address,string)", winningBid.seller, listing.jobDescription)
        );
        
        require(success, "Escrow creation failed");

        // Refund excess to buyer
        uint256 excess = listing.maxBudgetWei - winningBid.bidAmount;
        if (excess > 0) {
            (bool refundSuccess, ) = payable(listing.buyer).call{value: excess}("");
            require(refundSuccess, "Refund failed");
        }

        emit BidAccepted(_listingId, winningBid.seller, winningBid.bidAmount, 0); // escrow ID would be fetched in production
    }

    /**
     * @notice Cancel listing and refund (only if no bids)
     */
    function cancelListing(uint256 _listingId) 
        external 
        listingExists(_listingId) 
        onlyBuyer(_listingId) 
        notFilled(_listingId) 
    {
        require(bids[_listingId].length == 0, "Cannot cancel with bids");
        
        AuctionListing storage listing = listings[_listingId];
        listing.filled = true; // Mark as filled to prevent future interaction

        (bool success, ) = payable(listing.buyer).call{value: listing.maxBudgetWei}("");
        require(success, "Refund failed");

        emit ListingCancelled(_listingId, block.timestamp);
    }

    /**
     * @notice Get all bids for a listing
     */
    function getBids(uint256 _listingId) external view returns (Bid[] memory) {
        return bids[_listingId];
    }

    /**
     * @notice Get listing details
     */
    function getListing(uint256 _listingId) external view returns (AuctionListing memory) {
        AuctionListing memory listing = listings[_listingId];
        require(listing.id != 0, "Listing does not exist");
        return listing;
    }

    /**
     * @notice Get listings for a buyer
     */
    function getBuyerListings(address _buyer) external view returns (uint256[] memory) {
        return buyerListings[_buyer];
    }

    /**
     * @notice Get listings where seller has bid
     */
    function getSellerBids(address _seller) external view returns (uint256[] memory) {
        return sellerBids[_seller];
    }

    /**
     * @notice Get time remaining in auction
     */
    function getTimeRemaining(uint256 _listingId) external view listingExists(_listingId) returns (uint256) {
        AuctionListing memory listing = listings[_listingId];
        if (listing.filled || block.timestamp >= listing.startTime + listing.duration) {
            return 0;
        }
        return (listing.startTime + listing.duration) - block.timestamp;
    }

    /**
     * @notice Get price curve data for visualization
     */
    function getPriceCurve(uint256 _listingId) external view listingExists(_listingId) returns (
        uint256 startPrice,
        uint256 floorPrice,
        uint256 currentPrice,
        uint256 decrementPerHour,
        uint256 startTime,
        uint256 endTime
    ) {
        AuctionListing memory listing = listings[_listingId];
        return (
            listing.startPrice,
            listing.floorPrice,
            getCurrentPrice(_listingId),
            listing.decrementPerHour,
            listing.startTime,
            listing.startTime + listing.duration
        );
    }
}
