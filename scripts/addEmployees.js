const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("===========================================");
    console.log("Adding Test Employees with Encrypted Salaries");
    console.log("===========================================\n");

    // Load deployment info
    const deploymentInfo = JSON.parse(fs.readFileSync('./deployment.json', 'utf8'));
    const contractAddress = deploymentInfo.contractAddress;

    console.log("Contract Address:", contractAddress);
    console.log();

    const [deployer] = await hre.ethers.getSigners();
    const ConfidentialPayroll = await hre.ethers.getContractFactory("ConfidentialPayroll");
    const payroll = ConfidentialPayroll.attach(contractAddress);

    // Create test employee wallets
    const employees = [
        {
            name: "Alice (Software Engineer)",
            wallet: hre.ethers.Wallet.createRandom().address,
            salary: 120000, // $120k/year = $10k/month
            department: 1, // Engineering
            level: 3,
            personalData: "ipfs://QmTest123AlicePersonalData"
        },
        {
            name: "Bob (Senior Developer)",
            wallet: hre.ethers.Wallet.createRandom().address,
            salary: 180000, // $180k/year = $15k/month
            department: 1, // Engineering
            level: 5,
            personalData: "ipfs://QmTest456BobPersonalData"
        },
        {
            name: "Carol (Product Manager)",
            wallet: hre.ethers.Wallet.createRandom().address,
            salary: 140000, // $140k/year = ~$11.6k/month
            department: 2, // Product
            level: 4,
            personalData: "ipfs://QmTest789CarolPersonalData"
        },
        {
            name: "Dave (DevOps)",
            wallet: hre.ethers.Wallet.createRandom().address,
            salary: 110000, // $110k/year = ~$9.1k/month
            department: 1, // Engineering
            level: 3,
            personalData: "ipfs://QmTest012DavePersonalData"
        },
        {
            name: "Eve (Designer)",
            wallet: hre.ethers.Wallet.createRandom().address,
            salary: 95000, // $95k/year = ~$7.9k/month
            department: 3, // Design
            level: 2,
            personalData: "ipfs://QmTest345EvePersonalData"
        }
    ];

    console.log("Adding employees with ENCRYPTED salaries...\n");

    // Save employee info for later
    const employeeInfo = [];

    for (const emp of employees) {
        console.log(`Adding: ${emp.name}`);
        console.log(`  Wallet: ${emp.wallet}`);
        console.log(`  Annual Salary: $${emp.salary.toLocaleString()}`);
        console.log(`  Monthly Salary: $${(emp.salary / 12).toLocaleString()}`);
        console.log(`  Department: ${emp.department}, Level: ${emp.level}`);

        // Calculate monthly salary in micro-units (6 decimal places, like USDC)
        // BUG FIX: was previously using emp.salary * 1e6 directly which gave annual
        // salary instead of monthly — caught this during first Sepolia test run when
        // Alice's "salary" was 12x what it should have been. Divided by 12 first now.
        const monthlySalary = Math.floor((emp.salary / 12) * 1e6);

        try {
            // In production, this would use fhevmjs to encrypt client-side
            // For this demo, we'll use TFHE.asEuint64 directly in contract
            // Note: This is simplified for demo. Real implementation uses einput + inputProof
            
            // NOTE: addEmployee now takes gender as last param (added in v2 for equity oracle)
            // was getting "wrong number of arguments" revert until I checked the ABI again —
            // the contract signature changed but the script wasn't updated. Added 0 (undisclosed).
            const tx = await payroll.addEmployee(
                emp.wallet,
                monthlySalary, // In production, this would be encrypted einput
                "0x", // inputProof (empty for demo)
                emp.personalData,
                emp.department,
                emp.level,
                0, // gender: 0 = undisclosed (default for demo)
                { gasLimit: 500000 }
            );

            const receipt = await tx.wait();
            console.log(`  ✅ Added successfully! Gas used: ${receipt.gasUsed.toString()}`);
            console.log(`  Transaction: ${receipt.hash}\n`);

            employeeInfo.push({
                name: emp.name,
                wallet: emp.wallet,
                annualSalary: emp.salary,
                monthlySalary: emp.salary / 12,
                department: emp.department,
                level: emp.level
            });

        } catch (error) {
            console.log(`  ❌ Failed: ${error.message}\n`);
        }
    }

    // Save employee info
    fs.writeFileSync(
        './employees.json',
        JSON.stringify(employeeInfo, null, 2)
    );

    console.log("===========================================");
    console.log("Summary");
    console.log("===========================================");
    console.log(`Total Employees Added: ${employeeInfo.length}`);
    console.log(`Total Monthly Payroll: $${employeeInfo.reduce((sum, e) => sum + e.monthlySalary, 0).toLocaleString()}`);
    console.log(`Total Annual Payroll: $${employeeInfo.reduce((sum, e) => sum + e.annualSalary, 0).toLocaleString()}`);
    console.log();

    // Get active employee count from contract
    const activeCount = await payroll.getActiveEmployeeCount();
    console.log(`Active Employees (on-chain): ${activeCount.toString()}`);
    console.log();

    console.log("Employee info saved to employees.json");
    console.log();
    console.log("Next step: Run payroll");
    console.log("  npx hardhat run scripts/runPayroll.js --network", hre.network.name);
    console.log();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
