// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Escrow.sol";

/**
 * @title EscrowCollateral
 * @notice Use locked escrow as collateral for DeFi loans.
 *         Seller can borrow against their pending payment.
 *         Lenders earn interest; if seller defaults, lender can claim the escrow.
 */
contract EscrowCollateral {
    enum LoanStatus {
        ACTIVE,
        REPAID,
        DEFAULTED,
        LIQUIDATED
    }

    struct Loan {
        uint256 id;
        address borrower;           // Seller in escrow
        address lender;
        uint256 escrowId;
        address escrowContract;
        uint256 loanAmount;
        uint256 interestRateBps;    // Annual rate
        uint256 duration;
        uint256 startTime;
        uint256 dueDate;
        uint256 repaidAmount;
        LoanStatus status;
        bool escrowClaimed;
    }

    struct LoanOffer {
        uint256 id;
        address lender;
        uint256 maxAmount;
        uint256 minInterestBps;
        uint256 maxDuration;
        uint256 totalFunded;
        bool active;
    }

    uint256 public loanCount;
    uint256 public offerCount;
    
    mapping(uint256 => Loan) public loans;
    mapping(uint256 => LoanOffer) public offers;
    mapping(address => uint256[]) public borrowerLoans;
    mapping(address => uint256[]) public lenderLoans;
    mapping(address => uint256[]) public lenderOffers;
    
    // Escrow tracking
    mapping(address => mapping(uint256 => bool)) public escrowHasActiveLoan;
    mapping(address => mapping(uint256 => uint256)) public escrowToLoan;

    // Parameters
    uint256 public constant MAX_LTV_BPS = 7000;         // 70% max loan-to-value
    uint256 public constant LIQUIDATION_THRESHOLD = 8000; // 80% triggers liquidation
    uint256 public constant PLATFORM_FEE_BPS = 100;    // 1%
    uint256 public constant MIN_INTEREST_BPS = 500;      // 5% min APR
    uint256 public constant MAX_INTEREST_BPS = 5000;     // 50% max APR
    
    address public platformWallet;
    address public owner;

    event LoanOfferCreated(
        uint256 indexed offerId,
        address indexed lender,
        uint256 maxAmount,
        uint256 minInterestBps
    );

    event LoanTaken(
        uint256 indexed loanId,
        uint256 indexed offerId,
        address indexed borrower,
        uint256 escrowId,
        uint256 amount
    );

    event LoanRepaid(
        uint256 indexed loanId,
        uint256 amount,
        uint256 interest
    );

    event LoanDefaulted(
        uint256 indexed loanId,
        uint256 escrowClaimed
    );

    event Liquidation(
        uint256 indexed loanId,
        address indexed liquidator,
        uint256 escrowAmount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier loanExists(uint256 _loanId) {
        require(loans[_loanId].id != 0, "Loan does not exist");
        _;
    }

    modifier offerExists(uint256 _offerId) {
        require(offers[_offerId].id != 0, "Offer does not exist");
        _;
    }

    constructor(address _platformWallet) {
        owner = msg.sender;
        platformWallet = _platformWallet;
    }

    /**
     * @notice Create a loan offer
     */
    function createOffer(
        uint256 _maxAmount,
        uint256 _minInterestBps,
        uint256 _maxDuration
    ) external payable {
        require(_maxAmount > 0, "Max amount required");
        require(_minInterestBps >= MIN_INTEREST_BPS && _minInterestBps <= MAX_INTEREST_BPS, "Invalid interest");
        require(_maxDuration >= 7 days && _maxDuration <= 365 days, "Duration 7-365 days");
        require(msg.value >= _maxAmount, "Must fund offer");

        offerCount++;

        offers[offerCount] = LoanOffer({
            id: offerCount,
            lender: msg.sender,
            maxAmount: _maxAmount,
            minInterestBps: _minInterestBps,
            maxDuration: _maxDuration,
            totalFunded: msg.value,
            active: true
        });

        lenderOffers[msg.sender].push(offerCount);

        emit LoanOfferCreated(offerCount, msg.sender, _maxAmount, _minInterestBps);
    }

    /**
     * @notice Take a loan against an escrow
     */
    function takeLoan(
        uint256 _offerId,
        uint256 _escrowId,
        address _escrowContract,
        uint256 _amount,
        uint256 _interestBps,
        uint256 _duration
    ) external offerExists(_offerId) {
        LoanOffer storage offer = offers[_offerId];
        
        require(offer.active, "Offer not active");
        require(offer.lender != msg.sender, "Cannot borrow from self");
        require(!escrowHasActiveLoan[_escrowContract][_escrowId], "Escrow already collateralized");
        require(_amount <= offer.maxAmount, "Exceeds offer max");
        require(_amount <= offer.totalFunded, "Insufficient offer funds");
        require(_interestBps >= offer.minInterestBps, "Interest too low");
        require(_duration <= offer.maxDuration, "Duration too long");

        // Verify escrow exists and is valid
        (bool success, bytes memory data) = _escrowContract.call(
            abi.encodeWithSignature("escrows(uint256)", _escrowId)
        );
        require(success && data.length > 0, "Invalid escrow");

        // Decode escrow data - simplified, would need proper interface in production
        // For now we assume the escrow is valid and seller = msg.sender

        loanCount++;

        loans[loanCount] = Loan({
            id: loanCount,
            borrower: msg.sender,
            lender: offer.lender,
            escrowId: _escrowId,
            escrowContract: _escrowContract,
            loanAmount: _amount,
            interestRateBps: _interestBps,
            duration: _duration,
            startTime: block.timestamp,
            dueDate: block.timestamp + _duration,
            repaidAmount: 0,
            status: LoanStatus.ACTIVE,
            escrowClaimed: false
        });

        escrowHasActiveLoan[_escrowContract][_escrowId] = true;
        escrowToLoan[_escrowContract][_escrowId] = loanCount;

        borrowerLoans[msg.sender].push(loanCount);
        lenderLoans[offer.lender].push(loanCount);

        // Update offer
        offer.totalFunded -= _amount;
        if (offer.totalFunded == 0) {
            offer.active = false;
        }

        // Transfer loan amount
        (bool transferSuccess, ) = payable(msg.sender).call{value: _amount}("");
        require(transferSuccess, "Loan transfer failed");

        emit LoanTaken(loanCount, _offerId, msg.sender, _escrowId, _amount);
    }

    /**
     * @notice Repay loan (partial or full)
     */
    function repayLoan(uint256 _loanId) external payable loanExists(_loanId) {
        Loan storage loan = loans[_loanId];
        
        require(loan.borrower == msg.sender, "Only borrower");
        require(loan.status == LoanStatus.ACTIVE, "Loan not active");
        require(block.timestamp <= loan.dueDate, "Loan overdue");
        require(msg.value > 0, "Payment required");

        uint256 totalDue = calculateTotalDue(_loanId);
        require(msg.value <= totalDue, "Overpayment");

        loan.repaidAmount += msg.value;

        // Calculate interest portion
        uint256 interest = (msg.value * loan.interestRateBps) / 10000;
        uint256 principal = msg.value - interest;

        // Platform fee
        uint256 platformFee = (interest * PLATFORM_FEE_BPS) / 10000;
        uint256 lenderInterest = interest - platformFee;

        // Transfer to lender
        (bool lenderSuccess, ) = payable(loan.lender).call{value: principal + lenderInterest}("");
        require(lenderSuccess, "Lender transfer failed");

        // Transfer platform fee
        if (platformFee > 0) {
            (bool feeSuccess, ) = payable(platformWallet).call{value: platformFee}("");
            require(feeSuccess, "Fee transfer failed");
        }

        // Check if fully repaid
        if (loan.repaidAmount >= totalDue) {
            loan.status = LoanStatus.REPAID;
            escrowHasActiveLoan[loan.escrowContract][loan.escrowId] = false;
        }

        emit LoanRepaid(_loanId, msg.value, interest);
    }

    /**
     * @notice Mark loan as defaulted after due date
     */
    function markDefaulted(uint256 _loanId) external loanExists(_loanId) {
        Loan storage loan = loans[_loanId];
        
        require(block.timestamp > loan.dueDate, "Not yet due");
        require(loan.status == LoanStatus.ACTIVE, "Loan not active");
        require(loan.repaidAmount < loan.loanAmount, "Already repaid");

        loan.status = LoanStatus.DEFAULTED;

        emit LoanDefaulted(_loanId, 0); // Escrow not yet claimed
    }

    /**
     * @notice Claim escrow on defaulted loan
     */
    function claimEscrow(uint256 _loanId) external loanExists(_loanId) {
        Loan storage loan = loans[_loanId];
        
        require(loan.lender == msg.sender, "Only lender");
        require(loan.status == LoanStatus.DEFAULTED, "Loan not defaulted");
        require(!loan.escrowClaimed, "Already claimed");

        loan.escrowClaimed = true;
        loan.status = LoanStatus.LIQUIDATED;
        escrowHasActiveLoan[loan.escrowContract][loan.escrowId] = false;

        // Attempt to claim escrow from main contract
        // This would require integration with the escrow contract
        // For now, we record the claim event

        emit Liquidation(_loanId, msg.sender, loan.loanAmount);
    }

    /**
     * @notice Calculate total amount due including interest
     */
    function calculateTotalDue(uint256 _loanId) public view loanExists(_loanId) returns (uint256) {
        Loan memory loan = loans[_loanId];
        
        uint256 timeElapsed = block.timestamp - loan.startTime;
        uint256 interest = (loan.loanAmount * loan.interestRateBps * timeElapsed) / (365 days * 10000);
        
        return loan.loanAmount + interest;
    }

    /**
     * @notice Calculate remaining balance
     */
    function getRemainingBalance(uint256 _loanId) external view loanExists(_loanId) returns (uint256) {
        Loan memory loan = loans[_loanId];
        uint256 totalDue = calculateTotalDue(_loanId);
        
        if (loan.repaidAmount >= totalDue) {
            return 0;
        }
        return totalDue - loan.repaidAmount;
    }

    /**
     * @notice Get loan details
     */
    function getLoan(uint256 _loanId) external view returns (Loan memory) {
        Loan memory l = loans[_loanId];
        require(l.id != 0, "Loan does not exist");
        return l;
    }

    /**
     * @notice Get offer details
     */
    function getOffer(uint256 _offerId) external view returns (LoanOffer memory) {
        LoanOffer memory o = offers[_offerId];
        require(o.id != 0, "Offer does not exist");
        return o;
    }

    /**
     * @notice Get borrower's loans
     */
    function getBorrowerLoans(address _borrower) external view returns (uint256[] memory) {
        return borrowerLoans[_borrower];
    }

    /**
     * @notice Get lender's loans
     */
    function getLenderLoans(address _lender) external view returns (uint256[] memory) {
        return lenderLoans[_lender];
    }

    /**
     * @notice Get active offers
     */
    function getActiveOffers() external view returns (uint256[] memory) {
        // Count first
        uint256 count = 0;
        for (uint256 i = 1; i <= offerCount; i++) {
            if (offers[i].active) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= offerCount; i++) {
            if (offers[i].active) {
                result[index] = i;
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Check if escrow can be used as collateral
     */
    function canUseAsCollateral(
        address _escrowContract,
        uint256 _escrowId,
        uint256 _escrowAmount
    ) external view returns (bool, uint256 maxLoan) {
        if (escrowHasActiveLoan[_escrowContract][_escrowId]) {
            return (false, 0);
        }
        
        uint256 maxLoanAmount = (_escrowAmount * MAX_LTV_BPS) / 10000;
        return (true, maxLoanAmount);
    }

    /**
     * @notice Cancel offer and withdraw remaining funds
     */
    function cancelOffer(uint256 _offerId) external offerExists(_offerId) {
        LoanOffer storage offer = offers[_offerId];
        require(offer.lender == msg.sender, "Only lender");
        require(offer.active, "Not active");

        offer.active = false;

        uint256 refund = offer.totalFunded;
        if (refund > 0) {
            offer.totalFunded = 0;
            (bool success, ) = payable(msg.sender).call{value: refund}("");
            require(success, "Refund failed");
        }
    }

    /**
     * @notice Add funds to existing offer
     */
    function fundOffer(uint256 _offerId) external payable offerExists(_offerId) {
        LoanOffer storage offer = offers[_offerId];
        require(offer.lender == msg.sender, "Only lender");
        require(msg.value > 0, "Must send ETH");

        offer.totalFunded += msg.value;
        offer.active = true;
    }

    /**
     * @notice Get loan health factor
     */
    function getHealthFactor(uint256 _loanId) external view loanExists(_loanId) returns (uint256 factorBps) {
        Loan memory loan = loans[_loanId];
        
        if (loan.status != LoanStatus.ACTIVE) {
            return 0;
        }

        uint256 totalDue = calculateTotalDue(_loanId);
        uint256 collateralValue = loan.loanAmount * 10000 / MAX_LTV_BPS; // Approximate

        if (totalDue == 0) return 10000;
        
        return (collateralValue * 10000) / totalDue;
    }

    receive() external payable {}
}
