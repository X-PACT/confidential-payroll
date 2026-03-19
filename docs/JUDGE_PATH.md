# Judge Path

If you have five minutes and want the highest-signal pass through the project, use this path:

1. Open `https://confidential-payroll-henna.vercel.app/frontend`.
2. Confirm the prefilled Sepolia addresses match the repository deployment table.
3. Connect a Sepolia wallet and inspect the four real operator flows:
   - add employee with encrypted salary input
   - run confidential payroll
   - request an equity certificate
   - request and verify a payslip
4. Watch the gateway-progress panel update as asynchronous FHE work moves from transaction submission to callback completion.

What to notice:

- Salaries never appear in plaintext on-chain or in the UI.
- The payroll path stays branchless and compatible with the fhEVM v0.6 operations used in this repo.
- The frontend is truthful about encrypted handles, proofs, and gateway callbacks.
- The Sepolia deployment references, frontend defaults, scripts, and docs all point to the same contracts.
