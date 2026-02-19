# 🎬 Demo Video Script — 2 Minutes

## What to record (use SimpleScreenRecorder or OBS on Parrot)

---

### [0:00 – 0:20] — The Problem (show slides or terminal)

Say out loud:
> "Traditional blockchain payroll exposes every salary publicly.
> Anyone can see what Alice earns just by watching the contract.
> ConfidentialPayroll fixes this using Fully Homomorphic Encryption —
> salaries are computed on-chain while staying encrypted the entire time."

Show: The ZAMA_SUBMISSION.md threat model section (scroll slowly)

---

### [0:20 – 0:45] — Show the deployed contract on Zama Explorer

1. Open browser → https://explorer.zama.ai/address/YOUR_CONTRACT_ADDRESS
2. Show the contract is live on Sepolia
3. Click on a transaction — show that salary values are NOT visible (encrypted)

Say:
> "This is our contract deployed on Zama Sepolia.
> Every salary, bonus, and tax calculation happens on encrypted data.
> Nobody — not even the deployer — can read the amounts."

---

### [0:45 – 1:15] — Live terminal demo

Run in terminal:
```bash
cd ~/Desktop/ConfidentialPayroll
npm run add-employees
```

Show the output — encrypted salaries being added.

Say:
> "We're adding 5 employees with encrypted salaries.
> The contract receives FHE ciphertexts — never plaintext."

Then run:
```bash
npm run run-payroll
```

Say:
> "Payroll runs. Progressive tax is calculated on encrypted data.
> Net pay is computed — still encrypted. Nobody sees the numbers."

---

### [1:15 – 1:40] — Show the code (the key innovation)

Open in editor:
```bash
nano contracts/ConfidentialPayroll.sol
```
Scroll to `_calculateTax()` function (around line 443)

Say:
> "This is the core innovation — progressive tax brackets
> computed entirely in FHE using TFHE.shr() for bit-shift arithmetic.
> No TFHE.decrypt() anywhere in the loop.
> The result is an encrypted tax amount — never revealed on-chain."

---

### [1:40 – 2:00] — Show the payslip feature + close

Open `contracts/ConfidentialPayslip.sol` briefly

Say:
> "Employees can also request verifiable payslips —
> proving 'my salary is between $8k and $20k' to a bank,
> without revealing the exact amount. Not even the bank sees the number.
> This is ConfidentialPayroll — real FHE, real payroll, deployed today."

---

## Recording tips for Parrot Linux

```bash
# Install recorder
sudo apt-get install -y simplescreenrecorder

# Start recording
simplescreenrecorder
```

- Resolution: 1920x1080
- Audio: ON (record your voice)
- Format: MP4
- Keep terminal font large: Ctrl+Shift+= to zoom in

## After recording
Upload to YouTube (Unlisted) and add link to ZAMA_SUBMISSION.md
