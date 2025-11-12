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
  const [deployer] = await ethers.getSigners();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ConfidentialPayroll v2 — Zama fhEVM Deployment");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Network:   ${(await ethers.provider.getNetwork()).name}`);
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
  fs.writeFileSync(".env.deployed",
    `PAYROLL_CONTRACT=${payrollAddress}\nPAY_TOKEN=${tokenAddr}\nEQUITY_ORACLE=${oracleAddr}\nPAYSLIP_CONTRACT=${payslipAddress}\n`
  );
  console.log("\n📄 Addresses saved to .env.deployed");
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  PAYROLL_CONTRACT = "${payrollAddress}"`);
  console.log(`  PAY_TOKEN        = "${tokenAddr}"`);
  console.log(`  EQUITY_ORACLE    = "${oracleAddr}"`);
  console.log(`  PAYSLIP_CONTRACT = "${payslipAddress}"`);
  console.log("═══════════════════════════════════════════════════════");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
