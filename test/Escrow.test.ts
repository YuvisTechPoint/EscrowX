import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;

describe("EscrowMarketplace", function () {
  async function deployFixture() {
    const [buyer, seller, attacker] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory("EscrowMarketplace");
    const escrow = await Escrow.deploy();
    await escrow.waitForDeployment();

    return { escrow, buyer, seller, attacker };
  }

  it("creates escrow with correct ETH deposit", async function () {
    const { escrow, buyer, seller } = await loadFixture(deployFixture);
    const deposit = ethers.parseEther("1");

    await expect(
      escrow.connect(buyer).createEscrow(seller.address, "Laptop", { value: deposit })
    ).to.emit(escrow, "EscrowCreated");

    const created = await escrow.getEscrow(1);
    expect(created.buyer).to.equal(buyer.address);
    expect(created.seller).to.equal(seller.address);
    expect(created.amount).to.equal(deposit);
    expect(created.status).to.equal(0n);
  });

  it("releases payment to seller", async function () {
    const { escrow, buyer, seller } = await loadFixture(deployFixture);
    const deposit = ethers.parseEther("1");

    await escrow.connect(buyer).createEscrow(seller.address, "Work", { value: deposit });

    const sellerBefore = await ethers.provider.getBalance(seller.address);
    const tx = await escrow.connect(buyer).releasePayment(1);
    await tx.wait();
    const sellerAfter = await ethers.provider.getBalance(seller.address);

    expect(sellerAfter - sellerBefore).to.equal(deposit);

    const item = await escrow.getEscrow(1);
    expect(item.status).to.equal(1n);
    expect(item.amount).to.equal(0n);
  });

  it("refunds buyer", async function () {
    const { escrow, buyer, seller } = await loadFixture(deployFixture);
    const deposit = ethers.parseEther("1");

    const buyerBefore = await ethers.provider.getBalance(buyer.address);
    const createTx = await escrow.connect(buyer).createEscrow(seller.address, "Refund", { value: deposit });
    const createRcpt = await createTx.wait();

    const refundTx = await escrow.connect(buyer).refundBuyer(1);
    const refundRcpt = await refundTx.wait();

    const buyerAfter = await ethers.provider.getBalance(buyer.address);
    const gasSpent =
      (createRcpt?.gasUsed || 0n) * (createRcpt?.gasPrice || 0n) +
      (refundRcpt?.gasUsed || 0n) * (refundRcpt?.gasPrice || 0n);

    expect(buyerAfter + gasSpent).to.equal(buyerBefore);

    const item = await escrow.getEscrow(1);
    expect(item.status).to.equal(2n);
    expect(item.amount).to.equal(0n);
  });

  it("prevents non-buyers from releasing or refunding", async function () {
    const { escrow, buyer, seller, attacker } = await loadFixture(deployFixture);
    const deposit = ethers.parseEther("0.5");

    await escrow.connect(buyer).createEscrow(seller.address, "Access Control", { value: deposit });

    await expect(escrow.connect(attacker).releasePayment(1)).to.be.revertedWith(
      "Only buyer can release payment"
    );

    await expect(escrow.connect(attacker).refundBuyer(1)).to.be.revertedWith(
      "Only buyer can refund"
    );
  });

  it("handles edge cases: double release and refund after completion", async function () {
    const { escrow, buyer, seller } = await loadFixture(deployFixture);
    const deposit = ethers.parseEther("1");

    await escrow.connect(buyer).createEscrow(seller.address, "Edge", { value: deposit });
    await escrow.connect(buyer).releasePayment(1);

    await expect(escrow.connect(buyer).releasePayment(1)).to.be.revertedWith("Escrow is not pending");
    await expect(escrow.connect(buyer).refundBuyer(1)).to.be.revertedWith("Escrow is not pending");
  });

  it("rejects invalid createEscrow calls", async function () {
    const { escrow, buyer } = await loadFixture(deployFixture);

    await expect(
      escrow.connect(buyer).createEscrow(ethers.ZeroAddress, "Invalid", { value: ethers.parseEther("1") })
    ).to.be.revertedWith("Seller cannot be zero address");

    await expect(
      escrow.connect(buyer).createEscrow(buyer.address, "Self", { value: ethers.parseEther("1") })
    ).to.be.revertedWith("Buyer and seller cannot be same");

    await expect(escrow.connect(buyer).createEscrow(buyer.address, "Zero", { value: 0 })).to.be.reverted;
  });

  it("sets deadline when createEscrowWithDeadline is used", async function () {
    const { escrow, buyer, seller } = await loadFixture(deployFixture);
    const deposit = ethers.parseEther("0.2");

    const before = await ethers.provider.getBlock("latest");
    await escrow.connect(buyer).createEscrowWithDeadline(seller.address, "Deadline", 2, { value: deposit });
    const created = await escrow.getEscrow(1);

    expect(created.deadline).to.be.greaterThan(0n);
    // roughly now + 2 days (allow small drift)
    expect(created.deadline).to.be.closeTo(BigInt((before?.timestamp || 0) + 2 * 24 * 60 * 60), 5n);
  });

  it("allows anyone to claim expired refund after deadline", async function () {
    const { escrow, buyer, seller, attacker } = await loadFixture(deployFixture);
    const deposit = ethers.parseEther("0.3");

    await escrow.connect(buyer).createEscrowWithDeadline(seller.address, "Expired", 1, { value: deposit });

    // Fast-forward 1 day + 1 second
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    expect(await escrow.isExpired(1)).to.equal(true);

    const buyerBefore = await ethers.provider.getBalance(buyer.address);
    const tx = await escrow.connect(attacker).claimExpiredRefund(1);
    const rcpt = await tx.wait();
    expect(rcpt).to.not.equal(null);

    const item = await escrow.getEscrow(1);
    expect(item.status).to.equal(2n);
    expect(item.amount).to.equal(0n);

    // Buyer receives deposit back (attacker pays gas)
    const buyerAfter = await ethers.provider.getBalance(buyer.address);
    expect(buyerAfter).to.be.greaterThan(buyerBefore);
  });

  it("rejects expired refund claims before deadline or without deadline", async function () {
    const { escrow, buyer, seller, attacker } = await loadFixture(deployFixture);
    const deposit = ethers.parseEther("0.1");

    await escrow.connect(buyer).createEscrowWithDeadline(seller.address, "Not yet", 1, { value: deposit });
    await expect(escrow.connect(attacker).claimExpiredRefund(1)).to.be.revertedWith("Escrow not expired");

    await escrow.connect(buyer).createEscrow(seller.address, "No deadline", { value: deposit });
    await expect(escrow.connect(attacker).claimExpiredRefund(2)).to.be.revertedWith("No deadline set");
  });
});
