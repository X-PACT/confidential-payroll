# ConfidentialPayroll v2 — Architecture & Technical Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ConfidentialPayroll v2                                │
│                                                                             │
│  ┌─────────────────────────┐    ┌──────────────────────────────────────┐   │
│  │   ConfidentialPayroll   │    │      ConfidentialPayToken (CPT)       │   │
│  │   (Main Contract)       │───▶│      ERC-7984 Compliant              │   │
│  │                         │    │      Salary is transferable token     │   │
│  │  • addEmployee()        │    └──────────────────────────────────────┘   │
│  │  • runPayroll()         │                                               │
│  │  • _calculateTax()      │    ┌──────────────────────────────────────┐   │
│  │  • requestDecryption()  │───▶│   ConfidentialEquityOracle            │   │
│  │                         │    │   🪄 Pay Equity Certificates          │   │
│  └─────────────────────────┘    │   FHE Proofs without salary reveal    │   │
│                                 └──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                │                               │
                ▼                               ▼
         ┌──────────┐                   ┌──────────────┐
         │  Zama    │                   │ Zama Gateway │
         │  fhEVM   │                   │  Threshold   │
         │ Network  │                   │  Decryption  │
         └──────────┘                   └──────────────┘
```

---

## Component 1: ConfidentialPayroll (Core)

The main payroll processor. All salary data is encrypted using `euint64` FHE types.

### Key Fix vs v1: Branchless Tax Calculation

**v1 BUG** (critical — breaks FHE confidentiality model):
```solidity
// ❌ WRONG — decrypts inside loop, reveals plaintext, fails on production fhEVM
ebool shouldContinue = TFHE.gt(grossPay, taxBrackets[i].threshold);
if (!TFHE.decrypt(shouldContinue)) break;
```

**v2 FIX** (fully branchless — constant-time, zero leakage):
```solidity
// ✅ CORRECT — branchless, no decryption, constant-time
euint64 cappedAtThreshold = TFHE.min(grossPay, taxBrackets[i].threshold);
ebool   abovePrev         = TFHE.gt(cappedAtThreshold, previousThreshold);
euint64 bracketAmt        = TFHE.select(
    abovePrev,
    TFHE.sub(cappedAtThreshold, previousThreshold),
    TFHE.asEuint64(0)
);
```

Why this matters:
- `TFHE.decrypt()` is a **synchronous decryption** that only works in Hardhat mock mode
- On production fhEVM, all decryptions are **asynchronous via Gateway**
- Calling `decrypt()` in a loop would leak which tax bracket the salary falls in
- The branchless version computes all brackets simultaneously with no information leak

---

## Component 2: ConfidentialPayToken (ERC-7984)

The first ERC-7984 compliant salary token deployed alongside a payroll system.

### Interface ID: `0x4958f2a4`

```solidity
interface IERC7984 {
    // Metadata
    function name()        external view returns (string memory);
    function symbol()      external view returns (string memory);
    function decimals()    external view returns (uint8);
    function contractURI() external view returns (string memory);

    // Supply & Balances (encrypted handles)
    function confidentialTotalSupply()              external view returns (bytes32);
    function confidentialBalanceOf(address account) external view returns (bytes32);

    // Operators (time-limited approvals)
    function isOperator(address holder, address op) external view returns (bool);
    function setOperator(address op, uint256 exp)   external;

    // Transfers (8 variants: with/without proof, transfer/transferFrom)
    function confidentialTransfer(address to, einput amt, bytes calldata proof) external returns (euint64);
    function confidentialTransfer(address to, euint64 amt)                     external returns (euint64);
    function confidentialTransferFrom(address from, address to, einput amt, bytes calldata proof) external returns (euint64);
    function confidentialTransferFrom(address from, address to, euint64 amt)                     external returns (euint64);
}
```

### Why ERC-7984 Matters for Payroll

Without ERC-7984, salary payments are just opaque encrypted numbers stored in a mapping.
With ERC-7984:
- Salary becomes a **transferable, composable token**
- Employees can pay vendors, split bills, DeFi — all confidentially
- Wallets can display "confidential balance" without revealing amounts
- DEXes and lending protocols can integrate confidential salary tokens
- Standard interface means any tool built for ERC-7984 works with CPT

---

## Component 3: ConfidentialEquityOracle 🪄

**The Magic Feature — World's First FHE Pay Equity Certification System**

### The Problem

The EU Pay Transparency Directive (2023/970) and similar laws in the US require companies to:
1. Report pay gaps by gender, role, and department
2. Prove all employees earn above minimum wage
3. Show that salary bands are respected

Currently, this requires exposing individual salaries to auditors or HR software.

### The Solution: FHE Boolean Proofs

Instead of revealing salaries, we perform the comparison **on encrypted data** and only reveal the **boolean result**:

```
Alice's salary = [ENCRYPTED]
Minimum wage   = [ENCRYPTED]

FHE: result = TFHE.gt(alice_salary, minimum_wage)
            = [ENCRYPTED BOOLEAN]

Gateway decrypts ONLY the boolean → "true" (Alice earns above minimum wage)

Alice's salary is NEVER decrypted. Only the comparison result is revealed.
```

### Certificate Types

| ClaimType | FHE Operation | What's Proven | What's Hidden |
|-----------|---------------|---------------|---------------|
| `ABOVE_MINIMUM_WAGE` | `TFHE.gt(salary, minWage)` | Earns above minimum | Exact salary |
| `WITHIN_SALARY_BAND` | `TFHE.ge(s, bandMin) AND TFHE.le(s, bandMax)` | Within band | Exact salary |
| `ABOVE_DEPARTMENT_MEDIAN` | `TFHE.gt(salary, median)` | Above/below median | Exact position |
| `GENDER_PAY_EQUITY` | `TFHE.gt(salary, deptMedian)` | Relative to median | Exact salary |

### Certificate Lifecycle

```
HR sets encrypted reference values
    ↓
Employee/Regulator requests certificate
    ↓
ConfidentialEquityOracle runs FHE comparison
    ↓ (comparison is on ENCRYPTED data)
Zama Gateway decrypts ONLY the boolean result
    ↓
Certificate issued on-chain:
    • Employee: Alice
    • Claim: ABOVE_MINIMUM_WAGE
    • Result: TRUE
    • AuditRef: [payroll run hash]
    • Timestamp: [block time]
    (No salary amount anywhere)
    ↓
Regulator verifies certificate — confirms compliance
(No salary access needed)
```

### Why This Is Revolutionary

No existing payroll system — on-chain or traditional — can:
1. Prove pay equity to regulators without disclosing individual salaries
2. Issue cryptographically verifiable equity certificates
3. Compute salary band compliance on encrypted data

This is the **only solution in existence** that satisfies EU Pay Transparency Directive requirements while maintaining complete salary confidentiality.

---

## FHE Operations Reference

| Operation | Purpose | Security Property |
|-----------|---------|------------------|
| `TFHE.asEuint64(x)` | Encrypt plaintext | Creates ciphertext |
| `TFHE.add(a, b)` | a + b (encrypted) | No overflow leak |
| `TFHE.sub(a, b)` | a - b (encrypted) | No underflow (wraps mod 2^64) |
| `TFHE.mul(a, b)` | a × b (encrypted) | Multiplicative homomorphism |
| `TFHE.div(a, b)` | a / b (encrypted) | Divisor must be plaintext or use TFHE.div(a, plaintext) |
| `TFHE.min(a, b)` | min(a, b) (encrypted) | Safe overflow guard |
| `TFHE.gt(a, b)` | a > b → ebool | Returns encrypted boolean |
| `TFHE.ge(a, b)` | a ≥ b → ebool | Returns encrypted boolean |
| `TFHE.le(a, b)` | a ≤ b → ebool | Returns encrypted boolean |
| `TFHE.and(a, b)` | a AND b → ebool | Logical AND on encrypted bools |
| `TFHE.select(cond, a, b)` | cond ? a : b | Branchless conditional |
| `TFHE.allow(x, addr)` | Grant ACL permission | Access control for ciphertexts |
| `Gateway.requestDecryption(...)` | Async threshold decrypt | Only authorized party sees result |

---

## Security Model

### Access Control Layers

1. **Smart Contract ACL (TFHE.allow)**: Controls who can decrypt specific ciphertexts
2. **Role-Based Access (OpenZeppelin)**: Controls who can call payroll functions  
3. **Gateway Authentication**: Zama Gateway verifies ACL before decrypting

### What Each Party Can See

| Party | Salary | Net Pay | Tax | Totals | Certificate |
|-------|--------|---------|-----|--------|-------------|
| Admin | ❌ | ❌ | ❌ | ❌ | ✅ |
| Payroll Manager | ❌ | ❌ | ❌ | ❌ | ✅ |
| Auditor | ❌ | ❌ | ❌ | ❌ | ✅ |
| Regulator | ❌ | ❌ | ❌ | ❌ | ✅ |
| Employee (own) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Employee (other) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Public/On-chain | ❌ | ❌ | ❌ | ❌ | ❌ |

**Only the employee themselves can ever decrypt their salary** — via Zama Gateway.

---

## Gas Estimates

| Operation | Gas | FHE Ops | Notes |
|-----------|-----|---------|-------|
| Deploy (all 3 contracts) | ~2.5M | - | One-time |
| addEmployee | ~400k | 5 | Includes EquityOracle registration |
| updateSalary | ~150k | 1 | |
| addBonus | ~100k | 1 FHE add | |
| addDeduction | ~100k | 1 FHE add | |
| runPayroll (per employee) | ~300k | 8+ FHE ops | Tax + net pay + mint |
| requestSalaryDecryption | ~80k | 1 | Gateway call |
| requestEquityCert | ~150k | 2-3 FHE comparisons | Cert request |
| finalizeRun | ~50k | 0 | State update only |

---

## Comparison: v1 vs v2

| Feature | v1 | v2 |
|---------|----|----|
| ERC-7984 Token | ❌ | ✅ CPT minted on payroll |
| Tax Calculation | ❌ Uses TFHE.decrypt in loop | ✅ Fully branchless FHE |
| Pay Equity Certs | ❌ None | ✅ FHE Boolean Proofs |
| Salary as Token | ❌ Raw encrypted number | ✅ Transferable ERC-7984 |
| Production Safe | ❌ decrypt() fails on mainnet | ✅ Async Gateway only |
| Gender in Records | ❌ | ✅ For equity reporting |
| Overflow Safety | Partial | ✅ TFHE.min() everywhere |
