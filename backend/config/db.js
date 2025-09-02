const mongoose = require('mongoose');
const logger = require('../utils/logger');

let isConnected = false;

const connectDB = async (serverName = 'Server') => {
  if (isConnected) {
    logger.info(`${serverName}: Already connected to MongoDB`, 'database');
    return;
  }

  try {
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    await mongoose.connect(process.env.MONGODB_URI, options);
    
    isConnected = true;
    logger.success(`${serverName}: Connected to MongoDB successfully`, 'database');

    mongoose.connection.on('error', (err) => {
      logger.error(`${serverName}: MongoDB connection error: ${err}`, 'database');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn(`${serverName}: MongoDB disconnected`, 'database');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      logger.success(`${serverName}: MongoDB reconnected`, 'database');
      isConnected = true;
    });

  } catch (error) {
    logger.error(`${serverName}: Failed to connect to MongoDB: ${error.message}`, 'database');
    process.exit(1);
  }
};

const disconnectDB = async () => {
  if (!isConnected) return;
  
  try {
    await mongoose.connection.close();
    isConnected = false;
    logger.info('Disconnected from MongoDB', 'database');
  } catch (error) {
    logger.error(`Error disconnecting from MongoDB: ${error.message}`, 'database');
  }
};

module.exports = { connectDB, disconnectDB };