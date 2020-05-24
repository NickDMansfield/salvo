vow-xamel [![NPM version](https://badge.fury.io/js/vow-xamel.svg)](http://badge.fury.io/js/vow-xamel)
=========
A [vow](https://github.com/dfilatov/vow)-shell for the [xamel](https://github.com/nodules/xamel) XML serialized/deserializer

## How to use
You can get the latest version of the package by running:
```
npm install vow-xamel
```

The package proxies the interface of [xamel](https://github.com/nodules/xamel#quick-start). The only differences being that you should require `vow-xamel`, the `parse()` method returns a [vow.Promise](http://dfilatov.github.io/vow/) and doesn't need a callback argument. Putting those together will result in something like this:
```
var xamel = require('vow-xamel');
var xmlString = '<onion><layer smell="1" /><layer smell="2" /><layer smell="3" /></onion>';

xamel.parse(xmlString)
    .then(function (nodeSet) {
        // do something with the result
    })
    .fail(function (reason) {
        // log the failure
    });

```

## How to contribute
You can start by checking out the repository and then installing the dependencies:
```
npm install
```

You can check the compliance with the code style and for JS syntax quality by running:
```
npm run-script lint
```

Test can be ran by using the `test` npm script:
```
npm run-script test
```

## License
[The MIT License](http://opensource.org/licenses/MIT)
