'use strict';
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

async function getPrice(symbol) {
  let urlP = `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/`,
    url = (urlP + symbol.toLowerCase() + '/quote'),
    fRtn = await fetch(url),
    fObj = await fRtn.json();
  return fObj.latestPrice;
}

async function likeHandler(ipv4, stock, like) {
  const stockU = stock.toUpperCase();
  const db = new sqlite3.Database('likedb.db'); // Db=likedb
  db.run(`CREATE TABLE IF NOT EXISTS liketable (
        id INTEGER PRIMARY KEY,
        ip TEXT ,stock TEXT,like TEXT 
        )`); // Create/connect to the database

  let sql = "SELECT ip,stock,like FROM liketable " + " WHERE ip IS '" + ipv4 + "' AND stock IS '" + stockU + "' ;";

  return new Promise((resolve) => {
    db.all(sql, [], (err, rows) => {
      if (rows.length === 0 && like == 'true') {
        let insertQuery = `INSERT INTO liketable(ip,stock,like) VALUES (?,?,?)`;
        db.run(insertQuery, [ipv4, stockU, like], function (err) {
          if (err) {
            console.error(err.message);
            resolve(0); // Return 0 likes if there's an error
          } else {
            console.log(`Inserted data with id ${this.lastID}`);
            resolve(1); // Return 1 like if successful insertion
          }
        });
      } else {
        resolve(0); // Return 0 likes if the row already exists or like is 'false'
      }
    });
  });
}

module.exports = function (app) {
  app.route('/api/stock-prices').get(async function (req, res) {
    const { stock, like } = req.query;
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ipArray = clientIP.split(':');
    const ipv4Ori = ipArray[ipArray.length - 1];
    const ipv4Arr = ipv4Ori.split('.');
    ipv4Arr[3] = 0;
    const ipv4Mdf = ipv4Arr.join('.');

    if (typeof stock === 'string') {
      let symP = await getPrice(stock);
      if (typeof symP == 'undefined') {
        res.send({ err: 'code not valid' });
      }

      const saveLikes = await likeHandler(ipv4Mdf, stock, like);

      const db = new sqlite3.Database('likedb.db'); // Db=likedb
      const likerows = `SELECT ip,stock,like FROM liketable WHERE stock IS '${stock.toUpperCase()}'`;
      db.all(likerows, [], (err, likes) => {
        if (err) {
          console.error(err.message);
        } else {
          const likesttl = likes.length + saveLikes;
          db.close(); // Close the database connection
          console.log(stock, symP, likesttl);
          res.send({ "stockData": { "stock": stock.toUpperCase(), "price": symP, "likes": likesttl } });
        }
      });
    }

    if (typeof stock != 'string') {
      const p0 = await getPrice(stock[0]);
      if (typeof p0 == 'undefined') {
        res.send({ err: 'code not valid' });
      }
      const p1 = await getPrice(stock[1]);
      if (typeof p1 == 'undefined') {
        res.send({ err: 'code not valid' });
      }

      const saveLikes0 = await likeHandler(ipv4Mdf, stock[0], like);
      const saveLikes1 = await likeHandler(ipv4Mdf, stock[1], like);

      const db = new sqlite3.Database('likedb.db'); // Db=likedb
      const likerows0 = `SELECT ip,stock,like FROM liketable WHERE stock IS '${stock[0].toUpperCase()}'`;
      const likerows1 = `SELECT ip,stock,like FROM liketable WHERE stock IS '${stock[1].toUpperCase()}'`;

      db.all(likerows0, [], (err0, likes0) => {
        db.all(likerows1, [], (err1, likes1) => {
          if (err0 || err1) {
            console.error(err0 ? err0.message : err1.message);
          } else {
            const diff = likes0.length - (likes1.length);
            res.send({
              "stockData": [
                { "stock": stock[0].toUpperCase(), "price": p0, "rel_likes": diff },
                { "stock": stock[1].toUpperCase(), "price": p1, "rel_likes": 0 - diff }
              ]
            });
          }
          db.close(); // Close the database connection
        });
      });
    }
  });
};
