import hre from "hardhat";

async function main(): Promise<void> {
  try {
    console.log("Deploying EscrowMarketplace contract...");

    const Escrow = await hre.ethers.getContractFactory("EscrowMarketplace");
    const escrow = await Escrow.deploy();
    await escrow.waitForDeployment();

    const deployedAddress = await escrow.getAddress();
    console.log(`EscrowMarketplace deployed to: ${deployedAddress}`);
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exitCode = 1;
  }
}

void main();
