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

const PriceHistory = mongoose.model('PriceHistory', priceHistorySchema);

const upload = multer({ storage: multer.memoryStorage() });


const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'daryldynamic5@gmail.com',         
    pass: 'hcma kqld jmdg hyqy '         
  }
});

/**
 * Sends an alert email based on the alert type.
 * 
 * @param {string} type - Either "drop" or "rise".
 * @param {number} currentPrice - The current price.
 * @param {number} refPrice - The reference price (max for drop, min for rise).
 */
function sendAlertEmail(type, currentPrice, refPrice) {
  let subject = '';
  let text = '';

  if (type === 'drop') {
    subject = 'Mutual fund alert: 20% drop';
    text = `Alert: The mutual fund has dropped more than 20% from its maximum value over the past year.
Current Price: ${currentPrice}
Maximum Price (past year): ${refPrice}`;
  } else if (type === 'rise') {
    subject = 'Mutual fund alert: 20% increase';
    text = `Alert: The mutual fund has risen more than 20% from its minimum value over the past year.
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

/**
 * Checks the threshold conditions:
 * 1. If the current price is 20% below the maximum price of the past year.
 * 2. If the current price is 20% above the minimum price of the past year.
 * If either condition is met, an email alert is sent.
 *
 * @param {number} currentPrice - The current price.
 */
async function checkThreshold(currentPrice) {
  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const records = await PriceHistory.find({ fetchedAt: { $gte: oneYearAgo } });
    if (records.length === 0) return;

    
    const prices = records
      .map(record => parseFloat(record.price))
      .filter(price => !isNaN(price));

    if (prices.length === 0) return;

    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);

    
    if (maxPrice > 0) {
      const dropRatio = (maxPrice - currentPrice) / maxPrice;
      console.log(`Drop Ratio: ${dropRatio}`);
      if (dropRatio >= 0.15) {
        sendAlertEmail('drop', currentPrice, maxPrice);
      }
    }

    
    if (minPrice > 0) {
      const riseRatio = (currentPrice - minPrice) / minPrice;
      console.log(`Rise Ratio: ${riseRatio}`);
      if (riseRatio >= 0.2) {
        sendAlertEmail('rise', currentPrice, minPrice);
      }
    }
  } catch (error) {
    console.error('Error in checkThreshold:', error);
  }
}


async function getPrice() {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto('https://finance.yahoo.com/quote/0P0000XVFY.BO/history/', { waitUntil: 'networkidle2' });
    
    
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
  const price = await getPrice();
  if (price) {
    try {
      const priceEntry = new PriceHistory({ price });
      await priceEntry.save();
      console.log(`Price fetched and stored: ${price} at ${new Date().toLocaleString()}`);

      
      const currentPrice = parseFloat(price);
      if (!isNaN(currentPrice)) {
        checkThreshold(currentPrice);
      }
    } catch (error) {
      console.error('Error saving price to MongoDB:', error);
    }
  } else {
    console.error('No price fetched.');
  }
}



cron.schedule('0 19 * * *', async () => {
  console.log('Scheduled task: Fetching price at 7 PM...');
  await fetchAndStorePrice();
});


fetchAndStorePrice();


app.get('/', async (req, res) => {
  try {
    
    const prices = await PriceHistory.find().sort({ fetchedAt: -1 });

    
    const tableRows = prices.map(record => {
      return `<tr>
                <td>${new Date(record.fetchedAt).toLocaleString()}</td>
                <td>${record.price}</td>
              </tr>`;
    }).join('');

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Price History</title>
        <style>
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>Price History</h1>
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
        <h2>Import Historical Data</h2>
        <form action="/import" method="POST" enctype="multipart/form-data">
          <input type="file" name="file" accept=".xlsx" required />
          <button type="submit">Import Excel File</button>
        </form>
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
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    
    
    const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });

    
    const insertPromises = data.map(async row => {
      const dateValue = new Date(row['date']);
      if (isNaN(dateValue)) {
        throw new Error(`Invalid date format in row: ${JSON.stringify(row)}`);
      }
      const priceEntry = new PriceHistory({
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
        <title>Import Successful</title>
      </head>
      <body>
        <h1>Import Successful</h1>
        <p>Imported ${data.length} record(s) from the Excel file.</p>
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
