// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "hardhat/console.sol";
import "./interfaces/IGovernance.sol";
import "./extensions/StakingLockable.sol";


contract Governance is IGovernance, StakingLockable {
  using SafeERC20 for IERC20;

  uint256 immutable public APPROVAL_FIXED_PERIOD_IN_SECONDS;

  uint256 immutable public MIN_APPROVAL_PERCENT;

  /// @dev proposals: proposal ipfs hash => proposal
  mapping(bytes32 => Proposal) public proposals;

  /// @dev votes: proposal ipfs hash => user => vote
  mapping(bytes32 => mapping(address => bool)) public voted;

  modifier onlyStaker() {
    require(totalStakedFor(msg.sender) > 0, "You are not a staker");
    _;
  }

  /**
   * @param _approvalFixedPeriodInSeconds approval fixed period in seconds, suggested value is 3600 * 24 * 5
   * @param _minApprovalPercent min approval percent, suggested value is 51
   */
  constructor(
    uint256 _approvalFixedPeriodInSeconds,
    uint256 _minApprovalPercent,
    // parent constructor arguments
    address stakeTokenAddress,
    uint256 startingTimestamp,
    uint256 maxInterestRate,
    uint256 startingInterestRate
  ) StakingLockable(stakeTokenAddress, startingTimestamp, maxInterestRate, startingInterestRate) {
    APPROVAL_FIXED_PERIOD_IN_SECONDS = _approvalFixedPeriodInSeconds;
    MIN_APPROVAL_PERCENT = _minApprovalPercent;
  }

  /**
   * @dev Get _token balance of this contract
   * @param _token token address
   * @return balance
   */
  function treasuryBalance(address _token) public override view returns (uint256) {
    return IERC20(_token).balanceOf(address(this));
  }

  /**
   * @dev Make proposal and set proposal state `proposed`
   * @param _proposalIpfsHash proposal ipfs hash
   * @param _tokenAddress token address
   * @param _tokenPaymentAmount token amount
   * @param _recipientAddress recipient address
   */
  function makeProposal(
    bytes32 _proposalIpfsHash,
    address _tokenAddress,
    uint256 _tokenPaymentAmount,
    address _recipientAddress
  ) external override onlyStaker() {
    require(_proposalIpfsHash != 0, "Empty proposal ipfs hash");
    require(_tokenAddress != address(0), "Empty token address");
    require(_tokenPaymentAmount > 0, "Empty token payment amount");
    require(_recipientAddress != address(0), "Empty recipient address");

    proposals[_proposalIpfsHash] = Proposal({
      proposalIpfsHash: _proposalIpfsHash,
      tokenPaymentAmount: _tokenPaymentAmount,
      tokenAddress: _tokenAddress,
      recipientAddress: _recipientAddress,
      createdAt: block.timestamp,
      totalVotesWeight: 0,
      totalVotes: 0,
      yesVotesWeight: 0,
      yesVotes: 0,
      paid: false
    });

    emit ProposalMade(
      _proposalIpfsHash,
      _tokenAddress,
      _tokenPaymentAmount,
      _recipientAddress
    );
  }

  /**
   * @dev Approve proposal
   * @param _proposalIpfsHash ipfs hash of proposal
   * @param _approve `true` if vote for, `false` if vote against
   */
  function approveProposal(bytes32 _proposalIpfsHash, bool _approve) external override onlyStaker {
    Proposal storage proposal = proposals[_proposalIpfsHash];
    uint256 voteWeight = totalStakedFor(msg.sender);

    require(proposal.tokenAddress != address(0), "Invalid ipfs hash");
    require(block.timestamp < _proposalFinalizationTime(proposal), "Proposal expired");
    require(voted[_proposalIpfsHash][msg.sender] == false, "You already voted");

    voted[_proposalIpfsHash][msg.sender] = true;
    proposal.totalVotesWeight += voteWeight;
    proposal.totalVotes += 1;

    if (_approve) {
      proposal.yesVotesWeight += voteWeight;
      proposal.yesVotes += 1;
    }

    uint256 lockedUntilTimestamp = Math.max(
      _proposalFinalizationTime(proposal),
      locks[msg.sender].lockedUntilTimestamp
    );

    lockTokens(voteWeight, lockedUntilTimestamp);

    emit ProposalApproved(msg.sender, _proposalIpfsHash, _approve);
  }

  /**
   * @dev Get proposal status
   * @param _proposalIpfsHash ipfs hash
   * @return proposal state
   */
  function proposalStatus(bytes32 _proposalIpfsHash) public override view returns (ProposalState) {
    Proposal storage proposal = proposals[_proposalIpfsHash];

    if (proposal.tokenAddress == address(0)) {
      return ProposalState.None;
    } else if (_proposalFinalizationTime(proposal) > block.timestamp) {
      return ProposalState.Proposed;
    } else if (proposal.paid) {
      return ProposalState.Paid;
    } else if (proposal.totalVotes > 0 && (proposal.yesVotesWeight * 100 / proposal.totalVotesWeight) >= MIN_APPROVAL_PERCENT) {
      // todo: additional requirement here
      return ProposalState.Approved;
    } else {
      return ProposalState.Failed;
    }

    // todo: need to add sponsor status
  }

  /**
   * @dev Get finalization time of proposal
   * @param _proposal proposal
   * @return finalizationTime
   */
  function _proposalFinalizationTime(Proposal memory _proposal) internal view returns (uint256) {
    return _proposal.createdAt + APPROVAL_FIXED_PERIOD_IN_SECONDS;
  }

  /**
   * @dev Pay proposal
   * @param _proposalIpfsHash ipfs hash
   */
  function payProposal(bytes32 _proposalIpfsHash) external override onlyStaker {
    Proposal storage proposal = proposals[_proposalIpfsHash];

    require(proposalStatus(_proposalIpfsHash) == ProposalState.Approved, "Proposal is not approved");
    require(treasuryBalance(proposal.tokenAddress) >= proposal.tokenPaymentAmount, "Insufficient payment balance");

    proposal.paid = true;
    IERC20(proposal.tokenAddress).safeTransfer(proposal.recipientAddress, proposal.tokenPaymentAmount);

    emit ProposalPaid(
      _proposalIpfsHash,
      proposal.tokenAddress,
      proposal.recipientAddress,
      proposal.tokenPaymentAmount
    );
  }
}
