'use strict';

import iso7816 from 'iso7816';

function EmvApplication(cardReader) {
    this.cardReader = cardReader;
}

EmvApplication.prototype.selectPse = function () {
    var PSE = [0x31, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53, 0x2E, 0x44, 0x44, 0x46, 0x30, 0x31];
    return iso7816(this.cardReader).selectFile(PSE)
};

EmvApplication.prototype.selectApplication = function (aidBytes) {
    return iso7816(this.cardReader).selectFile(aidBytes)
};

EmvApplication.prototype.readRecord = function (sfi, record) {
    return iso7816(this.cardReader).readRecord(sfi, record)
};

function create(cardReader) {
    return new EmvApplication(cardReader);
}

module.exports = create;

