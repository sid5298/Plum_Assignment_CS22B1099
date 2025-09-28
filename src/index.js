require('dotenv').config();
const express = require('express');
const app = express();
const amountDetectionRoutes = require('./routes/amountDetection');

// Middleware
app.use(express.json());

// Routes
app.use('/api', amountDetectionRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
