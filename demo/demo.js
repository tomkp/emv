var cardreader = require('card-reader');
var emv = require('../lib/emv');

cardreader.on('device-activated', function (reader) {
    //console.info('Device activated', reader);
});
cardreader.on('device-deactivated', function (reader) {
    //console.info('Device deactivated', reader);
});
cardreader.on('card-removed', function (reader) {
    //console.info('Card removed', reader);
});
cardreader.on('data-received', function (data) {
    //console.info('Data received', data.toString());
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
            return application.selectApplication(aids[8].aid)
        })
        .then(function (response) {
            console.info('selectFile: data-received', response.toString('hex'));
        }).catch(function (error) {
            console.error('selectFile: error', error);
        });
}
