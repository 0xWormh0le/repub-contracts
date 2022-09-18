// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./IStakingContract.sol";

interface IStakingLockable is IStakingContract {
  struct LockData {
    uint256 amount;
    uint256 lockedUntilTimestamp;
  }

  function locks(address staker) external returns(LockData memory);

  function setAdmin(address admin) external;

  function lockTokens(address user, uint256 amount, uint256 lockedUntilTimestamp) external;
}
