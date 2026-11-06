//! A deliberately risky NEP-141 token, used to show what the VANA risk check catches.
//!
//! On top of a standard fungible token, the owner can:
//! - `mint` any amount to anyone, at any time;
//! - `blacklist` an account so it can no longer send or receive the token;
//! - `set_owner` to hand those powers to someone else.
//!
//! The deploy script also leaves a full-access key on the token account, so the key holder can
//! replace the code outright. Testnet only. Never deploy this on mainnet.

use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::{LazyOption, UnorderedSet};
use near_sdk::json_types::U128;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue,
};

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum Key {
    Token,
    Metadata,
    Blacklist,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    owner_id: AccountId,
    blacklist: UnorderedSet<AccountId>,
}

#[near]
impl Contract {
    /// The whole `total_supply` goes to `owner_id`.
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128, name: String, symbol: String) -> Self {
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name,
            symbol,
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 18,
        };
        let mut this = Self {
            token: FungibleToken::new(Key::Token),
            metadata: LazyOption::new(Key::Metadata, Some(&metadata)),
            owner_id: owner_id.clone(),
            blacklist: UnorderedSet::new(Key::Blacklist),
        };
        this.token.internal_register_account(&owner_id);
        this.token.internal_deposit(&owner_id, total_supply.0);
        near_contract_standards::fungible_token::events::FtMint {
            owner_id: &owner_id,
            amount: total_supply,
            memo: Some("initial supply"),
        }
        .emit();
        this
    }

    pub fn owner_id(&self) -> AccountId {
        self.owner_id.clone()
    }

    /// Owner only: create `amount` new tokens for `account_id`.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        self.only_owner();
        if !self.token.accounts.contains_key(&account_id) {
            self.token.internal_register_account(&account_id);
        }
        self.token.internal_deposit(&account_id, amount.0);
        near_contract_standards::fungible_token::events::FtMint {
            owner_id: &account_id,
            amount,
            memo: Some("owner mint"),
        }
        .emit();
    }

    /// Owner only: stop `account_id` from sending or receiving the token.
    pub fn blacklist(&mut self, account_id: AccountId) {
        self.only_owner();
        self.blacklist.insert(&account_id);
    }

    pub fn is_blacklisted(&self, account_id: AccountId) -> bool {
        self.blacklist.contains(&account_id)
    }

    /// Owner only: hand every owner power to `owner_id`.
    pub fn set_owner(&mut self, owner_id: AccountId) {
        self.only_owner();
        self.owner_id = owner_id;
    }

    fn only_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, "Owner only");
    }

    fn check_allowed(&self, a: &AccountId, b: &AccountId) {
        require!(!self.blacklist.contains(a) && !self.blacklist.contains(b), "Account is blacklisted");
    }
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.check_allowed(&env::predecessor_account_id(), &receiver_id);
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.check_allowed(&env::predecessor_account_id(), &receiver_id);
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, _burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
    }
}
