# EMV 

EMV / Chip and PIN library


## Examples

```javascript

var cardreader = require('card-reader');
var emvTags = require('../lib/emvTags');
var emvApplication = require('../lib/emvApplication');


cardreader.on('device-activated', function (reader) {
    console.info(`Device '${reader.name}' activated`);
});

cardreader.on('device-deactivated', function (reader) {
    console.info(`Device '${reader}' deactivated`);
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

    var application = emvApplication(cardreader);
    application
        .selectPse()
        .then(function (response) {
            console.info(`Select PSE Response:\n${emvTags.format(response)}`);
            var sfi = 1;
            var record = 0;
            while (record++ < 10) {
                application.readRecord(sfi, record).then(function (response) {
                    if (response.isOk()) {
                        console.info(`Read Record Response: ${emvTags.format(response)}`);
                        var aid = emvTags.findTag(response, 0x4f);
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


```
