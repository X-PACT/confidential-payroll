const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const CHUNK_SIZE = 10;

function loadDeployment() {
  const deploymentPath = path.join(process.cwd(), "deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployment.json not found. Run deploy first.");
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

async function main() {
  console.log("===========================================");
  console.log("Chunked Payroll Runner");
  console.log("===========================================\n");

  const deployment = loadDeployment();
  const payrollAddress = deployment.contractAddress;
  if (!payrollAddress) {
    throw new Error("contractAddress missing in deployment.json");
  }

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signer found. Set PRIVATE_KEY in .env before running this script.");
  }

  const manager = signers[0];
  const payroll = await hre.ethers.getContractAt("ConfidentialPayroll", payrollAddress, manager);
  const activeCount = Number(await payroll.getActiveEmployeeCount());

  console.log(`Network:          ${hre.network.name}`);
  console.log(`Payroll Contract: ${payrollAddress}`);
  console.log(`Manager:          ${manager.address}`);
  console.log(`Active employees: ${activeCount}\n`);

  if (activeCount === 0) {
    console.log("No active employees found. Run addEmployees.js first.");
    return;
  }

  const initTx = await payroll.initPayrollRun({ gasLimit: 300_000 });
  const initReceipt = await initTx.wait();
  const runId = Number(await payroll.nextPayrollRunId()) - 1;

  console.log(`Initialized run ${runId}`);
  console.log(`  tx:       ${initReceipt.hash}`);
  console.log(`  gas used: ${initReceipt.gasUsed.toString()}\n`);

  const totalChunks = Math.ceil(activeCount / CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const startIndex = chunkIndex * CHUNK_SIZE;
    const endIndex = Math.min(startIndex + CHUNK_SIZE, activeCount);

    console.log(`Processing chunk ${chunkIndex + 1}/${totalChunks}: [${startIndex}, ${endIndex})`);

    const batchTx = await payroll.batchRunPayroll(runId, startIndex, endIndex, {
      gasLimit: 3_000_000,
    });
    const batchReceipt = await batchTx.wait();

    console.log(`  tx:       ${batchReceipt.hash}`);
    console.log(`  gas used: ${batchReceipt.gasUsed.toString()}\n`);
  }

  const finalizeTx = await payroll.finalizePayrollRun(runId, { gasLimit: 100_000 });
  const finalizeReceipt = await finalizeTx.wait();
  const run = await payroll.payrollRuns(runId);

  console.log("Payroll run finalized");
  console.log(`  tx:             ${finalizeReceipt.hash}`);
  console.log(`  gas used:       ${finalizeReceipt.gasUsed.toString()}`);
  console.log(`  processed:      ${run.employeeCount.toString()} employees`);
  console.log(`  audit hash:     ${run.auditHash}`);
  console.log(`  finalized flag: ${run.isFinalized}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ batchPayroll failed:", error.message || error);
    process.exit(1);
  });
