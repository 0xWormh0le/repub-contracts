// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../interfaces/ITransferRules.sol";
import "../RestrictedToken.sol";

contract TransferRulesUpgrade is ITransferRules {
  function detectTransferRestriction(
    address _token,
    address from,
    address to,
    uint256 value
  ) public override view returns (uint8) {
    RestrictedToken token = RestrictedToken(_token);
    if (from == to && value > 0) {
      return token.decimals(); // prove we are using all the arguments
    }
    return 17; // grab an arbitrary value from the injected token contract
  }

  function messageForTransferRestriction(uint8 restrictionCode)
    public
    override
    pure
    returns (string memory)
  {
    if (restrictionCode >= 0) {
      return "HELLO UPGRADE";
    }
    return "HELLO 0 UPGRADE";
  }

  function checkSuccess(uint8 restrictionCode)
    public
    override
    pure
    returns (bool)
  {
    return restrictionCode == 0;
  }
}
