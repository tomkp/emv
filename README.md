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

cardreader.on('command-issued', function (reader, command) {
    console.info(`Command '${command.toString('hex')}' issued to '${reader.name}' `);
});

cardreader.on('response-received', function (reader, response) {
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


## Compatible Readers

Tested on Mac OSX with the SCM SCR3500 Smart Card Reader. 
This library *should* work with most PC/SC readers - I'll update this page when I get to test others.
If you know of any other devices that work please let me know.
 

<div align="center">
   <img src="docs/scr3500-collapsed.JPG" width=600 style="margin:1rem;" />
</div>

<div align="center">
   <img src="docs/scr3500-expanded.JPG" width=600 style="margin:1rem;" />
</div>