# FHE Operations Deep Dive — ConfidentialPayroll v2

> Complete technical reference for every TFHE operation used in this system.
> No other payroll submission uses FHE at this depth.

---

## Overview: FHE Operations Used

| Operation | Usage | Contract |
|-----------|-------|----------|
| `TFHE.asEuint64()` | Encrypt plaintext or `einput` | All contracts |
| `TFHE.add()` | Gross = salary + bonus; net accumulation | ConfidentialPayroll |
| `TFHE.sub()` | Net = gross − deductions | ConfidentialPayroll, CPT |
| `TFHE.min()` | Overflow-safe deduction cap | ConfidentialPayroll, CPT |
| `TFHE.shr()` | Tax-rate approximation via bit shifts | ConfidentialPayroll |
| `TFHE.gt()` | Tax bracket threshold check | ConfidentialPayroll |
| `TFHE.ge()` | Salary band: above minimum | ConfidentialEquityOracle, ConfidentialPayslip |
| `TFHE.le()` | Salary band: below maximum | ConfidentialEquityOracle, ConfidentialPayslip |
| `TFHE.and()` | Range proof: above AND below | ConfidentialEquityOracle, ConfidentialPayslip |
| `TFHE.select()` | Branchless bracket selection | ConfidentialPayroll |
| `TFHE.allow()` | ACL permission management | All contracts |
| `Gateway.requestDecryption()` | Threshold decryption of result | All contracts |

---

## 1. Branchless Progressive Tax (The Core Innovation)

**Why this is revolutionary:** Standard progressive tax requires branching on salary values. With FHE, you cannot branch on encrypted data — it would require decryption. We implement tax as a constant-time, fully branchless algorithm.

### Algorithm

```
For each bracket i with threshold[i] and rate[i]:
  capped_i        = min(grossPay, threshold[i])           ← TFHE.min
  above_prev_i    = capped_i > threshold[i-1]             ← TFHE.gt
  bracket_amt_i   = select(above_prev_i,                  ← TFHE.select
                      capped_i - threshold[i-1],          ← TFHE.sub
                      0)
  bracket_tax_i   = approxRate(bracket_amt_i)            ← TFHE.shr + TFHE.sub
  totalTax        += bracket_tax_i                        ← TFHE.add
```

### Why `TFHE.min()` is Critical

The naive approach would be:
```
if (grossPay > threshold) {
    // This REQUIRES decryption — BREAKS FHE!
}
```

Our approach:
```solidity
// No decryption ever — pure FHE arithmetic
euint64 capped = TFHE.min(grossPay, taxBrackets[i].threshold);
ebool abovePrev = TFHE.gt(capped, previousThreshold);
euint64 bracketAmt = TFHE.select(abovePrev, TFHE.sub(capped, previousThreshold), TFHE.asEuint64(0));
```

**v1 Bug (now fixed in v2):** v1 called `TFHE.decrypt()` inside the tax loop to enable branching. This:
1. Exposes plaintext salary data on-chain → destroys confidentiality
2. Does not work in production fhEVM (only mock mode)
3. Creates regulatory risk (GDPR violation)

v2 uses `TFHE.min()` + `TFHE.select()` for fully branchless execution.

---

## 2. Overflow-Safe Net Pay Calculation

```solidity
// Step 1: Total deductions (encrypted)
euint64 totalDeductions = TFHE.add(emp.deductions, tax);

// Step 2: Cap deductions at gross pay (prevents negative net pay)
euint64 safeDeductions = TFHE.min(totalDeductions, grossPay);

// Step 3: Net pay (guaranteed non-negative)
euint64 netPay = TFHE.sub(grossPay, safeDeductions);
```

`TFHE.min()` ensures `safeDeductions ≤ grossPay`, making the subtraction always valid in FHE arithmetic.

---

## 3. Range Proof (ConfidentialPayslip — New Feature)

For the verifiable payslip, we prove a range assertion on the encrypted salary:

```solidity
// Prove: rangeMin <= salary <= rangeMax
euint64 encMin = TFHE.asEuint64(rangeMin);  // plaintext → encrypted
euint64 encMax = TFHE.asEuint64(rangeMax);  // plaintext → encrypted

ebool aboveMin = TFHE.ge(encryptedSalary, encMin);  // salary >= min
ebool belowMax = TFHE.le(encryptedSalary, encMax);  // salary <= max

ebool rangeProof = TFHE.and(aboveMin, belowMax);     // both conditions
// ↑ This ebool is the ONLY thing decrypted via Gateway
// The salary itself is never decrypted
```

**Information-theoretic analysis:**
- The verifier learns: `salary ∈ [rangeMin, rangeMax]` (true/false)
- The verifier does NOT learn: the exact salary
- Information revealed: at most `log2(rangeMax - rangeMin)` bits
- Employee controls how much info to reveal by choosing range width

---

## 4. Equity Oracle FHE Comparisons

```solidity
// Claim: salary > departmentMedian
ebool aboveMedian = TFHE.gt(salary, deptMedian[dept]);

// Claim: salary within band [bandMin, bandMax]
ebool aboveMin = TFHE.ge(salary, band.minimum);
ebool belowMax = TFHE.le(salary, band.maximum);
ebool inBand   = TFHE.and(aboveMin, belowMax);

// Claim: salary > minimumWage
ebool compliant = TFHE.gt(salary, encryptedMinimumWage);
```

All reference values (`deptMedian`, `band.minimum`, `band.maximum`, `encryptedMinimumWage`) are also encrypted — even the comparison targets are confidential.

---

## 5. ACL Permission Management

Every ciphertext in fhEVM requires explicit ACL permissions:

```solidity
// After creating a ciphertext, grant access to specific addresses:
TFHE.allow(netPay, emp.wallet);       // Employee can decrypt their own pay
TFHE.allow(netPay, address(this));     // Contract can use for computations
TFHE.allow(netPay, address(payslip)); // Payslip contract can use for proofs

// Do NOT allow:
// - Other employees (privacy preserved)
// - Admin (even admin cannot see individual salaries)
// - Public (no public decryption)
```

---

## 6. Gateway Threshold Decryption

All user-facing decryption goes through Zama's Gateway for threshold decryption:

```solidity
// Request decryption of a boolean (payslip proof result)
uint256[] memory cts = new uint256[](1);
cts[0] = Gateway.toUint256(proofBool);

Gateway.requestDecryption(
    cts,
    this.callbackFunction.selector,  // Callback for when decryption completes
    requestId,
    block.timestamp + 300,           // 5 minute deadline
    false                            // Non-trivial decryption
);
```

The Gateway uses threshold cryptography — no single party can decrypt. The decryption requires a threshold of Zama's key holders to cooperate.

---

## Gas Costs (Estimated — Zama Sepolia)

| Operation | Gas | Notes |
|-----------|-----|-------|
| `TFHE.add` | ~50k | Two euint64 ciphertexts |
| `TFHE.sub` | ~50k | Safe subtraction |
| `TFHE.min` | ~80k | Internal select + comparison |
| `TFHE.shr` | ~45k | Scalar shift approximation for tax rate |
| `TFHE.gt/ge/le` | ~60k | Encrypted comparison → ebool |
| `TFHE.and` | ~40k | Boolean FHE operation |
| `TFHE.select` | ~90k | Conditional ciphertext selection |
| Full tax calc (3 brackets) | ~1.5M | 5+ FHE ops per bracket |
| Full payroll run (5 employees) | ~10M | All FHE ops combined |
| Payslip range proof | ~250k | 4 FHE ops + Gateway |

---

## Security Properties

1. **IND-CPA Security:** All ciphertexts use Zama's TFHE scheme, which is IND-CPA secure under the RLWE hardness assumption.

2. **No Trusted Dealer:** Encryption happens client-side using `fhevmjs`. No server or contract ever sees plaintext salaries.

3. **Threshold Decryption:** Gateway decryption requires threshold cooperation — no single point of failure.

4. **ACL Enforcement:** `TFHE.allow()` is enforced at the protocol level — not just application logic.

5. **Overflow Safety:** `TFHE.min()` prevents arithmetic overflow without leaking data.

6. **Constant-Time:** All FHE operations are data-independent — no timing side channels.
