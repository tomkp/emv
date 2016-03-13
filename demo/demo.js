var cardreader = require('card-reader');
var emv = require('../lib/emv');
var hexify = require('hexify');


cardreader.on('card-inserted', function (reader, status) {

    var application = emv(cardreader);
    application.selectPse()
        .then(function (response) {
            console.info(`Select PSE:\n${response.toTlvString()}`);
            var sfi = 1;
            var record = 1;
            return application.readRecord(sfi, record);
        })
        .then(function (response) {
            console.info(`Read Record:\n${response.toTlvString()}`);
            var aid = response.find(0x4f);
            console.info(`Application ID: '${aid.toString('hex')}`);
            if (aid) {
                return application.selectApplication(hexify.toByteArray(aid.toString('hex')));
            }

        }).then(function (response) {
        console.info(`Select Application:\n${response.toTlvString()}`);

    }).catch(function (error) {
        console.error('Error:', error, error.stack);
    });

});
