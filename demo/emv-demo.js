'use strict';

let cardreader = require('card-reader');
let emvTags = require('../lib/emv-tags');
let emvApplication = require('../lib/emv-application');


cardreader.on('device-activated', function (reader) {
    console.info(`Device '${reader.name}' activated`);
});

cardreader.on('device-deactivated', function (reader) {
    console.info(`Device '${reader}' deactivated`);
});

cardreader.on('card-removed', function (reader) {
    console.info(`Card removed from '${reader.name}' `);
});

cardreader.on('command-issued', function (reader, command) {
    console.info(`Command '${command.toString('hex')}' issued to '${reader.name}' `);
});

cardreader.on('response-received', function (reader, response) {
    console.info(`Response '${response}' received from '${reader.name}' `);
});


cardreader.on('card-inserted', function (reader, status) {

    console.info(`Card inserted into '${reader.name}', atr: '${status.atr.toString('hex')}'`);

    let application = emvApplication(cardreader);
    application
        .selectPse()
        .then(function (response) {
            console.info(`Select PSE Response:\n${emvTags.format(response)}`);
            let sfi = emvTags.findTag(response, 0x88).toString('hex');
            let records = [0, 1, 2, 3, 4, 5, 6];
            let aids = [];
            let queue = Promise.resolve();
            records.forEach(function (record) {
                queue = queue.then(function () {
                    return application.readRecord(sfi, record).then(function (response) {
                        if (response.isOk()) {
                            console.info(`Read Record Response: \n${emvTags.format(response)}`);
                            let aid = emvTags.findTag(response, 0x4f);
                            if (aid) {
                                console.info(`Application ID: '${aid.toString('hex')}`);
                                aids.push(aid.toString('hex'));
                            }
                        }
                        return aids;
                    }).catch(function (error) {
                        console.error('Read Record Error:', error, error.stack);
                    });
                });
            });
            return queue;
        }).then(function(applicationIds) {
            console.info(`Application IDs: '${applicationIds}'`);
        }).catch(function (error) {
            console.error('Error:', error, error.stack);
        });

});
