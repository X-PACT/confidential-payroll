const payrollAbi = [
  "function addEmployee(address employee, bytes32 encryptedSalary, bytes inputProof, string encryptedPersonalData, uint8 department, uint8 level, uint8 gender)",
  "function runPayroll() returns (uint256)",
  "function getSystemAddresses() view returns (address token, address oracle)",
  "function requestSalaryDecryption() returns (uint256)",
  "event PayrollRunStarted(uint256 indexed runId, uint256 timestamp, uint256 employeeCount)",
  "event DecryptionRequested(uint256 indexed requestId, address indexed requester)"
];

const equityOracleAbi = [
  "function requestEquityCertificate(address employee, uint8 claimType, bytes32 encryptedSalary, bytes32 auditReference) returns (uint256)",
  "event CertificateRequested(uint256 indexed requestId, address indexed employee, uint8 claimType)"
];

const payslipAbi = [
  "function requestPayslip(address verifier, uint8 purpose, uint8 proofType, uint64 rangeMin, uint64 rangeMax, bytes32 encryptedSalary, uint256 runId, bytes32 auditReference, string positionTitle) returns (uint256)",
  "function verifyPayslip(uint256 tokenId) returns (address employee, uint8 purpose, uint8 proofType, uint64 rangeMin, uint64 rangeMax, bool proofResult, uint256 issuedAt, string employerName, string positionTitle, bool isValid)",
  "event PayslipRequested(uint256 indexed requestId, address indexed employee, address indexed verifier, uint8 purpose)"
];

const zeroBytes32 = "0x" + "0".repeat(64);

export class ConfidentialPayrollClient {
  constructor(addresses = {}) {
    this.addresses = {
      payroll: addresses.payroll || "",
      oracle: addresses.oracle || "",
      payslip: addresses.payslip || ""
    };
    this.provider = null;
    this.signer = null;
    this.contracts = {};
  }

  setAddresses(nextAddresses) {
    this.addresses = {
      ...this.addresses,
      ...nextAddresses
    };
  }

  async connect() {
    if (!window.ethereum) {
      throw new Error("MetaMask is required to use the live contract actions.");
    }

    await window.ethereum.request({ method: "eth_requestAccounts" });
    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();

    if (this.addresses.payroll) {
      this.contracts.payroll = new ethers.Contract(this.addresses.payroll, payrollAbi, this.signer);
    }
    if (this.addresses.oracle) {
      this.contracts.oracle = new ethers.Contract(this.addresses.oracle, equityOracleAbi, this.signer);
    }
    if (this.addresses.payslip) {
      this.contracts.payslip = new ethers.Contract(this.addresses.payslip, payslipAbi, this.signer);
    }

    return {
      account: await this.signer.getAddress(),
      chainId: (await this.provider.getNetwork()).chainId
    };
  }

  async hydrateSystemAddresses() {
    if (!this.contracts.payroll) {
      throw new Error("Set a payroll contract address first.");
    }

    const [token, oracle] = await this.contracts.payroll.getSystemAddresses();
    this.addresses.oracle = oracle;
    this.contracts.oracle = new ethers.Contract(oracle, equityOracleAbi, this.signer);
    return { token, oracle };
  }

  async addEmployee(payload) {
    const tx = await this.contracts.payroll.addEmployee(
      payload.employee,
      payload.encryptedSalary || zeroBytes32,
      payload.inputProof || "0x",
      payload.personalDataCid,
      payload.department,
      payload.level,
      payload.gender
    );
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  }

  async runPayroll() {
    const tx = await this.contracts.payroll.runPayroll();
    const receipt = await tx.wait();
    const parsed = this._parseFirst(receipt.logs, this.contracts.payroll, "PayrollRunStarted");
    return {
      txHash: receipt.hash,
      runId: parsed ? parsed.args.runId.toString() : "",
      employeeCount: parsed ? parsed.args.employeeCount.toString() : ""
    };
  }

  async requestEquityCertificate(payload) {
    const tx = await this.contracts.oracle.requestEquityCertificate(
      payload.employee,
      Number(payload.claimType),
      payload.encryptedSalary || zeroBytes32,
      payload.auditReference || zeroBytes32
    );
    const receipt = await tx.wait();
    const parsed = this._parseFirst(receipt.logs, this.contracts.oracle, "CertificateRequested");
    return {
      txHash: receipt.hash,
      requestId: parsed ? parsed.args.requestId.toString() : ""
    };
  }

  async requestPayslip(payload) {
    const tx = await this.contracts.payslip.requestPayslip(
      payload.verifier,
      Number(payload.purpose),
      Number(payload.proofType),
      BigInt(payload.rangeMin || 0),
      BigInt(payload.rangeMax || 0),
      payload.encryptedSalary || zeroBytes32,
      BigInt(payload.runId || 0),
      payload.auditReference || zeroBytes32,
      payload.positionTitle
    );
    const receipt = await tx.wait();
    const parsed = this._parseFirst(receipt.logs, this.contracts.payslip, "PayslipRequested");
    return {
      txHash: receipt.hash,
      requestId: parsed ? parsed.args.requestId.toString() : ""
    };
  }

  async verifyPayslip(tokenId) {
    const response = await this.contracts.payslip.verifyPayslip(tokenId);
    return {
      employee: response[0],
      purpose: Number(response[1]),
      proofType: Number(response[2]),
      rangeMin: response[3].toString(),
      rangeMax: response[4].toString(),
      proofResult: response[5],
      issuedAt: Number(response[6]),
      employerName: response[7],
      positionTitle: response[8],
      isValid: response[9]
    };
  }

  async requestSalaryDecryption() {
    const tx = await this.contracts.payroll.requestSalaryDecryption();
    const receipt = await tx.wait();
    const parsed = this._parseFirst(receipt.logs, this.contracts.payroll, "DecryptionRequested");
    return {
      txHash: receipt.hash,
      requestId: parsed ? parsed.args.requestId.toString() : ""
    };
  }

  _parseFirst(logs, contract, eventName) {
    for (const log of logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === eventName) {
          return parsed;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }
}
