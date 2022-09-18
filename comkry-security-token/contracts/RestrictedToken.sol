// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "./interfaces/ITransferRules.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";

/// @title Restricted Token
/// @author CoMakery, Inc.
/// @notice An ERC-20 token with ERC-1404 transfer restrictions for managing security tokens, etc.
contract RestrictedToken is ERC20Snapshot, AccessControl {
  uint8 public _decimals;
  ITransferRules public transferRules;

  bytes32 private constant CONTRACT_ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
  bytes32 private constant TRANSFER_ADMIN_ROLE = keccak256("TRANSFER_ADMIN");
  bytes32 private constant WALLETS_ADMIN_ROLE = keccak256("WALLET_ADMIN");
  bytes32 private constant RESERVE_ADMIN_ROLE = keccak256("RESERVE_ADMIN");

  uint256 public maxTotalSupply;
  uint256 public contractAdminCount;

  struct LockUntil {
      uint256 timestamp; // unix timestamp to lock funds until
      uint256 minBalance; // minimal balance that has to remain at the address until the timestamp
  }

  // Transfer restriction "eternal storage" mappings that can be used by future TransferRules contract upgrades
  // They are accessed through getter and setter methods
  mapping(address => uint256) private _maxBalances;
  mapping(address => LockUntil[]) private _locksUntil;
  mapping(address => uint256) private _transferGroups; // restricted groups like Reg D Accredited US, Reg CF Unaccredited US and Reg S Foreign
  mapping(uint256 => mapping(uint256 => uint256)) private _allowGroupTransfers; // approve transfers between groups: from => to => TimeLockUntil
  mapping(address => bool) private _frozenAddresses;

  bool public isPaused = false;

  uint256 public constant MAX_UINT256 = ((2 ** 255 - 1) * 2) + 1; // get max uint256 without overflow
  uint256 public constant MAX_TIMELOCKS = 32; // maximum supported number of token timelocks

  event RoleChange(address indexed grantor, address indexed grantee, string role, bool indexed status);
  event AddressMaxBalance(address indexed admin, address indexed addr, uint256 indexed value);
  event AddressTimeLockAdded(address indexed admin, address indexed addr, uint256 indexed timestamp, uint256 value);
  event AddressTimeLockRemoved(address indexed admin, address indexed addr, uint256 indexed timestamp, uint256 unlockedValue);
  event AddressTimeLockExpired(address indexed addr, uint256 indexed timestamp, uint256 unlockedValue);
  event AddressTransferGroup(address indexed admin, address indexed addr, uint256 indexed value);
  event AddressFrozen(address indexed admin, address indexed addr, bool indexed status);
  event AllowGroupTransfer(address indexed admin, uint256 indexed fromGroup, uint256 indexed toGroup, uint256 lockedUntil);

  event Pause(address admin, bool status);
  event Upgrade(address admin, address oldRules, address newRules);

  constructor(
    address transferRules_,
    address contractAdmin_,
    address tokenReserveAdmin_,
    string memory symbol_,
    string memory name_,
    uint8 decimals_,
    uint256 totalSupply_,
    uint256 maxTotalSupply_
  ) ERC20(name_, symbol_) {
    require(transferRules_ != address(0), "Transfer rules address cannot be 0x0");
    require(contractAdmin_ != address(0), "Token owner address cannot be 0x0");
    require(tokenReserveAdmin_ != address(0), "Token reserve admin address cannot be 0x0");

    // Transfer rules can be swapped out for a new contract inheriting from the ITransferRules interface
    // The "eternal storage" for rule data stays in this RestrictedToken contract for use by TransferRules contract upgrades
    transferRules = ITransferRules(transferRules_);
    _decimals = decimals_;
    maxTotalSupply = maxTotalSupply_;

    _setupRole(CONTRACT_ADMIN_ROLE, contractAdmin_);
    _setupRole(RESERVE_ADMIN_ROLE, tokenReserveAdmin_);
    contractAdminCount = 1;

    _mint(tokenReserveAdmin_, totalSupply_);
  }

  modifier onlyContractAdmin() {
    require(hasRole(CONTRACT_ADMIN_ROLE, msg.sender), "DOES NOT HAVE CONTRACT ADMIN ROLE");
    _;
  }

   modifier onlyTransferAdmin() {
    require(hasRole(TRANSFER_ADMIN_ROLE, msg.sender), "DOES NOT HAVE TRANSFER ADMIN ROLE");
    _;
  }

   modifier onlyWalletsAdmin() {
    require(hasRole(WALLETS_ADMIN_ROLE, msg.sender), "DOES NOT HAVE WALLETS ADMIN ROLE");
    _;
  }

   modifier onlyReserveAdmin() {
    require(hasRole(RESERVE_ADMIN_ROLE, msg.sender), "DOES NOT HAVE RESERVE ADMIN ROLE");
    _;
  }

  modifier onlyWalletsAdminOrReserveAdmin() {
    require((hasRole(WALLETS_ADMIN_ROLE, msg.sender) || hasRole(RESERVE_ADMIN_ROLE, msg.sender)),
    "DOES NOT HAVE WALLETS ADMIN OR RESERVE ADMIN ROLE");
    _;
  }

  modifier validAddress(address addr) {
    require(addr != address(0), "Address cannot be 0x0");
    _;
  }

  function decimals() public view virtual override returns (uint8) {
    return _decimals;
  }

  // Create new snapshot
  function snapshot() external onlyContractAdmin returns (uint256)  {
    return _snapshot();
  }

  // Get current snapshot ID
  function getCurrentSnapshotId() view external returns (uint256) {
    return _getCurrentSnapshotId();
  }

  /// @dev Authorizes an address holder to write transfer restriction rules
  /// @param addr The address to grant transfer admin rights to
  function grantTransferAdmin(address addr) external validAddress(addr) onlyContractAdmin {
    grantRole(TRANSFER_ADMIN_ROLE, addr);
    emit RoleChange(msg.sender, addr, "TransferAdmin", true);
  }

  /// @dev Revokes authorization to write transfer restriction rules
  /// @param addr The address to grant transfer admin rights to
  function revokeTransferAdmin(address addr) external validAddress(addr) onlyContractAdmin  {
    revokeRole(TRANSFER_ADMIN_ROLE, addr);
    emit RoleChange(msg.sender, addr, "TransferAdmin", false);
  }

  /// @dev Checks if an address is an authorized transfer admin.
  /// @param addr The address to check for transfer admin privileges.
  /// @return hasPermission returns true if the address has transfer admin permission and false if not.
  function checkTransferAdmin(address addr) external view returns(bool hasPermission) {
    return hasRole(TRANSFER_ADMIN_ROLE, addr);
  }

  /// @dev Authorizes an address holder to grant and revoke rights and restrictions for \
  ///      individual wallets, including assignment into groups.
  /// @param addr The address to grant wallets admin rights to
  function grantWalletsAdmin(address addr) external validAddress(addr) onlyContractAdmin {
    grantRole(WALLETS_ADMIN_ROLE, addr);
    emit RoleChange(msg.sender, addr, "WalletsAdmin", true);
  }

  /// @dev Revokes authorization to grant and revoke rights and restrictions for \
  ///      individual wallets, including assignment into groups.
  /// @param addr The address to revoke wallets admin rights from.
  function revokeWalletsAdmin(address addr) external validAddress(addr) onlyContractAdmin  {
    revokeRole(WALLETS_ADMIN_ROLE, addr);
    emit RoleChange(msg.sender, addr, "WalletsAdmin", false);
  }

  /// @dev Checks if an address is an authorized wallets admin.
  /// @param addr The address to check for wallets admin privileges.
  /// @return hasPermission returns true if the address has wallets admin permission and false if not.
  function checkWalletsAdmin(address addr) external view returns(bool hasPermission) {
    return hasRole(WALLETS_ADMIN_ROLE, addr);
  }

  /// @dev Authorizes an address holder to mint and burn tokens, and to freeze individual addresses
  /// @param addr The address to grant reserve admin rights to.
  function grantReserveAdmin(address addr) external validAddress(addr) onlyContractAdmin {
    grantRole(RESERVE_ADMIN_ROLE, addr);
    emit RoleChange(msg.sender, addr, "ReserveAdmin", true);
  }

  /// @dev Revokes authorization to mint and burn tokens, and to freeze individual addresses
  /// @param addr The address to revoke reserve admin rights from.
  function revokeReserveAdmin(address addr) external validAddress(addr) onlyContractAdmin  {
    revokeRole(RESERVE_ADMIN_ROLE, addr);
    emit RoleChange(msg.sender, addr, "ReserveAdmin", false);
  }

  /// @dev Checks if an address is an authorized reserve admin.
  /// @param addr The address to check for reserve admin privileges.
  /// @return hasPermission returns true if the address has reserve admin permission and false if not.
  function checkReserveAdmin(address addr) external view returns(bool hasPermission) {
    return hasRole(RESERVE_ADMIN_ROLE, addr);
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
  function checkContractAdmin(address addr) external view returns(bool hasPermission) {
    return hasRole(CONTRACT_ADMIN_ROLE, addr);
  }

  /// @dev Enforces transfer restrictions managed using the ERC-1404 standard functions.
  /// The TransferRules contract defines what the rules are. The data inputs to those rules remains in the RestrictedToken contract.
  /// TransferRules is a separate contract so its logic can be upgraded.
  /// @param from The address the tokens are transferred from
  /// @param to The address the tokens would be transferred to
  /// @param value the quantity of tokens to be transferred
  function enforceTransferRestrictions(address from, address to, uint256 value) private view {
    uint8 restrictionCode = detectTransferRestriction(from, to, value);
    require(transferRules.checkSuccess(restrictionCode), messageForTransferRestriction(restrictionCode));
  }

  /// @dev Calls the TransferRules detectTransferRetriction function to determine if tokens can be transferred.
  /// detectTransferRestriction returns a status code.
  /// @param from The address the tokens are transferred from
  /// @param to The address the tokens would be transferred to
  /// @param value The quantity of tokens to be transferred
  function detectTransferRestriction(address from, address to, uint256 value) public view returns(uint8) {
    return transferRules.detectTransferRestriction(address(this), from, to, value);
  }

  /// @dev Calls TransferRules to lookup a human readable error message that goes with an error code.
  /// @param restrictionCode is an error code to lookup an error code for
  function messageForTransferRestriction(uint8 restrictionCode) public view returns(string memory) {
    return transferRules.messageForTransferRestriction(restrictionCode);
  }

  /// @dev Sets the maximum number of tokens an address will be allowed to hold.
  /// Addresses can hold 0 tokens by default.
  /// @param addr The address to restrict
  /// @param updatedValue the maximum number of tokens the address can hold
  function setMaxBalance(address addr, uint256 updatedValue) public validAddress(addr) onlyWalletsAdmin {
    _maxBalances[addr] = updatedValue;
    emit AddressMaxBalance(msg.sender, addr, updatedValue);
  }

  /// @dev Gets the maximum number of tokens an address is allowed to hold
  /// @param addr The address to check restrictions for
  function getMaxBalance(address addr) external view returns(uint256) {
    return _maxBalances[addr];
  }

  /// @dev Lock the minimum amount of tokens in the address from being transfered until the specified time
  /// @param addr The address to restrict
  /// @param timestamp The time the tokens will be locked until as a Unix timetsamp.
  /// Unix timestamp is the number of seconds since the Unix epoch of 00:00:00 UTC on 1 January 1970.
  /// @param minBalance Tokens reserved in the wallet until the specified time. Reservations are exclusive
  function addLockUntil(address addr, uint256 timestamp, uint256 minBalance) public validAddress(addr) onlyWalletsAdmin {
    require(timestamp > block.timestamp, "Lock timestamp cannot be in the past");
    require(minBalance > 0, "Locked balance cannot be zero");

    cleanupTimelocks(addr);

    require(_locksUntil[addr].length < MAX_TIMELOCKS, "Timelock limit exceeded, cannot add more");

    bool timestampFound = false;

    for (uint256 i=0; i < _locksUntil[addr].length; i++) {
      if (_locksUntil[addr][i].timestamp == timestamp) {
        _locksUntil[addr][i].minBalance += minBalance;
        timestampFound = true;
      }
    }

    if (!timestampFound) {
        _locksUntil[addr].push(LockUntil(timestamp, minBalance));
    }

    emit AddressTimeLockAdded(msg.sender, addr, timestamp, minBalance);
  }

  /// @dev A convenience method to remove an addresses timelock, looking one up by timestamp.
  /// @param addr The address to remove the timelock for.
  /// @param timestamp The timestamp for which the timelock has to be removed.
  function removeLockUntilTimestampLookup(address addr, uint256 timestamp) external validAddress(addr) onlyWalletsAdmin {
    uint256 index = findTimelockIndex(addr, timestamp);
    uint256 tokensUnlocked = _locksUntil[addr][index].minBalance;

    _deleteTimelock(addr, index);

    emit AddressTimeLockRemoved(msg.sender, addr, timestamp, tokensUnlocked);
  }

  /// @dev A convenience method to remove an addresses timelock, looking one up by its index on the list.
  /// @param addr The address to remove the timelock for.
  /// @param index The index at which the timelock has to be removed.
  function removeLockUntilIndexLookup(address addr, uint256 index) external validAddress(addr) onlyWalletsAdmin {
    require(_locksUntil[addr].length > index, "Timelock index outside range");

    uint256 timestamp = _locksUntil[addr][index].timestamp;
    uint256 tokensUnlocked = _locksUntil[addr][index].minBalance;

    _deleteTimelock(addr, index);

    emit AddressTimeLockRemoved(msg.sender, addr, timestamp, tokensUnlocked);
  }


  /// @dev Check the total amount of timelocks issued for an address
  /// @param addr The address to check
  /// @return locksTotal The time the address will be locked until.
  /// The format is the number of seconds since the Unix epoch of 00:00:00 UTC on 1 January 1970.
  function getTotalLocksUntil(address addr) public view returns (uint256 locksTotal) {
    return _locksUntil[addr].length;
  }

  /// @dev Check a particular timelock issued for an address, by index
  /// @param addr The address to check
  /// @param index the index at which the lock is checked
  /// @return lockedUntil The timestamp for the selected lock.
  /// The format is the number of seconds since the Unix epoch of 00:00:00 UTC on 1 January 1970.
  /// @return balanceLocked The balance reserved by the selected lock.
  function getLockUntilIndexLookup(address addr, uint256 index) public view returns(uint256 lockedUntil, uint256 balanceLocked) {
    require(index < _locksUntil[addr].length, "Index too big, no lock at that index.");

    return (_locksUntil[addr][index].timestamp, _locksUntil[addr][index].minBalance);
  }

  /// @dev Check a particular timelock issued for an address, by timestamp
  /// @param addr The address to check
  /// @param timestamp The particular timestamp to look up
  /// @return lockedUntil The timestamp for the selected lock.
  /// The format is the number of seconds since the Unix epoch of 00:00:00 UTC on 1 January 1970.
  /// @return balanceLocked The balance reserved by the selected lock.
  function getLockUntilTimestampLookup(address addr, uint256 timestamp) public view returns(uint256 lockedUntil, uint256 balanceLocked) {
    return getLockUntilIndexLookup(addr, findTimelockIndex(addr, timestamp));
  }

  /// @dev Check total balance locked at the given timestamp, across all applicable locks
  /// @param addr The address to check
  /// @param timestamp The timestamp to check the total locks at
  /// The format is the number of seconds since the Unix epoch of 00:00:00 UTC on 1 January 1970.
  /// @return balanceLocked The combined amount of tokens reserved until the timestamp.
  function getLockUntilAtTimestamp(address addr, uint256 timestamp) public view returns(uint256 balanceLocked) {
    uint256 totalLocked = 0;

    for (uint256 i=0; i<_locksUntil[addr].length; i++) {
        if (_locksUntil[addr][i].timestamp > timestamp) {
            totalLocked += _locksUntil[addr][i].minBalance;
        }
    }

    return totalLocked;
  }

  /// @dev Checks how many tokens are locked at the time of the request
  /// @param addr The address to check
  /// @return balanceLocked The number of tokens that cannot be accessed now
  function getCurrentlyLockedBalance(address addr) public view returns (uint256 balanceLocked) {
    return getLockUntilAtTimestamp(addr, block.timestamp);
  }

  /// @dev Checks how many tokens are available to move at the time of the request
  /// @param addr The address to check
  /// @return balanceUnlocked The number of tokens that can be accessed now
  function getCurrentlyUnlockedBalance(address addr) external view returns (uint256 balanceUnlocked) {
    uint256 lockedNow = getCurrentlyLockedBalance(addr);

    return balanceOf(addr) - lockedNow;
  }

  /// @dev Set the one group that the address belongs to, such as a US Reg CF investor group.
  /// @param addr The address to set the group for.
  /// @param groupID The uint256 numeric ID of the group.
  function setTransferGroup(address addr, uint256 groupID) public validAddress(addr) onlyWalletsAdmin {
    _transferGroups[addr] = groupID;
    emit AddressTransferGroup(msg.sender, addr, groupID);
  }

  /// @dev Gets the transfer group the address belongs to. The default group is 0.
  /// @param addr The address to check.
  /// @return groupID The group id of the address.
  function getTransferGroup(address addr) external view returns(uint256 groupID) {
    return _transferGroups[addr];
  }

  /// @dev Freezes or unfreezes an address.
  /// Tokens in a frozen address cannot be transferred from until the address is unfrozen.
  /// @param addr The address to be frozen.
  /// @param status The frozenAddress status of the address. True means frozen false means not frozen.
  function freeze(address addr, bool status) public validAddress(addr) onlyWalletsAdminOrReserveAdmin {
    _frozenAddresses[addr] = status;
    emit AddressFrozen(msg.sender, addr, status);
  }

  /// @dev Checks the status of an address to see if its frozen
  /// @param addr The address to check
  /// @return status Returns true if the address is frozen and false if its not frozen.
  function getFrozenStatus(address addr) external view returns(bool status) {
    return _frozenAddresses[addr];
  }

  /// @dev A convenience method for updating the transfer group, lock until, max balance, and freeze status.
  /// The convenience method also helps to reduce gas costs.
  /// @param addr The address to set permissions for.
  /// @param groupID The ID of the address
  /// @param timeLockUntil The unix timestamp that the address should be locked until. Use 0 if it's not locked.
  /// The format is the number of seconds since the Unix epoch of 00:00:00 UTC on 1 January 1970.
  /// @param lockedBalanceUntil The amount of tokens to be reserved until the timelock expires. Reservation is exclusive.
  /// @param maxBalance Is the maximum number of tokens the account can hold.
  /// @param status The frozenAddress status of the address. True means frozen false means not frozen.
  function setAddressPermissions(address addr, uint256 groupID, uint256 timeLockUntil, uint256 lockedBalanceUntil,
    uint256 maxBalance, bool status) public validAddress(addr) onlyWalletsAdmin {
    setTransferGroup(addr, groupID);
    if (timeLockUntil > 0) {
        addLockUntil(addr, timeLockUntil, lockedBalanceUntil);
    }
    setMaxBalance(addr, maxBalance);
    freeze(addr, status);
  }

  /// @dev Sets an allowed transfer from a group to another group beginning at a specific time.
  /// There is only one definitive rule per from and to group.
  /// @param from The group the transfer is coming from.
  /// @param to The group the transfer is going to.
  /// @param lockedUntil The unix timestamp that the transfer is locked until. 0 is a special number. 0 means the transfer is not allowed.
  /// This is because in the smart contract mapping all pairs are implicitly defined with a default lockedUntil value of 0.
  /// But no transfers should be authorized until explicitly allowed. Thus 0 must mean no transfer is allowed.
  function setAllowGroupTransfer(uint256 from, uint256 to, uint256 lockedUntil) external onlyTransferAdmin {
    _allowGroupTransfers[from][to] = lockedUntil;
    emit AllowGroupTransfer(msg.sender, from, to, lockedUntil);
  }

  /// @dev Checks to see when a transfer between two addresses would be allowed.
  /// @param from The address the transfer is coming from
  /// @param to The address the transfer is going to
  /// @return timestamp The Unix timestamp of the time the transfer would be allowed. A 0 means never.
  /// The format is the number of seconds since the Unix epoch of 00:00:00 UTC on 1 January 1970.
  function getAllowTransferTime(address from, address to) external view returns(uint timestamp) {
    return _allowGroupTransfers[_transferGroups[from]][_transferGroups[to]];
  }

  /// @dev Checks to see when a transfer between two groups would be allowed.
  /// @param from The group id the transfer is coming from
  /// @param to The group id the transfer is going to
  /// @return timestamp The Unix timestamp of the time the transfer would be allowed. A 0 means never.
  /// The format is the number of seconds since the Unix epoch of 00:00:00 UTC on 1 January 1970.
  function getAllowGroupTransferTime(uint from, uint to) external view returns(uint timestamp) {
    return _allowGroupTransfers[from][to];
  }

  /// @dev Destroys tokens and removes them from the total supply. Can only be called by an address with a Reserve Admin role.
  /// @param from The address to destroy the tokens from.
  /// @param value The number of tokens to destroy from the address.
  function burn(address from, uint256 value) external validAddress(from) onlyReserveAdmin {
    require(value <= balanceOf(from), "Insufficent tokens to burn");
    _burn(from, value);
  }

  /// @dev Allows the reserve admin to create new tokens in a specified address.
  /// The total number of tokens cannot exceed the maxTotalSupply (the "Hard Cap").
  /// @param to The addres to mint tokens into.
  /// @param value The number of tokens to mint.
  function mint(address to, uint256 value) external validAddress(to) onlyReserveAdmin  {
    require(totalSupply() + value <= maxTotalSupply, "Cannot mint more than the max total supply");
    _mint(to, value);
  }

  /// @dev Allows the contract admin to pause transfers.
  function pause() external onlyContractAdmin() {
    isPaused = true;
    emit Pause(msg.sender, true);
  }

  /// @dev Allows the contract admin to unpause transfers.
  function unpause() external onlyContractAdmin() {
    isPaused = false;
    emit Pause(msg.sender, false);
  }

  /// @dev Allows the contrac admin to upgrade the transfer rules.
  /// The upgraded transfer rules must implement the ITransferRules interface which conforms to the ERC-1404 token standard.
  /// @param newTransferRules The address of the deployed TransferRules contract.
  function upgradeTransferRules(ITransferRules newTransferRules) external onlyTransferAdmin {
    require(address(newTransferRules) != address(0x0), "Address cannot be 0x0");
    address oldRules = address(transferRules);
    transferRules = newTransferRules;
    emit Upgrade(msg.sender, oldRules, address(newTransferRules));
  }

  function transfer(address to, uint256 value)
    public
    override
    validAddress(to)
    returns(bool success)
  {
    require(value <= balanceOf(msg.sender), "Insufficent tokens");
    cleanupTimelocks(msg.sender);
    enforceTransferRestrictions(msg.sender, to, value);
    super.transfer(to, value);
    return true;
  }

  function transferFrom(address from, address to, uint256 value)
    public
    override validAddress(from)
    validAddress(to)
    returns(bool success)
  {
    require(value <= allowance(from, to), "The approved allowance is lower than the transfer amount");
    require(value <= balanceOf(from), "Insufficent tokens");
    cleanupTimelocks(from);
    enforceTransferRestrictions(from, to, value);
    super.transferFrom(from, to, value);
    return true;
  }

  function safeApprove(address spender, uint256 value) public {
    // safeApprove should only be called when setting an initial allowance,
    // or when resetting it to zero. To increase and decrease it, use
    // 'safeIncreaseAllowance' and 'safeDecreaseAllowance'
    require((value == 0) || (allowance(address(msg.sender), spender) == 0),
        "Cannot approve from non-zero to non-zero allowance"
    );
    approve(spender, value);
  }


  // TIMELOCK UTILITY FUNCTIONS

  /// @dev Locates an index of a particular timelock for a user, by timestamp. Reverts if unable.
  /// @param addr Address for which the timelocks are being searched.
  /// @param timestamp Timestamp at which the required timelock resides.
  /// @return index The index of the timelock in the mapping for that address.
  function findTimelockIndex(address addr, uint256 timestamp) private view returns (uint256 index) {
    for (uint256 i=0; i <_locksUntil[addr].length; i++) {
      if (_locksUntil[addr][i].timestamp == timestamp) {
        return i;
      }
    }

    revert("Coundn't find an index by timestamp: no lock with that timestamp.");
  }

  /// @dev Removes expired timelocks for a user (therefore unlocking the tokens).
  /// @param addr Address for which the timelocks are being cleaned up.
  function cleanupTimelocks(address addr) public {
    // Since we delete efficiently (by moving the last element to replace the one being deleted),
    // we clean up right to left, emitting events and mutating the list on the go.
    // 1. Go right to left
    // 2. If the timelock we're looking at is expired, 
    // -- emit an expiration event before we overwrite the data
    // -- overwrite the element with the last one on the list
    // -- pop the list.
    // 3. Until beginning is reached.

    uint256 totalLocks = getTotalLocksUntil(addr);

    for (uint256 i=0; i < totalLocks; i++) {
        uint256 curInd = totalLocks - 1 - i;
        if (_locksUntil[addr][curInd].timestamp <= block.timestamp) {

          emit AddressTimeLockExpired(
            addr, 
            _locksUntil[addr][curInd].timestamp, 
            _locksUntil[addr][curInd].minBalance
          );

          _deleteTimelock(addr, curInd);
        }
    }
  }

  /// @dev Deletes a timelock given an address and an index. Mutates the list, breaks ordering, 
  // doesn't emit events. Reverts if inputs are wrong.
  /// @param addr Address for which the timelock is being removed.
  /// @param index Index for the timelock being removed.
  function _deleteTimelock(address addr, uint256 index) private {
    require(_locksUntil[addr].length > index, "Timelock index outside range");

    uint256 totalLocks = getTotalLocksUntil(addr);

    // If the element we plan to remove is not the last on the list, we copy the last element over it
    // After that check, we delete the last element
    if (index < totalLocks - 1) {
        _locksUntil[addr][index] = _locksUntil[addr][totalLocks - 1];
    }

    _locksUntil[addr].pop();
  }
}
