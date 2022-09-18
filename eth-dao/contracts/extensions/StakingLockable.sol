// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interfaces/IStakingLockable.sol";
import "../Staking.sol";

/**
 * @dev This contract extends Staking and has token locking feature
 *      It is different from locking staking
 */
contract StakingLockable is Staking {
  address public admin;

  /// @dev lock per staker: staker => lock data
  mapping(address => IStakingLockable.LockData) public locks;

  event AdminSet(address indexed user, address admin);
  event TokensLocked(address indexed user, uint256 amount, uint256 lockedUntilTimestamp);

  constructor(
    address stakeTokenAddress,
    uint256 startingTimestamp,
    uint256 maxInterestRate,
    uint256 startingInterestRate
  ) Staking(stakeTokenAddress, startingTimestamp, maxInterestRate, startingInterestRate) {}

  /**
   * @dev Set locked token count
   * @param _amount lock amount
   * @param _lockedUntilTimestamp timestamp that lock will be available until
   */
  function lockTokens(uint256 _amount, uint256 _lockedUntilTimestamp) internal {
    IStakingLockable.LockData storage lock = locks[msg.sender];
    uint256 stakeBalance = totalStakedFor(msg.sender);

    require(stakeBalance > 0, "Didn't stake tokens");
    require(_amount <= stakeBalance, "Lock amount exceeds staking balance");
    require(_lockedUntilTimestamp > block.timestamp, "Invalid lockUntilTimestamp");

    lock.amount = _amount;
    lock.lockedUntilTimestamp = _lockedUntilTimestamp;

    emit TokensLocked(msg.sender, lock.amount, lock.lockedUntilTimestamp);
  }

  /**
   * @dev Unstake unlocked tokens
   * @param _amount: how many tokens the contract will attempt to unstake & send
   * @param _data: required by ERC-900 for potential usage in signaling
   */
  function unstake(uint256 _amount, bytes memory _data) override public {
    IStakingLockable.LockData storage lock = locks[msg.sender];
    
    if (lock.amount > 0 && lock.lockedUntilTimestamp > block.timestamp) {
      // todo: confirm approach to calculate unstakable amount
      // calculate it based on just total staked? or total staked with interest?
      uint256 unlocked = totalStakedFor(msg.sender) - lock.amount;
      require(_amount <= unlocked, "Unstake amount is greater than unlocked balance");
    }

    super.unstake(_amount, _data);
  }
}
