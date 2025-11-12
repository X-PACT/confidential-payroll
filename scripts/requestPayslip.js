/**
 * requestPayslip.js — Demo: Request a Verifiable Confidential Payslip
 *
 * Shows the full flow:
 *   1. Employee requests payslip for a bank loan
 *   2. FHE range proof computed on encrypted salary
 *   3. Gateway decrypts ONLY the boolean
 *   4. Soulbound payslip NFT issued
 *   5. Bank verifies payslip — salary never revealed
 */

const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  ConfidentialPayslip — Verifiable Confidential Payslip");
  console.log("  Demo: Bank Loan Income Verification");
  console.log("═══════════════════════════════════════════════════════\n");

  // ─── Load addresses ────────────────────────────────────────────────────────
  const envPath = path.join(__dirname, "..", ".env.deployed");
  const envVars = fs.readFileSync(envPath, "utf8")
    .split("\n").filter(Boolean)
    .reduce((acc, line) => { const [k,v] = line.split("="); acc[k.trim()] = v.trim(); return acc; }, {});

  const [admin, employee, bankVerifier] = await hre.ethers.getSigners();

  const payroll = await hre.ethers.getContractAt("ConfidentialPayroll", envVars.PAYROLL_CONTRACT);
  const payslip = await hre.ethers.getContractAt("ConfidentialPayslip", envVars.PAYSLIP_CONTRACT || "");

  console.log("🏦 Scenario: Alice needs a bank loan from First National Bank");
  console.log(`   Alice (employee):  ${employee.address}`);
  console.log(`   Bank (verifier):   ${bankVerifier.address}\n`);

  console.log("📋 Alice's Request:");
  console.log("   Purpose:    BANK_LOAN");
  console.log("   Assertion:  'My monthly salary is between $8,000 and $20,000'");
  console.log("   The bank ONLY learns if this is true or false");
  console.log("   Alice's EXACT salary is NEVER revealed\n");

  // Range proof parameters (micro-units, 6 decimals like USDC)
  const rangeMin = 8_000 * 1e6;   // $8,000/month
  const rangeMax = 20_000 * 1e6;  // $20,000/month

  // Get employee's encrypted salary from payroll contract
  const empInfo = await payroll.employees(employee.address);
  const encSalary = empInfo.monthlySalary;

  // Get latest run for audit reference
  const runId = Number(await payroll.nextPayrollRunId()) - 1;
  const run   = await payroll.payrollRuns(runId);

  console.log("⚙️  Requesting Payslip (FHE range proof computing...)");
  console.log(`   TFHE.ge(encryptedSalary, ${rangeMin}) → ebool`);
  console.log(`   TFHE.le(encryptedSalary, ${rangeMax}) → ebool`);
  console.log(`   TFHE.and(above, below) → ebool`);
  console.log(`   Gateway.requestDecryption([ebool]) → boolean only\n`);

  const tx = await payslip.connect(employee).requestPayslip(
    bankVerifier.address,      // verifier = bank
    0,                         // PayslipPurpose.BANK_LOAN
    0,                         // ProofType.RANGE_PROOF
    rangeMin,
    rangeMax,
    encSalary,
    runId,
    run.auditHash,
    "Software Engineer",       // positionTitle (employee chooses to share)
    { gasLimit: 500_000 }
  );

  const receipt = await tx.wait();
  console.log(`✅ Payslip requested! Tx: ${receipt.hash}`);
  console.log("   ⏳ Waiting for Zama Gateway to decrypt the boolean...\n");

  // In production, Gateway is async. For demo, we show what the result looks like.
  console.log("═══════════════════════════════════════════════════════");
  console.log("  GATEWAY RESPONSE (after decryption):");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Proof Result:   true");
  console.log("  Meaning:        Alice's salary IS in range $8k-$20k");
  console.log("  Alice's salary: [NEVER DECRYPTED — permanently encrypted]");
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("🏦 Bank Verification:");
  console.log("  Bank calls: payslip.verifyPayslip(tokenId)");
  console.log("  Bank receives:");
  console.log("  {");
  console.log("    employee:      '0xAlice...',");
  console.log("    purpose:       'BANK_LOAN',");
  console.log("    rangeMin:      8000000000,  // $8,000");
  console.log("    rangeMax:      20000000000, // $20,000");
  console.log("    proofResult:   true,        // ✅ Salary is in range");
  console.log("    employerName:  'ConfidentialCorp',");
  console.log("    positionTitle: 'Software Engineer',");
  console.log("    isValid:       true");
  console.log("  }");
  console.log("  // exactSalary:  NEVER REVEALED ✅\n");

  console.log("✅ Loan APPROVED based on privacy-preserving payslip!");
  console.log("   Alice's exact salary: never seen by bank, never on-chain in plaintext.");
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
