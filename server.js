//const MONGODB_URI = 'mongodb+srv://daryldynamic5:Lkps%409753@vohala.a2zchcl.mongodb.net/?retryWrites=true&w=majority&appName=Vohala';

const express = require('express');
const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const multer = require('multer');
const XLSX = require('xlsx');

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

async function getPrice() {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
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

app.get('/', async (req, res) => {
  let priceHtml = '';
  const price = await getPrice();
  
  if (price) {
    try {
      const priceEntry = new PriceHistory({ price });
      await priceEntry.save();
      priceHtml = `<h2>Latest Price: ${price}</h2>
                   <p>Fetched at: ${new Date().toLocaleString()}</p>`;
    } catch (err) {
      priceHtml = '<p>Error saving scraped price to database.</p>';
    }
  } else {
    priceHtml = '<p>Unable to fetch the price data.</p>';
  }
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Yahoo Finance Price & Import</title>
    </head>
    <body>
      <h1>Yahoo Finance Price</h1>
      ${priceHtml}
      <hr>
      <h2>Import Historical Data</h2>
      <form action="/import" method="POST" enctype="multipart/form-data">
        <input type="file" name="file" accept=".xlsx" required />
        <button type="submit">Import Excel File</button>
      </form>
    </body>
    </html>
  `);
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
