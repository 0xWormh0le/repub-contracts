// SPDX-License-Identifier: MIT licensed

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2ERC20.sol";
import "./interfaces/IStakingRewards.sol";

contract StakingRewards is IStakingRewards, Ownable, ReentrancyGuard {
    using ERC165Checker for address;
    using SafeERC20 for IERC20;

    uint256 constant internal BASE_UNIT = 1e18;
    uint256 constant internal S_UPPER_BOUND = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A1;

    address public immutable rewardsDistribution;
    IERC20 public immutable rewardsToken;
    IERC20 public immutable stakingToken;
    uint256 public immutable rewardDurationInSeconds;

    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 public override totalSupply;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;
    mapping(address => uint256) private balances;

    /************** events ***************/

    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(
        address _owner,
        address _rewardsDistribution,
        address _rewardsToken,
        address _stakingToken,
        uint256 _rewardDurationInDays
    ) ReentrancyGuard() {
        require(_rewardsDistribution != address(0), "RadarStakingRewards: invalid reward distribution");
        require(_rewardsToken != address(0), "RadarStakingRewards: invalid reward token address");
        require(_stakingToken != address(0), "RadarStakingRewards: invalid staking token address");
        require(_rewardDurationInDays != 0, "RadarStakingRewards: invalid reward duration");

        transferOwnership(_owner);
        rewardsToken = IERC20(_rewardsToken);
        stakingToken = IERC20(_stakingToken);
        rewardsDistribution = _rewardsDistribution;
        rewardDurationInSeconds = _rewardDurationInDays * 1 days;
    }

    /************** views ***************/

    function balanceOf(address account) external view override returns (uint256) {
        return balances[account];
    }

    function lastTimeRewardApplicable() public view override returns (uint256) {
        return Math.min(block.timestamp, periodFinish);
    }

    function rewardPerToken() public view override returns (uint256) {
        if (totalSupply == 0) {
            return rewardPerTokenStored;
        }
        return rewardPerTokenStored + (lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * BASE_UNIT / totalSupply;
    }

    function earned(address account) public view override returns (uint256) {
        return balances[account] * (rewardPerToken() - userRewardPerTokenPaid[account]) / BASE_UNIT + rewards[account];
    }

    function getRewardForDuration() external view override returns (uint256) {
        return rewardRate * rewardDurationInSeconds;
    }

    /************** mutative functions ***************/

    function stakeWithPermit(
        uint256 amount,
        uint deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant updateReward(msg.sender) {
        require(uint256(s) <= S_UPPER_BOUND && uint256(s) > 0, "RadarStakingRewards: invalid s");
        require(v == 27 || v == 28, "RadarStakingRewards: invalid v");

        IUniswapV2ERC20 univ2Token = IUniswapV2ERC20(address(stakingToken));
        // This will revert if the contract caller doesn't support permit()
        univ2Token.permit(msg.sender, address(this), amount, deadline, v, r, s);

        _stake(amount);
    }

    function stake(uint256 amount) external override nonReentrant updateReward(msg.sender) {
        _stake(amount);
    }

    function _stake(uint256 amount) internal {
        require(amount > 0, "RadarStakingRewards: cannot stake 0");

        totalSupply += amount;
        balances[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) public override nonReentrant {
        require(amount > 0, "RadarStakingRewards: cannot withdraw 0");

        totalSupply -= amount;
        balances[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);

        _getReward();

        emit Withdrawn(msg.sender, amount);
    }

    function exit() external override {
        withdraw(balances[msg.sender]);
    }

    function getReward() public override nonReentrant {
        _getReward();
    }

    function _getReward() private updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];

        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function fundRewards(uint256 reward) external updateReward(address(0)) {
        require(reward > 0, "RadarStakingRewards: invalid reward");
        require(msg.sender == owner() || msg.sender == rewardsDistribution, "RadarStakingRewards: caller is not eligible to fund rewards");

        rewardsToken.safeTransferFrom(msg.sender, address(this), reward);

        if (block.timestamp < periodFinish) {
            reward += (periodFinish - block.timestamp) * rewardRate;
        }

        rewardRate = reward / rewardDurationInSeconds;

        // Ensure the provided reward amount is not more than the balance in the contract.
        // This keeps the reward rate in the right range, preventing overflows due to
        // very high values of rewardRate in the earned and rewardsPerToken functions;
        // Reward must be less than 2^256 / 10^18 to avoid overflow.
        uint256 balance = rewardsToken.balanceOf(address(this));
        require(rewardRate <= balance / rewardDurationInSeconds, "RadarStakingRewards: provided reward too high");

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardDurationInSeconds;

        emit RewardAdded(reward);
    }
}
