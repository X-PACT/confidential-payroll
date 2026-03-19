# Cover Note

Confidential Payroll is our submission for the Zama confidential-payroll challenge.

We focused on a narrow question with real operational weight: can payroll stay private on-chain without turning the product into a research artifact that nobody can actually run?

This repository answers that with a coherent system:

- confidential employee onboarding
- branchless encrypted payroll execution
- ERC-7984 salary-token settlement
- verifier-safe payslip proofs
- encrypted compliance and equity checks
- a frontend wired to the published Sepolia deployment

The most important design choice is not simply that salaries are encrypted. It is that the surrounding workflows still behave like real payroll operations. Admins can manage treasury liquidity, employees can request documents, and compliance reviewers can validate policy outcomes without exposing raw compensation.

We also tightened the repository for review. Contract logic is de-duplicated where it matters, the frontend does not pretend unsupported automation exists, and the documentation tracks the actual deployed system.

Thank you for reviewing the project.

Project contact on Discord: `xpactprotocol`
