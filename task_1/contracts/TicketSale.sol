// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {VRFCoordinatorV2Interface} from "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import {VRFConsumerBaseV2} from "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ILotteryTicket} from "./interfaces/ILotteryTicket.sol";
import "./Signature2.sol";
// import "./Signature.sol";


contract TicketSale is VRFConsumerBaseV2, ReentrancyGuard, Signature, AccessControl {
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    address payable private owner;
    ILotteryTicket private contractNFT;

    Counters.Counter public currencyId;
    Counters.Counter public ticketId;
    uint256 public loteryLimit = 500;
    uint256 public lotteryFee = 10000; // 1% = 1000

    VRFCoordinatorV2Interface internal immutable coordinator;
    uint64 internal immutable _subscriptionId;
    bytes32 internal immutable _keyHash;
    uint32 internal constant CALLBACK_GAS_LIMIT = 250000;
    uint32 internal constant NUM_WORDS = 1;
    uint16 internal constant REQUEST_CONFIRMATIONS = 3;
    uint256 public _requestId;

    uint256 public priceForOne = 0.02 ether;
    uint256 public winnerNumber;
    uint256 public lotteryDuration = 7 days;
    uint256 public lotteryStart;

    mapping(uint8 => address) public listOfPiceFeed;
    mapping(uint8 => address) public listOfToken;
    mapping(address => bool) public supportOfToken;
    mapping(uint256 => address) public ownerOfTicket;
    mapping(uint16 => uint256) public purchaseAmount;

    event PurchaseTicket(address indexed to, uint8 amountOfTicket, uint8 _currencyId, uint256 price);
    event Withdraw(address indexed to, uint256 amount, uint8 _currencyId);
    event SetNewToken(address oracleAddress, address tokenAddress, address who);
    event WinnerNumber(uint256 winner);
    event Payout(address tokenAddress, address payoutAddress, uint256 amount);

    constructor(
        address _nftAddress,
        string memory _name,
        string memory _version,
        uint64 subscriptionId,
        address vrfCoordinator,
        bytes32 keyHash
    ) VRFConsumerBaseV2(vrfCoordinator) {
        __Signature_init(_name, _version);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(OPERATOR_ROLE, msg.sender);
        contractNFT = ILotteryTicket(_nftAddress);
        owner = payable(msg.sender);
        coordinator = VRFCoordinatorV2Interface(vrfCoordinator);
        _keyHash = keyHash;
        _subscriptionId = subscriptionId;
        supportOfToken[address(0)] = true;
        currencyId.increment();
        lotteryStart = block.timestamp;
    }

    function setTokenData(address oracleAddress, address tokenAddress) external onlyRole(OPERATOR_ROLE) {
        uint8 currentId = uint8(currencyId.current());
        listOfPiceFeed[currentId] = oracleAddress;
        listOfToken[currentId] = tokenAddress;
        supportOfToken[tokenAddress] = true;
        currencyId.increment();
        emit SetNewToken(oracleAddress, tokenAddress, msg.sender);
    }

    function purchaseTicket(
        address _currencyAddress,
        uint8 _currencyId,
        uint8 amount,
        // string memory uri,
        string[] memory uri,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable nonReentrant {
        require(ticketId.current() + amount <= loteryLimit, "tickets sold out");
        require(supportOfToken[_currencyAddress], "Unsupported token");
        require(block.timestamp < lotteryDuration + lotteryStart, "Lottery over");
        require(
            hasRole(
                DEFAULT_ADMIN_ROLE,
                _getSigner(msg.sender, uri, amount, v, r, s)
            ),
            "Action is inconsistent."
        );
        if (_currencyAddress == address(0)) {
            require(msg.value == amount * priceForOne, "Price entered incorrectly");

            ILotteryTicket(contractNFT).batchMint(msg.sender, amount, uri);
            purchaseAmount[_currencyId] += msg.value;
            setParticipantsList(amount);

            emit PurchaseTicket(msg.sender, amount, _currencyId, msg.value);
        } else {
            require(msg.value == 0, "Unnecessary transfer of Ether.");

            uint256 totalPrice = getTotalPrice(_currencyId, amount);

            purchaseAmount[_currencyId] += totalPrice;

            setParticipantsList(amount);

            IERC20(listOfToken[_currencyId]).safeTransferFrom(msg.sender, address(this), totalPrice);

            ILotteryTicket(contractNFT).batchMint(msg.sender, amount, uri);

            emit PurchaseTicket(msg.sender, amount, _currencyId, totalPrice);
        }
    }

    function getLatestPrice(uint8 tokenId) public view returns (int) {
        require(supportOfToken[listOfToken[tokenId]], "Unsupported token");
        (, int price, , , ) = AggregatorV3Interface(listOfPiceFeed[tokenId]).latestRoundData();
        return price;
    }

    function getTotalPrice(uint8 tokenId, uint8 amount) public view returns (uint256) {
        uint256 decimals;
        tokenId == 1 ? decimals = 1e6 : decimals = 1e18;
        return (priceForOne * amount * decimals) / uint256(getLatestPrice(tokenId));
    }

    function fulfillRandomWords(uint256 /* requestId */, uint256[] memory randomWords) internal override {
        winnerNumber = randomWords[0] % ticketId.current();

        emit WinnerNumber(winnerNumber);
    }

    function getWinner() external view returns (uint256) {
        return winnerNumber;
    }

    function setParticipantsList(uint256 amount) internal {
        uint256 i;
        for (; i < amount; ) {
            ownerOfTicket[ticketId.current()] = msg.sender;

            unchecked {
                ++i;
                ticketId.increment();
            }
        }
    }

    function setWinners() external onlyRole(OPERATOR_ROLE) {
        require(
            ticketId.current() == loteryLimit || block.timestamp > lotteryDuration + lotteryStart,
            "Lottery is not over"
        );

        _requestId = coordinator.requestRandomWords(
            _keyHash,
            _subscriptionId,
            REQUEST_CONFIRMATIONS,
            CALLBACK_GAS_LIMIT,
            NUM_WORDS
        );
    }

    function payout() external onlyRole(OPERATOR_ROLE) {
        require(
            ticketId.current() == loteryLimit || block.timestamp > lotteryDuration + lotteryStart,
            "Lottery is not over"
        );
        address winnerAddress = ownerOfTicket[winnerNumber];
        payoutETH(winnerAddress);
        payoutTokens(winnerAddress);
    }

    function payoutETH(address _winner) internal {
        uint256 balanceETH = address(this).balance;
        uint256 ownerFee = (balanceETH * lotteryFee) / 100000;
        uint256 winningAmount = (balanceETH - ownerFee);

        (bool success, ) = payable(msg.sender).call{value: ownerFee}("");
        require(success, "Transfer failed");

        (bool _success, ) = payable(_winner).call{value: winningAmount}("");
        require(_success, "Transfer failed");

        emit Payout(address(0), msg.sender, ownerFee);
        emit Payout(address(0), _winner, winningAmount);
    }

    function payoutTokens(address _winner) internal {
        IERC20 tokenAddress;
        uint8 j = 1;
        uint256 ownerFee;
        uint256 tokenBalance;
        uint256 winningAmount;

        for (; j < currencyId.current(); ) {
            tokenAddress = IERC20(listOfToken[j]);
            tokenBalance = tokenAddress.balanceOf(address(this));
            ownerFee = (tokenBalance * lotteryFee) / 100000;
            winningAmount = tokenBalance - ownerFee;

            tokenAddress.safeTransfer(msg.sender, ownerFee);
            tokenAddress.safeTransfer(_winner, winningAmount);
            emit Payout(listOfToken[j], msg.sender, ownerFee);
            emit Payout(listOfToken[j], _winner, winningAmount);
            unchecked {
                ++j;
            }
        }
    }

    receive() external payable {}
}
