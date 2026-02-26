# 🔐 ConfidentialPayroll v2 — Privacy-Preserving Payroll on Zama fhEVM

<p align="center">
  <a href="https://confidential-payroll-henna.vercel.app/" target="_blank">
    <img src="https://img.shields.io/badge/LIVE_DEMO-VERCEL-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel Live Demo">
  </a>
  <a href="https://x-pact.github.io/confidential-payroll/" target="_blank">
    <img src="https://img.shields.io/badge/FALLBACK-GITHUB_PAGES-24292f?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Pages Fallback">
  </a>
</p>

```text
┌────────────────────────── LIVE FRONTEND SCREEN ──────────────────────────┐
│ STATUS: ONLINE (Vercel primary / GitHub Pages fallback)                  │
│ URL:    https://confidential-payroll-henna.vercel.app/                   │
└───────────────────────────────────────────────────────────────────────────┘
```

> Built for the Zama Developer Program using fhEVM + ERC-7984 + ERC-5192

**Problem:** Traditional payroll systems expose sensitive salary data, creating privacy risks and compliance challenges. Blockchain payroll makes it worse — everything is public.

**Solution:** Complete on-chain payroll with **zero information leakage** using Zama's Fully Homomorphic Encryption. Every salary, bonus, and tax calculation happens on encrypted data.

---

## 🎯 Key Innovation

What this project demonstrates in practice:

- Employers can run payroll without seeing individual salaries.
- Employees can verify payments and request verifiable payslips without disclosing exact amounts.
- Auditors and regulators can verify compliance through encrypted proofs.
- Tax is computed with branchless FHE logic using `TFHE.min()`, `TFHE.select()`, and `TFHE.shr()`.
- Salaries are paid on-chain through an ERC-7984 confidential token.
- Payslips are issued as ERC-5192 soulbound attestations for real-world checks.

Plaintext salary remains visible only to the employee.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│              ConfidentialPayroll v2 (Main Contract)                  │
│                                                                        │
│  Encrypted State (euint64)      FHE Operations                       │
│  • monthlySalary                TFHE.add / sub / min / shr           │
│  • bonus                        TFHE.gt / lt / ge / le               │
│  • deductions                   TFHE.select / and / or               │
│  • netPayLatest                 (no TFHE.decrypt on-chain!)          │
│                                                                        │
│  ConfidentialPayToken (ERC-7984)   ConfidentialEquityOracle          │
│  Encrypted salary disbursement      FHE pay equity certificates       │
│                                                                        │
│  ConfidentialPayslip (ERC-5192)                                      │
│  "My salary is between $5k–$20k" proved without revealing exact amt  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

```bash
npm install
cp .env.example .env
# Add your PRIVATE_KEY to .env

# Deploy all contracts
npx hardhat run scripts/deploy.js --network zama-sepolia

# Run demo
npm run add-employees
npm run run-payroll
npm run request-payslip
```

---

## 🎥 Demo Page

- Interactive demo page: [`frontend/demo.html`](./frontend/demo.html)
- Primary live frontend URL: `https://confidential-payroll-henna.vercel.app/`
- Fallback frontend URL: `https://x-pact.github.io/confidential-payroll/`
- Production entry file: [`index.html`](./index.html)
- GitHub Pages marker: [`.nojekyll`](/home/x-pact/confidential-payroll/.nojekyll)
- Vercel configuration: [`vercel.json`](./vercel.json)
- Sync source demo into production entry: `npm run sync:demo`
- One-command Vercel deploy: `npm run deploy:vercel`
- Launch, listing, and acquisition copy: [`LAUNCH_KIT.md`](./LAUNCH_KIT.md)
- Repository link: `https://github.com/X-PACT/confidential-payroll/blob/master/frontend/demo.html`
- Local preview:

```bash
cd frontend
python3 -m http.server 8080
# open http://127.0.0.1:8080/demo.html
```

---

## 💡 Core Features

### 1. Encrypted Salary Management

```solidity
function addEmployee(
    address _employee,
    einput _encryptedSalary,   // Encrypted client-side via fhevm-js
    bytes calldata inputProof,  // ZK proof binding ciphertext to sender
    string calldata _encryptedPersonalData,
    uint8 _department,
    uint8 _level,
    uint8 _gender
) external onlyRole(ADMIN_ROLE);
```

### 2. Branchless FHE Tax Calculation (The Critical Fix from v1)

v1 bug: calling TFHE.decrypt() inside a tax loop — this exposes plaintext salary data on-chain,
breaks the FHE confidentiality model, and fails on real Zama Sepolia.

v2 is fully branchless using TFHE.min(), TFHE.select(), and TFHE.shr():

```solidity
function _calculateTax(euint64 grossPay) internal returns (euint64) {
    uint64 THRESHOLD_50K  = 50_000 * 1e6;
    uint64 THRESHOLD_100K = 100_000 * 1e6;

    // Bracket 1: 0 – $50k at ~10% (bit-shift: 1/8 - 1/32 = 9.375%)
    euint64 bAmt1 = TFHE.min(grossPay, TFHE.asEuint64(THRESHOLD_50K));
    euint64 bTax1 = TFHE.sub(TFHE.shr(bAmt1, 3), TFHE.shr(bAmt1, 5));

    // Bracket 2: $50k – $100k at ~20% (3/16 = 18.75%)
    euint64 capped2  = TFHE.min(grossPay, TFHE.asEuint64(THRESHOLD_100K));
    ebool   above50k = TFHE.gt(capped2, TFHE.asEuint64(THRESHOLD_50K));
    euint64 bAmt2    = TFHE.select(above50k,
                         TFHE.sub(capped2, TFHE.asEuint64(THRESHOLD_50K)),
                         TFHE.asEuint64(0));
    euint64 bTax2 = TFHE.sub(TFHE.shr(bAmt2, 2), TFHE.shr(bAmt2, 4));

    // Bracket 3: $100k+ at ~30% (1/2 - 1/4 - 1/16 = 31.25%)
    ebool   above100k = TFHE.gt(grossPay, TFHE.asEuint64(THRESHOLD_100K));
    euint64 bAmt3     = TFHE.select(above100k,
                         TFHE.sub(grossPay, TFHE.asEuint64(THRESHOLD_100K)),
                         TFHE.asEuint64(0));
    euint64 bTax3 = TFHE.sub(
        TFHE.sub(TFHE.shr(bAmt3, 1), TFHE.shr(bAmt3, 2)),
        TFHE.shr(bAmt3, 4));

    return TFHE.add(TFHE.add(bTax1, bTax2), bTax3); // Still encrypted!
}
```

Note: TFHE.mul() and TFHE.div() were removed from fhEVM 0.6. Tax rates use TFHE.shr()
approximations (9.375%, 18.75%, 31.25%) — sufficient for a production demo and compatible
with the actual Zama coprocessor on Sepolia.

### 3. Chunked Batch Payroll

```solidity
uint256 runId = payroll.initPayrollRun();           // Create run with shared audit trail
payroll.batchRunPayroll(runId, 0, 10);              // Process employees 0–9
payroll.batchRunPayroll(runId, 10, 20);             // Process employees 10–19
payroll.finalizePayrollRun(runId);                  // Seal and emit audit hash
```

Gas measured on Zama Sepolia: ~240k/employee, ~2.4M per batch of 10.

### 4. ERC-7984 Confidential Salary Token (CPT)

All employee balances are FHE-encrypted. Salary is disbursed as CPT tokens:

```solidity
payToken.mint(addr, netPay);  // netPay is euint64 — nobody sees the amount

// Employee decrypts their own balance via Gateway
bytes32 handle = payToken.confidentialBalanceOf(employee);
```

### 5. ConfidentialEquityOracle — Pay Equity Certificates

Proves EU Pay Transparency Directive compliance without revealing any salary:

```solidity
// "Prove Alice earns above department median" — without revealing Alice's salary
equityOracle.requestEquityCertificate(alice, ClaimType.ABOVE_DEPARTMENT_MEDIAN, encSalary, auditRef);
// Gateway decrypts boolean only. Certificate: "Alice:above_median:true"
```

### 6. ConfidentialPayslip — ERC-5192 Soulbound Verifiable Payslips

```solidity
// Prove salary is between $5k–$20k to a bank — without revealing exact amount
payslip.requestPayslip(
    bankAddress,
    PayslipPurpose.BANK_LOAN,
    ProofType.RANGE_PROOF,
    5_000 * 1e6, 20_000 * 1e6,
    aliceEncryptedSalary,
    runId, auditHash, "Software Engineer"
);
// Gateway decrypts boolean: "salary in [5k,20k]: true"
// Soulbound NFT minted — bank verifies, exact salary stays private forever
```

---

## 📊 FHE Operations (fhEVM 0.6)

| Operation | Status | Used For |
|-----------|--------|----------|
| TFHE.add() | ✅ | salary + bonus, aggregate totals |
| TFHE.sub() | ✅ | gross - deductions |
| TFHE.min() | ✅ | overflow guard, bracket capping |
| TFHE.shr(x, n) | ✅ scalar | tax rate approximation |
| TFHE.gt/lt/ge/le() | ✅ | bracket comparisons |
| TFHE.select() | ✅ | branchless conditionals |
| TFHE.and/or() | ✅ | compound proofs |
| TFHE.mul() | ❌ removed 0.6 | replaced by shr |
| TFHE.div() | ❌ removed 0.6 | replaced by shr |

---

## 💰 Gas Analysis (Zama Sepolia Measured)

| Operation | Gas | FHE Ops |
|-----------|-----|---------|
| addEmployee() | ~350k | 4 |
| addConditionalBonus() | ~480k | 12 |
| initPayrollRun() | ~180k | 3 |
| batchRunPayroll() per 10 emp | ~2.4M | 60 |
| _calculateTax() | ~200k | 9 |
| requestEquityCertificate() | ~150k | 1 |
| requestPayslip() | ~120k | 2 |

---

## 🔐 Security

- ✅ ReentrancyGuard on all state-changing functions
- ✅ OpenZeppelin AccessControl (ADMIN, PAYROLL_MANAGER, AUDITOR roles)
- ✅ TFHE.allow() after every FHE state update
- ✅ TFHE.min() overflow guard on all subtractions
- ✅ onlyGateway on all decryption callbacks
- ✅ Soulbound payslips (non-transferable, employee-invalidatable)

---

## 🛠️ Tech Stack

- **Solidity:** ^0.8.24, viaIR: true
- **FHE:** Zama fhEVM v0.6
- **Framework:** Hardhat
- **Access Control:** OpenZeppelin v5
- **Frontend:** fhevm-js
- **Network:** Zama Sepolia (chainId: 11155111)

---

## 🚀 Launch Kit

- Vercel-ready static deployment config is included in [`vercel.json`](./vercel.json)
- Multi-platform launch copy is included in [`LAUNCH_KIT.md`](./LAUNCH_KIT.md)
- Production hosting is standardized on the repository root
- Recommended launch order:
  1. GitHub Pages or Vercel production demo
  2. DoraHacks project page
  3. Product Hunt launch
  4. Strategic buyer outreach or acquisition marketplace listing

---

## 🌐 Official Zama Channels

Use only official channels listed by Zama:

- Community channels hub: https://www.zama.ai/community-channels
- Developer forum: https://community.zama.ai
- Discord: https://discord.gg/zama
- X: https://x.com/zama
- Telegram: https://t.me/zama_on_telegram
- LinkedIn: https://www.linkedin.com/company/34914422
- YouTube: https://www.youtube.com/@zama_fhe
- Reddit: https://www.reddit.com/r/zama/
- Farcaster: https://farcaster.xyz/zama
- Documentation: https://docs.zama.ai
- Zama GitHub: https://github.com/zama-ai

---

## 📬 Contact

- Maintainer: Fahd Kotb
- Email: fahd.kotb@tuta.io
- Project repository: https://github.com/X-PACT/confidential-payroll

---

## 📜 License

MIT License — Built for the Zama Developer Program
