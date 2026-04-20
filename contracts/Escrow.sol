// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EscrowMarketplace {
    enum EscrowStatus {
        PENDING,
        COMPLETED,
        REFUNDED
    }

    struct Escrow {
        uint256 id;
        address buyer;
        address seller;
        uint256 amount;
        string description;
        uint256 createdAt;
        uint256 deadline; // unix timestamp, 0 = no deadline
        EscrowStatus status;
    }

    uint256 public escrowCount;
    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        string description,
        uint256 createdAt
    );

    event PaymentReleased(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint256 releasedAt
    );

    event PaymentRefunded(
        uint256 indexed escrowId,
        address indexed buyer,
        uint256 amount,
        uint256 refundedAt
    );

    event ExpiredRefundClaimed(
        uint256 indexed escrowId,
        address indexed buyer,
        uint256 amount,
        uint256 refundedAt
    );

    function createEscrow(address _seller, string memory _description) external payable {
        _createEscrow(_seller, _description, 0);
    }

    function createEscrowWithDeadline(address _seller, string memory _description, uint256 _deadlineDays) external payable {
        _createEscrow(_seller, _description, _deadlineDays);
    }

    function _createEscrow(address _seller, string memory _description, uint256 _deadlineDays) internal {
        require(_seller != address(0), "Seller cannot be zero address");
        require(_seller != msg.sender, "Buyer and seller cannot be same");
        require(msg.value > 0, "Amount must be greater than zero");

        escrowCount += 1;

        uint256 computedDeadline = 0;
        if (_deadlineDays > 0) {
            computedDeadline = block.timestamp + (_deadlineDays * 1 days);
        }

        escrows[escrowCount] = Escrow({
            id: escrowCount,
            buyer: msg.sender,
            seller: _seller,
            amount: msg.value,
            description: _description,
            createdAt: block.timestamp,
            deadline: computedDeadline,
            status: EscrowStatus.PENDING
        });

        emit EscrowCreated(
            escrowCount,
            msg.sender,
            _seller,
            msg.value,
            _description,
            block.timestamp
        );
    }

    function releasePayment(uint256 _escrowId) external {
        Escrow storage escrowItem = escrows[_escrowId];

        require(escrowItem.id != 0, "Escrow does not exist");
        require(msg.sender == escrowItem.buyer, "Only buyer can release payment");
        require(escrowItem.status == EscrowStatus.PENDING, "Escrow is not pending");

        escrowItem.status = EscrowStatus.COMPLETED;
        uint256 amount = escrowItem.amount;
        escrowItem.amount = 0;

        (bool success, ) = payable(escrowItem.seller).call{value: amount}("");
        require(success, "ETH transfer to seller failed");

        emit PaymentReleased(
            _escrowId,
            escrowItem.buyer,
            escrowItem.seller,
            amount,
            block.timestamp
        );
    }

    function refundBuyer(uint256 _escrowId) external {
        Escrow storage escrowItem = escrows[_escrowId];

        require(escrowItem.id != 0, "Escrow does not exist");
        require(msg.sender == escrowItem.buyer, "Only buyer can refund");
        require(escrowItem.status == EscrowStatus.PENDING, "Escrow is not pending");

        escrowItem.status = EscrowStatus.REFUNDED;
        uint256 amount = escrowItem.amount;
        escrowItem.amount = 0;

        (bool success, ) = payable(escrowItem.buyer).call{value: amount}("");
        require(success, "ETH refund to buyer failed");

        emit PaymentRefunded(_escrowId, escrowItem.buyer, amount, block.timestamp);
    }

    function isExpired(uint256 _escrowId) external view returns (bool) {
        Escrow memory escrowItem = escrows[_escrowId];
        require(escrowItem.id != 0, "Escrow does not exist");
        return escrowItem.status == EscrowStatus.PENDING && escrowItem.deadline > 0 && block.timestamp >= escrowItem.deadline;
    }

    function claimExpiredRefund(uint256 _escrowId) external {
        Escrow storage escrowItem = escrows[_escrowId];

        require(escrowItem.id != 0, "Escrow does not exist");
        require(escrowItem.status == EscrowStatus.PENDING, "Escrow is not pending");
        require(escrowItem.deadline > 0, "No deadline set");
        require(block.timestamp >= escrowItem.deadline, "Escrow not expired");

        escrowItem.status = EscrowStatus.REFUNDED;
        uint256 amount = escrowItem.amount;
        escrowItem.amount = 0;

        (bool success, ) = payable(escrowItem.buyer).call{value: amount}("");
        require(success, "ETH refund to buyer failed");

        emit PaymentRefunded(_escrowId, escrowItem.buyer, amount, block.timestamp);
        emit ExpiredRefundClaimed(_escrowId, escrowItem.buyer, amount, block.timestamp);
    }

    function getEscrow(uint256 _escrowId) external view returns (Escrow memory) {
        Escrow memory escrowItem = escrows[_escrowId];
        require(escrowItem.id != 0, "Escrow does not exist");
        return escrowItem;
    }

    function getAllEscrows() external view returns (Escrow[] memory) {
        Escrow[] memory allEscrows = new Escrow[](escrowCount);

        for (uint256 i = 1; i <= escrowCount; i++) {
            allEscrows[i - 1] = escrows[i];
        }

        return allEscrows;
    }
}
