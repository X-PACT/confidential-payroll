// SPDX-License-Identifier: MIT
const { expect } = require("chai");
const { ethers } = require("hardhat");

const ZERO_EINPUT = `0x${"0".repeat(64)}`;
const ONE_DAY = 24 * 60 * 60;

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

    await payroll.connect(admin).grantOperationalRole(
      await payroll.PAYROLL_MANAGER_ROLE(),
      manager.address
    );
    await payroll.connect(admin).grantOperationalRole(
      await payroll.AUDITOR_ROLE(),
      auditor.address
    );
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

    await payroll.connect(admin).setPayrollFrequency(7 * ONE_DAY);
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

  it("updates tax brackets and rejects malformed bracket arrays", async function () {
    await expect(
      payroll.connect(admin).setTaxBrackets(
        [50_000n * 1_000_000n, 100_000n * 1_000_000n],
        [1000]
      )
    ).to.be.revertedWith("Payroll: bracket length mismatch");

    await expect(
      payroll.connect(admin).setTaxBrackets(
        [100_000n * 1_000_000n, 50_000n * 1_000_000n, BigInt("18446744073709551615")],
        [1000, 2000, 3000]
      )
    ).to.be.revertedWith("Payroll: thresholds not ascending");

    await expect(
      payroll.connect(admin).setTaxBrackets(
        [50_000n * 1_000_000n, BigInt("18446744073709551615")],
        [1000, 4000]
      )
    ).to.be.revertedWith("Payroll: unsupported tax rate");

    await expect(
      payroll.connect(admin).setTaxBrackets(
        [60_000n * 1_000_000n, BigInt("18446744073709551615")],
        [1000, 3000]
      )
    )
      .to.emit(payroll, "TaxBracketsUpdated")
      .withArgs(2, anyValue);

    const firstBracket = await payroll.taxBrackets(0);
    const secondBracket = await payroll.taxBrackets(1);

    expect(firstBracket.threshold).to.equal(60_000n * 1_000_000n);
    expect(firstBracket.rate).to.equal(1000);
    expect(secondBracket.threshold).to.equal(BigInt("18446744073709551615"));
    expect(secondBracket.rate).to.equal(3000);
  });

  it("updates base currency and exchange rate", async function () {
    await expect(payroll.connect(admin).setBaseCurrency(ethers.encodeBytes32String("EUR"), 9200))
      .to.emit(payroll, "BaseCurrencyUpdated")
      .withArgs(ethers.encodeBytes32String("EUR"), 9200, anyValue);

    expect(await payroll.baseCurrency()).to.equal(ethers.encodeBytes32String("EUR"));
    expect(await payroll.exchangeRateBps()).to.equal(9200);
    expect(await payroll.convertReserveToCpt(1_000_000)).to.equal(920_000);
    expect(await payroll.convertCptToReserve(920_000)).to.equal(1_000_000);
  });

  it("emits role-change events for operational role management", async function () {
    await expect(
      payroll.connect(admin).grantOperationalRole(await payroll.AUDITOR_ROLE(), outsider.address)
    )
      .to.emit(payroll, "RoleUpdated")
      .withArgs(await payroll.AUDITOR_ROLE(), outsider.address, admin.address, true);

    expect(await payroll.hasRole(await payroll.AUDITOR_ROLE(), outsider.address)).to.equal(true);

    await expect(
      payroll.connect(admin).revokeOperationalRole(await payroll.AUDITOR_ROLE(), outsider.address)
    )
      .to.emit(payroll, "RoleUpdated")
      .withArgs(await payroll.AUDITOR_ROLE(), outsider.address, admin.address, false);

    expect(await payroll.hasRole(await payroll.AUDITOR_ROLE(), outsider.address)).to.equal(false);
  });

  it("supports reserve asset configuration and blocks redemption without reserves", async function () {
    await expect(payroll.connect(admin).setReserveAsset(outsider.address, true))
      .to.emit(payroll, "ReserveAssetUpdated")
      .withArgs(outsider.address, true, anyValue);

    expect(await payroll.supportedReserveAssets(outsider.address)).to.equal(true);

    await expect(
      payroll
        .connect(outsider)
        .requestSalaryTokenRedemption(ethers.ZeroAddress, ethers.parseEther("1"), outsider.address)
    ).to.be.revertedWith("Payroll: reserve empty");
  });

  it("validates ETH reserve deposit inputs before minting", async function () {
    const reserveAmount = ethers.parseEther("1");

    await expect(
      payroll
        .connect(outsider)
        .depositSalaryTokenReserve(ethers.ZeroAddress, outsider.address, reserveAmount, {
          value: reserveAmount,
        })
    ).to.be.revertedWithCustomError(payroll, "AccessControlUnauthorizedAccount");

    await expect(
      payroll
        .connect(admin)
        .depositSalaryTokenReserve(ethers.ZeroAddress, outsider.address, reserveAmount, {
          value: reserveAmount - 1n,
        })
    ).to.be.revertedWith("Payroll: ETH amount mismatch");
  });
});

const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
