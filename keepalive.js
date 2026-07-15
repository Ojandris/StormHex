const express = require('express');
const server = express();

server.all('/', (req, res) => {
  res.send('Bot en ligne !');
});

function keepAlive() {
  server.listen(3000, () => {
    console.log('KeepAlive actif');
  });
}

module.exports = keepAlive;
