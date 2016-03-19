var cardreader = require('card-reader');
var emv = require('../lib/emv');
var hexify = require('hexify');



cardreader.on('device-activated', function (reader) {
    console.info(`Device '${reader.name}' activated`);
});

cardreader.on('device-deactivated', function (reader) {
    console.info(`Device '${reader.name}' deactivated`);
});

cardreader.on('card-removed', function (reader) {
    console.info(`Card removed from '${reader.name}' `);
});

cardreader.on('issue-command', function (reader, command) {
    console.info(`Command '${command.toString('hex')}' issued to '${reader.name}' `);
});

cardreader.on('receive-response', function (reader, response) {
    console.info(`Response '${response}' received from '${reader.name}' `);
});


cardreader.on('card-inserted', function (reader, status) {

    console.info(`Card inserted into '${reader.name}', atr: '${status.atr.toString('hex')}'`);

    var application = emv(cardreader);
    application.selectPse()
        .then(function (response) {
            console.info(`Select PSE Response:\n${response.toTlvString()}`);
            var sfi = 1;
            var record = 1;

            while (record < 10) {
                application.readRecord(sfi, record++).then(function (response) {
                    if (response.response.isOk()) {
                        console.info(`Read Record Response:\n${response.toTlvString()}`);
                        var aid = response.find(0x4f);
                        if (aid) {
                            console.info(`Application ID: '${aid.toString('hex')}`);
                        }
                    }
                    return response;
                }).catch(function (error) {
                    console.error('Read Record Error:', error, error.stack);
                });
            }

        }).catch(function (error) {
        console.error('Error:', error, error.stack);
    });

});
