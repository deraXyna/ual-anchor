"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnchorUser = void 0;
const universal_authenticator_library_1 = require("universal-authenticator-library");
const eosio_1 = require("@greymass/eosio");
const eosjs_1 = require("eosjs");
const UALAnchorError_1 = require("./UALAnchorError");
const eosjs_numeric_1 = require("eosjs/dist/eosjs-numeric");
// import { TextDecoder, TextEncoder } from "util";
const httpEndpoint = "https://wax.greymass.com";
// import fetch from "node-fetch"; //node only
let fetch = window.fetch.bind(window);
const rpc = new eosjs_1.JsonRpc(httpEndpoint, { fetch });
class CosignAuthorityProvider {
    getRequiredKeys(args) {
        return __awaiter(this, void 0, void 0, function* () {
            const { transaction } = args;
            // Iterate over the actions and authorizations
            transaction.actions.forEach((action, ti) => {
                action.authorization.forEach((auth, ai) => {
                    // If the authorization matches the expected cosigner
                    // then remove it from the transaction while checking
                    // for what public keys are required
                    if (auth.actor === "limitlesswax" && auth.permission === "cosign") {
                        //@ts-ignore
                        delete transaction.actions[ti].authorization.splice(ai, 1);
                    }
                });
            });
            return eosjs_numeric_1.convertLegacyPublicKeys((yield rpc.fetch("/v1/chain/get_required_keys", {
                transaction,
                available_keys: args.availableKeys,
            })).required_keys);
        });
    }
}
// const authorization: Array<Object> = [
//   { actor: "limitlesswax", permission: "cosign" },
// ];
//@ts-ignore
const api = new eosjs_1.Api({
    rpc: rpc,
    authorityProvider: new CosignAuthorityProvider(),
    textDecoder: new TextDecoder(),
    textEncoder: new TextEncoder(),
});
class AnchorUser extends universal_authenticator_library_1.User {
    constructor(rpc, client, identity) {
        super();
        this.accountName = "";
        this.requestPermission = "";
        const { session } = identity;
        this.accountName = String(session.auth.actor);
        this.chainId = String(session.chainId);
        if (identity.signatures) {
            [this.signerProof] = identity.signatures;
        }
        if (identity.signerKey) {
            this.signerKey = identity.signerKey;
        }
        if (identity.resolvedTransaction) {
            this.signerRequest = identity.transaction;
        }
        this.requestPermission = String(session.auth.permission);
        this.session = session;
        this.client = client;
        this.rpc = rpc;
    }
    objectify(data) {
        return JSON.parse(JSON.stringify(data));
    }
    signTransaction(transaction, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var completedTransaction;
            // If this is not a transaction and expireSeconds is passed, form a transaction
            //   Note: this needs to be done because the session transact doesn't understand eosjs transact options
            var temp_transaction = transaction;
            try {
                if (options.expireSeconds && !transaction.expiration) {
                    const info = yield this.client.v1.chain.get_info();
                    const tx = Object.assign(Object.assign({}, transaction), info.getTransactionHeader(options.expireSeconds));
                    temp_transaction = tx;
                }
            }
            catch (e) {
                const message = "this.client.v1.chain.get_info() FAILED";
                const type = universal_authenticator_library_1.UALErrorType.Signing;
                const cause = e;
                throw new UALAnchorError_1.UALAnchorError(message, type, cause);
            }
            console.log("Transaction: ", temp_transaction.actions);
            var need_sig = true;
            // Object.keys(temp_transaction.actions).forEach(function (key) {
            //   if (parseInt(key) >= 0) {
            //     console.log("TEST 1: ", key);
            //     if (
            //       _.isEqual(
            //         temp_transaction.actions[key]["authorization"],
            //         authorization
            //       )
            //     ) {
            //       console.log("TEST 2: ", temp_transaction.actions[key]);
            //       need_sig = true;
            //     }
            //   }
            // });
            console.log("need_sig: ", need_sig);
            if (need_sig === true) {
                console.log("Getting a sig");
                var temp_braodcast = options.broadcast;
                options.broadcast = false;
                try {
                    completedTransaction = yield this.session.transact(temp_transaction, options);
                }
                catch (e) {
                    const message = "this.session.transact FAILED";
                    const type = universal_authenticator_library_1.UALErrorType.Signing;
                    const cause = e;
                    throw new UALAnchorError_1.UALAnchorError(message, type, cause);
                }
                console.log("Didn't broadcast.");
                // const serialized_transaction = PackedTransaction.fromSigned(
                //   SignedTransaction.from(completed_transaction.transaction)
                // );
                console.log("serializedTransaction: ", completedTransaction);
                const request = {
                    transaction: Array.from(completedTransaction.transaction),
                };
                console.log("About to fetch");
                let response;
                // try {
                const res = yield fetch("https://api.limitlesswax.co/cpu-rent", {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                        "content-type": "application/x-www-form-urlencoded",
                    },
                    body: JSON.stringify(request),
                });
                console.log(res);
                response = res;
                // } catch (e) {
                //   console.log(JSON.stringify(e));
                //   const message = "fetch api sig FAILED";
                //   const type = UALErrorType.Signing;
                //   const cause = e;
                //   throw new UALAnchorError(message, type, cause);
                // }
                console.log("Response: ", response);
                if (!response.ok) {
                    console.log("Stuck");
                    //@ts-ignore
                    const body = yield response.json();
                    throw new UALAnchorError_1.UALAnchorError("Failed to connect to endpoint", universal_authenticator_library_1.UALErrorType.Signing, null);
                }
                //@ts-ignore
                const json = yield response.json();
                console.log("Response JSON: ", json);
                if (json.signature) {
                    try {
                        completedTransaction.signatures.push(json.signature[0]);
                    }
                    catch (e) {
                        const message = "completedTransaction.signatures.push FAILED";
                        const type = universal_authenticator_library_1.UALErrorType.Signing;
                        const cause = e;
                        throw new UALAnchorError_1.UALAnchorError(message, type, cause);
                    }
                }
                console.log("Pushing completed_transaction");
                var data = {
                    signatures: completedTransaction.signatures,
                    compression: 0,
                    serializedContextFreeData: undefined,
                    serializedTransaction: completedTransaction.serializedTransaction,
                };
                options.broadcast = temp_braodcast;
                var completed_transaction = completedTransaction;
                if (temp_braodcast) {
                    completed_transaction = yield api.rpc.send_transaction(data);
                }
            }
            console.log("Done with changed code.");
            const wasBroadcast = options.broadcast !== false;
            const serializedTransaction = eosio_1.PackedTransaction.fromSigned(eosio_1.SignedTransaction.from(completed_transaction.transaction));
            return this.returnEosjsTransaction(wasBroadcast, Object.assign(Object.assign({}, completed_transaction), { transaction_id: completed_transaction.payload.tx, serializedTransaction: serializedTransaction.packed_trx.array, signatures: this.objectify(completed_transaction.signatures) }));
        });
    }
    signArbitrary(publicKey, data, _) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new UALAnchorError_1.UALAnchorError(`Anchor does not currently support signArbitrary(${publicKey}, ${data})`, universal_authenticator_library_1.UALErrorType.Unsupported, null);
        });
    }
    verifyKeyOwnership(challenge) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new UALAnchorError_1.UALAnchorError(`Anchor does not currently support verifyKeyOwnership(${challenge})`, universal_authenticator_library_1.UALErrorType.Unsupported, null);
        });
    }
    getAccountName() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.accountName;
        });
    }
    getChainId() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.chainId;
        });
    }
    getKeys() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const keys = yield this.signatureProvider.getAvailableKeys(this.requestPermission);
                return keys;
            }
            catch (error) {
                const message = `Unable to getKeys for account ${this.accountName}.
        Please make sure your wallet is running.`;
                const type = universal_authenticator_library_1.UALErrorType.DataRequest;
                const cause = error;
                throw new UALAnchorError_1.UALAnchorError(message, type, cause);
            }
        });
    }
    isAccountValid() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const account = this.client &&
                    (yield this.client.v1.chain.get_account(this.accountName));
                const actualKeys = this.extractAccountKeys(account);
                const authorizationKeys = yield this.getKeys();
                return (actualKeys.filter((key) => {
                    return authorizationKeys.indexOf(key) !== -1;
                }).length > 0);
            }
            catch (e) {
                if (e.constructor.name === "UALAnchorError") {
                    throw e;
                }
                const message = `Account validation failed for account ${this.accountName}.`;
                const type = universal_authenticator_library_1.UALErrorType.Validation;
                const cause = e;
                throw new UALAnchorError_1.UALAnchorError(message, type, cause);
            }
        });
    }
    extractAccountKeys(account) {
        const keySubsets = account.permissions.map((permission) => permission.required_auth.keys.map((key) => key.key));
        let keys = [];
        for (const keySubset of keySubsets) {
            keys = keys.concat(keySubset);
        }
        return keys;
    }
}
exports.AnchorUser = AnchorUser;
