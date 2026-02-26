const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { createInstance } = require("fhevmjs");
require("dotenv").config();

function must(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

async function getFheInstance() {
  const networkUrl = process.env.SEPOLIA_RPC_URL || hre.network.config.url;
  if (!networkUrl) {
    throw new Error("Missing RPC URL. Set SEPOLIA_RPC_URL in .env");
  }

  const aclContractAddress = must("ACL_CONTRACT");
  const kmsContractAddress = must("KMS_CONTRACT");
  const gatewayUrl = must("GATEWAY_URL");

  return createInstance({
    networkUrl,
    gatewayUrl,
    aclContractAddress,
    kmsContractAddress,
  });
}

function loadDeployment() {
  const deploymentPath = path.join(process.cwd(), "deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployment.json not found. Run deploy first.");
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

async function main() {
  console.log("===========================================");
  console.log("Adding Employees with Real FHE Encryption");
  console.log("===========================================\n");

  if (!["zama-sepolia", "sepolia"].includes(hre.network.name)) {
    throw new Error(
      `This script is for Sepolia-based fhEVM only. Current network: ${hre.network.name}`
    );
  }

  const deployment = loadDeployment();
  const payrollAddress = deployment.contractAddress;
  if (!payrollAddress) {
    throw new Error("contractAddress missing in deployment.json");
  }

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No deployer account found. Set PRIVATE_KEY in .env before running this script.");
  }
  const admin = signers[0];
  const payroll = await hre.ethers.getContractAt("ConfidentialPayroll", payrollAddress);
  const fhe = await getFheInstance();

  console.log(`Network:          ${hre.network.name}`);
  console.log(`Payroll Contract: ${payrollAddress}`);
  console.log(`Admin:            ${admin.address}\n`);

  const employees = [
    {
      name: "Demo Employee (deployer)",
      wallet: admin.address,
      annualSalaryUsd: 120000,
      department: 1,
      level: 3,
      gender: 0,
      personalData: "ipfs://QmDemoEmployeeData",
    },
    {
      name: "Alice (Engineering)",
      wallet: hre.ethers.Wallet.createRandom().address,
      annualSalaryUsd: 180000,
      department: 1,
      level: 5,
      gender: 1,
      personalData: "ipfs://QmAliceEncryptedData",
    },
    {
      name: "Bob (Product)",
      wallet: hre.ethers.Wallet.createRandom().address,
      annualSalaryUsd: 140000,
      department: 2,
      level: 4,
      gender: 2,
      personalData: "ipfs://QmBobEncryptedData",
    },
  ];

  const added = [];

  for (const employee of employees) {
    const monthlySalaryMicros = Math.floor((employee.annualSalaryUsd / 12) * 1e6);

    console.log(`Adding ${employee.name}`);
    console.log(`  wallet: ${employee.wallet}`);
    console.log(`  annual salary: $${employee.annualSalaryUsd.toLocaleString()}`);

    try {
      const input = fhe.createEncryptedInput(payrollAddress, admin.address);
      input.add64(monthlySalaryMicros);
      const { handles, inputProof } = await input.encrypt();

      const tx = await payroll.connect(admin).addEmployee(
        employee.wallet,
        handles[0],
        inputProof,
        employee.personalData,
        employee.department,
        employee.level,
        employee.gender
      );

      const receipt = await tx.wait();
      console.log(`  ✅ added in tx ${receipt.hash}`);

      added.push({
        ...employee,
        monthlySalaryMicros,
        txHash: receipt.hash,
      });
    } catch (error) {
      console.log(`  ❌ failed: ${error.shortMessage || error.message}`);
    }

    console.log();
  }

  fs.writeFileSync(
    path.join(process.cwd(), "employees.json"),
    JSON.stringify(
      {
        network: hre.network.name,
        payrollAddress,
        admin: admin.address,
        addedAt: new Date().toISOString(),
        employees: added,
      },
      null,
      2
    )
  );

  const activeCount = await payroll.getActiveEmployeeCount();

  console.log("===========================================");
  console.log("Summary");
  console.log("===========================================");
  console.log(`Employees added in this run: ${added.length}`);
  console.log(`Active employees on-chain:   ${activeCount}`);
  console.log("Saved details to employees.json");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ addEmployees failed:", err.message || err);
    process.exit(1);
  });
