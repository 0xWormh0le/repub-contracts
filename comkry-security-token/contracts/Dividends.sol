// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract Dividends is AccessControl, ReentrancyGuard {

  using SafeERC20 for IERC20;

  ERC20Snapshot public immutable restrictedToken;

  uint256 public contractAdminCount;

  bytes32 private constant CONTRACT_ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

  event Funded (address indexed payer, address indexed token, uint256 amount, uint256 indexed snapshotId);
  event Claimed (address indexed payee, address indexed token, uint256 amount, uint256 indexed snapshotId);
  event Withdrawn (address indexed payee, address indexed token, uint256 amount, uint256 indexed snapshotId);
  event RoleChange(address indexed grantor, address indexed grantee, string role, bool indexed status);

  /// @dev snapshotID => funderAddress => token => getAmount;
  mapping(uint256 => mapping(address => mapping(address => uint256))) claimedTokens;

  /// @dev snapshotID => token => totalAmount of token
  mapping(uint256 => mapping(address => uint256)) tokensFunded;

  /// @dev Accuracy of division
  uint256 public constant tokenPrecisionDivider = 10000;

  /**
   * @dev Contract constructor
   * @param restrictedToken_ RestrictedSwap Token
   */
  constructor(address restrictedToken_) public {
    _setupRole(CONTRACT_ADMIN_ROLE, msg.sender);
    contractAdminCount = 1;
    restrictedToken = ERC20Snapshot(restrictedToken_);
  }

  modifier onlyContractAdmin() {
    require(hasRole(CONTRACT_ADMIN_ROLE, msg.sender), "DOES NOT HAVE CONTRACT ADMIN ROLE");
    _;
  }

  modifier validAddress(address addr) {
    require(addr != address(0), "Address cannot be 0x0");
    _;
  }

  /// @dev Authorizes an address holder to be a contract admin. Contract admins grant privileges to accounts.
  /// Contract admins can mint/burn tokens and freeze accounts.
  /// @param addr The address to grant transfer admin rights to.
  function grantContractAdmin(address addr) external validAddress(addr) onlyContractAdmin {
    grantRole(CONTRACT_ADMIN_ROLE, addr);
    contractAdminCount += 1;
    emit RoleChange(msg.sender, addr, "ContractAdmin", true);
  }

  /// @dev Revokes authorization as a contract admin.
  /// The contract requires there is at least 1 Contract Admin to avoid locking the Contract Admin functionality.
  /// @param addr The address to remove contract admin rights from
  function revokeContractAdmin(address addr) external validAddress(addr) onlyContractAdmin {
    require(contractAdminCount > 1, "Must have at least one contract admin");
    revokeRole(CONTRACT_ADMIN_ROLE, addr);
    contractAdminCount -= 1;
    emit RoleChange(msg.sender, addr, "ContractAdmin", false);
  }

  /// @dev Checks if an address is an authorized contract admin.
  /// @param addr The address to check for contract admin privileges.
  /// @return hasPermission returns true if the address has contract admin permission and false if not.
  function checkContractAdmin(address addr) external view returns (bool hasPermission) {
    return hasRole(CONTRACT_ADMIN_ROLE, addr);
  }

  /// @dev Get unused ERC-20 tokens on snapshot
  /// @param token ERC-20 token address
  /// @param snapshotId Snapshot ID
  /// @return amount of ERC-20 tokens
  function tokensAt(address token, uint256 snapshotId) public view returns (uint256) {
    return IERC20(token).balanceOf(address(this));
  }

  /// @dev Withdrawal remains of unused ERC-20 tokens at snapshot
  /// @param token ERC-20 token address
  /// @param snapshotId Snapshot ID
  function withdrawalRemains(address token, uint256 snapshotId) public onlyContractAdmin nonReentrant {
    require(token != address(0), "BAD TOKEN ADDRESS");

    uint256 amount = tokensAt(token, snapshotId);

    require(amount > 0, "CONTRACT DOES NOT HAVE TOKENS");

    IERC20(token).safeTransfer(msg.sender, amount);

    emit Withdrawn(msg.sender, token, amount, snapshotId);
  }

  /**
   * @dev Fund any ERC-20 tokens into current contract
   * Tokens can be claimed by holders of RestrictedSwap Token uses claimDividends method
   * @param token ERC-20 token address
   * @param amount amount of tokens to fund
   * @param snapshotId snapshot ID of RestrictedSwap Token
   */
  function fundDividend(address token, uint256 amount, uint256 snapshotId) public {
    require(token != address(0), "BAD TOKEN ADDRESS");

    IERC20 paymentToken = IERC20(token);

    require(paymentToken.balanceOf(msg.sender) >= amount, "SENDER DOES NOT HAVE TOKENS");

    paymentToken.safeTransferFrom(msg.sender, address(this), amount);

    tokensFunded[snapshotId][token] += amount;

    emit Funded(msg.sender, token, amount, snapshotId);
  }

  /**
   * @dev Get balance of ERC-20 tokens funded at snapshot
   * @param token ERC-20 token address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of ERC-20 tokens
   */
  function fundsAt(address token, uint256 snapshotId) public view returns (uint256) {
    return tokensFunded[snapshotId][token];
  }

  /**
   * @dev Amount of ERC-20 tokens distributed to the holder of RestrictedSwap Token at snapshot
   * @param token ERC-20 token address
   * @param receiver RestrictedSwap Token's holder address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of total ERC-20 tokens distributed to the receiver
   */
  function totalAwardedBalanceAt(address token, address receiver, uint256 snapshotId) public view returns (uint256) {
    uint256 secTokenBalance = restrictedToken.balanceOfAt(receiver, snapshotId);
    uint256 totalSupply = restrictedToken.totalSupplyAt(snapshotId);
    uint256 share = (secTokenBalance * tokenPrecisionDivider) / totalSupply;
    return (tokensFunded[snapshotId][token] * share) / tokenPrecisionDivider;
  }

  /**
   * @dev Amount of ERC-20 tokens claimed by the holder of RestrictedSwap Token at snapshot
   * @param token ERC-20 token address
   * @param receiver RestrictedSwap Token's holder address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of claimed ERC-20 tokens
   */
  function claimedBalanceAt(address token, address receiver, uint256 snapshotId) public view returns (uint256) {
    return claimedTokens[snapshotId][token][receiver];
  }

  /**
   * @dev Amount of ERC-20 tokens that can be claimed by the holder of RestrictedSwap Token at snapshot
   * @param token ERC-20 token address
   * @param receiver RestrictedSwap Token's holder address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   * @return amount of can be claimed ERC-20 tokens
   */
  function unclaimedBalanceAt(address token, address receiver, uint256 snapshotId) public view returns (uint256) {
    return totalAwardedBalanceAt(token, receiver, snapshotId) - claimedBalanceAt(token, receiver, snapshotId);
  }

  /**
   * @dev Claim ERC-20 tokens (dividends) by RestrictedSwap Tokens holder
   * Tokens can be claimed when its allowed by unclaimedBalanceAt
   * @param token ERC-20 token address
   * @param snapshotId snapshot ID of RestrictedSwap Token
   */
  function claimDividend(address token, uint256 snapshotId) public nonReentrant {
    uint256 unclaimedBalance = unclaimedBalanceAt(token, msg.sender, snapshotId);

    require(unclaimedBalance > 0, "YOU CAN`T RECEIVE MORE TOKENS");

    IERC20(token).safeTransfer(msg.sender, unclaimedBalance);

    claimedTokens[snapshotId][token][msg.sender] += unclaimedBalance;

    emit Claimed(msg.sender, token, unclaimedBalance, snapshotId);
  }
}
