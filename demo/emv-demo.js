'use strict';

let devices = require('card-reader');
let emvTags = require('../lib/emv-tags');
let emvApplication = require('../lib/emv-application');


devices.on('device-activated', function (event) {
    console.log(`Device '${event.reader.name}' activated, devices: ${devices.listDevices()}`);
});

devices.on('device-deactivated', function (event) {
    console.log(`Device '${event.reader.name}' deactivated, devices: ${devices.listDevices()}`);
});

devices.on('card-removed', function (event) {
    console.log(`Card removed from '${event.reader.name}' `);
});

devices.on('command-issued', function (event) {
    console.log(`Command '${event.command}' issued to '${event.reader.name}' `);
});

devices.on('response-received', function (event) {
    console.log(`Response '${event.response}' received from '${event.reader.name}' in response to '${event.command}'`);
});

devices.on('error', function (event) {
    console.log(`Error '${event.error}' received`);
});

devices.on('card-inserted', function (event) {

    console.log(`List devices: ${devices.listDevices()}`);

    var reader = event.reader;
    console.log(`Card inserted into '${reader.name}', atr: '${event.status.atr.toString('hex')}'`);


    let application = emvApplication(devices, reader);
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
