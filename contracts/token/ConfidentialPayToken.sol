// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import "fhevm/gateway/GatewayCaller.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IERC7984.sol";

// Helper extension – convert uint256 to bytes32 (Gateway handle format)
library Uint256ToBytes32 {
    function toBytes32(uint256 value) internal pure returns (bytes32) {
        return bytes32(value);
    }
}

/**
 * @title ConfidentialPayToken (CPT)
 * @notice ERC-7984 compliant confidential fungible token for payroll disbursement.
 *
 * @dev This token acts as the on-chain salary currency. All balances are FHE-encrypted
 *      so no one — not even the token contract deployer — can see how much any employee holds.
 *
 * KEY DESIGN:
 *  - Minted by the Payroll contract when salaries are disbursed.
 *  - Redeemable 1:1 for USDC/ETH via the wrapped asset mechanism.
 *  - Fully ERC-7984 compliant (interface ID: 0x4958f2a4).
 *  - Supports operator-based transfers for automated payroll processing.
 *
 * Built for Zama Developer Program – Confidential Payroll Challenge
 */
contract ConfidentialPayToken is IERC7984, ERC165, AccessControl, ReentrancyGuard, GatewayCaller {

    using Uint256ToBytes32 for uint256;

    // =========================================================================
    // Roles
    // =========================================================================

    bytes32 public constant MINTER_ROLE   = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE   = keccak256("BURNER_ROLE");

    // =========================================================================
    // ERC-7984 State
    // =========================================================================

    string private _name;
    string private _symbol;
    string private _contractURI;

    /// @dev Encrypted total supply
    euint64 private _totalSupply;

    /// @dev address → encrypted balance
    mapping(address => euint64) private _balances;

    /// @dev holder → operator → expiration timestamp
    mapping(address => mapping(address => uint256)) private _operators;

    // =========================================================================
    // Constants
    // =========================================================================

    uint8  public constant DECIMALS       = 6;   // Like USDC
    bytes4 public constant ERC7984_ID     = 0x4958f2a4;

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        string memory tokenContractURI
    ) {
        _name        = tokenName;
        _symbol      = tokenSymbol;
        _contractURI = tokenContractURI;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);

        // Initialize encrypted total supply to 0
        _totalSupply = TFHE.asEuint64(0);
        TFHE.allow(_totalSupply, address(this));
    }

    // =========================================================================
    // ERC-165
    // =========================================================================

    /**
     * @notice Supports ERC-7984 (0x4958f2a4), ERC-165, and AccessControl.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC165, AccessControl, IERC7984)
        returns (bool)
    {
        return
            interfaceId == ERC7984_ID ||
            super.supportsInterface(interfaceId);
    }

    // =========================================================================
    // Metadata
    // =========================================================================

    function name()        external view override returns (string memory) { return _name; }
    function symbol()      external view override returns (string memory) { return _symbol; }
    function decimals()    external pure  override returns (uint8)         { return DECIMALS; }
    function contractURI() external view override returns (string memory) { return _contractURI; }

    // =========================================================================
    // Supply & Balances
    // =========================================================================

    /**
     * @notice Returns encrypted total supply as a bytes32 handle.
     * @dev Can be decrypted by the admin via Gateway.
     */
    function confidentialTotalSupply() external view override returns (bytes32) {
        return Gateway.toUint256(_totalSupply).toBytes32();
    }

    /**
     * @notice Returns the encrypted balance handle for `account`.
     * @dev Only `account` or an approved operator can decrypt this.
     */
    function confidentialBalanceOf(address account) external view override returns (bytes32) {
        return Gateway.toUint256(_balances[account]).toBytes32();
    }

    /**
     * @notice Returns the raw euint64 balance (for contract-to-contract use).
     * @dev Caller must have ACL permission on the ciphertext.
     */
    function encryptedBalanceOf(address account) external view returns (euint64) {
        return _balances[account];
    }

    // =========================================================================
    // Operators
    // =========================================================================

    function isOperator(address holder, address operator)
        external view override returns (bool)
    {
        return _operators[holder][operator] > block.timestamp;
    }

    function setOperator(address operator, uint256 expiration)
        external override
    {
        require(expiration > block.timestamp, "CPT: expiration in the past");
        _operators[msg.sender][operator] = expiration;
        emit OperatorSet(msg.sender, operator, expiration);
    }

    // =========================================================================
    // Transfers – with inputProof (new ciphertext from client)
    // =========================================================================

    function confidentialTransfer(
        address to,
        einput encryptedAmount,
        bytes calldata inputProof
    ) external override nonReentrant returns (euint64 transferred) {
        euint64 amount = TFHE.asEuint64(encryptedAmount, inputProof);
        return _transfer(msg.sender, to, amount);
    }

    function confidentialTransferFrom(
        address from,
        address to,
        einput encryptedAmount,
        bytes calldata inputProof
    ) external override nonReentrant returns (euint64 transferred) {
        _requireOperator(from);
        euint64 amount = TFHE.asEuint64(encryptedAmount, inputProof);
        return _transfer(from, to, amount);
    }

    // =========================================================================
    // Transfers – without inputProof (reuse existing allowed ciphertext)
    // =========================================================================

    function confidentialTransfer(
        address to,
        euint64 amount
    ) external override nonReentrant returns (euint64 transferred) {
        return _transfer(msg.sender, to, amount);
    }

    function confidentialTransferFrom(
        address from,
        address to,
        euint64 amount
    ) external override nonReentrant returns (euint64 transferred) {
        _requireOperator(from);
        return _transfer(from, to, amount);
    }

    // =========================================================================
    // Mint / Burn (Payroll contract only)
    // =========================================================================

    /**
     * @notice Mint encrypted `amount` to `to`. Called by Payroll contract on salary disbursement.
     * @dev Uses ACL: only MINTER_ROLE addresses can call.
     */
    function mint(address to, euint64 amount) external onlyRole(MINTER_ROLE) {
        require(to != address(0), "CPT: mint to zero address");

        // Increase balance (FHE addition)
        _balances[to] = TFHE.add(_balances[to], amount);

        // Increase total supply (FHE addition)
        _totalSupply = TFHE.add(_totalSupply, amount);

        // Grant ACL: recipient can decrypt their own balance
        TFHE.allow(_balances[to], to);
        TFHE.allow(_balances[to], address(this));
        TFHE.allow(_totalSupply, address(this));

        emit ConfidentialTransfer(address(0), to);
    }

    /**
     * @notice Burn encrypted `amount` from `from`. Called on redemption.
     */
    function burn(address from, euint64 amount) external onlyRole(BURNER_ROLE) {
        require(from != address(0), "CPT: burn from zero address");

        // Decrease balance (FHE subtraction — underflow-safe via FHE min selection)
        euint64 burnAmt  = TFHE.min(amount, _balances[from]);
        _balances[from]  = TFHE.sub(_balances[from], burnAmt);
        _totalSupply     = TFHE.sub(_totalSupply, burnAmt);

        TFHE.allow(_balances[from], from);
        TFHE.allow(_balances[from], address(this));
        TFHE.allow(_totalSupply,    address(this));

        emit ConfidentialTransfer(from, address(0));
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    function _transfer(
        address from,
        address to,
        euint64 amount
    ) internal returns (euint64 transferred) {
        require(to != address(0), "CPT: transfer to zero address");

        // FHE min-check: can only transfer up to available balance
        euint64 safeAmount = TFHE.min(amount, _balances[from]);

        _balances[from] = TFHE.sub(_balances[from], safeAmount);
        _balances[to]   = TFHE.add(_balances[to],   safeAmount);

        // ACL: update permissions
        TFHE.allow(_balances[from], from);
        TFHE.allow(_balances[from], address(this));
        TFHE.allow(_balances[to],   to);
        TFHE.allow(_balances[to],   address(this));

        emit ConfidentialTransfer(from, to);
        return safeAmount;
    }

    function _requireOperator(address holder) internal view {
        require(
            msg.sender == holder || _operators[holder][msg.sender] > block.timestamp,
            "CPT: not authorized"
        );
    }
}
