# Payslip Flow

The payslip contract exists because "privacy-preserving payroll" does not mean much to employees unless they can still prove income to someone else.

## What A Payslip Proves

The employee chooses:

- the verifier
- the purpose
- the proof type
- the salary range or threshold they are comfortable disclosing

The verifier gets a yes-or-no answer to that statement. They do not get the underlying salary.

## Core Request

```solidity
requestPayslip(
    verifier,
    purpose,
    proofType,
    rangeMin,
    rangeMax,
    encryptedSalary,
    runId,
    auditReference,
    positionTitle
)
```

## Supported Proof Modes

- `RANGE_PROOF`
  Useful when the verifier needs bounded income, for example "between $5k and $15k per month."

- `THRESHOLD_PROOF`
  Useful when the verifier only cares about a floor, for example "above $4k per month."

- `EMPLOYMENT_ONLY`
  Useful when someone needs proof of active employment but not the salary figure itself.

## Verification Rules

The verifier can read a payslip only if:

- the token exists
- it has not been invalidated
- the gateway callback has completed
- the caller is the designated verifier or the employee

That last rule matters. A payslip is not meant to become a public artifact just because it lives on-chain.

## Frontend Behavior

The frontend intentionally shows payslip requests as asynchronous flows:

1. transaction submitted
2. encrypted proof accepted
3. gateway callback pending
4. verifier-ready result

That makes the demo feel honest about the underlying infrastructure instead of hiding the gateway wait behind a spinner with no context.
