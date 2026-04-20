import pkg from 'hardhat';
const { ethers } = pkg;

async function main() {
  console.log("Deploying SubscriptionEscrow...");

  const SubscriptionEscrow = await ethers.getContractFactory("SubscriptionEscrow");
  const subscriptionEscrow = await SubscriptionEscrow.deploy();

  await subscriptionEscrow.waitForDeployment();

  const subscriptionAddress = await subscriptionEscrow.getAddress();
  console.log(`SubscriptionEscrow deployed to: ${subscriptionAddress}`);
  
  console.log("\nAdd this to your .env file:");
  console.log(`NEXT_PUBLIC_SUBSCRIPTION_CONTRACT_ADDRESS=${subscriptionAddress}`);
  
  console.log("\nVerify on Etherscan:");
  console.log(`npx hardhat verify --network sepolia ${subscriptionAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
