// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface IStakingContract {
  function totalUnmintedInterest() external view returns (uint256);

  function totalStakedFor(address addr) external view returns (uint256);
}
