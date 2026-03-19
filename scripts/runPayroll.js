/**
 * runPayroll.js — ConfidentialPayroll v2
 *
 * Executes monthly payroll for all active employees.
 * All salary computations happen on ENCRYPTED data — nobody sees amounts.
 */

const hre  = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  ConfidentialPayroll v2 — Monthly Payroll Run");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Network:   ${hre.network.name}`);
  console.log(`  Time:      ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // ─── Load deployed addresses ───────────────────────────────────────────────
  const envPath = path.join(__dirname, "..", ".env.deployed");
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.deployed not found. Run deploy.js first:");
    console.error("   npm run deploy:zama");
    process.exit(1);
  }

  const envVars = fs.readFileSync(envPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .reduce((acc, line) => {
      const [k, v] = line.split("=");
      acc[k.trim()] = v.trim();
      return acc;
    }, {});

  const payrollAddress = envVars.PAYROLL_CONTRACT;
  const tokenAddress   = envVars.PAY_TOKEN;
  const oracleAddress  = envVars.EQUITY_ORACLE;

  if (!payrollAddress) {
    console.error("❌ PAYROLL_CONTRACT not found in .env.deployed");
    process.exit(1);
  }

  console.log("📋 Contract Addresses:");
  console.log(`   Payroll:       ${payrollAddress}`);
  console.log(`   PayToken:      ${tokenAddress}`);
  console.log(`   EquityOracle:  ${oracleAddress}\n`);

  // ─── Connect to contracts ──────────────────────────────────────────────────
  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    console.error("❌ No signer found. Set PRIVATE_KEY in .env before running this script.");
    process.exit(1);
  }
  const manager = signers[0];

  const payroll = await hre.ethers.getContractAt(
    "ConfidentialPayroll",
    payrollAddress
  );
  const payToken = await hre.ethers.getContractAt(
    "ConfidentialPayToken",
    tokenAddress
  );

  console.log(`📊 Manager:  ${manager.address}`);

  // ─── Pre-flight checks ─────────────────────────────────────────────────────
  console.log("\n🔍 Pre-flight Checks...");

  const activeCount = await payroll.getActiveEmployeeCount();
  console.log(`   Active employees:     ${activeCount}`);

  const nextRunId      = await payroll.nextPayrollRunId();
  const payrollFreq    = await payroll.payrollFrequency();
  const lastPayrollRun = await payroll.lastPayrollRun();
  const now            = BigInt(Math.floor(Date.now() / 1000));
  const nextDue        = lastPayrollRun + payrollFreq;

  console.log(`   Current run ID:       ${nextRunId}`);
  console.log(`   Payroll frequency:    ${Number(payrollFreq) / 86400} days`);
  console.log(`   Last payroll:         ${new Date(Number(lastPayrollRun) * 1000).toISOString()}`);
  console.log(`   Next due:             ${new Date(Number(nextDue) * 1000).toISOString()}`);

  if (now < nextDue) {
    const hoursLeft = Number(nextDue - now) / 3600;
    console.log(`\n⚠️  Payroll not due yet. ${hoursLeft.toFixed(1)} hours remaining.`);
    console.log(  "   On testnet, the admin can adjust frequency via setPayrollFrequency().");
    console.log(  "   For testing, use hardhat network with time manipulation.\n");

    // On testnet/local, we can still try and show the error clearly
    if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
      console.log("   [Hardhat detected] Fast-forwarding time for testing...");
      await hre.network.provider.send("evm_increaseTime", [Number(payrollFreq)]);
      await hre.network.provider.send("evm_mine");
      console.log("   ✅ Time fast-forwarded.\n");
    }
  }

  if (activeCount === 0n) {
    console.log("\n⚠️  No active employees. Run add-employees first:");
    console.log("   npm run add-employees\n");
    process.exit(0);
  }

  // ─── Execute Payroll Run ───────────────────────────────────────────────────
  console.log("\n🚀 Executing Payroll Run...");
  console.log(  "   ⚙️  FHE Operations Running:");
  console.log(  "     • Gross = Salary + Bonus              [TFHE.add]");
  console.log(  "     • Tax   = Progressive brackets        [TFHE.min + TFHE.select + TFHE.shr]");
  console.log(  "     • Net   = Gross - min(deductions, Gross) [TFHE.sub]");
  console.log(  "     • Mint  = ERC-7984 tokens to employees");
  console.log(  "   ⚠️  ALL computations on ENCRYPTED data — no amounts revealed.\n");

  let tx, receipt;

  try {
    tx = await payroll.connect(manager).runPayroll({
      gasLimit: 5_000_000  // FHE ops are gas-intensive
    });

    console.log(`   📡 Transaction submitted: ${tx.hash}`);
    console.log(  "   ⏳ Waiting for confirmation (FHE ops take time)...");

    receipt = await tx.wait(1);

    console.log(`\n✅ Payroll Run SUCCESSFUL!`);
    console.log(`   Block:     ${receipt.blockNumber}`);
    console.log(`   Gas used:  ${receipt.gasUsed.toString()} (${(Number(receipt.gasUsed) / 1_000_000).toFixed(2)}M)`);
    console.log(`   Tx hash:   ${receipt.hash}`);

  } catch (err) {
    if (err.message.includes("not due yet")) {
      console.error("\n❌ Payroll not due yet. Wait for the next cycle.");
      console.error("   Use setPayrollFrequency() to adjust on testnet.");
    } else {
      console.error("\n❌ Payroll run failed:", err.message);
    }
    process.exit(1);
  }

  // ─── Parse Events ──────────────────────────────────────────────────────────
  console.log("\n📋 Payroll Events:");

  const startedEvents = receipt.logs
    .filter(log => {
      try {
        return payroll.interface.parseLog(log)?.name === "PayrollRunStarted";
      } catch { return false; }
    })
    .map(log => payroll.interface.parseLog(log));

  const mintedEvents = receipt.logs
    .filter(log => {
      try {
        return payroll.interface.parseLog(log)?.name === "SalaryMinted";
      } catch { return false; }
    })
    .map(log => payroll.interface.parseLog(log));

  if (startedEvents.length > 0) {
    const ev = startedEvents[0];
    const runId = ev.args.runId;
    console.log(`   PayrollRunStarted: runId=${runId}, employees=${ev.args.employeeCount}`);

    // Fetch run data
    const run = await payroll.payrollRuns(runId);
    console.log(`   Audit Hash:        ${run.auditHash}`);
    console.log(`   (total payroll amounts remain ENCRYPTED on-chain)`);
  }

  console.log(`\n   SalaryMinted events: ${mintedEvents.length} employees paid`);
  for (const ev of mintedEvents) {
    console.log(`     • ${ev.args.employee} (runId: ${ev.args.runId})`);
    console.log(`       → ERC-7984 CPT tokens minted (amount: ENCRYPTED)`);
  }

  // ─── Token Supply Check ────────────────────────────────────────────────────
  console.log("\n📊 ERC-7984 Token Status:");
  const supplyHandle = await payToken.confidentialTotalSupply();
  console.log(`   Total Supply Handle: ${supplyHandle}`);
  console.log(  "   (Actual supply is encrypted — only admin can decrypt via Gateway)");

  // ─── Save Run Report ───────────────────────────────────────────────────────
  const runId = startedEvents.length > 0
    ? Number(startedEvents[0].args.runId)
    : Number(nextRunId) - 1;

  const runReport = {
    runId,
    timestamp:       new Date().toISOString(),
    network:         hre.network.name,
    transactionHash: receipt.hash,
    blockNumber:     receipt.blockNumber,
    gasUsed:         receipt.gasUsed.toString(),
    employeesPaid:   mintedEvents.length,
    note:            "All salary amounts remain encrypted on-chain. This report contains NO sensitive data.",
    auditHash:       startedEvents[0]?.args ? await payroll.payrollRuns(runId).then(r => r.auditHash) : null,
    employees:       mintedEvents.map(ev => ({
      address: ev.args.employee,
      status:  "PAID — salary encrypted"
    }))
  };

  fs.writeFileSync(
    path.join(__dirname, "..", `payroll-run-${runId}.json`),
    JSON.stringify(runReport, null, 2)
  );

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  ✅ PAYROLL RUN COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Run ID:          ${runId}`);
  console.log(`  Employees Paid:  ${mintedEvents.length}`);
  console.log(`  Privacy Status:  ALL salaries remain encrypted ✅`);
  console.log(`  ERC-7984 CPT:    Minted to all employees ✅`);
  console.log(`  Report saved:    payroll-run-${runId}.json`);
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("📌 Next steps:");
  console.log("  • Employees can decrypt their own salary via Gateway:");
  console.log("    payroll.requestSalaryDecryption()");
  console.log("  • Request an equity certificate:");
  console.log("    equityOracle.requestEquityCertificate(...)");
  console.log("  • Request a verifiable payslip:");
  console.log("    payslip.requestPayslip(verifierAddress, purpose, ...)");
  console.log("  • Finalize this run:");
  console.log(`    payroll.finalizePayrollRun(${runId})`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("\n❌ Fatal error:", err);
    process.exit(1);
  });
