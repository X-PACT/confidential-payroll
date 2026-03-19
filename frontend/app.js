import { ConfidentialPayrollClient } from "./confidentialPayroll.js";

const claimTypes = [
  "ABOVE_MINIMUM_WAGE",
  "WITHIN_SALARY_BAND",
  "ABOVE_DEPARTMENT_MEDIAN",
  "GENDER_PAY_EQUITY",
  "ABOVE_CUSTOM_THRESHOLD",
  "AVERAGE_DEPARTMENT_SALARY",
  "GENDER_PAY_GAP"
];

const payslipPurposes = [
  "BANK_LOAN",
  "APARTMENT_RENTAL",
  "VISA_APPLICATION",
  "MORTGAGE",
  "CREDIT_CARD",
  "EMPLOYMENT_PROOF",
  "CUSTOM"
];

const proofTypes = ["RANGE_PROOF", "THRESHOLD_PROOF", "EMPLOYMENT_ONLY"];

const deployedSepoliaAddresses = {
  payroll: "0xA1b22e02484E573cb1b4970cA52B7b24c13D20dF",
  oracle: "0xe9F6209156dE521334Bd56eAf9063Af2882216B3",
  payslip: "0xbF160BC0A4C610E8134eAbd3cd1a1a9608d534aC"
};

const defaultAddresses = {
  payroll: localStorage.getItem("confidential-payroll.payroll") || deployedSepoliaAddresses.payroll,
  oracle: localStorage.getItem("confidential-payroll.oracle") || deployedSepoliaAddresses.oracle,
  payslip: localStorage.getItem("confidential-payroll.payslip") || deployedSepoliaAddresses.payslip
};

const client = new ConfidentialPayrollClient(defaultAddresses);

const { createApp } = Vue;

createApp({
  data() {
    return {
      wallet: {
        account: "",
        chainId: "",
        connected: false
      },
      addresses: { ...defaultAddresses },
      addEmployeeForm: {
        employee: "",
        encryptedSalary: "",
        inputProof: "0x",
        personalDataCid: "ipfs://employee-record",
        department: 1,
        level: 2,
        gender: 0
      },
      equityForm: {
        employee: "",
        encryptedSalary: "",
        auditReference: "",
        claimType: 5
      },
      payslipForm: {
        verifier: "",
        encryptedSalary: "",
        runId: "",
        auditReference: "",
        purpose: 0,
        proofType: 0,
        rangeMin: "5000000000",
        rangeMax: "15000000000",
        positionTitle: "Confidential Engineer"
      },
      verifyForm: {
        tokenId: ""
      },
      verifyResult: null,
      notices: [],
      queue: [],
      busy: {
        connect: false,
        addEmployee: false,
        runPayroll: false,
        equity: false,
        payslip: false,
        verify: false,
        decrypt: false
      },
      claimTypes,
      payslipPurposes,
      proofTypes
    };
  },
  computed: {
    gatewaySteps() {
      return [
        "Transaction submitted",
        "Encrypted payload accepted",
        "Waiting for Gateway callback",
        "Result ready for verification"
      ];
    }
  },
  methods: {
    pushNotice(kind, message) {
      this.notices.unshift({
        id: `${Date.now()}-${Math.random()}`,
        kind,
        message
      });
      this.notices = this.notices.slice(0, 5);
    },
    setBusy(key, state) {
      this.busy[key] = state;
    },
    persistAddresses() {
      Object.entries(this.addresses).forEach(([key, value]) => {
        localStorage.setItem(`confidential-payroll.${key}`, value);
      });
      client.setAddresses(this.addresses);
    },
    async connectWallet() {
      this.setBusy("connect", true);
      try {
        this.persistAddresses();
        const result = await client.connect();
        this.wallet = {
          account: result.account,
          chainId: result.chainId.toString(),
          connected: true
        };

        if (this.addresses.payroll && !this.addresses.oracle) {
          const hydrated = await client.hydrateSystemAddresses();
          this.addresses.oracle = hydrated.oracle;
          this.persistAddresses();
        }

        this.pushNotice("success", "Wallet connected. The console is ready for live contract calls.");
      } catch (error) {
        this.pushNotice("error", error.message);
      } finally {
        this.setBusy("connect", false);
      }
    },
    enqueueFlow(label, txHash, requestId = "") {
      this.queue.unshift({
        id: `${Date.now()}-${Math.random()}`,
        label,
        txHash,
        requestId,
        status: requestId ? "Waiting for Gateway callback" : "Transaction confirmed"
      });
      this.queue = this.queue.slice(0, 8);
    },
    async submitAddEmployee() {
      this.setBusy("addEmployee", true);
      try {
        const response = await client.addEmployee(this.addEmployeeForm);
        this.enqueueFlow("Employee added", response.txHash);
        this.pushNotice("success", "Employee registered. The encrypted salary stays private end to end.");
      } catch (error) {
        this.pushNotice("error", error.message);
      } finally {
        this.setBusy("addEmployee", false);
      }
    },
    async submitRunPayroll() {
      this.setBusy("runPayroll", true);
      try {
        const response = await client.runPayroll();
        this.enqueueFlow(`Payroll run ${response.runId || "submitted"}`, response.txHash);
        this.pushNotice(
          "success",
          `Payroll finished${response.employeeCount ? ` for ${response.employeeCount} employees` : ""}.`
        );
      } catch (error) {
        this.pushNotice("error", error.message);
      } finally {
        this.setBusy("runPayroll", false);
      }
    },
    async submitEquityCertificate() {
      this.setBusy("equity", true);
      try {
        const response = await client.requestEquityCertificate(this.equityForm);
        this.enqueueFlow("Equity certificate requested", response.txHash, response.requestId);
        this.pushNotice(
          "success",
          "Equity request is on-chain. The Gateway will reveal only the compliance result."
        );
      } catch (error) {
        this.pushNotice("error", error.message);
      } finally {
        this.setBusy("equity", false);
      }
    },
    async submitPayslip() {
      this.setBusy("payslip", true);
      try {
        const response = await client.requestPayslip(this.payslipForm);
        this.enqueueFlow("Payslip requested", response.txHash, response.requestId);
        this.pushNotice(
          "success",
          "Payslip request submitted. The verifier will only see the approved proof, not the salary."
        );
      } catch (error) {
        this.pushNotice("error", error.message);
      } finally {
        this.setBusy("payslip", false);
      }
    },
    async submitVerifyPayslip() {
      this.setBusy("verify", true);
      try {
        this.verifyResult = await client.verifyPayslip(this.verifyForm.tokenId);
        this.pushNotice("success", "Payslip verified from the live contract.");
      } catch (error) {
        this.verifyResult = null;
        this.pushNotice("error", error.message);
      } finally {
        this.setBusy("verify", false);
      }
    },
    async requestSalaryDecryption() {
      this.setBusy("decrypt", true);
      try {
        const response = await client.requestSalaryDecryption();
        this.enqueueFlow("Salary decryption requested", response.txHash, response.requestId);
        this.pushNotice(
          "success",
          "Decryption request submitted. The callback will deliver the clear salary only to the authorized employee."
        );
      } catch (error) {
        this.pushNotice("error", error.message);
      } finally {
        this.setBusy("decrypt", false);
      }
    }
  }
}).mount("#app");
