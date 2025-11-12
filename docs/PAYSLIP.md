# ConfidentialPayslip — Verifiable Confidential Payslips

> **The Decisive Feature** — Bridges on-chain confidential payroll with real-world income verification.

---

## The Problem

Employees constantly need payslips for real-world financial interactions:

| Use Case | Who Needs It | What They Verify |
|----------|-------------|-----------------|
| Bank loan | Bank | "Does this person earn enough to repay?" |
| Apartment rental | Landlord | "Can this person afford the rent?" |
| Visa / immigration | Embassy | "Is this person employed at stated salary?" |
| Mortgage | Lender | "3-month salary history above $X" |
| Credit card | Card issuer | "Annual income above $Y" |

**Current options — all broken:**

- **Traditional payroll:** Payslips can be forged. Verifier can't trust them.
- **On-chain transparent payroll:** Everything is public. Privacy destroyed.
- **On-chain FHE payroll (naive):** Salary encrypted, but employee can't prove income to anyone.

**ConfidentialPayslip solves all three.**

---

## The Solution

A **Soulbound (ERC-5192) on-chain attestation** that proves a salary claim **without revealing the exact salary**.

```
Employee:  "Prove to First National Bank that my salary is between $8k–$20k/month"
           (without telling the bank my exact salary)

Contract:  TFHE.ge(encSalary, $8k) AND TFHE.le(encSalary, $20k) → encrypted boolean
           Gateway decrypts ONLY the boolean → true

Result:    Soulbound NFT minted, readable only by First National Bank
           NFT says: "Salary ∈ [$8k, $20k] — TRUE"
           Exact salary: never decrypted, never on-chain in plaintext
```

---

## Three Proof Types

### 1. Range Proof (Most Common)
```
"My salary is between $X and $Y"
```
FHE: `TFHE.ge(salary, X) AND TFHE.le(salary, Y)`  
Use case: Bank loans, mortgages, high-income rental applications  
Information revealed: salary is in a range (employee-chosen width)

### 2. Threshold Proof
```
"My salary is above $T"
```
FHE: `TFHE.ge(salary, T)`  
Use case: Minimum income requirements, visa applications  
Information revealed: salary exceeds a threshold

### 3. Employment Only
```
"I am employed with a non-zero salary"
```
FHE: `TFHE.gt(salary, 0)`  
Use case: Basic employment verification  
Information revealed: minimum possible (just active employment)

---

## How It Works

```
1. Employee chooses verifier address (e.g., bank's Ethereum address)
2. Employee chooses proof type and parameters (range: $8k–$20k)
3. requestPayslip() called:
   - FHE range proof computed on encrypted salary
   - Gateway.requestDecryption([ebool]) called
4. Zama Gateway decrypts ONLY the boolean (not salary)
5. payslipDecryptionCallback() called with true/false
6. Soulbound NFT minted, accessible ONLY to designated verifier
7. Bank calls verifyPayslip(tokenId):
   - Gets: range, result, employer, position title
   - Does NOT get: exact salary
```

---

## Smart Contract API

### For Employees

```solidity
// Request a payslip for bank loan
function requestPayslip(
    address   verifier,        // Bank's Ethereum address
    PayslipPurpose purpose,    // BANK_LOAN, APARTMENT_RENTAL, etc.
    ProofType proofType,       // RANGE_PROOF, THRESHOLD_PROOF, EMPLOYMENT_ONLY
    uint64    rangeMin,        // Minimum of range (micro-units)
    uint64    rangeMax,        // Maximum of range (or threshold)
    euint64   encryptedSalary, // Handle from Payroll contract
    uint256   runId,           // Which payroll run to reference
    bytes32   auditReference,  // Audit hash from payroll run
    string    positionTitle    // "Software Engineer" (employee chooses to share)
) external returns (uint256 requestId);

// Invalidate a payslip (e.g., after loan closes)
function invalidatePayslip(uint256 tokenId) external;

// View all your payslips
function getMyPayslips() external view returns (uint256[] memory);
```

### For Verifiers (Banks, Landlords, etc.)

```solidity
// Verify a payslip (ONLY authorized verifier can call)
function verifyPayslip(uint256 tokenId) external returns (
    address employee,        // Employee address
    PayslipPurpose purpose,  // Why it was issued
    ProofType proofType,     // What was asserted
    uint64 rangeMin,         // Range minimum (plaintext — employee chose to share)
    uint64 rangeMax,         // Range maximum
    bool proofResult,        // ✅ TRUE = salary claim holds
    uint256 issuedAt,        // When issued
    string employerName,     // "ConfidentialCorp Inc."
    string positionTitle,    // "Software Engineer"
    bool isValid             // False if employee invalidated
);
```

---

## Usage Example — Full Flow

```javascript
// Employee side (using fhevmjs)
const payslipContract = new ethers.Contract(PAYSLIP_ADDRESS, ABI, employee);

// Alice wants to prove salary ∈ [$8k, $20k] to First National Bank
const tx = await payslipContract.requestPayslip(
    BANK_ADDRESS,                     // verifier
    0,                                // BANK_LOAN
    0,                                // RANGE_PROOF
    8_000 * 1e6,                      // $8,000/month min
    20_000 * 1e6,                     // $20,000/month max
    encryptedSalaryHandle,            // from Payroll contract
    latestRunId,
    auditHash,
    "Software Engineer"               // position title (Alice chooses to share)
);

// Gateway processes decryption asynchronously...
// Payslip NFT is minted with result

// Bank side
const bankContract = new ethers.Contract(PAYSLIP_ADDRESS, ABI, bankSigner);
const result = await bankContract.verifyPayslip(tokenId);

console.log(result.proofResult);    // true — Alice qualifies
console.log(result.rangeMin);       // 8000000000 — bank knows Alice earns ≥$8k
console.log(result.rangeMax);       // 20000000000 — bank knows Alice earns ≤$20k
// Exact salary: never available to bank
```

---

## Privacy Guarantees

| Information | Employee | Verifier | Public | Admin |
|-------------|----------|----------|--------|-------|
| Exact salary | ✅ (via Gateway) | ❌ Never | ❌ Never | ❌ Never |
| Salary range (chosen by employee) | ✅ | ✅ (proof result only) | ❌ | ❌ |
| Position title | ✅ | ✅ | ❌ | ❌ |
| Employer name | ✅ | ✅ | ✅ | ✅ |
| Payslip exists | ✅ | ✅ | ✅ (metadata only) | ✅ |

---

## Soulbound Properties (ERC-5192)

- Payslips are **non-transferable** — bound to the employee's address
- Employee can **invalidate** their own payslip at any time
- Once invalidated, the verifier can no longer use it
- Issued payslips have a **permanent on-chain record** (for audit trail)

---

## Deployment

```bash
# Deploys along with all other contracts
npm run deploy:zama

# Request a demo payslip
npm run request-payslip
```

The `PAYSLIP_CONTRACT` address is saved to `.env.deployed` automatically.
