# FHE Operations

This repo is built around a constraint that is worth stating plainly: fhEVM v0.6 is powerful, but it does not support every arithmetic pattern a normal Solidity developer might expect.

## Operations Used In Production Paths

| Operation | Used For | Notes |
| --- | --- | --- |
| `TFHE.add()` | gross pay, deductions, totals, aggregate salary sums | safe default for accumulating encrypted values |
| `TFHE.sub()` | net pay, bracket slices, redemption deltas | always paired with guards or capped values |
| `TFHE.min()` | overflow-safe deductions, bracket caps, burn limits | prevents obvious underflow paths |
| `TFHE.select()` | branchless payroll logic | keeps encrypted decisions off the control-flow surface |
| `TFHE.gt/ge/le/eq()` | bracket checks, band checks, compliance claims | boolean-only encrypted comparisons |
| `TFHE.shr()` | rate and average approximations | scalar shift is the practical replacement for several removed arithmetic ops |

## Why Shift-Based Math Appears In Multiple Places

Two places rely on `TFHE.shr()` deliberately:

- tax rate approximation
- aggregate normalization inside the equity oracle

That is not accidental duplication. It is the common workaround that keeps the project aligned with the current library surface.

## Branchless Tax Path

The tax engine walks each bracket without decrypting the employee salary:

1. cap the encrypted gross pay at the bracket threshold
2. subtract the previous threshold if the employee is above that floor
3. apply the supported public tax-rate approximation
4. accumulate encrypted tax

The contract only allows the supported public rates baked into the approximation helpers, which keeps bracket updates honest and predictable.

## Aggregate Equity Claims

The new aggregate claim types work with encrypted totals plus HR-supplied normalization metadata:

- `setDepartmentAggregate()` stores the encrypted total and the shift used to normalize it.
- `setGenderAggregate()` stores the encrypted male or female total, the shift, and the acceptable pay-gap threshold.

Because the final output is still just a decrypted boolean, the oracle can answer questions like:

- "Is this salary at or above the department average?"
- "Is the configured gender pay gap still inside tolerance?"

without disclosing any raw salary.

## Gateway Model

The contracts do not treat decryption as a synchronous convenience method. Every user-facing decryption path goes through a request/callback flow:

- salary decryption
- equity certificate issuance
- payslip issuance
- salary-token redemption approval

This makes the frontend slightly more complex, but it is the right tradeoff. You can show users meaningful progress instead of pretending the gateway does not exist.
