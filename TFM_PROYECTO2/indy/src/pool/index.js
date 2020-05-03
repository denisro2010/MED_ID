'use strict';
const sdk = require('indy-sdk');
const indy = require('../../index.js');
const config = require('../../../config');
const mkdirp = require('mkdirp');
const fs = require('fs');
const os = require('os');
let pool;

exports.get = async function() {
    if(!pool) {
        await exports.setup();
    }
    return pool;
};

exports.setup = async function () {
    await sdk.setProtocolVersion(2);

    let poolGenesisTxnPath = await exports.getPoolGenesisTxnPath(config.poolName);
    let poolConfig = {
        "genesis_txn": poolGenesisTxnPath
    };
    try {
        await sdk.createPoolLedgerConfig(config.poolName, poolConfig);
    } catch (e) {
        if (e.message !== "PoolLedgerConfigAlreadyExistsError") {
            throw e;
        }
    } finally {
        pool = await sdk.openPoolLedger(config.poolName);
    }
};

exports.getPoolGenesisTxnPath = async function(poolName) {
    let path = `${os.tmpdir()}/indy/${poolName}.txn`;
    await savePoolGenesisTxnFile(path);
    return path
};

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

async function poolGenesisTxnData() {
    let poolIp = config.testPoolIp;
    let poolFile = '/home/indy/ledger/sandbox/pool_transactions_genesis';

    while ( !fs.existsSync(poolFile) ) {
       await sleep(200);
    }

    return fs.readFileSync(poolFile, {encoding: 'utf-8'});

}

async function savePoolGenesisTxnFile(filePath) {
    let data = await poolGenesisTxnData();
    await mkdir(filePath);
    return fs.writeFileSync(filePath, data, 'utf8');
}

async function mkdir(filePath) {
    return new Promise((resolve, reject) => {
        let folderPath = filePath.split('/').slice(0, filePath.split('/').length - 1).join('/');
        mkdirp(folderPath, function(err, res) {
            if(err) reject(err);
            else resolve(res);
        })
    })
}

exports.setEndpointForDid = async function (did, endpoint) {
    let attributeRequest = await sdk.buildAttribRequest(await indy.did.getEndpointDid(), did, null, {endpoint: {ha: endpoint}}, null);
    await sdk.signAndSubmitRequest(await indy.pool.get(), await indy.wallet.get(), await indy.did.getEndpointDid(), attributeRequest);
};

exports.getEndpointForDid = async function (did) {
    let getAttrRequest = await sdk.buildGetAttribRequest(await indy.did.getEndpointDid(), did, 'endpoint', null, null);
    let res = await waitUntilApplied(pool, getAttrRequest, data => data['result']['data'] != null);
    return JSON.parse(res.result.data).endpoint.ha;
};

exports.proverGetEntitiesFromLedger = async function(identifiers) {
    let schemas = {};
    let credDefs = {};
    let revStates = {};

    for(let referent of Object.keys(identifiers)) {
        let item = identifiers[referent];
        let receivedSchema = await indy.issuer.getSchema(item['schema_id']);
        schemas[receivedSchema.id] = receivedSchema;

        let [receivedCredDefId, receivedCredDef] = await indy.issuer.getCredDef(await indy.pool.get(), await indy.did.getEndpointDid(), item['cred_def_id']);
        credDefs[receivedCredDefId] = receivedCredDef;

        if (item.rev_reg_seq_no) {
            // TODO Create Revocation States
        }
    }

    return [schemas, credDefs, revStates];
};

exports.verifierGetEntitiesFromLedger = async function(identifiers) {
    let schemas = {};
    let credDefs = {};
    let revRegDefs = {};
    let revRegs = {};

    for(let referent of Object.keys(identifiers)) {
        let item = identifiers[referent];
        let receivedSchema = await indy.issuer.getSchema(item['schema_id']);
        schemas[receivedSchema.id] = receivedSchema;

        let [receivedCredDefId, receivedCredDef] = await indy.issuer.getCredDef(await indy.pool.get(), await indy.did.getEndpointDid(), item['cred_def_id']);
        credDefs[receivedCredDefId] = receivedCredDef;

        if (item.rev_reg_seq_no) {
            // TODO Get Revocation Definitions and Revocation Registries
        }
    }
    return [schemas, credDefs, revRegDefs, revRegs];
};

exports.sendNym = async function(poolHandle, walletHandle, Did, newDid, newKey, role) {
    let nymRequest = await sdk.buildNymRequest(Did, newDid, newKey, null, role);
    await sdk.signAndSubmitRequest(poolHandle, walletHandle, Did, nymRequest);
};

async function waitUntilApplied(ph, req, cond) {
    for (let i = 0; i < 3; i++) {
        let res = await sdk.submitRequest(ph, req);

        if (cond(res)) {
            return res;
        }

        await indy.utils.sleep(5 * 1000);
    }
}
