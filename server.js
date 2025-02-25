//const MONGODB_URI = 'mongodb+srv://daryldynamic5:Lkps%409753@vohala.a2zchcl.mongodb.net/?retryWrites=true&w=majority&appName=Vohala';

const express = require('express');
const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const multer = require('multer');
const XLSX = require('xlsx');
const cron = require('node-cron');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

const MONGODB_URI = 'mongodb+srv://daryldynamic5:Lkps%409753@vohala.a2zchcl.mongodb.net/?retryWrites=true&w=majority&appName=Vohala';

mongoose
  .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const priceHistorySchema = new mongoose.Schema({
  price: {
    type: String,
    required: true,
  },
  fetchedAt: {
    type: Date,
    default: Date.now,
  },
});

const mutualFunds = [
  { name: 'Axis Small Cap Dir', url: 'https://finance.yahoo.com/quote/0P00011MAX.BO/history/', model: mongoose.model('AxisSmallCapDir', priceHistorySchema) },
  { name: 'HDFC Small Cap Dir', url: 'https://finance.yahoo.com/quote/0P0000XVAA.BO/history/', model: mongoose.model('HDFCSmallCapDir', priceHistorySchema) },
  { name: 'HSBC Nifty 50 Index Dir Gro', url: 'https://finance.yahoo.com/quote/0P0001JIS1.BO/history/', model: mongoose.model('HSBCNifty50IndexDirGro', priceHistorySchema) },
  { name: 'SBI Nifty Next 50 Index Dir Growth', url: 'https://finance.yahoo.com/quote/0P0001M6U0.BO/history/', model: mongoose.model('SBINiftyNext50IndexDirGrowth', priceHistorySchema) },
  { name: 'Nippon Small Cap Dir Growth', url: 'https://finance.yahoo.com/quote/0P0000XVFY.BO/history/', model: mongoose.model('NipponSmallCapDirGrowth', priceHistorySchema) }
];

const upload = multer({ storage: multer.memoryStorage() });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'daryldynamic5@gmail.com',
    pass: 'hcma kqld jmdg hyqy'
  }
});

function sendAlertEmail(type, fundName, currentPrice, refPrice) {
  let subject = '';
  let text = '';

  if (type === 'drop') {
    subject = `${fundName} Alert: 15% Drop`;
    text = `Alert: ${fundName} has dropped more than 15% from its maximum value over the past year.
Current Price: ${currentPrice}
Maximum Price (past year): ${refPrice}`;
  } else if (type === 'rise') {
    subject = `${fundName} Alert: 20% Increase`;
    text = `Alert: ${fundName} has risen more than 20% from its minimum value over the past year.
Current Price: ${currentPrice}
Minimum Price (past year): ${refPrice}`;
  }

  const mailOptions = {
    from: 'daryldynamic5@gmail.com',
    to: 'cubetvorange@gmail.com',
    subject,
    text
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending alert email:', error);
    } else {
      console.log('Alert email sent:', info.response);
    }
  });
}

async function checkThreshold(fund, currentPrice) {
  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const records = await fund.model.find({ fetchedAt: { $gte: oneYearAgo } });
    if (records.length === 0) return;

    const prices = records
      .map(record => parseFloat(record.price))
      .filter(price => !isNaN(price));

    if (prices.length === 0) return;

    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);

    if (maxPrice > 0) {
      const dropRatio = (maxPrice - currentPrice) / maxPrice;
      console.log(`${fund.name} Drop Ratio: ${dropRatio}`);
      if (dropRatio >= 0.15) {
        sendAlertEmail('drop', fund.name, currentPrice, maxPrice);
      }
    }

    if (minPrice > 0) {
      const riseRatio = (currentPrice - minPrice) / minPrice;
      console.log(`${fund.name} Rise Ratio: ${riseRatio}`);
      if (riseRatio >= 0.2) {
        sendAlertEmail('rise', fund.name, currentPrice, minPrice);
      }
    }
  } catch (error) {
    console.error(`Error in checkThreshold for ${fund.name}:`, error);
  }
}

async function getPrice(url) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    await page.waitForSelector('[data-testid="qsp-price"]', { timeout: 10000 });
    
    const price = await page.$eval('[data-testid="qsp-price"]', el => el.textContent.trim());
    await browser.close();
    return price;
  } catch (error) {
    console.error('Error fetching or parsing data:', error);
    return null;
  }
}

async function fetchAndStorePrice() {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  for (const fund of mutualFunds) {
    try {
      const existingRecord = await fund.model.findOne({
        fetchedAt: {
          $gte: today,
          $lt: tomorrow
        }
      });

      if (existingRecord) {
        console.log(`Price for ${fund.name} already synced today at ${new Date(existingRecord.fetchedAt).toLocaleString()}. Skipping...`);
        const currentPrice = parseFloat(existingRecord.price);
        if (!isNaN(currentPrice)) {
          checkThreshold(fund, currentPrice);
        }
        continue;
      }

      const price = await getPrice(fund.url);
      if (price) {
        const priceEntry = new fund.model({ price });
        await priceEntry.save();
        console.log(`Price fetched and stored for ${fund.name}: ${price} at ${new Date().toLocaleString()}`);

        const currentPrice = parseFloat(price);
        if (!isNaN(currentPrice)) {
          checkThreshold(fund, currentPrice);
        }
      } else {
        console.error(`No price fetched for ${fund.name}.`);
      }
    } catch (error) {
      console.error(`Error processing ${fund.name}:`, error);
    }
  }
}

cron.schedule('0 19 * * *', async () => {
  console.log('Scheduled task: Fetching prices at 7 PM...');
  await fetchAndStorePrice();
});

fetchAndStorePrice();

app.get('/', async (req, res) => {
  try {
    const selectedFund = req.query.fund || mutualFunds[0].name;
    const selectedModel = mutualFunds.find(fund => fund.name === selectedFund).model;
    const prices = await selectedModel.find().sort({ fetchedAt: -1 });

    const tableRows = prices.map(record => {
      return `<tr>
                <td>${new Date(record.fetchedAt).toLocaleString()}</td>
                <td>${record.price}</td>
              </tr>`;
    }).join('');

    const dropdownOptions = mutualFunds.map(fund => {
      return `<option value="${fund.name}" ${fund.name === selectedFund ? 'selected' : ''}>${fund.name}</option>`;
    }).join('');

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mutual Funds Data</title>
        <style>
          body {
            background-color: #1a1a1a;
            color: #00ff00;
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 20px;
          }
          header {
            text-align: center;
            padding: 20px;
            background-color: #000000;
            border-bottom: 2px solid #00ff00;
          }
          h1 {
            margin: 0;
            font-size: 2.5em;
            color: #00ff00;
          }
          .container {
            max-width: 1200px;
            margin: 20px auto;
          }
          select {
            background-color: #333333;
            color: #00ff00;
            border: 1px solid #00ff00;
            padding: 10px;
            font-size: 1em;
            width: 100%;
            max-width: 300px;
            border-radius: 5px;
            margin-bottom: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background-color: #2b2b2b;
            box-shadow: 0 0 10px rgba(0, 255, 0, 0.1);
          }
          th, td {
            border: 1px solid #00ff00;
            padding: 12px;
            text-align: left;
          }
          th {
            background-color: #444444;
            color: #00ff00;
          }
          tr:nth-child(even) {
            background-color: #333333;
          }
          hr {
            border: 0;
            border-top: 1px solid #00ff00;
            margin: 20px 0;
          }
          form {
            background-color: #2b2b2b;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0, 255, 0, 0.1);
          }
          input[type="file"] {
            color: #00ff00;
          }
          button {
            background-color: #00ff00;
            color: #000000;
            border: none;
            padding: 10px 20px;
            font-size: 1em;
            cursor: pointer;
            border-radius: 5px;
            transition: background-color 0.3s;
          }
          button:hover {
            background-color: #00cc00;
          }
          footer {
            text-align: center;
            padding: 20px;
            color: #00ff00;
            position: fixed;
            bottom: 0;
            width: 100%;
            left: 0;
            background-color: #000000;
            border-top: 2px solid #00ff00;
          }
        </style>
      </head>
      <body>
        <header>
          <h1>Mutual Funds Data</h1>
        </header>
        <div class="container">
          <form method="GET">
            <label for="fund">Select Mutual Fund:</label>
            <select name="fund" id="fund" onchange="this.form.submit()">
              ${dropdownOptions}
            </select>
          </form>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <hr>
          <form action="/import" method="POST" enctype="multipart/form-data">
            <h2>Import Historical Data for ${selectedFund}</h2>
            <input type="hidden" name="fund" value="${selectedFund}" />
            <input type="file" name="file" accept=".xlsx" required />
            <button type="submit">Import Excel File</button>
          </form>
        </div>
        <footer>
          <p>Developed by Vohala</p>
        </footer>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error fetching data from MongoDB:', error);
    res.status(500).send('Error fetching data from database.');
  }
});

app.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.body.fund) {
      return res.status(400).send('No file uploaded or fund not specified.');
    }

    const selectedFund = req.body.fund;
    const selectedModel = mutualFunds.find(fund => fund.name === selectedFund).model;

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });

    const insertPromises = data.map(async row => {
      const dateValue = new Date(row['date']);
      if (isNaN(dateValue)) {
        throw new Error(`Invalid date format in row: ${JSON.stringify(row)}`);
      }
      const priceEntry = new selectedModel({
        price: row['price'].toString(),
        fetchedAt: dateValue
      });
      return priceEntry.save();
    });

    await Promise.all(insertPromises);

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Import Successful - Mutual Funds Data</title>
        <style>
          body {
            background-color: #1a1a1a;
            color: #00ff00;
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 20px;
            text-align: center;
          }
          h1 {
            font-size: 2em;
            color: #00ff00;
          }
          p {
            font-size: 1.2em;
          }
          a {
            color: #00ff00;
            text-decoration: none;
            padding: 10px 20px;
            border: 1px solid #00ff00;
            border-radius: 5px;
            display: inline-block;
            margin-top: 20px;
          }
          a:hover {
            background-color: #00ff00;
            color: #000000;
          }
        </style>
      </head>
      <body>
        <h1>Import Successful</h1>
        <p>Imported ${data.length} record(s) from the Excel file for ${selectedFund}.</p>
        <a href="/">Go back</a>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error importing Excel file:', error);
    res.status(500).send('Error importing Excel file: ' + error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});