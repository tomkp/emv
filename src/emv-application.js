'use strict';

import iso7816 from 'iso7816';

function EmvApplication(devices, cardReader) {
    this.iso7816 = iso7816(devices, cardReader);
}

EmvApplication.prototype.selectPse = function () {
    var PSE = [0x31, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53, 0x2E, 0x44, 0x44, 0x46, 0x30, 0x31];
    return this.iso7816.selectFile(PSE)
};

EmvApplication.prototype.selectApplication = function (aidBytes) {
    return this.iso7816.selectFile(aidBytes)
};

EmvApplication.prototype.readRecord = function (sfi, record) {
    return this.iso7816.readRecord(sfi, record)
};

function create(devices, cardReader) {
    return new EmvApplication(devices, cardReader);
}

module.exports = create;

