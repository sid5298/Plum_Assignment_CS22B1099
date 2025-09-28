require('dotenv').config();
const express = require('express');
const app = express();
const amountDetectionRoutes = require('./routes/amountDetection');

// Middleware
app.use(express.json());

// Routes
app.use('/api', amountDetectionRoutes);

// 🔹 Cron route
app.get('/cron', (req, res) => {
    console.log(`Cron task executed at ${new Date().toISOString()}`);
    
    // 👉 Place your actual cron logic here
    // Example: call a function that processes DB, cleans old files, etc.
    // runCronTask();

    res.send("Cron task executed!");
});

// Port setup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
