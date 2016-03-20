'use strict';

var iso7816 = require('iso7816');
var hexify = require('hexify');
var emvResponse = require('./EmvResponse');

function EmvApplication(cardReader) {
    this.cardReader = cardReader;
}

EmvApplication.prototype.selectPse = function () {
    var PSE = [0x31, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53, 0x2E, 0x44, 0x44, 0x46, 0x30, 0x31];
    return iso7816(this.cardReader).selectFile(PSE).then(function (resp) {
        return emvResponse(resp)
    });
};

EmvApplication.prototype.selectApplication = function (aidBytes) {
    return iso7816(this.cardReader).selectFile(aidBytes).then(function (resp) {
        return emvResponse(resp)
    });
};

EmvApplication.prototype.readRecord = function (sfi, record) {
    return iso7816(this.cardReader).readRecord(sfi, record).then(function (resp) {
        return emvResponse(resp)
    });
};

function create(cardReader) {
    return new EmvApplication(cardReader);
}

module.exports = create;

