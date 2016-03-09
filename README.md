# EMV 

EMV / Chip and PIN library


## Examples

```javascript

var cardreader = require('card-reader');
var emv = require('emv');

cardreader.on('card-inserted', function () {

  var application = emv(cardreader);
  application.selectPse()
    .then(function (response) {
      console.info('Select PSE response:\n', response.toTlvString());
    }).catch(function (error) {
      console.error('Select PSE', error);
    });
});


```
