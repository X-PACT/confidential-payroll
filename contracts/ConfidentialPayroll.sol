// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import "fhevm/gateway/GatewayCaller.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./token/ConfidentialPayToken.sol";
import "./ConfidentialEquityOracle.sol";

/**
 * @title ConfidentialPayroll v2
 * @notice Confidential payroll orchestration for Zama fhEVM.
 *
 * @dev Salaries, bonuses, deductions, and net pay stay encrypted on-chain.
 *      Public administration data, reserve balances, and exchange rates stay
 *      plaintext so the treasury and auditors can operate normally.
 */
contract ConfidentialPayroll is AccessControl, ReentrancyGuard, GatewayCaller {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant PAYROLL_MANAGER_ROLE = keccak256("PAYROLL_MANAGER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    uint256 public constant FX_RATE_SCALE = 10_000;
    uint16 private constant TAX_RATE_10_PERCENT = 1000;
    uint16 private constant TAX_RATE_20_PERCENT = 2000;
    uint16 private constant TAX_RATE_30_PERCENT = 3000;

    struct EncryptedEmployee {
        address wallet;
        euint64 monthlySalary;
        euint64 bonus;
        euint64 deductions;
        euint64 netPayLatest;
        uint256 lastPaymentTimestamp;
        uint256 employmentStartDate;
        bool isActive;
        string encryptedPersonalData;
        uint8 department;
        uint8 level;
        uint8 gender;
    }

    struct PayrollRun {
        uint256 runId;
        uint256 timestamp;
        uint256 employeeCount;
        euint64 totalGrossPay;
        euint64 totalDeductions;
        euint64 totalNetPay;
        bool isFinalized;
        bytes32 auditHash;
    }

    struct TaxBracket {
        uint64 threshold;
        uint16 rate;
    }

    struct PendingTokenRedemption {
        address requester;
        address reserveAsset;
        address payoutRecipient;
        uint256 requestedReserveAmount;
        uint256 approvedReserveAmount;
        bool exists;
        bool ready;
    }

    mapping(address => EncryptedEmployee) public employees;
    mapping(uint256 => PayrollRun) public payrollRuns;
    mapping(address => mapping(uint256 => euint64)) public employeePayments;
    mapping(uint256 => address) private _decryptRequests;
    mapping(uint256 => PendingTokenRedemption) public pendingTokenRedemptions;

    address[] public employeeList;
    uint256 public nextPayrollRunId = 1;
    uint256 public payrollFrequency = 30 days;
    uint256 public lastPayrollRun;
    uint256 private _nextRequestId = 1;
    uint256 private _nextRedemptionRequestId = 1;

    TaxBracket[] public taxBrackets;

    ConfidentialPayToken public payToken;
    ConfidentialEquityOracle public equityOracle;

    mapping(address => bool) public supportedReserveAssets;
    mapping(address => uint256) public reserveBalances;
    bytes32 public baseCurrency = "USD";
    uint256 public exchangeRateBps = FX_RATE_SCALE;

    event EmployeeAdded(address indexed employee, uint256 timestamp);
    event EmployeeUpdated(address indexed employee, uint256 timestamp);
    event EmployeeRemoved(address indexed employee, uint256 timestamp);
    event PayrollRunStarted(uint256 indexed runId, uint256 timestamp, uint256 employeeCount);
    event PayrollRunFinalized(uint256 indexed runId, bytes32 auditHash);
    event SalaryMinted(address indexed employee, uint256 indexed runId, uint256 timestamp);
    event DecryptionRequested(uint256 indexed requestId, address indexed requester);
    event SalaryDecrypted(uint256 indexed requestId, address indexed employee);
    event SalaryAccessAuthorized(address indexed employee, address indexed grantee);
    event SystemDeployed(address payToken, address equityOracle);
    event RoleUpdated(bytes32 indexed role, address indexed account, address indexed operator, bool granted);
    event TaxBracketsUpdated(uint256 bracketCount, uint256 timestamp);
    event BaseCurrencyUpdated(bytes32 indexed currencyCode, uint256 exchangeRateBps, uint256 timestamp);
    event ReserveAssetUpdated(address indexed reserveAsset, bool enabled, uint256 timestamp);
    event SalaryTokenReserveDeposited(
        address indexed reserveAsset,
        address indexed beneficiary,
        uint256 reserveAmount,
        uint256 mintedAmount,
        bytes32 baseCurrency,
        uint256 timestamp
    );
    event SalaryTokenRedemptionRequested(
        uint256 indexed requestId,
        address indexed requester,
        address indexed reserveAsset,
        uint256 requestedReserveAmount,
        address payoutRecipient
    );
    event SalaryTokenRedemptionReady(
        uint256 indexed requestId,
        address indexed requester,
        address indexed reserveAsset,
        uint256 approvedReserveAmount,
        address payoutRecipient
    );
    event SalaryTokenRedeemed(
        uint256 indexed requestId,
        address indexed requester,
        address indexed reserveAsset,
        address payoutRecipient,
        uint256 redeemedReserveAmount
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(PAYROLL_MANAGER_ROLE, msg.sender);

        _setRoleAdmin(PAYROLL_MANAGER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(AUDITOR_ROLE, ADMIN_ROLE);

        lastPayrollRun = block.timestamp;

        payToken = new ConfidentialPayToken(
            "Confidential Pay Token",
            "CPT",
            "ipfs://confidential-pay-token-metadata"
        );

        equityOracle = new ConfidentialEquityOracle(address(this), msg.sender);

        supportedReserveAssets[address(0)] = true;

        uint64[] memory thresholds = new uint64[](3);
        uint16[] memory rates = new uint16[](3);
        thresholds[0] = uint64(50_000 * 1_000_000);
        thresholds[1] = uint64(100_000 * 1_000_000);
        thresholds[2] = type(uint64).max;
        rates[0] = TAX_RATE_10_PERCENT;
        rates[1] = TAX_RATE_20_PERCENT;
        rates[2] = TAX_RATE_30_PERCENT;
        _setTaxBrackets(thresholds, rates);

        emit ReserveAssetUpdated(address(0), true, block.timestamp);
        emit BaseCurrencyUpdated(baseCurrency, exchangeRateBps, block.timestamp);
        emit SystemDeployed(address(payToken), address(equityOracle));
    }

    function addEmployee(
        address _employee,
        einput _encryptedSalary,
        bytes calldata inputProof,
        string calldata _encryptedPersonalData,
        uint8 _department,
        uint8 _level,
        uint8 _gender
    ) external onlyRole(ADMIN_ROLE) {
        require(_employee != address(0), "Payroll: zero address");
        require(!employees[_employee].isActive, "Payroll: already exists");
        require(_department > 0, "Payroll: invalid dept");
        require(_level >= 1 && _level <= 10, "Payroll: invalid level");

        euint64 salary = TFHE.asEuint64(_encryptedSalary, inputProof);

        employees[_employee] = EncryptedEmployee({
            wallet: _employee,
            monthlySalary: salary,
            bonus: TFHE.asEuint64(0),
            deductions: TFHE.asEuint64(0),
            netPayLatest: TFHE.asEuint64(0),
            lastPaymentTimestamp: 0,
            employmentStartDate: block.timestamp,
            isActive: true,
            encryptedPersonalData: _encryptedPersonalData,
            department: _department,
            level: _level,
            gender: _gender
        });

        TFHE.allow(salary, address(this));
        TFHE.allow(salary, _employee);
        TFHE.allow(salary, address(equityOracle));
        TFHE.allow(employees[_employee].bonus, address(this));
        TFHE.allow(employees[_employee].deductions, address(this));
        TFHE.allow(employees[_employee].netPayLatest, address(this));

        employeeList.push(_employee);
        equityOracle.registerEmployee(_employee, _department, _level, _gender);

        emit EmployeeAdded(_employee, block.timestamp);
    }

    function updateSalary(
        address _employee,
        einput _newSalary,
        bytes calldata inputProof
    ) external onlyRole(PAYROLL_MANAGER_ROLE) {
        require(employees[_employee].isActive, "Payroll: not found");

        euint64 newSalary = TFHE.asEuint64(_newSalary, inputProof);
        employees[_employee].monthlySalary = newSalary;

        TFHE.allow(newSalary, address(this));
        TFHE.allow(newSalary, _employee);
        TFHE.allow(newSalary, address(equityOracle));

        emit EmployeeUpdated(_employee, block.timestamp);
    }

    function addBonus(
        address _employee,
        einput _encBonus,
        bytes calldata inputProof
    ) external onlyRole(PAYROLL_MANAGER_ROLE) {
        require(employees[_employee].isActive, "Payroll: not found");

        euint64 bonus = TFHE.asEuint64(_encBonus, inputProof);
        employees[_employee].bonus = TFHE.add(employees[_employee].bonus, bonus);

        TFHE.allow(employees[_employee].bonus, address(this));
        TFHE.allow(employees[_employee].bonus, _employee);
    }

    function addConditionalBonus(
        address _employee,
        einput _encBonus,
        einput _encTier,
        bytes calldata inputProof
    ) external onlyRole(PAYROLL_MANAGER_ROLE) {
        require(employees[_employee].isActive, "Payroll: not found");

        euint64 submittedBonus = TFHE.asEuint64(_encBonus, inputProof);
        euint64 tier = TFHE.asEuint64(_encTier, inputProof);

        euint64 effectiveCap = _resolveTierCap(tier);
        euint64 approvedBonus = TFHE.min(submittedBonus, effectiveCap);

        employees[_employee].bonus = TFHE.add(employees[_employee].bonus, approvedBonus);
        TFHE.allow(employees[_employee].bonus, address(this));
        TFHE.allow(employees[_employee].bonus, _employee);
    }

    function addDeduction(
        address _employee,
        einput _encDeduction,
        bytes calldata inputProof
    ) external onlyRole(PAYROLL_MANAGER_ROLE) {
        require(employees[_employee].isActive, "Payroll: not found");

        euint64 deduction = TFHE.asEuint64(_encDeduction, inputProof);
        employees[_employee].deductions = TFHE.add(employees[_employee].deductions, deduction);

        TFHE.allow(employees[_employee].deductions, address(this));
        TFHE.allow(employees[_employee].deductions, _employee);
    }

    function removeEmployee(address _employee) external onlyRole(ADMIN_ROLE) {
        require(employees[_employee].isActive, "Payroll: not active");
        employees[_employee].isActive = false;
        emit EmployeeRemoved(_employee, block.timestamp);
    }

    function runPayroll()
        external
        onlyRole(PAYROLL_MANAGER_ROLE)
        nonReentrant
        returns (uint256)
    {
        require(block.timestamp >= lastPayrollRun + payrollFrequency, "Payroll: not due yet");

        uint256 runId = _initializePayrollRun();
        PayrollRun storage run = payrollRuns[runId];

        for (uint256 i = 0; i < employeeList.length; i++) {
            address employee = employeeList[i];
            _processEmployeePayroll(employee, runId, run);
        }

        _finalizeRunAccounting(runId, run);

        emit PayrollRunStarted(runId, block.timestamp, run.employeeCount);
        return runId;
    }

    function finalizePayrollRun(uint256 _runId) external onlyRole(ADMIN_ROLE) {
        require(!payrollRuns[_runId].isFinalized, "Payroll: already finalized");
        require(payrollRuns[_runId].timestamp > 0, "Payroll: run not found");

        payrollRuns[_runId].isFinalized = true;

        emit PayrollRunFinalized(_runId, payrollRuns[_runId].auditHash);
    }

    function authorizeSalaryAccess(address grantee) external {
        require(employees[msg.sender].isActive, "Payroll: not an employee");
        require(grantee != address(0), "Payroll: zero address");

        TFHE.allow(employees[msg.sender].monthlySalary, grantee);

        emit SalaryAccessAuthorized(msg.sender, grantee);
    }

    function requestSalaryDecryption() external returns (uint256) {
        require(employees[msg.sender].isActive, "Payroll: not an employee");

        uint256 requestId = _nextRequestId++;
        _decryptRequests[requestId] = msg.sender;

        uint256[] memory cts = new uint256[](1);
        cts[0] = Gateway.toUint256(employees[msg.sender].monthlySalary);

        Gateway.requestDecryption(
            cts,
            this.salaryDecryptionCallback.selector,
            requestId,
            block.timestamp + 100,
            false
        );

        emit DecryptionRequested(requestId, msg.sender);
        return requestId;
    }

    function salaryDecryptionCallback(
        uint256 requestId,
        uint64 decryptedSalary
    ) external onlyGateway returns (uint64) {
        address employee = _decryptRequests[requestId];
        delete _decryptRequests[requestId];
        emit SalaryDecrypted(requestId, employee);
        return decryptedSalary;
    }

    function getMyPayment(uint256 _runId) external view returns (euint64) {
        require(employees[msg.sender].isActive, "Payroll: not an employee");
        return employeePayments[msg.sender][_runId];
    }

    function auditPayrollRun(uint256 _runId)
        external
        view
        onlyRole(AUDITOR_ROLE)
        returns (
            uint256 timestamp,
            uint256 employeeCount,
            bytes32 auditHash,
            bool isFinalized
        )
    {
        PayrollRun storage run = payrollRuns[_runId];
        return (run.timestamp, run.employeeCount, run.auditHash, run.isFinalized);
    }

    function getEmployeeInfo(address _employee)
        external
        view
        returns (
            bool isActive,
            uint256 employmentStartDate,
            uint256 lastPaymentTimestamp,
            string memory encryptedPersonalData,
            uint8 department,
            uint8 level
        )
    {
        require(
            msg.sender == _employee ||
                hasRole(ADMIN_ROLE, msg.sender) ||
                hasRole(PAYROLL_MANAGER_ROLE, msg.sender),
            "Payroll: unauthorized"
        );

        EncryptedEmployee storage employee = employees[_employee];
        return (
            employee.isActive,
            employee.employmentStartDate,
            employee.lastPaymentTimestamp,
            employee.encryptedPersonalData,
            employee.department,
            employee.level
        );
    }

    function getActiveEmployeeCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < employeeList.length; i++) {
            if (employees[employeeList[i]].isActive) {
                count++;
            }
        }
    }

    function getSystemAddresses() external view returns (address token, address oracle) {
        return (address(payToken), address(equityOracle));
    }

    function batchRunPayroll(
        uint256 _runId,
        uint256 startIndex,
        uint256 endIndex
    ) external onlyRole(PAYROLL_MANAGER_ROLE) nonReentrant {
        require(payrollRuns[_runId].timestamp > 0, "Payroll: run not initialized");
        require(!payrollRuns[_runId].isFinalized, "Payroll: already finalized");
        require(startIndex < endIndex, "Payroll: invalid range");
        require(endIndex <= employeeList.length, "Payroll: index out of bounds");

        PayrollRun storage run = payrollRuns[_runId];

        for (uint256 i = startIndex; i < endIndex; i++) {
            address employee = employeeList[i];
            _processEmployeePayroll(employee, _runId, run);
        }

        TFHE.allow(run.totalGrossPay, address(this));
        TFHE.allow(run.totalDeductions, address(this));
        TFHE.allow(run.totalNetPay, address(this));
    }

    function initPayrollRun() external onlyRole(PAYROLL_MANAGER_ROLE) returns (uint256) {
        require(block.timestamp >= lastPayrollRun + payrollFrequency, "Payroll: not due yet");
        return _initializePayrollRun();
    }

    function setPayrollFrequency(uint256 _freq) external onlyRole(ADMIN_ROLE) {
        require(_freq >= 1 days && _freq <= 365 days, "Payroll: invalid frequency");
        payrollFrequency = _freq;
    }

    function setTaxBrackets(
        uint64[] calldata thresholds,
        uint16[] calldata rates
    ) external onlyRole(ADMIN_ROLE) {
        _setTaxBrackets(thresholds, rates);
    }

    function setBaseCurrency(bytes32 currencyCode, uint256 newExchangeRateBps) external onlyRole(ADMIN_ROLE) {
        require(currencyCode != bytes32(0), "Payroll: invalid currency");
        require(newExchangeRateBps > 0, "Payroll: invalid exchange rate");

        baseCurrency = currencyCode;
        exchangeRateBps = newExchangeRateBps;

        emit BaseCurrencyUpdated(currencyCode, newExchangeRateBps, block.timestamp);
    }

    function setReserveAsset(address reserveAsset, bool enabled) external onlyRole(ADMIN_ROLE) {
        supportedReserveAssets[reserveAsset] = enabled;
        emit ReserveAssetUpdated(reserveAsset, enabled, block.timestamp);
    }

    function depositSalaryTokenReserve(
        address reserveAsset,
        address beneficiary,
        uint256 reserveAmount
    ) external payable onlyRole(ADMIN_ROLE) nonReentrant returns (uint256 mintedAmount) {
        require(beneficiary != address(0), "Payroll: zero beneficiary");
        require(supportedReserveAssets[reserveAsset], "Payroll: unsupported reserve");
        require(reserveAmount > 0, "Payroll: zero amount");

        if (reserveAsset == address(0)) {
            require(msg.value == reserveAmount, "Payroll: ETH amount mismatch");
        } else {
            require(msg.value == 0, "Payroll: unexpected ETH");
            IERC20(reserveAsset).safeTransferFrom(msg.sender, address(this), reserveAmount);
        }

        mintedAmount = convertReserveToCpt(reserveAmount);
        require(mintedAmount <= type(uint64).max, "Payroll: mint overflow");

        reserveBalances[reserveAsset] += reserveAmount;

        euint64 encryptedMintAmount = TFHE.asEuint64(uint64(mintedAmount));
        TFHE.allow(encryptedMintAmount, address(this));
        TFHE.allow(encryptedMintAmount, address(payToken));
        TFHE.allow(encryptedMintAmount, beneficiary);

        payToken.mint(beneficiary, encryptedMintAmount);

        emit SalaryTokenReserveDeposited(
            reserveAsset,
            beneficiary,
            reserveAmount,
            mintedAmount,
            baseCurrency,
            block.timestamp
        );
    }

    function requestSalaryTokenRedemption(
        address reserveAsset,
        uint256 requestedReserveAmount,
        address payoutRecipient
    ) external nonReentrant returns (uint256 requestId) {
        require(payoutRecipient != address(0), "Payroll: zero payout recipient");
        require(supportedReserveAssets[reserveAsset], "Payroll: unsupported reserve");
        require(requestedReserveAmount > 0, "Payroll: zero amount");
        require(reserveBalances[reserveAsset] > 0, "Payroll: reserve empty");

        uint256 requestedMintAmount = convertReserveToCpt(requestedReserveAmount);
        require(requestedMintAmount > 0, "Payroll: amount too small");
        require(requestedMintAmount <= type(uint64).max, "Payroll: redeem overflow");

        euint64 encryptedBurnAmount = TFHE.asEuint64(uint64(requestedMintAmount));
        TFHE.allow(encryptedBurnAmount, address(this));
        TFHE.allow(encryptedBurnAmount, address(payToken));

        euint64 burnedAmount = payToken.burn(msg.sender, encryptedBurnAmount);
        TFHE.allow(burnedAmount, address(this));

        uint256[] memory cts = new uint256[](1);
        cts[0] = Gateway.toUint256(burnedAmount);

        requestId = _nextRedemptionRequestId++;
        pendingTokenRedemptions[requestId] = PendingTokenRedemption({
            requester: msg.sender,
            reserveAsset: reserveAsset,
            payoutRecipient: payoutRecipient,
            requestedReserveAmount: requestedReserveAmount,
            approvedReserveAmount: 0,
            exists: true,
            ready: false
        });

        Gateway.requestDecryption(
            cts,
            this.salaryTokenRedemptionCallback.selector,
            requestId,
            block.timestamp + 300,
            false
        );

        emit SalaryTokenRedemptionRequested(
            requestId,
            msg.sender,
            reserveAsset,
            requestedReserveAmount,
            payoutRecipient
        );
    }

    function salaryTokenRedemptionCallback(
        uint256 requestId,
        uint64 burnedAmount
    ) external onlyGateway returns (uint64) {
        PendingTokenRedemption storage redemption = pendingTokenRedemptions[requestId];
        require(redemption.exists, "Payroll: unknown redemption");

        uint256 approvedReserveAmount = convertCptToReserve(burnedAmount);
        if (approvedReserveAmount > redemption.requestedReserveAmount) {
            approvedReserveAmount = redemption.requestedReserveAmount;
        }
        if (approvedReserveAmount > reserveBalances[redemption.reserveAsset]) {
            approvedReserveAmount = reserveBalances[redemption.reserveAsset];
        }

        redemption.approvedReserveAmount = approvedReserveAmount;
        redemption.ready = true;

        emit SalaryTokenRedemptionReady(
            requestId,
            redemption.requester,
            redemption.reserveAsset,
            approvedReserveAmount,
            redemption.payoutRecipient
        );

        return burnedAmount;
    }

    function claimSalaryTokenRedemption(uint256 requestId) external nonReentrant {
        PendingTokenRedemption memory redemption = pendingTokenRedemptions[requestId];
        require(redemption.exists, "Payroll: unknown redemption");
        require(redemption.ready, "Payroll: redemption pending");
        require(
            msg.sender == redemption.requester || hasRole(ADMIN_ROLE, msg.sender),
            "Payroll: unauthorized redemption"
        );
        require(redemption.approvedReserveAmount > 0, "Payroll: nothing redeemable");

        reserveBalances[redemption.reserveAsset] -= redemption.approvedReserveAmount;
        delete pendingTokenRedemptions[requestId];

        if (redemption.reserveAsset == address(0)) {
            (bool sent, ) = redemption.payoutRecipient.call{value: redemption.approvedReserveAmount}("");
            require(sent, "Payroll: ETH transfer failed");
        } else {
            IERC20(redemption.reserveAsset).safeTransfer(
                redemption.payoutRecipient,
                redemption.approvedReserveAmount
            );
        }

        emit SalaryTokenRedeemed(
            requestId,
            redemption.requester,
            redemption.reserveAsset,
            redemption.payoutRecipient,
            redemption.approvedReserveAmount
        );
    }

    function convertReserveToCpt(uint256 reserveAmount) public view returns (uint256) {
        return (reserveAmount * exchangeRateBps) / FX_RATE_SCALE;
    }

    function convertCptToReserve(uint256 cptAmount) public view returns (uint256) {
        return (cptAmount * FX_RATE_SCALE) / exchangeRateBps;
    }

    function grantOperationalRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        require(role == PAYROLL_MANAGER_ROLE || role == AUDITOR_ROLE, "Payroll: unsupported role");
        _grantRole(role, account);
        emit RoleUpdated(role, account, msg.sender, true);
    }

    function revokeOperationalRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        require(role == PAYROLL_MANAGER_ROLE || role == AUDITOR_ROLE, "Payroll: unsupported role");
        _revokeRole(role, account);
        emit RoleUpdated(role, account, msg.sender, false);
    }

    function grantAdminRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(ADMIN_ROLE, account);
        emit RoleUpdated(ADMIN_ROLE, account, msg.sender, true);
    }

    function revokeAdminRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(ADMIN_ROLE, account);
        emit RoleUpdated(ADMIN_ROLE, account, msg.sender, false);
    }

    function grantRole(bytes32 role, address account)
        public
        override
        onlyRole(getRoleAdmin(role))
    {
        bool alreadyGranted = hasRole(role, account);
        super.grantRole(role, account);
        if (!alreadyGranted) {
            emit RoleUpdated(role, account, msg.sender, true);
        }
    }

    function revokeRole(bytes32 role, address account)
        public
        override
        onlyRole(getRoleAdmin(role))
    {
        bool alreadyMissing = !hasRole(role, account);
        super.revokeRole(role, account);
        if (!alreadyMissing) {
            emit RoleUpdated(role, account, msg.sender, false);
        }
    }

    function renounceRole(bytes32 role, address callerConfirmation) public override {
        bool hadRole = hasRole(role, callerConfirmation);
        super.renounceRole(role, callerConfirmation);
        if (hadRole) {
            emit RoleUpdated(role, callerConfirmation, msg.sender, false);
        }
    }

    function _resolveTierCap(euint64 tier) internal returns (euint64) {
        euint64 cap = TFHE.asEuint64(type(uint64).max);
        cap = TFHE.select(TFHE.eq(tier, TFHE.asEuint64(4)), TFHE.asEuint64(20_000 * 1e6), cap);
        cap = TFHE.select(TFHE.eq(tier, TFHE.asEuint64(3)), TFHE.asEuint64(10_000 * 1e6), cap);
        cap = TFHE.select(TFHE.eq(tier, TFHE.asEuint64(2)), TFHE.asEuint64(5_000 * 1e6), cap);
        cap = TFHE.select(TFHE.eq(tier, TFHE.asEuint64(1)), TFHE.asEuint64(2_000 * 1e6), cap);
        return cap;
    }

    function _calculateTax(euint64 grossPay) internal returns (euint64 totalTax) {
        totalTax = TFHE.asEuint64(0);
        uint64 previousThreshold = 0;

        for (uint256 i = 0; i < taxBrackets.length; i++) {
            TaxBracket memory bracket = taxBrackets[i];
            euint64 cappedAtThreshold = bracket.threshold == type(uint64).max
                ? grossPay
                : TFHE.min(grossPay, TFHE.asEuint64(bracket.threshold));
            euint64 previousFloor = TFHE.asEuint64(previousThreshold);
            ebool aboveFloor = TFHE.gt(cappedAtThreshold, previousFloor);
            euint64 bracketAmount = TFHE.select(
                aboveFloor,
                TFHE.sub(cappedAtThreshold, previousFloor),
                TFHE.asEuint64(0)
            );

            totalTax = TFHE.add(totalTax, _applyTaxRateApproximation(bracketAmount, bracket.rate));
            previousThreshold = bracket.threshold;
        }
    }

    function _applyTaxRateApproximation(euint64 amount, uint16 rate) internal returns (euint64) {
        if (rate == 0) {
            return TFHE.asEuint64(0);
        }
        if (rate == TAX_RATE_10_PERCENT) {
            return TFHE.sub(TFHE.shr(amount, 3), TFHE.shr(amount, 5));
        }
        if (rate == TAX_RATE_20_PERCENT) {
            return TFHE.sub(TFHE.shr(amount, 2), TFHE.shr(amount, 4));
        }
        if (rate == TAX_RATE_30_PERCENT) {
            return TFHE.sub(TFHE.sub(TFHE.shr(amount, 1), TFHE.shr(amount, 2)), TFHE.shr(amount, 4));
        }
        revert("Payroll: unsupported tax rate");
    }

    function _processEmployeePayroll(
        address employeeAddress,
        uint256 runId,
        PayrollRun storage run
    ) internal returns (bool processed) {
        EncryptedEmployee storage employee = employees[employeeAddress];
        if (!employee.isActive) {
            return false;
        }

        euint64 grossPay = TFHE.add(employee.monthlySalary, employee.bonus);
        euint64 tax = _calculateTax(grossPay);
        euint64 totalDeductions = TFHE.add(employee.deductions, tax);
        euint64 safeDeductions = TFHE.min(totalDeductions, grossPay);
        euint64 netPay = TFHE.sub(grossPay, safeDeductions);

        employee.netPayLatest = netPay;
        employee.lastPaymentTimestamp = block.timestamp;
        employeePayments[employeeAddress][runId] = netPay;

        TFHE.allow(netPay, employeeAddress);
        TFHE.allow(netPay, address(this));
        TFHE.allow(netPay, address(payToken));
        TFHE.allow(employeePayments[employeeAddress][runId], employeeAddress);

        payToken.mint(employeeAddress, netPay);

        run.totalGrossPay = TFHE.add(run.totalGrossPay, grossPay);
        run.totalDeductions = TFHE.add(run.totalDeductions, totalDeductions);
        run.totalNetPay = TFHE.add(run.totalNetPay, netPay);
        run.employeeCount++;

        employee.bonus = TFHE.asEuint64(0);
        employee.deductions = TFHE.asEuint64(0);

        TFHE.allow(employee.bonus, address(this));
        TFHE.allow(employee.deductions, address(this));

        emit SalaryMinted(employeeAddress, runId, block.timestamp);
        return true;
    }

    function _initializePayrollRun() internal returns (uint256 runId) {
        runId = nextPayrollRunId++;
        PayrollRun storage run = payrollRuns[runId];

        run.runId = runId;
        run.timestamp = block.timestamp;
        run.employeeCount = 0;
        run.totalGrossPay = TFHE.asEuint64(0);
        run.totalDeductions = TFHE.asEuint64(0);
        run.totalNetPay = TFHE.asEuint64(0);

        TFHE.allow(run.totalGrossPay, address(this));
        TFHE.allow(run.totalDeductions, address(this));
        TFHE.allow(run.totalNetPay, address(this));

        lastPayrollRun = block.timestamp;
    }

    function _finalizeRunAccounting(uint256 runId, PayrollRun storage run) internal {
        TFHE.allow(run.totalGrossPay, address(this));
        TFHE.allow(run.totalDeductions, address(this));
        TFHE.allow(run.totalNetPay, address(this));

        run.auditHash = keccak256(
            abi.encodePacked(
                runId,
                run.timestamp,
                run.employeeCount,
                blockhash(block.number - 1),
                address(payToken),
                baseCurrency,
                exchangeRateBps
            )
        );
    }

    function _setTaxBrackets(uint64[] memory thresholds, uint16[] memory rates) internal {
        require(thresholds.length == rates.length, "Payroll: bracket length mismatch");
        require(thresholds.length > 0, "Payroll: empty brackets");
        require(thresholds[thresholds.length - 1] == type(uint64).max, "Payroll: top bracket must be open");

        delete taxBrackets;

        uint64 previousThreshold = 0;
        for (uint256 i = 0; i < thresholds.length; i++) {
            require(thresholds[i] > previousThreshold, "Payroll: thresholds not ascending");
            require(_isSupportedTaxRate(rates[i]), "Payroll: unsupported tax rate");

            taxBrackets.push(TaxBracket({threshold: thresholds[i], rate: rates[i]}));
            previousThreshold = thresholds[i];
        }

        emit TaxBracketsUpdated(thresholds.length, block.timestamp);
    }

    function _isSupportedTaxRate(uint16 rate) internal pure returns (bool) {
        return rate == 0 || rate == TAX_RATE_10_PERCENT || rate == TAX_RATE_20_PERCENT || rate == TAX_RATE_30_PERCENT;
    }

    receive() external payable {}
}
