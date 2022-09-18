// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import "../RestrictedToken.sol";

contract UserProxy {
  RestrictedToken public token;
  
  constructor(RestrictedToken _token) {
      token = _token;
  }

  function transfer(address to, uint amount) public returns(bool success) {
      return token.transfer(to, amount);
  }

  function setMaxBalance(address _account, uint256 _updatedValue) public {
      token.setMaxBalance(_account, _updatedValue);
  }
}
