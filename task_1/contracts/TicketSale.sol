// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "hardhat/console.sol";

interface MyTicket is IERC721 {
    function batchMint(address to, uint256 amount, string memory uri) external;
}

contract TicketSale is VRFConsumerBaseV2, ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter;

    MyTicket private NFTAddress;
    Counters.Counter public currencyId;
    Counters.Counter public ticketId;
    uint256 public loteryLimit = 500;
    uint256 public lotteryFee = 10000; // 1% = 1000

    VRFCoordinatorV2Interface immutable COORDINATOR;
    uint64 immutable s_subscriptionId;
    bytes32 immutable s_keyHash;
    uint32 constant CALLBACK_GAS_LIMIT = 250000;
    uint32 constant NUM_WORDS = 1;
    uint16 constant REQUEST_CONFIRMATIONS = 3;
    uint256 public s_requestId;

    uint256 public priceForOne = 0.02 ether;
    address payable private owner;
    uint256 public winnerNumber;
    uint256 public lotteryDuration = 7 days;
    uint256 public lotteryStart;

    mapping(uint8 => address) public listOfPiceFeed;
    mapping(uint8 => address) public listOfToken;
    mapping(address => bool) public supportOfToken;
    mapping(uint256 => address) public ownerOfTicket;
    mapping(uint16 => uint256) public purchaseAmount;

    event PurchaseTicket(
        address indexed to,
        uint8 amountOfTicket,
        uint8 _currencyId,
        uint256 price
    );
    event Withdraw(address indexed to, uint256 amount, uint8 _currencyId);
    event SetNewToken(address oracleAddress, address tokenAddress, address who);
    event WinnerNumber(uint256 winner);
    event Payout(
        address tokenAddress,
        address payoutAddress,
        uint256 amount
    );

    modifier onlyAdmin() {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Caller is not a admin"
        );
        _;
    }

    constructor(
        address _NFTAddress,
        uint64 subscriptionId,
        address vrfCoordinator,
        bytes32 keyHash
    ) VRFConsumerBaseV2(vrfCoordinator) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        NFTAddress = MyTicket(_NFTAddress);
        owner = payable(msg.sender);
        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinator);
        s_keyHash = keyHash;
        s_subscriptionId = subscriptionId;
        listOfPiceFeed[0] = address(0);
        listOfToken[0] = address(0);
        supportOfToken[address(0)] = true;
        currencyId.increment();
        lotteryStart = block.timestamp;
    }

    function setTokenData(
        address oracleAddress,
        address tokenAddress
    ) external onlyAdmin {
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
        string calldata uri
    ) external payable nonReentrant {
        require(ticketId.current() + amount <= loteryLimit, "tickets sold out");
        require(supportOfToken[_currencyAddress], "Unsupported token");
        require(
            block.timestamp < lotteryDuration + lotteryStart,
            "Lottery over"
        );

        if (_currencyAddress == address(0)) {
            require(
                msg.value == amount * priceForOne,
                "Price entered incorrectly"
            );

            MyTicket(NFTAddress).batchMint(msg.sender, amount, uri);
            purchaseAmount[_currencyId] += msg.value;
            setParticipantsList(amount);

            emit PurchaseTicket(msg.sender, amount, _currencyId, msg.value);
        } else {
            require(msg.value == 0, "Unnecessary transfer of Ether.");

            uint256 totalPrice = getTotalPrice(_currencyId, amount);

            purchaseAmount[_currencyId] += totalPrice;

            setParticipantsList(amount);

            IERC20(listOfToken[_currencyId]).safeTransferFrom(
                msg.sender,
                address(this),
                totalPrice
            );

            MyTicket(NFTAddress).batchMint(msg.sender, amount, uri);

            emit PurchaseTicket(msg.sender, amount, _currencyId, totalPrice);
        }
    }

    function withdraw(address to) external onlyAdmin returns (bool) {
        uint256 balance = address(this).balance;
        require(balance > 0, "Balance is zero");
        (bool success, ) = payable(to).call{value: balance}("");
        require(success, "Transfer failed");

        emit Withdraw(to, balance, 99);
        return true;
    }

    function withdrawToken(uint8 tokenId, address to) external onlyAdmin {
        IERC20 tokenAddress = IERC20(listOfToken[tokenId]);
        uint256 tokenBalance = tokenAddress.balanceOf(address(this));
        tokenAddress.safeTransfer(to, tokenBalance);

        emit Withdraw(to, tokenBalance, tokenId);
    }

    function getLatestPrice(uint8 tokenId) public view returns (int) {
        require(supportOfToken[listOfToken[tokenId]], "Unsupported token");
        (, int price, , , ) = AggregatorV3Interface(listOfPiceFeed[tokenId])
            .latestRoundData();
        return price;
    }

    function getTotalPrice(
        uint8 tokenId,
        uint8 amount
    ) public view returns (uint256) {
        uint256 decimals;
        tokenId == 1 ? decimals = 1e6 : decimals = 1e18;
        return
            (priceForOne * amount * decimals) /
            uint256(getLatestPrice(tokenId));
    }

    function fulfillRandomWords(
        uint256 /* requestId */,
        uint256[] memory randomWords
    ) internal override {
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

    function setWinners() external onlyAdmin {
        require(
            ticketId.current() == loteryLimit ||
                block.timestamp > lotteryDuration + lotteryStart,
            "Lottery is not over"
        );

        s_requestId = COORDINATOR.requestRandomWords(
            s_keyHash,
            s_subscriptionId,
            REQUEST_CONFIRMATIONS,
            CALLBACK_GAS_LIMIT,
            NUM_WORDS
        );
    }

    function payout() external onlyAdmin {
        require(
            ticketId.current() == loteryLimit ||
                block.timestamp > lotteryDuration + lotteryStart,
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
        console.log(address(0));
        console.log(msg.sender);
        console.log(ownerFee);
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
