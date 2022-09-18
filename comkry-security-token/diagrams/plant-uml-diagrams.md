```plantuml
@startuml setup
!include style.iuml
actor "Deployer" as Deployer
participant "Token Contract" as Token
actor "Transfer\nAdmin" as TAdmin
actor "Reserve\nAdmin" as RAdmin
actor "Hot Wallet\nAdmin" as HAdmin

Deployer -> Token: constructor(reserveAddress,transferAdminAddress,\nsymbol,decimals,totalSupply,...)
TAdmin -> Token: setAllowGroupTransfer(reserveTransferGroup,hotWalletTransferGroup,\nunrestrictedAddressTimeLock)
TAdmin -> Token: setAddressPermissions(reserveAddress,reserveTransferGroup,\nunrestrictedAddressTimelock,unrestrictedMaxTokenAmount)
TAdmin -> Token: setAddressPermissions(reserveAddress,hotWalletTransferGroup,\nunrestrictedAddressTimeLock,sensibleMaxAmountInHotWallet)
RAdmin -> Token: transfer(hotWallet,amount)
TAdmin -> Token: setAddressPermissions(investorAddress,issuerTransferGroup,\naddressTimeLock,maxTokens)
HAdmin -> Token: transfer(investorAddress,amount)
activate Token
Token -> Token: detectTransferRestriction(from,to,value)

@enduml
```

```plantuml
@startuml basic-issuance
!include style.iuml
actor "Investor" as Investor
actor "Transfer\nAdmin" as TAdmin
participant "Token Contract" as Token
actor "Hot Wallet\nAdmin" as HAdmin

Investor -> TAdmin: send AML/KYC and accreditation info
TAdmin -> Token: setMaxBalance(investorAddress, maxTokens)
TAdmin -> Token: setLockUntil(investorAddress, timeToUnlock)
TAdmin -> Token: setAddressPermissions(investorAddress, transferGroup,\naddressTimeLock, maxTokens)\n// Reg D, S or CF
HAdmin -> Token: transfer(investorAddress, amount)
activate Token
Token -> Token: detectTransferRestriction(from, to, value)

@enduml
```

```plantuml
@startuml transfer-restrictions
!include style.iuml
actor Buyer
actor Investor
actor "Transfer\nAdmin" as TAdmin
participant "Token Contract" as Token

Investor -> TAdmin: send AML/KYC and accreditation info
TAdmin -> Token: setAddressPermissions(buyerAddress, transferGroup,\naddressTimeLock, maxTokens)


Buyer -> TAdmin: send AML/KYC and accreditation info
TAdmin -> Token: setAddressPermissions(sellerAddress, transferGroup,\naddressTimeLock, maxTokens)
TAdmin -> Token: setAllowGroupTransfer(fromGroup, toGroup, afterTimestamp)

Investor -> Token: transfer(buyerAddress, amount)
activate Token
Token -> Token: detectTransferRestriction(from, to, value)

note left 
    **Transfer** or **Revert** depending on the result code
end note

@enduml
```

```plantuml
@startuml issuer-transfer-restriction-graph
actor (Default) as "**0**\nNo Transfers\n(Address Default)"
actor (Issuer) as "**1**\nIssuer\nToken Reserves"
actor (Exchange) as "**2**\nRegulated Exchange"
actor (Reg S) as "**3**\nReg S Non-US Approved"
actor (Founders) as "**5**\nFounders\n(2 Year Lockup)"
(Issuer) -> (Issuer)
(Issuer) -down-> (Exchange)
(Issuer) -left-> (Founders)
(Exchange) -down-> (Exchange)
(Exchange) -> (Issuer)
(Exchange) -down-> (Reg S)
(Reg S) -> (Exchange)
@enduml
```