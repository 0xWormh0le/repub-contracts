// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IGovernance {

  /*************************
   *  Data Types
   ************************/
  enum ProposalState {
    None,
    Proposed,
    Sponsored,
    Approved,
    Failed,
    Paid
  }

  struct Proposal {
    bytes32 proposalIpfsHash;
    address tokenAddress;
    address recipientAddress;
    uint256 tokenPaymentAmount;
    uint256 createdAt;
    uint256 totalVotes;
    uint256 totalVotesWeight;
    uint256 yesVotes;
    uint256 yesVotesWeight;
    bool paid;
  }

  /*************************
   *  Events
   ************************/
  event ProposalMade(
    bytes32 proposalIpfsHash,
    address token,
    uint256 tokenPaymentAmount,
    address recipeint
  );

  event ProposalApproved(
    address user,
    bytes32 proposalIpfsHash,
    bool approve
  );

  event ProposalPaid(
    bytes32 proposalIpfsHash,
    address tokenAddress,
    address recipientAddress,
    uint256 tokenPaymentAmount
  );


  /*************************
   *  Functions
   ************************/
  function treasuryBalance(address _token) external view returns (uint256);

  function makeProposal(
    bytes32 _proposalIpfsHash,
    address _tokenAddress,
    uint256 _tokenPaymentAmount,
    address _recipientAddress
  ) external;

  function approveProposal(bytes32 _proposalIpfsHash, bool approve) external;

  function proposalStatus(bytes32 _proposalIpfsHash) external view returns (ProposalState);

  function payProposal(bytes32 _proposalIpfsHash) external;
}
