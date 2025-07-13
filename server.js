const express = require('express');
const fs = require('fs');
const app = express();

// Store completed offers in memory
const completedOffers = new Map();

// Middleware
app.use(express.urlencoded({ extended: true }));

// ======================
// SECURITY CONFIGURATION
// ======================
const SECURITY_MODE = process.env.NODE_ENV === 'production'; // Turn on in production

// OGAds IP Whitelist (replace with actual IPs from OGAds support)
const OGADS_IPS = SECURITY_MODE ? new Set([
  '52.1.2.3', // Real OGAds IP 1
  '54.5.6.7'  // Real OGAds IP 2
]) : null;

// ======================
// REQUEST VALIDATION
// ======================
app.use('/postback', (req, res, next) => {
  if (SECURITY_MODE) {
    const clientIp = req.headers['x-forwarded-for'] || req.ip.split(':').pop();
    
    if (!OGADS_IPS.has(clientIp)) {
      fs.appendFileSync('security.log', `[BLOCKED] ${new Date().toISOString()} | IP: ${clientIp}\n`);
      return res.status(403).send('Forbidden');
    }
  }
  next();
});

// ======================
// POSTBACK HANDLER
// ======================
app.get('/postback', (req, res) => {
  // Accept both OGAds (aff_sub) and standard (id) parameters
  const id = req.query.aff_sub || req.query.id;
  const payout = req.query.payout || '0';
  const user_ip = req.query.ip || req.ip.split(':').pop();

  if (!id) return res.status(400).send('Missing offer ID');

  // Store conversion
  completedOffers.set(id, { 
    timestamp: Date.now(),
    payout,
    ip: user_ip
  });

  // Async logging with error handling
  fs.appendFile('conversions.log', 
    `${id},${payout},${user_ip},${new Date().toISOString()}\n`,
    (err) => err && console.error('Log failed:', err)
  );

  res.status(200).send('1'); // OGAds requires '1' response
});

// ======================
// MONITORING ENDPOINTS
// ======================
app.get('/check', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send('Missing ID');
  
  res.json({
    completed: completedOffers.has(id),
    data: completedOffers.get(id) || null
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    conversions: completedOffers.size,
    memory: process.memoryUsage()
  });
});

// ======================
// SERVER INITIALIZATION
// ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize log files
  ['conversions.log', 'security.log'].forEach(file => {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, `SERVER STARTED ${new Date().toISOString()}\n`);
    }
  });
});

// ======================
// TESTING INSTRUCTIONS
// ======================
/*
1. Development Testing:
   curl "http://localhost:3000/postback?id=TEST123&payout=1.5&ip=127.0.0.1"
   curl "http://localhost:3000/check?id=TEST123"

2. Production Setup:
   - Set NODE_ENV=production
   - Add real OGAds IPs
   - Enable HTTPS
*/