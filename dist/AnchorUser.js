"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
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
const node_fetch_1 = __importDefault(require("node-fetch")); //node only
const rpc = new eosjs_1.JsonRpc(httpEndpoint, { fetch: node_fetch_1.default });
const _ = __importStar(require("lodash"));
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
const authorization = [
    { actor: "limitlesswax", permission: "cosign" },
];
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
            try {
                let completedTransaction;
                // If this is not a transaction and expireSeconds is passed, form a transaction
                //   Note: this needs to be done because the session transact doesn't understand eosjs transact options
                var temp_transaction = transaction;
                if (options.expireSeconds && !transaction.expiration) {
                    const info = yield this.client.v1.chain.get_info();
                    const tx = Object.assign(Object.assign({}, transaction), info.getTransactionHeader(options.expireSeconds));
                    temp_transaction = tx;
                }
                console.log("Transaction: ", temp_transaction.actions);
                var need_sig = false;
                Object.keys(temp_transaction.actions).forEach(function (key) {
                    if (parseInt(key) >= 0) {
                        if (_.isEqual(temp_transaction.actions[key]["authorization"], authorization)) {
                            need_sig = true;
                        }
                    }
                });
                console.log("need_sig: ", need_sig);
                if (need_sig) {
                    var temp_braodcast = options.broadcast;
                    options.broadcast = false;
                    completedTransaction = yield this.session.transact(temp_transaction, options);
                    const request = {
                        transaction: Array.from(completedTransaction.serializedTransaction),
                    };
                    const response = yield node_fetch_1.default("https://api.limitlesswax.co/cpu-rent", {
                        method: "POST",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(request),
                    });
                    console.log("Response: ", response);
                    if (!response.ok) {
                        const body = yield response.json();
                        throw Error(body.reason || "Failed to connect to endpoint");
                    }
                    const json = yield response.json();
                    console.log("Response JSON: ", json);
                    completedTransaction.signatures.push(json.sig[0]);
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
            }
            catch (e) {
                const message = "Unable to sign transaction";
                const type = universal_authenticator_library_1.UALErrorType.Signing;
                const cause = e;
                throw new UALAnchorError_1.UALAnchorError(message, type, cause);
            }
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
