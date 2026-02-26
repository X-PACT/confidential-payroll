// SPDX-License-Identifier: MIT
const { expect } = require("chai");
const { ethers } = require("hardhat");

const ZERO_EINPUT = `0x${"0".repeat(64)}`;

describe("ConfidentialPayroll", function () {
  let payroll;
  let payToken;
  let equityOracle;
  let admin;
  let manager;
  let auditor;
  let outsider;

  beforeEach(async function () {
    [admin, manager, auditor, outsider] = await ethers.getSigners();

    const Payroll = await ethers.getContractFactory("ConfidentialPayroll");
    payroll = await Payroll.connect(admin).deploy();
    await payroll.waitForDeployment();

    const [tokenAddress, oracleAddress] = await payroll.getSystemAddresses();
    payToken = await ethers.getContractAt("ConfidentialPayToken", tokenAddress);
    equityOracle = await ethers.getContractAt("ConfidentialEquityOracle", oracleAddress);

    await payroll.connect(admin).grantRole(await payroll.PAYROLL_MANAGER_ROLE(), manager.address);
    await payroll.connect(admin).grantRole(await payroll.AUDITOR_ROLE(), auditor.address);
  });

  it("deploys token and oracle addresses", async function () {
    const [tokenAddress, oracleAddress] = await payroll.getSystemAddresses();

    expect(tokenAddress).to.not.equal(ethers.ZeroAddress);
    expect(oracleAddress).to.not.equal(ethers.ZeroAddress);
  });

  it("exposes ERC-7984 metadata and interface support", async function () {
    expect(await payToken.name()).to.equal("Confidential Pay Token");
    expect(await payToken.symbol()).to.equal("CPT");
    expect(await payToken.decimals()).to.equal(6);
    expect(await payToken.supportsInterface("0x4958f2a4")).to.equal(true);
  });

  it("assigns equity oracle admin roles to deployer", async function () {
    expect(
      await equityOracle.hasRole(await equityOracle.DEFAULT_ADMIN_ROLE(), admin.address)
    ).to.equal(true);
    expect(await equityOracle.hasRole(await equityOracle.HR_ROLE(), admin.address)).to.equal(
      true
    );
    expect(
      await equityOracle.hasRole(await equityOracle.REGULATOR_ROLE(), admin.address)
    ).to.equal(true);
  });

  it("blocks non-admin from adding employees", async function () {
    await expect(
      payroll.connect(outsider).addEmployee(
        outsider.address,
        ZERO_EINPUT,
        "0x",
        "ipfs://meta",
        1,
        1,
        0
      )
    ).to.be.revertedWithCustomError(payroll, "AccessControlUnauthorizedAccount");
  });

  it("blocks non-manager from running payroll", async function () {
    await expect(payroll.connect(outsider).runPayroll()).to.be.revertedWithCustomError(
      payroll,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("rejects payroll execution before due date", async function () {
    await expect(payroll.connect(manager).runPayroll()).to.be.revertedWith("Payroll: not due yet");
  });

  it("rejects batch payroll for unknown run id", async function () {
    await expect(
      payroll.connect(manager).batchRunPayroll(999, 0, 1)
    ).to.be.revertedWith("Payroll: run not initialized");
  });

  it("blocks non-employee salary access authorization", async function () {
    await expect(
      payroll.connect(outsider).authorizeSalaryAccess(outsider.address)
    ).to.be.revertedWith("Payroll: not an employee");
  });

  it("enforces payroll frequency bounds", async function () {
    await expect(payroll.connect(admin).setPayrollFrequency(0)).to.be.revertedWith(
      "Payroll: invalid frequency"
    );

    await payroll.connect(admin).setPayrollFrequency(7 * 24 * 60 * 60);
    expect(await payroll.payrollFrequency()).to.equal(7n * 24n * 60n * 60n);
  });

  it("allows auditors to read run metadata without salary amounts", async function () {
    const [timestamp, employeeCount, auditHash, isFinalized] = await payroll
      .connect(auditor)
      .auditPayrollRun(999);

    expect(timestamp).to.equal(0);
    expect(employeeCount).to.equal(0);
    expect(auditHash).to.equal(ethers.ZeroHash);
    expect(isFinalized).to.equal(false);
  });
});
