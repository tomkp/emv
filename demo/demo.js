var cardreader = require('card-reader');
var emv = require('../lib/emv');
var hexify = require('hexify');

cardreader.on('device-activated', function (reader) {
    //console.info('Device activated', reader);
});
cardreader.on('device-deactivated', function (reader) {
    //console.info('Device deactivated', reader);
});
cardreader.on('card-removed', function (reader) {
    //console.info('Card removed', reader);
});
cardreader.on('error', function (error) {
    //console.info('Error', error);
});


cardreader.on('card-inserted', function (reader, status) {
    //console.info('Card inserted', reader, status, this);
    explore();
});


var aids = [
    {name: 'VISA', aid: [0xa0, 0x00, 0x00, 0x00, 0x03]},
    {name: 'VISA Debit/Credit', aid: [0xa0, 0x00, 0x00, 0x00, 0x03, 0x10, 0x10]},
    {name: 'VISA Credit', aid: [0xa0, 0x00, 0x00, 0x00, 0x03, 0x10, 0x10, 0x01]},
    {name: 'VISA Debit', aid: [0xa0, 0x00, 0x00, 0x00, 0x03, 0x10, 0x10, 0x02]},
    {name: 'VISA Electron', aid: [0xa0, 0x00, 0x00, 0x00, 0x03, 0x20, 0x10]},
    {name: 'VISA Interlink', aid: [0xa0, 0x00, 0x00, 0x00, 0x03, 0x30, 0x10]},
    {name: 'VISA Plus', aid: [0xa0, 0x00, 0x00, 0x00, 0x03, 0x80, 0x10]},
    {name: 'VISA ATM', aid: [0xa0, 0x00, 0x00, 0x00, 0x03, 0x99, 0x99, 0x10]},
    {name: 'MASTERCARD', aid: [0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10]},
    {name: 'Maestro', aid: [0xa0, 0x00, 0x00, 0x00, 0x04, 0x30, 0x60]},
    {name: 'Maestro UK', aid: [0xa0, 0x00, 0x00, 0x00, 0x05, 0x00, 0x01]},
    {name: 'Maestro TEST', aid: [0xb0, 0x12, 0x34, 0x56, 0x78]},
    {name: 'Self Service', aid: [0xa0, 0x00, 0x00, 0x00, 0x24, 0x01]},
    {name: 'American Express', aid: [0xa0, 0x00, 0x00, 0x00, 0x25]},
    {name: 'ExpressPay', aid: [0xa0, 0x00, 0x00, 0x00, 0x25, 0x01, 0x07, 0x01]},
    {name: 'Link', aid: [0xa0, 0x00, 0x00, 0x00, 0x29, 0x10, 0x10]},
    {name: 'Alias AID', aid: [0xa0, 0x00, 0x00, 0x00, 0x29, 0x10, 0x10]}
];


function explore() {


    var application = emv(cardreader);
    application.selectPse()
        .then(function (response) {
            console.info('selectFile: data-received', response.toString('hex'));
            console.info('parsed:\n', response.toTlvString());

            //console.info('sfi:', response.tlv.getFirstChild(0x6f));

            var sfi = 1;
            var record = 1;
            return application.readRecord(sfi, record);


            /*var promises = [];
             for (var sfi = 1; sfi < 2; sfi++) {
             for (var record = 1; record < 2; record++) {
             promises.push(application.readRecord(sfi, record));
             }
             }
             return Promise.all(promises)*/
        })
        .then(function (response) {
            //console.info('response', response);
            //console.info('readRecord: data-received', response.buffer().toString('hex'));
            console.info('parsed:\n', response.toTlvString());

            var aid = response.find(0x4f);
            console.info('aid', aid);


            if (aid) {

                return application.selectApplication(hexify.toByteArray(aid.toString('hex')));
                // 00a404000ea000000004101000
                // 00a4040007a000000004101000
                //return application.selectApplication(aids[8].aid);
            }

        }).then(function (response) {
            //console.info('response', response);
            console.info('parsed:\n', response.toTlvString());

    }).catch(function (error) {
        console.error('Error:', error, error.stack);
    });
}
