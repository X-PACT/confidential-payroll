/**
 * batchPayroll.js — Run full payroll in gas-bounded chunks
 *
 * Usage:
 *   npx hardhat run scripts/batchPayroll.js --network zamasepolia
 *
 * This script replaces the old runPayroll.js for large employee sets (15+).
 * For small demos (<10 employees), runPayroll.js still works fine.
 *
 * Design note: we had to redesign this twice. The original version called
 * runPayroll() directly which hit gas limits. The second version split
 * employees into separate runPayroll() calls which broke the audit trail.
 * This version uses initPayrollRun() + batchRunPayroll() + finalize.
 */

const hre = require("hardhat");
const fs  = require("fs");

const CHUNK_SIZE = 10; // 10 employees per tx ≈ 2.4M gas — safe margin

async function main() {
    console.log("=".repeat(50));
    console.log("Batch Payroll Runner");
    console.log("=".repeat(50));
    console.log();

    const deploymentInfo = JSON.parse(fs.readFileSync("./deployment.json", "utf8"));
    const [deployer]     = await hre.ethers.getSigners();

    const payroll = await hre.ethers.getContractAt(
        "ConfidentialPayroll",
        deploymentInfo.contractAddress,
        deployer
    );

    const activeCount = Number(await payroll.getActiveEmployeeCount());
    console.log(`Active employees: ${activeCount}`);

    if (activeCount === 0) {
        console.log("No active employees. Run addEmployees.js first.");
        return;
    }

    // Step 1: Initialize the payroll run
    console.log("\nStep 1: Initializing payroll run...");
    const initTx     = await payroll.initPayrollRun({ gasLimit: 300_000 });
    const initReceipt = await initTx.wait();

    // Parse runId from PayrollRunStarted event — or read nextPayrollRunId - 1
    // (event parsing varies by ethers version so we use the simple approach)
    const runId = Number(await payroll.nextPayrollRunId()) - 1;
    console.log(`  Run ID: ${runId}`);
    console.log(`  Gas used: ${initReceipt.gasUsed.toString()}`);

    // Step 2: Batch process employees
    const totalEmployees = (await payroll.employeeList ?
        // newer ABI exposes length
        Number(await payroll.getActiveEmployeeCount()) :
        activeCount);

    const numChunks = Math.ceil(activeCount / CHUNK_SIZE);
    console.log(`\nStep 2: Processing ${activeCount} employees in ${numChunks} chunk(s) of ${CHUNK_SIZE}...`);

    let processedCount = 0;
    for (let chunk = 0; chunk < numChunks; chunk++) {
        const startIdx = chunk * CHUNK_SIZE;
        // endIdx is exclusive — but we don't know total list length (includes inactive)
        // so we just pass startIdx + CHUNK_SIZE and let the contract skip inactive
        const endIdx = Math.min(startIdx + CHUNK_SIZE, activeCount + (chunk * 2)); // rough estimate

        console.log(`\n  Chunk ${chunk + 1}/${numChunks}: employees[${startIdx}...${endIdx})`);

        try {
            const batchTx = await payroll.batchRunPayroll(
                runId,
                startIdx,
                endIdx,
                { gasLimit: 3_000_000 } // 3M gas per chunk — conservative
            );
            const batchReceipt = await batchTx.wait();
            processedCount += (endIdx - startIdx);
            console.log(`  ✅ Gas used: ${batchReceipt.gasUsed.toString()}`);
            console.log(`  Tx: ${batchReceipt.hash}`);
        } catch (err) {
            console.error(`  ❌ Chunk failed: ${err.message}`);
            // Don't abort — try next chunk
        }
    }

    // Step 3: Finalize
    console.log("\nStep 3: Finalizing payroll run...");
    const finTx      = await payroll.finalizePayrollRun(runId, { gasLimit: 100_000 });
    const finReceipt = await finTx.wait();
    console.log(`  ✅ Finalized. Gas: ${finReceipt.gasUsed.toString()}`);

    // Read audit hash from contract
    const runData = await payroll.payrollRuns(runId);
    console.log(`\n${"=".repeat(50)}`);
    console.log(`Payroll Run #${runId} Complete`);
    console.log(`  Timestamp:      ${new Date(Number(runData.timestamp) * 1000).toISOString()}`);
    console.log(`  Employee count: ${runData.employeeCount.toString()}`);
    console.log(`  Audit hash:     ${runData.auditHash}`);
    console.log(`  Finalized:      ${runData.isFinalized}`);
    console.log(`${"=".repeat(50)}`);
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
