/**
 * deploy.js — ConfidentialPayroll v2 Deployment Script
 * 
 * Deploys:
 *   1. ConfidentialPayroll (main contract)
 *      └── ConfidentialPayToken (ERC-7984) — auto-deployed in constructor
 *      └── ConfidentialEquityOracle        — auto-deployed in constructor
 */
const { ethers } = require("hardhat");

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No deployer account found. Set PRIVATE_KEY in .env before deploying to zama-sepolia.");
  }
  const deployer = signers[0];

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ConfidentialPayroll v2 — Zama fhEVM Deployment");
  console.log("═══════════════════════════════════════════════════════");
  const network = await ethers.provider.getNetwork();
  const networkName = network.name;

  console.log(`  Network:   ${networkName}`);
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Balance:   ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("📦 Deploying ConfidentialPayroll...");
  const Payroll = await ethers.getContractFactory("ConfidentialPayroll");
  const payroll = await Payroll.deploy();
  await payroll.waitForDeployment();
  const payrollAddress = await payroll.getAddress();
  console.log(`✅ ConfidentialPayroll:              ${payrollAddress}`);

  const [tokenAddr, oracleAddr] = await payroll.getSystemAddresses();
  console.log(`✅ ConfidentialPayToken (ERC-7984):  ${tokenAddr}`);
  console.log(`✅ ConfidentialEquityOracle:         ${oracleAddr}\n`);

  const payToken = await ethers.getContractAt("ConfidentialPayToken", tokenAddr);
  const erc7984  = await payToken.supportsInterface("0x4958f2a4");
  const erc165   = await payToken.supportsInterface("0x01ffc9a7");

  console.log("🔍 Interface Verification:");
  console.log(`   ERC-7984 (0x4958f2a4): ${erc7984 ? "✅" : "❌"}`);
  console.log(`   ERC-165  (0x01ffc9a7): ${erc165  ? "✅" : "❌"}`);

  // Deploy ConfidentialPayslip — verifiable confidential payslips
  console.log("\n📦 Deploying ConfidentialPayslip...");
  const Payslip = await ethers.getContractFactory("ConfidentialPayslip");
  const payslip = await Payslip.deploy(
    payrollAddress,
    "ConfidentialCorp Inc.",
    "Delaware, USA"
  );
  await payslip.waitForDeployment();
  const payslipAddress = await payslip.getAddress();
  console.log(`✅ ConfidentialPayslip:              ${payslipAddress}`);

  const isLocked = await payslip.locked(1);
  console.log(`   Soulbound (ERC-5192):  ${isLocked ? "✅" : "❌"}`);

  const fs = require("fs");

  // Save to .env.deployed (for reference)
  fs.writeFileSync(".env.deployed",
    `PAYROLL_CONTRACT=${payrollAddress}\nPAY_TOKEN=${tokenAddr}\nEQUITY_ORACLE=${oracleAddr}\nPAYSLIP_CONTRACT=${payslipAddress}\n`
  );

  // Save to deployment.json (required by addEmployees.js and runPayroll.js)
  fs.writeFileSync("deployment.json", JSON.stringify({
    contractAddress: payrollAddress,
    payToken: tokenAddr,
    equityOracle: oracleAddr,
    payslipContract: payslipAddress,
    network: networkName,
    deployedAt: new Date().toISOString()
  }, null, 2));

  console.log("\n📄 Addresses saved to .env.deployed and deployment.json");
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  PAYROLL_CONTRACT = "${payrollAddress}"`);
  console.log(`  PAY_TOKEN        = "${tokenAddr}"`);
  console.log(`  EQUITY_ORACLE    = "${oracleAddr}"`);
  console.log(`  PAYSLIP_CONTRACT = "${payslipAddress}"`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("\n🎯 Next steps:");
  console.log("   npm run add-employees");
  console.log("   npm run run-payroll");
  if (networkName === "zama-sepolia" || networkName === "sepolia") {
    console.log(`\n🔍 View on Etherscan: https://sepolia.etherscan.io/address/${payrollAddress}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
