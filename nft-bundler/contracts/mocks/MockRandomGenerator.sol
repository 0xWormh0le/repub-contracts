//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../RandomGenerator.sol";

contract MockRandomGenerator is RandomGenerator {

  uint256 public requestIdNonce;

  constructor(
    address _vrfCoordinator,
    address _link,
    bytes32 _keyHash,
    uint256 _fee
  ) RandomGenerator(_vrfCoordinator, _link, _keyHash, _fee) { }

  function askRandomness(address recipient) external override sufficientFee {
    _saveSession(bytes32(requestIdNonce), recipient);
    requestIdNonce += 1;
  }

  function mockFulfillRandomness(bytes32 requestId, uint256 randomness) external {
    fulfillRandomness(requestId, randomness);
  }
}
