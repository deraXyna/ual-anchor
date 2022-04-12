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
// import axios from "axios"
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
            var completedTransaction;
            console.log("Transaction: ", transaction.actions);
            var need_sig = 0;
            Object.keys(transaction.actions).forEach(function (key) {
                if (parseInt(key) >= 0) {
                    console.log("TEST 1: ", key);
                    if (_.isEqual(transaction.actions[key]["authorization"], authorization)) {
                        console.log("TEST 2: ", transaction.actions[key]);
                        need_sig = 1;
                    }
                }
            });
            console.log("need_sig: ", need_sig);
            if (need_sig === 1) {
                options.sign = true;
                var temp_braodcast = options.broadcast;
                options.broadcast = false;
                try {
                    completedTransaction = yield this.session.transact(transaction, options);
                }
                catch (e) {
                    const message = "this.session.transact FAILED";
                    const type = universal_authenticator_library_1.UALErrorType.Signing;
                    const cause = e;
                    //@ts-ignore
                    throw new UALAnchorError_1.UALAnchorError(message, type, cause);
                }
                const request = {
                    transaction: Array.from(eosio_1.PackedTransaction.fromSigned(eosio_1.SignedTransaction.from(completedTransaction.transaction)).packed_trx.array),
                };
                console.log("About to fetch");
                console.log(request);
                // var response = {};
                var json = { signature: [] };
                if (typeof window !== "undefined") {
                    let fetchWindow = window.fetch.bind(window);
                    const response = yield fetchWindow("https://api.limitlesswax.co/cpu-rent", {
                        method: "POST",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(request),
                    });
                    if (!response.ok) {
                        throw new UALAnchorError_1.UALAnchorError("Failed to connect to endpoint", universal_authenticator_library_1.UALErrorType.Signing, null);
                    }
                    json = yield response.json();
                }
                else {
                    const response = yield node_fetch_1.default("https://api.limitlesswax.co/cpu-rent", {
                        method: "POST",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(request),
                    });
                    if (!response.ok) {
                        throw new UALAnchorError_1.UALAnchorError("Failed to connect to endpoint", universal_authenticator_library_1.UALErrorType.Signing, null);
                    }
                    //@ts-ignore
                    json = yield response.json();
                }
                // if (!response.ok) {
                //   throw new UALAnchorError(
                //     "Failed to connect to endpoint",
                //     UALErrorType.Signing,
                //     null
                //   );
                // }
                // const json = await response.json();
                console.log("Response JSON: ", json);
                var sigs = [];
                if (json.signature) {
                    sigs.push(json.signature[0]);
                    sigs.push(completedTransaction.payload.sig);
                }
                console.log("Pushing completed_transaction");
                var data = {
                    signatures: sigs,
                    compression: 0,
                    serializedContextFreeData: undefined,
                    serializedTransaction: eosio_1.PackedTransaction.fromSigned(eosio_1.SignedTransaction.from(completedTransaction.transaction)).packed_trx.array,
                };
                console.log("data: ", data);
                options.broadcast = temp_braodcast;
                if (temp_braodcast) {
                    var reties = 3;
                    var retry = false;
                    try {
                        var completed_transaction = yield api.rpc.send_transaction(data);
                        console.log("completed: ", completed_transaction);
                        completedTransaction.transaction_id =
                            completed_transaction.transaction_id;
                        completedTransaction.processed = completed_transaction.processed;
                    }
                    catch (e) {
                        const message = "api.rpc.send_transaction FAILED";
                        console.log("Error: ", message);
                        retry = true;
                    }
                    if (retry) {
                        var res = {};
                        var completed = false;
                        while (reties > 0) {
                            try {
                                res = yield api.rpc.send_transaction(data);
                                completed = true;
                            }
                            catch (e) {
                                console.log(JSON.stringify(e));
                            }
                            // check for completed - need to check actual returned messages
                            if (completed) {
                                completedTransaction = res;
                                reties = 0;
                            }
                            reties--;
                            new Promise((resolve) => setTimeout(resolve, 300));
                        }
                    }
                }
                completedTransaction.signatures = sigs;
                console.log("completedTransaction: ", completedTransaction);
                console.log("Done with changed code.");
            }
            else {
                if (options.expireSeconds && !transaction.expiration) {
                    const info = yield this.client.v1.chain.get_info();
                    const tx = Object.assign(Object.assign({}, transaction), info.getTransactionHeader(options.expireSeconds));
                    completedTransaction = yield this.session.transact(tx, options);
                }
                else {
                    completedTransaction = yield this.session.transact(transaction, options);
                }
            }
            const wasBroadcast = options.broadcast !== false;
            const serializedTransaction = eosio_1.PackedTransaction.fromSigned(eosio_1.SignedTransaction.from(completedTransaction.transaction));
            return this.returnEosjsTransaction(wasBroadcast, Object.assign(Object.assign({}, completedTransaction), { transaction_id: completedTransaction.payload.tx, serializedTransaction: serializedTransaction.packed_trx.array, signatures: this.objectify(completedTransaction.signatures) }));
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
                //@ts-ignore
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
                //@ts-ignore
                if (e.constructor.name === "UALAnchorError") {
                    throw e;
                }
                const message = `Account validation failed for account ${this.accountName}.`;
                const type = universal_authenticator_library_1.UALErrorType.Validation;
                const cause = e;
                //@ts-ignore
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
