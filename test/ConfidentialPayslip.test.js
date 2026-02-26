// SPDX-License-Identifier: MIT
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ConfidentialPayslip", function () {
  let payroll;
  let payslip;
  let admin;
  let verifier;
  let outsider;

  beforeEach(async function () {
    [admin, verifier, outsider] = await ethers.getSigners();

    const Payroll = await ethers.getContractFactory("ConfidentialPayroll");
    payroll = await Payroll.connect(admin).deploy();
    await payroll.waitForDeployment();

    const Payslip = await ethers.getContractFactory("ConfidentialPayslip");
    payslip = await Payslip.connect(admin).deploy(
      await payroll.getAddress(),
      "ConfidentialCorp Inc.",
      "Delaware, USA"
    );
    await payslip.waitForDeployment();
  });

  it("stores company metadata and payroll role", async function () {
    expect(await payslip.companyName()).to.equal("ConfidentialCorp Inc.");
    expect(await payslip.companyJurisdiction()).to.equal("Delaware, USA");

    const payrollRole = await payslip.PAYROLL_ROLE();
    expect(await payslip.hasRole(payrollRole, await payroll.getAddress())).to.equal(true);
  });

  it("is soulbound (locked always true)", async function () {
    expect(await payslip.locked(1)).to.equal(true);
    expect(await payslip.locked(9999)).to.equal(true);
  });

  it("validates payslip request inputs before FHE computation", async function () {
    await expect(
      payslip
        .connect(admin)
        .requestPayslip(
          ethers.ZeroAddress,
          0,
          0,
          1,
          2,
          0n,
          0,
          ethers.ZeroHash,
          "Engineer"
        )
    ).to.be.revertedWith("Payslip: zero verifier");

    await expect(
      payslip
        .connect(admin)
        .requestPayslip(
          verifier.address,
          0,
          0,
          10,
          10,
          0n,
          0,
          ethers.ZeroHash,
          "Engineer"
        )
    ).to.be.revertedWith("Payslip: invalid range");
  });

  it("rejects verification for unknown token", async function () {
    await expect(payslip.connect(verifier).verifyPayslip(1)).to.be.revertedWith(
      "Payslip: does not exist"
    );
  });

  it("prevents non-owner invalidation", async function () {
    await expect(payslip.connect(outsider).invalidatePayslip(1)).to.be.revertedWith(
      "Payslip: not your payslip"
    );
  });

  it("restricts verifier list access", async function () {
    await expect(
      payslip.connect(outsider).getVerifierPayslips(verifier.address)
    ).to.be.revertedWith("Payslip: unauthorized");

    const allowed = await payslip.connect(admin).getVerifierPayslips(verifier.address);
    expect(allowed.length).to.equal(0);
  });
});
