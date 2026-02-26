const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadDeployment() {
  const deploymentPath = path.join(process.cwd(), "deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployment.json not found. Run deploy first.");
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

async function main() {
  console.log("===========================================");
  console.log("Request Confidential Payslip");
  console.log("===========================================\n");

  const deployment = loadDeployment();
  const payrollAddress = deployment.contractAddress;
  const payslipAddress = deployment.payslipContract;

  if (!payrollAddress || !payslipAddress) {
    throw new Error("deployment.json is missing payroll or payslip contract addresses");
  }

  const signers = await hre.ethers.getSigners();
  if (signers.length < 2) {
    throw new Error("Need at least 2 funded accounts (employee + verifier) for payslip request.");
  }
  const employee = signers[0];
  const verifier = signers[1];

  const payroll = await hre.ethers.getContractAt("ConfidentialPayroll", payrollAddress);
  const payslip = await hre.ethers.getContractAt("ConfidentialPayslip", payslipAddress);

  const employeeInfo = await payroll.employees(employee.address);
  if (!employeeInfo.isActive) {
    throw new Error(
      `Employee ${employee.address} is not active. Add this address as employee first.`
    );
  }

  const monthlySalaryHandle = employeeInfo.monthlySalary;

  // Authorize payslip contract to use employee encrypted salary handle.
  const authTx = await payroll.connect(employee).authorizeSalaryAccess(payslipAddress);
  await authTx.wait();

  const nextRunId = await payroll.nextPayrollRunId();
  const runId = nextRunId > 1n ? nextRunId - 1n : 0n;
  let auditHash = hre.ethers.ZeroHash;
  if (runId > 0n) {
    const run = await payroll.payrollRuns(runId);
    auditHash = run.auditHash;
  }

  const rangeMin = 8_000 * 1e6;
  const rangeMax = 20_000 * 1e6;

  console.log(`Network:      ${hre.network.name}`);
  console.log(`Employee:     ${employee.address}`);
  console.log(`Verifier:     ${verifier.address}`);
  console.log(`Payroll:      ${payrollAddress}`);
  console.log(`Payslip:      ${payslipAddress}`);
  console.log(`Run ID:       ${runId}`);
  console.log("\nSubmitting payslip request...");

  const tx = await payslip.connect(employee).requestPayslip(
    verifier.address,
    0, // PayslipPurpose.BANK_LOAN
    0, // ProofType.RANGE_PROOF
    rangeMin,
    rangeMax,
    monthlySalaryHandle,
    runId,
    auditHash,
    "Software Engineer"
  );

  const receipt = await tx.wait();

  console.log(`✅ Payslip request submitted: ${receipt.hash}`);
  console.log("Gateway will asynchronously decrypt the proof boolean and issue the payslip token.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ requestPayslip failed:", err.message || err);
    process.exit(1);
  });
